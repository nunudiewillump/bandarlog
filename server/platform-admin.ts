import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomInt, createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import type { GlobalOperations } from './global-operations.js';
import {
  codeRequestId,
  codeVerifier,
  verifyCode,
  verifyGoogleToken,
  googleEmailAuthoritative,
} from './auth-security.js';
import { readCookie } from './session-cookie.js';
import { weeklyMail } from './weekly-mail.js';
import { component } from './components.js';
const secret = () => randomBytes(32).toString('hex');
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const platformCookieName = (production: boolean) =>
  production ? '__Host-bandarlog-platform' : 'bandarlog_platform';
export function platformPreview(origin: string) {
  return weeklyMail({
    project: 'Campamento de verano · ejemplo',
    groupName: 'Grupo de demostración',
    appUrl: origin,
    projectUrl: origin + '/plataforma',
    taskUrl: () => origin + '/plataforma',
    at: new Date('2026-11-19T10:00:00Z'),
    commissions: [{ id: 'demo', name: 'Cocina' }],
    tasks: [
      {
        id: 'demo-blocked',
        title: 'Cerrar el menú y las alergias',
        commissionId: 'demo',
        due: '2026-11-18T10:00:00Z',
        status: 'blocked',
        blockedReason: 'Faltan dos confirmaciones.',
      },
      {
        id: 'demo-soon',
        title: 'Confirmar la ruta alternativa',
        commissionId: 'demo',
        due: '2026-11-22T10:00:00Z',
        status: 'pending',
      },
      {
        id: 'demo-done',
        title: 'Preparar el material',
        commissionId: 'demo',
        due: '2026-11-20T10:00:00Z',
        status: 'done',
        completedAt: '2026-11-17T10:00:00Z',
      },
    ],
  });
}
export function platformAdminRoutes(
  ops: GlobalOperations,
  options: {
    origin: string;
    production: boolean;
    signingKeys: () => Promise<JsonWebKey[]>;
    mail: (subject: string, body: string, html?: string) => unknown;
    wake: () => Promise<void>;
  },
) {
  const router = express.Router(),
    { origin, production } = options;
  const cookieName = platformCookieName(production);
  const authSecret = process.env.AUTH_CHALLENGE_SECRET || '';
  // Only trusted protocol sites below sign payloads. Never sign a caller-supplied command/SQL.
  const signed = (action: string, values: Record<string, unknown>) => {
    const body = JSON.stringify(values),
      deadline = Date.now() + 30000;
    const proof = createHmac('sha256', Buffer.from(process.env.GROUP_CONTEXT_SECRET || '', 'hex'))
      .update(['platform-v1', action, String(deadline), body].join('\n'))
      .digest('hex');
    return { body, deadline, proof };
  };
  const auth = (action: string, values: Record<string, unknown>) => {
    const p = signed(action, values);
    return ops.adminAuth(action, p.body, p.deadline, p.proof);
  };
  const token = (q: Request) => readCookie(q.headers.cookie, cookieName) || '';
  const csrf = (q: Request) => hex.parse(q.get('X-CSRF-Token'));
  const setSession = (r: Response, raw: string) =>
    r.cookie(cookieName, raw, {
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 3600000,
    });
  const wake = () => {
    void options.wake().catch(() => console.error({ event: 'platform.mail.wake.failed' }));
  };
  router.use(
    '/api/platform',
    express.json({ limit: '16kb' }),
    (q, r, next) => {
      r.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      if (component() !== 'identity')
        return r
          .status(503)
          .json({ error: 'La administración requiere el componente de identidad.' });
      if (!['GET', 'HEAD'].includes(q.method) && q.get('origin') !== origin)
        return r.status(403).json({ error: 'Origen no permitido.' });
      next();
    },
    rateLimit({
      windowMs: 15 * 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.get('/api/platform/auth/config', (_q, r) =>
    r.json({
      googleEnabled: Boolean(
        process.env.GOOGLE_LOGIN_CLIENT_ID && process.env.GOOGLE_LOGIN_CLIENT_SECRET,
      ),
    }),
  );
  router.post('/api/platform/auth/code/request', async (q, r) => {
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.trim().toLowerCase()),
      })
      .strict()
      .parse(q.body);
    const key = createHmac('sha256', authSecret)
      .update('platform-email\n' + input.email)
      .digest('hex');
    const previous = await auth('code.prepare', { key });
    const response = (at: string, retryAfter = 60) => ({
      challengeId: codeRequestId(authSecret, 'platform', input.email, at),
      expiresIn: 600,
      retryAfter,
    });
    const wait = previous.requestedAt
      ? Math.ceil((+new Date(previous.requestedAt) + 60000 - Date.now()) / 1000)
      : 0;
    const windowWait =
      previous.requests >= 5
        ? Math.ceil((+new Date(previous.windowAt) + 15 * 60000 - Date.now()) / 1000)
        : 0;
    if (wait > 0 || windowWait > 0)
      return r.status(429).json({
        ...response(previous.requestedAt, Math.max(wait, windowWait)),
        error: 'Espera antes de solicitar otro código.',
      });
    const at = new Date().toISOString(),
      id = codeRequestId(authSecret, 'platform', input.email, at),
      code = String(randomInt(1000000)).padStart(6, '0');
    const result = await auth('code.request', {
      key,
      email: input.email,
      id: hash(id),
      at,
      verifier: await codeVerifier(authSecret, id, input.email, code),
      mail: JSON.stringify(
        options.mail(
          'Tu código de acceso a Bandarlog',
          `Tu código de acceso es: ${code}\n\nAcceso a administración. Caduca en 10 minutos. No compartas este código.`,
        ),
      ),
    });
    if (result.retryAfter)
      return r.status(429).json({
        ...response(result.requestedAt, result.retryAfter),
        error: 'Espera antes de solicitar otro código.',
      });
    if (result.queued) wake();
    r.status(202).json({
      ...response(at),
      message: 'Si tienes acceso a administración, recibirás un código.',
    });
  });
  router.post('/api/platform/auth/code/verify', async (q, r) => {
    const input = z
      .object({
        challengeId: hex,
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        code: z.string().regex(/^\d{6}$/),
      })
      .strict()
      .parse(q.body);
    const claim = secret(),
      request = await auth('code.claim', { id: hash(input.challengeId), claim: hash(claim) });
    const valid = await verifyCode(
      authSecret,
      input.challengeId,
      request?.email || input.email,
      input.code,
      request?.verifier || 'pbkdf2-v2:' + '0'.repeat(64),
    );
    if (!request || !valid || request.email !== input.email)
      return r.status(400).json({ error: 'Código no válido o caducado.' });
    const raw = secret(),
      nonce = secret();
    await auth('code.finish', {
      id: hash(input.challengeId),
      claim: hash(claim),
      session: hash(raw),
      csrf: nonce,
      previous: hash(token(q)),
    });
    setSession(r, raw);
    r.json({ ok: true });
  });
  router.get('/api/platform/auth/google/start', async (q, r) => {
    if (!process.env.GOOGLE_LOGIN_CLIENT_SECRET)
      return r.status(503).json({ error: 'Usa el código de correo.' });
    const state = secret(),
      browser = secret(),
      verifier = secret(),
      nonce = secret();
    await auth('google.start', {
      id: hash(state),
      browser: hash(browser),
      verifier,
      nonce,
      previous: hash(token(q)),
    });
    r.cookie((production ? '__Host-' : '') + 'bandarlog-platform-google-' + hash(state), browser, {
      secure: production,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600000,
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_LOGIN_CLIENT_ID!,
      redirect_uri: origin + '/api/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: hashBase64(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    r.redirect(url.toString());
  });
  // Reuse the already configured redirect URI. A separate, state-bound cookie
  // selects this protocol before legacy group routing; no Rosales dependency.
  router.get('/api/auth/google/callback', async (q, r, next) => {
    if (typeof q.query.state !== 'string' || !hex.safeParse(q.query.state).success) return next();
    const cookie =
      (production ? '__Host-' : '') + 'bandarlog-platform-google-' + hash(q.query.state);
    const browser = readCookie(q.headers.cookie, cookie);
    if (!browser) return next();
    r.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).clearCookie(cookie, {
      path: '/',
      secure: production,
    });
    try {
      const state = await auth('google.consume', {
        id: hash(q.query.state),
        browser: hash(hex.parse(browser)),
      });
      const code = z.string().max(4096).parse(q.query.code);
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_LOGIN_CLIENT_ID!,
          client_secret: process.env.GOOGLE_LOGIN_CLIENT_SECRET!,
          redirect_uri: origin + '/api/auth/google/callback',
          grant_type: 'authorization_code',
          code,
          code_verifier: state.verifier,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('provider');
      const payload = await response.json();
      const claims = verifyGoogleToken(
        payload.id_token,
        await options.signingKeys(),
        process.env.GOOGLE_LOGIN_CLIENT_ID!,
        state.nonce,
      );
      if (!googleEmailAuthoritative(claims))
        return r.redirect(303, '/plataforma?auth_error=correo');
      const raw = secret();
      await auth('google.finish', {
        id: hash(q.query.state),
        email: claims.email,
        subject: claims.sub,
        session: hash(raw),
        csrf: secret(),
      });
      setSession(r, raw);
      r.redirect(303, '/plataforma');
    } catch {
      r.redirect(303, '/plataforma?auth_error=google');
    }
  });
  router.get('/api/platform/me', async (q, r) => {
    const actor = await ops.adminMe(token(q));
    r.json({ ...actor, productFeedbackEnabled: process.env.PRODUCT_FEEDBACK_ENABLED === 'true' || process.env.PRODUCT_CAMPAIGNS_ENABLED === 'true' });
  });
  router.post('/api/platform/logout', async (q, r) => {
    await ops.adminClose(token(q), csrf(q));
    r.clearCookie(cookieName, { path: '/', secure: production }).json({ ok: true });
  });
  const query = z
    .object({
      period: z.enum(['7', '30']).default('7'),
      cursor: z.string().max(100).default(''),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      filter: z.string().max(100).default(''),
    })
    .strict();
  for (const view of ['overview', 'metrics', 'groups', 'requests', 'access', 'mail', 'audit'])
    router.get('/api/platform/' + view, async (q, r) => {
      const p = query.parse(q.query);
      const result = await ops.adminRead(
        token(q),
        view,
        Number(p.period),
        p.cursor,
        p.limit,
        p.filter,
      );
      r.json(view === 'mail' ? { ...result, preview: platformPreview(origin) } : result);
    });
  const campaignsEnabled = process.env.PRODUCT_CAMPAIGNS_ENABLED === 'true';
  if (campaignsEnabled) router.post('/api/platform/campaigns/:campaign', async (q,r) => {
    const campaign = z.enum(['F01','F02','F03']).parse(q.params.campaign);
    const { paused } = z.strictObject({ paused: z.boolean() }).parse(q.body);
    await ops.setProductCampaignPaused(token(q), csrf(q), campaign, paused);
    r.json({ ok: true });
  });
  if (process.env.PRODUCT_FEEDBACK_ENABLED === 'true' || campaignsEnabled) {
    const statuses = z.enum(['new','reviewing','in_progress','resolved','archived']);
    router.get('/api/platform/feedback', async (q,r) => {
      const p = query.parse(q.query);
      const after = p.cursor ? z.uuid().parse(p.cursor) : null;
      const status = p.filter ? statuses.parse(p.filter) : '';
      const [rows, insights, surveys, campaigns] = await Promise.all([
        ops.productFeedbackList(token(q), after, p.limit + 1, status),
        ops.productFeedbackInsights(token(q), Number(p.period)),
        campaignsEnabled ? ops.productSurveyInsights(token(q), Number(p.period)) : null,
        campaignsEnabled ? ops.productCampaignStatus(token(q)) : null,
      ]);
      r.json({ insights, surveys, campaigns, items: rows.slice(0,p.limit), nextCursor: rows.length > p.limit ? rows[p.limit-1].id : '' });
    });
    router.post('/api/platform/feedback/:id', async (q,r) => {
      const id = z.uuid().parse(q.params.id);
      const input = z.strictObject({ status: statuses, revision: z.int().positive() }).parse(q.body);
      const updated = await ops.productFeedbackReview(token(q), csrf(q), id, input.status, input.revision);
      if (!updated) return r.status(409).json({ error: 'La aportación ha cambiado. Vuelve a cargar la bandeja.' });
      r.json({ ok: true });
    });
  }
  router.get('/api/platform/groups/:id', async (q, r) => {
    const result = await ops.adminRead(
      token(q),
      'group',
      7,
      '',
      1,
      z.string().max(100).parse(q.params.id),
    );
    return result ? r.json(result) : r.status(404).json({ error: 'Grupo no encontrado.' });
  });
  router.get('/api/platform/requests/:id', async (q, r) => {
    const request = await ops.adminRequest(token(q), hex.parse(q.params.id));
    return request ? r.json(request) : r.status(404).json({ error: 'Solicitud no encontrada.' });
  });
  router.post('/api/platform/requests/:id/review', async (q, r) => {
    const input = z
      .object({
        decision: z.enum(['approve', 'reject']),
        reason: z.string().trim().min(1).max(500),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(q.body);
    const session = token(q),
      nonce = csrf(q),
      request = await ops.adminRequest(session, hex.parse(q.params.id));
    if (!request) return r.status(404).json({ error: 'Solicitud no encontrada.' });
    const activation = secret(),
      subject =
        input.decision === 'approve'
          ? 'Tu grupo ha sido aprobado · Bandarlog'
          : 'Solicitud de grupo revisada';
    const body =
      input.decision === 'approve'
        ? `Hola ${request.name}. Confirma tu correo para activar ${request.groupName}.\n\n${origin}/confirmar-grupo#token=${activation}\n\nEl enlace caduca en 7 días.`
        : `La solicitud de ${request.groupName} no se ha autorizado. Contacta con join@bandarlog.app si necesitas información.`;
    const p = signed('review', {
      session: hash(session),
      id: request.id,
      decision: input.decision,
      reason: input.reason,
      activation: hash(activation),
      mail: JSON.stringify(options.mail(subject, body)),
    });
    const result = await ops.adminReview(session, nonce, p.body, p.deadline, p.proof);
    wake();
    r.json(result);
  });
  router.get('/api/platform/preview', async (q, r) => {
    await ops.adminMe(token(q));
    r.json(platformPreview(origin));
  });
  router.post('/api/platform/test-mail', async (q, r) => {
    const raw = token(q),
      nonce = csrf(q);
    z.object({}).strict().parse(q.body);
    const preview = platformPreview(origin),
      p = signed('test-mail', {
        session: hash(raw),
        mail: JSON.stringify(options.mail('Prueba · resumen semanal', preview.body, preview.html)),
      });
    if (!(await ops.adminTestMail(raw, nonce, p.body, p.deadline, p.proof)))
      return r.status(429).json({ error: 'Espera un minuto antes de otra prueba.' });
    wake();
    r.status(202).json({ ok: true });
  });
  router.use('/api/platform', (_q, r) => r.status(404).json({ error: 'Ruta no encontrada.' }));
  router.use((error: any, _q: Request, r: Response, next: express.NextFunction) => {
    if (!_q.path.startsWith('/api/platform')) return next(error);
    const code = error.code || error.cause?.code;
    const status =
      error instanceof z.ZodError
        ? 400
        : code === '28000'
          ? 401
          : code === '28001'
            ? 428
            : code === '42501'
              ? 403
              : code === '23505'
                ? 409
                : code === 'P0002'
                  ? 404
                  : code === '22023' || code === '22P02'
                    ? 400
                    : 500;
    if (status === 500)
      console.error({ event: 'platform.operation.failed', code: code || 'INTERNAL' });
    r.status(status).json({
      error:
        status === 401
          ? 'Inicia sesión en administración.'
          : status === 428
            ? 'Vuelve a verificar tu cuenta.'
            : status === 403
              ? 'Acceso administrativo no autorizado.'
              : status === 409
                ? 'La solicitud ya tiene una decisión distinta o ha caducado.'
                : status === 400
                  ? 'Revisa los datos de la solicitud.'
                  : 'No se pudo completar la operación.',
    });
  });
  return router;
}
const hashBase64 = (value: string) => createHash('sha256').update(value).digest('base64url');
