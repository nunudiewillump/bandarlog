import { IdleJobs, nextMadridMidnight } from './idle-jobs.js';
import { publicUsers } from './public-users.js';
import { pageRequest, CursorError } from './pagination.js';
import { measureRequests, measureJob, flushMetrics } from './metrics.js';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { publicSite, renderPublicForm, renderPublicHome } from './public-site.js';
import { ENTRY_COOKIE, requestCookie, rememberEntry, rememberedEntry } from './remembered-entry.js';
import { publicInfo } from '../shared/public-info.js';
import {
  groupContext,
  groupPath,
  groupUrl,
  canonicalGroupPath,
  type Group,
} from './group-context.js';
import { groupRegistrationRoutes, groupResolver, groupColor } from './groups.js';
import {
  tutorialCommand,
  writeTutorial,
  readTutorial,
  expireTutorials,
  summarizeTutorial,
  TutorialError,
} from './tutorial.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { eq, and, inArray, sql, getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import { createMailTransport } from './mail.js';
import { mailFailure, MailDeliveryError } from './resend-mail.js';
import { connect, type Database } from './db.js';
import { seed } from './seed.js';
import * as s from './schema.js';
import { validateEnvironment } from './config.js';
import { preferenceSchema, preferences, reminderEvents } from './preferences.js';
import {
  artworkCatalog,
  artworkThemes,
  inferArtworkTheme,
  projectArtworkTheme,
  hasArtworkAssociation,
  selectArtwork,
  type ArtworkTheme,
} from '../shared/scout-catalog.js';
import { normalizePhoto } from './photos.js';
import { checklistChangeSchema, changeChecklist, ChecklistError } from './task-checklist.js';
import { artworkImage } from './artwork.js';
import { renderMail } from './mail-template.js';
import { pushService, validPushEndpoint } from './push.js';
import { projectSummaries } from './project-summaries.js';
import { projectTypeInput } from './project-input.js';
import {
  codeVerifier,
  codeRequestId,
  equalSecret,
  sessionDeadline,
  googleEmailAuthoritative,
  verifyGoogleToken,
  CODE_LIFETIME,
  SESSION_IDLE,
  SESSION_ABSOLUTE,
  SESSION_RENEW_INTERVAL,
} from './auth-security.js';
const { production: prod, appUrl, legacyOrigins } = validateEnvironment();
const { db, ownerDb, close } = await connect();
await seed(ownerDb);
const [legacyGroup] = await ownerDb.select().from(s.groups).where(eq(s.groups.id, 'rosales-702'));
const site = express();
site.disable('x-powered-by');
site.use(helmet({ contentSecurityPolicy: prod ? undefined : false }));
site.use((q, r, next) => {
  const oldHost = prod && legacyOrigins.includes('https://' + (q.get('host') || '').toLowerCase());
  const publicRoute = [
    '/presentacion',
    '/privacidad',
    '/condiciones',
    '/crear-grupo',
    '/confirmar-grupo',
    '/aprobar-grupo',
    '/entrar',
    '/suscripcion-demo',
    '/robots.txt',
    '/sitemap.xml',
  ].includes(q.path);
  const anonymousHome =
    q.path === '/' &&
    !requestCookie(q.headers.cookie, 'bandarlog') &&
    !requestCookie(q.headers.cookie, ENTRY_COOKIE);
  if (
    oldHost &&
    ['GET', 'HEAD'].includes(q.method) &&
    (publicRoute || anonymousHome || q.path === '/api/auth/google/start')
  ) {
    if (!q.originalUrl.startsWith('/')) return r.sendStatus(400);
    return r.redirect(308, appUrl + q.originalUrl);
  }
  next();
});
function allowedOrigin(q: express.Request) {
  const origin = q.get('origin');
  return (
    !origin ||
    origin === appUrl ||
    (groupContext.getStore()?.id === legacyGroup.id &&
      legacyOrigins.includes(origin) &&
      origin === 'https://' + (q.get('host') || '').toLowerCase())
  );
}
site.use(publicSite(appUrl));
const push = await pushService(db, appUrl, ownerDb);
const app = express();
app.disable('x-powered-by');
app.use('/api', measureRequests);
const liveViews = new Map<express.Response, string>();
app.use('/api', (q, r, next) => {
  if (q.path === '/tutorial' || q.path.startsWith('/tutorial/')) return next();
  const changedGroupId = groupContext.getStore()?.id;
  if (!['GET', 'HEAD'].includes(q.method) || q.path === '/auth/google/callback')
    r.on('finish', () => {
      if (r.statusCode < 400) {
        reminderJobs.schedule('reminders', undefined, Date.now() + 15 * 60000);
        for (const [view, groupId] of liveViews)
          if (groupId === changedGroupId) view.write('event: changed\ndata: {}\n\n');
      }
    });
  next();
});

app.use(helmet({ contentSecurityPolicy: prod ? undefined : false }));
app.use(express.json({ limit: '256kb' }));
app.use('/api', (_q, r, n) => {
  r.set('Cache-Control', 'no-store');
  n();
});
app.use('/api/auth', (q, r, n) => {
  if (!['GET', 'HEAD'].includes(q.method) && !allowedOrigin(q))
    return r.status(403).json({ error: 'Origen no permitido.' });
  n();
});
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    skip: (q) => q.path === '/config',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_q, r) => {
      r.status(429).json({
        error: 'Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.',
      });
    },
  }),
);
const now = () => new Date().toISOString();
const id = () => randomUUID();
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const secret = () => randomBytes(32).toString('hex');
class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, msg: string): never => {
  throw new Problem(status, msg);
};
const parse = <T>(schema: z.ZodType<T>, input: unknown) => schema.parse(input);
const statuses = z.enum(['pending', 'in_progress', 'blocked', 'done']);
const text = z.string().trim().min(1).max(200);
const commissionRole = z
  .enum(['scouter', 'responsible', 'member', 'coordinator'])
  .transform((value) =>
    value === 'coordinator' ? 'responsible' : value === 'member' ? 'scouter' : value,
  );
const email = z.email().transform((v) => v.toLowerCase());
const mailTransport = createMailTransport();
async function invitationLink(recipient: string, invitationId: string, expires: string, tx: any) {
  // Hashing the complete token binds its invitation ID to the secret without a schema change.
  const token = `invite.${invitationId}.${secret()}`;
  await tx.insert(s.tokens).values({ id: hash(token), email: recipient, expires });
  const url = new URL(groupUrl(appUrl));
  url.searchParams.set('token', token);
  return url.toString();
}
async function queue(
  email: string,
  subject: string,
  body: string,
  dedupe: string = id(),
  tx: any = db,
  html?: string,
) {
  await tx
    .insert(s.notifications)
    .values({
      id: id(),
      dedupe,
      email,
      subject,
      body,
      html: html || renderMail({ title: subject, body, appUrl }),
      status: mailTransport ? 'pending' : 'preview',
      createdAt: now(),
    })
    .onConflictDoNothing();
}
async function queuePlatform(
  email: string,
  subject: string,
  body: string,
  dedupe: string,
  tx: any = ownerDb,
) {
  const link = body
    .split('\n')
    .find(
      (line) =>
        line.startsWith(appUrl + '/aprobar-grupo?token=') ||
        line.startsWith(appUrl + '/confirmar-grupo?token='),
    );
  await tx
    .insert(s.platformMail)
    .values({
      id: id(),
      email,
      subject,
      body,
      dedupe,
      html: renderMail({
        title: subject,
        body,
        appUrl,
        actions: [
          {
            label: link?.includes('/aprobar-grupo')
              ? 'Revisar solicitud'
              : link
                ? 'Activar grupo'
                : 'Ver Bandarlog',
            url: link || appUrl + '/',
          },
        ],
      }),
      status: mailTransport ? 'pending' : 'preview',
      createdAt: now(),
    })
    .onConflictDoNothing();
}
let platformSending = false;
async function deliverPlatformNow() {
  if (!mailTransport || platformSending) return;
  platformSending = true;
  try {
    const pending = await ownerDb
      .select()
      .from(s.platformMail)
      .where(
        and(
          eq(s.platformMail.status, 'pending'),
          sql`${s.platformMail.attempts}::integer < 5`,
          sql`(${s.platformMail.nextAttemptAt} is null or ${s.platformMail.nextAttemptAt} <= now())`,
        ),
      );
    for (const m of pending) {
      const claimed = await ownerDb
        .update(s.platformMail)
        .set({ status: 'sending' })
        .where(and(eq(s.platformMail.id, m.id), eq(s.platformMail.status, 'pending')))
        .returning();
      if (!claimed.length) continue;
      try {
        const sent = await mailTransport.sendMail({
          from: process.env.MAIL_FROM,
          to: m.email,
          subject: m.subject,
          text: m.body,
          html: m.html,
          idempotencyKey: 'bandarlog-platform/' + m.id,
        });
        await ownerDb
          .update(s.platformMail)
          .set({
            status: 'sent',
            sentAt: now(),
            nextAttemptAt: null,
            providerMessageId: typeof sent.messageId === 'string' ? sent.messageId : null,
          })
          .where(eq(s.platformMail.id, m.id));
        if (mailTransport.kind === 'resend')
          console.info({ event: 'mail.accepted', provider: 'resend', messageId: sent.messageId });
      } catch (error) {
        const failure = mailFailure(error, Number(m.attempts) + 1);
        await ownerDb.update(s.platformMail).set(failure).where(eq(s.platformMail.id, m.id));
        if (mailTransport.kind === 'resend')
          console.error({
            event: 'mail.failed',
            provider: 'resend',
            status: error instanceof MailDeliveryError ? error.statusCode : undefined,
            retry: failure.status === 'pending',
          });
        if (error instanceof MailDeliveryError && error.statusCode === 429) break;
      }
    }
  } finally {
    platformSending = false;
  }
}
const sending = new Set<string>();
const pushing = new Set<string>();
async function deliverPush() {
  const key = groupContext.getStore()!.id;
  if (pushing.has(key)) return;
  pushing.add(key);
  try {
    const pending = await db
      .select()
      .from(s.pushOutbox)
      .where(sql`${s.pushOutbox.sentAt} is null`)
      .limit(100);
    for (const entry of pending) {
      if (await push.send(entry.userId, JSON.parse(entry.payload), entry.id))
        await db.update(s.pushOutbox).set({ sentAt: now() }).where(eq(s.pushOutbox.id, entry.id));
    }
  } finally {
    pushing.delete(key);
  }
}
async function deliverNow() {
  await deliverPush().catch(() =>
    console.error('No se pudieron enviar los avisos al dispositivo.'),
  );
  const key = groupContext.getStore()!.id;
  if (!mailTransport || sending.has(key)) return;
  sending.add(key);
  try {
    const pending = await db
      .select()
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.status, 'pending'),
          sql`${s.notifications.attempts}::integer < 5`,
          sql`(${s.notifications.nextAttemptAt} is null or ${s.notifications.nextAttemptAt} <= now())`,
        ),
      )
      .limit(100);
    for (const m of pending) {
      if (Number(m.attempts) >= 5) continue;
      const claimed = await db
        .update(s.notifications)
        .set({ status: 'sending' })
        .where(and(eq(s.notifications.id, m.id), eq(s.notifications.status, 'pending')))
        .returning();
      if (!claimed.length) continue;
      try {
        const snapshot = m.html || renderMail({ title: m.subject, body: m.body, appUrl });
        if (!m.html)
          await db
            .update(s.notifications)
            .set({ html: snapshot })
            .where(eq(s.notifications.id, m.id));
        const sent = await mailTransport.sendMail({
          from: process.env.MAIL_FROM,
          to: m.email,
          subject: m.subject,
          text: m.body,
          html: snapshot,
          idempotencyKey: 'bandarlog-notification/' + m.id,
          headers: { 'Message-ID': `<${m.id}@bandarlog.local>` },
        });
        await db
          .update(s.notifications)
          .set({
            status: 'sent',
            sentAt: now(),
            nextAttemptAt: null,
            providerMessageId: typeof sent.messageId === 'string' ? sent.messageId : null,
          })
          .where(eq(s.notifications.id, m.id));
        if (mailTransport.kind === 'resend')
          console.info({ event: 'mail.accepted', provider: 'resend', messageId: sent.messageId });
      } catch (error) {
        const failure = mailFailure(error, Number(m.attempts) + 1);
        await db.update(s.notifications).set(failure).where(eq(s.notifications.id, m.id));
        if (mailTransport.kind === 'resend')
          console.error({
            event: 'mail.failed',
            provider: 'resend',
            status: error instanceof MailDeliveryError ? error.statusCode : undefined,
            retry: failure.status === 'pending',
          });
        if (error instanceof MailDeliveryError && error.statusCode === 429) break;
      }
    }
  } finally {
    sending.delete(key);
  }
}
// Tokens are stored only as hashes. A GET never consumes a token or changes a task.
async function health(_q: express.Request, r: express.Response) {
  // This probe reads no tenant tables; avoid a tenant transaction and role setup.
  r.set('Cache-Control', 'no-store');
  await ownerDb.execute(sql`select 1`);
  r.json({
    ok: true,
    mail: mailTransport?.kind || 'development',
    database: process.env.DATABASE_URL ? 'postgresql' : 'pglite',
  });
}
site.get('/api/live', (_q, r) => r.set('Cache-Control', 'no-store').json({ ok: true }));
site.get('/api/health', health);
app.get('/api/health', health);
app.post('/api/auth/request', async (q, r) => {
  const input = parse(
    z.object({ email, task: z.string().max(100).optional(), action: statuses.optional() }),
    q.body,
  );
  const [user] = await db.select().from(s.users).where(eq(s.users.email, input.email));
  const invites = await db
    .select()
    .from(s.invitations)
    .where(and(eq(s.invitations.email, input.email), eq(s.invitations.status, 'pending')));
  if ((user && !user.disabledAt) || invites.some((i) => new Date(i.expires) > new Date())) {
    const token = secret();
    await db.insert(s.tokens).values({
      id: hash(token),
      email: input.email,
      expires: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    const loginUrl = new URL(groupUrl(appUrl));
    loginUrl.searchParams.set('token', token);
    if (input.task) loginUrl.searchParams.set('task', input.task);
    if (input.action) loginUrl.searchParams.set('action', input.action);
    await queue(
      input.email,
      'Tu enlace de acceso a Bandarlog',
      `Accede a Bandarlog. Este enlace caduca en 15 minutos y solo puede usarse una vez.\n${loginUrl}`,
    );
    void deliver();
  }
  r.json({ message: 'Si tienes acceso, recibirás un enlace por correo.' });
});
async function authenticatedUser(tx: any, recipient: string, invitationId?: string) {
  let [u] = await tx.select().from(s.users).where(eq(s.users.email, recipient));
  if (u?.disabledAt) fail(403, 'Esta cuenta no tiene acceso.');
  const invites = await tx
    .select()
    .from(s.invitations)
    .where(
      and(
        eq(s.invitations.email, recipient),
        eq(s.invitations.status, 'pending'),
        sql`${s.invitations.expires}>now()`,
      ),
    )
    .for('update');
  if (invitationId && !invites.some((i: any) => i.id === invitationId))
    fail(403, 'La invitación ha caducado, se ha revocado o ya se ha aceptado.');
  if (!u && !invites.length) fail(403, 'La invitación ya no está disponible.');
  if (!u) {
    [u] = await tx
      .insert(s.users)
      .values({ id: id(), email: recipient, name: invites[0].name, role: 'member' })
      .returning();
  }
  for (const i of invites) {
    if (i.projectId)
      await tx
        .insert(s.projectMembers)
        .values({ id: id(), projectId: i.projectId, userId: u.id })
        .onConflictDoNothing();
    if (i.commissionId)
      await tx
        .insert(s.members)
        .values({ id: id(), commissionId: i.commissionId, userId: u.id, role: i.role })
        .onConflictDoNothing();
    await tx.update(s.invitations).set({ status: 'accepted' }).where(eq(s.invitations.id, i.id));
  }
  return u;
}
async function createSession(tx: any, userId: string) {
  const [account] = await tx.select().from(s.users).where(eq(s.users.id, userId));
  if (!account || account.disabledAt) fail(403, 'Esta cuenta no tiene acceso.');
  const raw = secret(),
    csrf = secret(),
    stamp = now();
  await tx.insert(s.sessions).values({
    id: hash(raw),
    userId,
    csrf,
    createdAt: stamp,
    renewedAt: stamp,
    expires: new Date(Date.now() + SESSION_IDLE).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + SESSION_ABSOLUTE).toISOString(),
  });
  return { raw, csrf };
}
function sessionCookie(r: express.Response, raw: string, expires = Date.now() + SESSION_IDLE) {
  r.cookie('bandarlog', raw, {
    httpOnly: true,
    secure: prod,
    sameSite: 'lax',
    maxAge: Math.max(0, expires - Date.now()),
    path: groupPath() || '/',
  });
  // The initial group's former root PWA can still synchronize its existing queue.
  if (groupContext.getStore()?.id === legacyGroup.id && groupPath())
    r.cookie('bandarlog', raw, {
      httpOnly: true,
      secure: prod,
      sameSite: 'lax',
      maxAge: Math.max(0, expires - Date.now()),
      path: '/',
    });
  rememberEntry(r, groupContext.getStore()!, hash(raw), expires, prod);
}
const cookie = (q: express.Request, name: string) =>
  q.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
app.post('/api/auth/verify', async (q, r) => {
  const { token } = parse(z.object({ token: z.string().min(32).max(128) }), q.body);
  const invitationId = token.match(/^invite\.([a-f0-9-]{36})\.[a-f0-9]{64}$/)?.[1];
  const result = await db.transaction(async (tx: any) => {
    const [t] = await tx
      .delete(s.tokens)
      .where(and(eq(s.tokens.id, hash(token)), sql`${s.tokens.expires}>now()`))
      .returning();
    if (!t) fail(400, 'El enlace ha caducado o ya se ha utilizado. Solicita otro.');
    const u = await authenticatedUser(tx, t.email, invitationId);
    return createSession(tx, u.id);
  });
  sessionCookie(r, result.raw);
  r.json({ ok: true });
});
const googleEnabled = Boolean(
  process.env.GOOGLE_LOGIN_CLIENT_ID && process.env.GOOGLE_LOGIN_CLIENT_SECRET,
);
const challengeSecret =
  process.env.AUTH_CHALLENGE_SECRET || 'bandarlog-local-development-challenge-key';
app.get('/api/auth/config', (_q, r) =>
  r.json({ googleEnabled, codeEnabled: true, group: { name: groupContext.getStore()!.name } }),
);
app.post('/api/auth/code/request', async (q, r) => {
  const input = parse(
    z.object({ email, task: z.string().max(100).optional(), action: statuses.optional() }),
    q.body,
  );
  const stamp = Date.now();
  const result = await db.transaction(async (tx: any) => {
    // A row exists for every email, including unknown ones: cooldown and responses do not disclose registration.
    await tx
      .insert(s.authChallenges)
      .values({
        email: input.email,
        id: hash(secret()),
        verifier: '',
        expires: new Date(0).toISOString(),
        requestedAt: new Date(0).toISOString(),
        windowStartedAt: now(),
        requests: 0,
      })
      .onConflictDoNothing();
    const [previous] = await tx
      .select()
      .from(s.authChallenges)
      .where(eq(s.authChallenges.email, input.email))
      .for('update');
    const wait = Math.ceil((+new Date(previous.requestedAt) + 60000 - stamp) / 1000);
    const previousId = codeRequestId(
      challengeSecret,
      groupContext.getStore()!.id,
      input.email,
      previous.requestedAt,
    );
    const recovery =
      hash(previousId) === previous.id && +new Date(previous.expires) > stamp
        ? {
            challengeId: previousId,
            expiresIn: Math.ceil((+new Date(previous.expires) - stamp) / 1000),
          }
        : {};
    if (wait > 0) return { retryAfter: wait, ...recovery };
    const reset = stamp - +new Date(previous.windowStartedAt) >= 15 * 60000;
    if (!reset && previous.requests >= 5)
      return {
        ...recovery,
        retryAfter: Math.max(
          1,
          Math.ceil((+new Date(previous.windowStartedAt) + 15 * 60000 - stamp) / 1000),
        ),
      };
    const challengeId = codeRequestId(
        challengeSecret,
        groupContext.getStore()!.id,
        input.email,
        new Date(stamp).toISOString(),
      ),
      code = String(randomInt(1000000)).padStart(6, '0');
    let googleLinkId: string | null = null;
    const googleLink = cookie(q, 'bandarlog_google_link');
    if (googleLink) {
      const [link] = await tx
        .select()
        .from(s.googleLinks)
        .where(
          and(
            eq(s.googleLinks.id, hash(googleLink)),
            eq(s.googleLinks.email, input.email),
            sql`${s.googleLinks.expires}>now()`,
          ),
        );
      if (link) {
        googleLinkId = link.id;
        // The verified Google proof must remain live until this OTP expires.
        await tx
          .update(s.googleLinks)
          .set({ expires: new Date(stamp + CODE_LIFETIME).toISOString() })
          .where(eq(s.googleLinks.id, link.id));
      }
    }
    await tx
      .update(s.authChallenges)
      .set({
        id: hash(challengeId),
        verifier: codeVerifier(challengeSecret, challengeId, input.email, code),
        expires: new Date(stamp + CODE_LIFETIME).toISOString(),
        attempts: 0,
        consumedAt: null,
        requestedAt: new Date(stamp).toISOString(),
        windowStartedAt: reset ? new Date(stamp).toISOString() : previous.windowStartedAt,
        requests: reset ? 1 : previous.requests + 1,
        googleLinkId,
      })
      .where(eq(s.authChallenges.email, input.email));
    const [user] = await tx.select().from(s.users).where(eq(s.users.email, input.email));
    const invites = await tx
      .select()
      .from(s.invitations)
      .where(
        and(
          eq(s.invitations.email, input.email),
          eq(s.invitations.status, 'pending'),
          sql`${s.invitations.expires}>now()`,
        ),
      );
    if ((user && !user.disabledAt) || invites.length)
      await queue(
        input.email,
        'Tu código de acceso a Bandarlog',
        `Grupo: ${groupContext.getStore()!.name}\nTu código de acceso es: ${code}\nCaduca en 10 minutos y solo se puede usar una vez. Introdúcelo en Bandarlog sin salir de la aplicación.\nSi no lo has solicitado, ignora este correo.`,
        id(),
        tx,
      );
    return { challengeId };
  });
  if ('retryAfter' in result)
    return r.status(429).json({ error: 'Espera antes de solicitar otro código.', ...result });
  void deliver();
  r.json({
    challengeId: result.challengeId,
    resendAfter: 60,
    expiresIn: 600,
    message: 'Si tienes acceso, recibirás un código por correo.',
  });
});
app.post('/api/auth/code/verify', async (q, r) => {
  const input = parse(
    z.object({
      challengeId: z.string().regex(/^[a-f0-9]{64}$/),
      code: z.string().regex(/^\d{6}$/),
    }),
    q.body,
  );
  const result = await db.transaction(async (tx: any) => {
    const [challenge] = await tx
      .select()
      .from(s.authChallenges)
      .where(eq(s.authChallenges.id, hash(input.challengeId)))
      .for('update');
    if (!challenge || challenge.consumedAt || +new Date(challenge.expires) <= Date.now())
      return { error: 'El código ha caducado o ya se ha utilizado. Solicita otro.', status: 400 };
    if (challenge.attempts >= 5)
      return { error: 'Se han agotado los intentos. Solicita un nuevo código.', status: 429 };
    if (
      !equalSecret(
        challenge.verifier,
        codeVerifier(challengeSecret, input.challengeId, challenge.email, input.code),
      )
    ) {
      await tx
        .update(s.authChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(s.authChallenges.email, challenge.email));
      return {
        error:
          challenge.attempts >= 4
            ? 'Se han agotado los intentos. Solicita un nuevo código.'
            : 'El código no es correcto. Compruébalo e inténtalo de nuevo.',
        status: challenge.attempts >= 4 ? 429 : 400,
      };
    }
    const user = await authenticatedUser(tx, challenge.email);
    if (challenge.googleLinkId) {
      const [link] = await tx
        .delete(s.googleLinks)
        .where(
          and(
            eq(s.googleLinks.id, challenge.googleLinkId),
            eq(s.googleLinks.email, challenge.email),
            sql`${s.googleLinks.expires}>now()`,
          ),
        )
        .returning();
      if (link) {
        await tx
          .insert(s.googleIdentities)
          .values({ subject: link.subject, userId: user.id })
          .onConflictDoNothing();
        const [identity] = await tx
          .select()
          .from(s.googleIdentities)
          .where(eq(s.googleIdentities.subject, link.subject));
        if (identity?.userId !== user.id)
          fail(403, 'Esta cuenta de Google ya está vinculada a otra identidad.');
      }
    }
    await tx
      .update(s.authChallenges)
      .set({ consumedAt: now(), verifier: '' })
      .where(eq(s.authChallenges.email, challenge.email));
    return { session: await createSession(tx, user.id) };
  });
  if ('error' in result) return r.status(result.status || 400).json({ error: result.error });
  sessionCookie(r, result.session.raw);
  r.clearCookie('bandarlog_google_link', { path: '/' });
  r.json({ ok: true });
});
app.get('/api/auth/google/start', async (_q, r) => {
  if (!googleEnabled)
    return r
      .status(503)
      .json({ error: 'El acceso con Google no está configurado. Usa tu correo.' });
  const state = secret(),
    browser = secret(),
    nonce = secret(),
    verifier = secret();
  await db.delete(s.googleStates).where(sql`${s.googleStates.expires}<=now()`);
  await db.insert(s.googleStates).values({
    id: hash(state),
    browser: hash(browser),
    nonce,
    verifier,
    expires: new Date(Date.now() + CODE_LIFETIME).toISOString(),
  });
  r.cookie('bandarlog_google', browser, {
    httpOnly: true,
    secure: prod,
    sameSite: 'lax',
    maxAge: CODE_LIFETIME,
    path: '/api/auth/google',
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_LOGIN_CLIENT_ID!,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  r.redirect(url.toString());
});
let googleKeys: { keys: JsonWebKey[]; expires: number } | undefined;
async function signingKeys() {
  if (googleKeys && googleKeys.expires > Date.now()) return googleKeys.keys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Google keys unavailable');
  const json = (await response.json()) as { keys: JsonWebKey[] };
  if (!Array.isArray(json.keys)) throw new Error('Google keys unavailable');
  googleKeys = { keys: json.keys, expires: Date.now() + 5 * 60000 };
  return json.keys;
}
app.get('/api/auth/google/callback', async (q, r) => {
  r.clearCookie('bandarlog_google', { path: '/api/auth/google' });
  try {
    if (
      !googleEnabled ||
      typeof q.query.state !== 'string' ||
      !/^[a-f0-9]{64}$/.test(q.query.state)
    )
      throw new Error('Invalid OAuth state');
    const browser = cookie(q, 'bandarlog_google');
    if (!browser) throw new Error('Missing OAuth browser');
    // Delete only a state bound to this browser. A foreign callback cannot consume another browser's flow.
    const [flow] = await db
      .delete(s.googleStates)
      .where(
        and(
          eq(s.googleStates.id, hash(q.query.state)),
          eq(s.googleStates.browser, hash(browser)),
          sql`${s.googleStates.expires}>now()`,
        ),
      )
      .returning();
    if (!flow || q.query.error || typeof q.query.code !== 'string' || q.query.code.length > 4096)
      throw new Error('OAuth cancelled');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: q.query.code,
        client_id: process.env.GOOGLE_LOGIN_CLIENT_ID!,
        client_secret: process.env.GOOGLE_LOGIN_CLIENT_SECRET!,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        code_verifier: flow.verifier,
      }),
    });
    if (!response.ok) throw new Error('OAuth exchange failed');
    const token = (await response.json()) as { id_token?: string };
    if (!token.id_token) throw new Error('Missing Google token');
    const claims = verifyGoogleToken(
      token.id_token,
      await signingKeys(),
      process.env.GOOGLE_LOGIN_CLIENT_ID!,
      flow.nonce,
    );
    const [linked] = await db
      .select()
      .from(s.googleIdentities)
      .where(eq(s.googleIdentities.subject, claims.sub));
    if (!linked && !googleEmailAuthoritative(claims)) {
      const link = secret();
      await db.delete(s.googleLinks).where(sql`${s.googleLinks.expires}<=now()`);
      await db.insert(s.googleLinks).values({
        id: hash(link),
        subject: claims.sub,
        email: claims.email,
        expires: new Date(Date.now() + CODE_LIFETIME).toISOString(),
      });
      r.cookie('bandarlog_google_link', link, {
        httpOnly: true,
        secure: prod,
        sameSite: 'lax',
        maxAge: CODE_LIFETIME,
        path: '/',
      });
      return r.redirect(`${groupUrl(appUrl)}?auth_error=google_email_verify`);
    }
    const session = await db.transaction(async (tx: any) => {
      let user;
      if (linked) {
        [user] = await tx.select().from(s.users).where(eq(s.users.id, linked.userId));
        if (!user) fail(403, 'Cuenta no disponible.');
        if (user.email === claims.email) user = await authenticatedUser(tx, user.email);
      } else {
        user = await authenticatedUser(tx, claims.email);
        await tx
          .insert(s.googleIdentities)
          .values({ subject: claims.sub, userId: user.id })
          .onConflictDoNothing();
        const [identity] = await tx
          .select()
          .from(s.googleIdentities)
          .where(eq(s.googleIdentities.subject, claims.sub));
        if (identity?.userId !== user.id) fail(403, 'Identidad de Google ya vinculada.');
      }
      return createSession(tx, user.id);
    });
    sessionCookie(r, session.raw);
    r.redirect(groupUrl(appUrl));
  } catch {
    // Never leak tokens, callback parameters, credentials, or provider response bodies.
    r.redirect(`${groupUrl(appUrl)}?auth_error=google`);
  }
});

if (!prod)
  app.get('/api/dev/mail', async (_q, r) => {
    r.json(await db.select().from(s.notifications).orderBy(s.notifications.createdAt));
  });
for (const file of ['sw.js', 'offline-store.js', 'offline.html'])
  app.get('/' + file, async (_q, r) => {
    if (file === 'offline-store.js') {
      const legacy = groupContext.getStore()?.id === legacyGroup.id && Boolean(groupPath());
      return r
        .set('Cache-Control', 'no-store')
        .type('js')
        .send(
          `globalThis.BANDARLOG_LEGACY_STORAGE = ${legacy};\n` +
            (await readFile('public/' + file, 'utf8')),
        );
    }
    r.sendFile('public/' + file, { root: process.cwd() });
  });
app.get('/manifest.webmanifest', (_q, r) => {
  const group = groupContext.getStore()!,
    base = groupPath() || '';
  r.set('Cache-Control', 'no-store')
    .type('application/manifest+json')
    .json({
      id: base + '/',
      name: 'Bandarlog · ' + group.name,
      short_name: 'Bandarlog',
      lang: 'es',
      start_url: canonicalGroupPath() + '/',
      scope: base + '/',
      display: 'standalone',
      background_color: '#103b2d',
      theme_color: '#103b2d',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
});
app.use('/api', async (q, r, n) => {
  const raw = q.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('bandarlog='))
    ?.slice(10);
  if (!raw) return r.status(401).json({ error: 'Inicia sesión para continuar.' });
  const [session] = await db
    .select()
    .from(s.sessions)
    .where(
      and(
        eq(s.sessions.id, hash(raw)),
        sql`${s.sessions.expires}>now()`,
        sql`${s.sessions.absoluteExpiresAt}>now()`,
      ),
    );
  if (!session) return r.status(401).json({ error: 'Tu sesión ha caducado.' });
  const { avatarUrl: _avatar, ...authColumns } = getTableColumns(s.users);
  const [user] = await db
    .select(q.path === '/me' ? getTableColumns(s.users) : authColumns)
    .from(s.users)
    .where(eq(s.users.id, session.userId));
  if (!user || user.disabledAt) return r.sendStatus(401);
  r.locals.user = user;
  r.locals.session = session;
  if (!['GET', 'HEAD'].includes(q.method)) {
    if (q.headers['x-csrf-token'] !== session.csrf)
      return r
        .status(403)
        .json({ error: 'La sesión de seguridad ha cambiado. Recarga la página.' });
    const origin = q.headers.origin;
    if (
      origin &&
      !allowedOrigin(q) &&
      !new Set([
        new URL(groupUrl(appUrl)).origin,
        ...(!prod
          ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4174']
          : []),
      ]).has(origin)
    )
      return r.status(403).json({ error: 'Origen no permitido.' });
  }
  if (+new Date(session.renewedAt) <= Date.now() - SESSION_RENEW_INTERVAL) {
    const expires = sessionDeadline(session.absoluteExpiresAt);
    const renewed = await db
      .update(s.sessions)
      .set({ expires, renewedAt: now() })
      .where(
        and(
          eq(s.sessions.id, session.id),
          sql`${s.sessions.renewedAt} <= now() - interval '1 day'`,
        ),
      )
      .returning();
    if (renewed.length) {
      r.locals.session = renewed[0];
      sessionCookie(r, raw, +new Date(expires));
    }
  }
  n();
});
async function withReceipt(q: express.Request, r: express.Response, fn: (tx: any) => Promise<any>) {
  const mutation = q.get('X-Mutation-ID');
  if (mutation && !z.uuid().safeParse(mutation).success)
    fail(400, 'Identificador de cambio no válido.');
  return db.transaction(async (tx: any) => {
    if (!mutation) return fn(tx);
    const key = hash(`${r.locals.user.id}:${q.method}:${q.path}:${mutation}`);
    const fingerprint = hash(JSON.stringify(q.body));
    await tx
      .insert(s.mutationReceipts)
      .values({ id: key, userId: r.locals.user.id, response: '' })
      .onConflictDoNothing();
    const rows = await tx.execute(
      sql`select response from mutation_receipts where id=${key} for update`,
    );
    const saved = rows.rows[0]?.response;
    if (saved) {
      const previous = JSON.parse(String(saved));
      if (previous.fingerprint !== fingerprint)
        fail(409, 'El identificador de cambio ya se ha usado.');
      return previous.result;
    }
    const result = await fn(tx);
    await tx
      .update(s.mutationReceipts)
      .set({ response: JSON.stringify({ fingerprint, result }) })
      .where(eq(s.mutationReceipts.id, key));
    return result;
  });
}
// Dedicated tutorial storage never invokes task, membership, mail or activity services.
app.get('/api/tutorial', async (_q, r) => r.json(await readTutorial(db, r.locals.user.id)));
app.get('/api/tutorial/stats', async (_q, r) => {
  if (r.locals.user.role !== 'admin')
    fail(403, 'Solo Administración puede consultar estas estadísticas.');
  await expireTutorials(db);
  const rows = await db.select().from(s.tutorialProgress);
  r.json(summarizeTutorial(rows));
});
app.post(
  '/api/tutorial',
  rateLimit({
    windowMs: 60000,
    limit: 120,
    keyGenerator: (_q, r) => r.locals.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  async (q, r) => {
    if (r.locals.user.onboardingCompletedAt === null)
      fail(409, 'Completa primero tu nombre y foto opcional.');
    const command = parse(tutorialCommand, q.body);
    try {
      r.json(await withReceipt(q, r, (tx) => writeTutorial(tx, r.locals.user.id, command)));
    } catch (error) {
      if (error instanceof TutorialError) fail(error.status, error.message);
      throw error;
    }
  },
);
app.get('/api/events', (q, r) => {
  r.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  r.flushHeaders();
  const configured = Number(process.env.SSE_RECONCILE_SECONDS?.trim() || '120');
  const reconcileAfterMs =
    Number.isFinite(configured) && (configured === 0 || configured >= 15)
      ? Math.min(configured, 3600) * 1000
      : 120000;
  r.write('event: ready\ndata: ' + JSON.stringify({ reconcileAfterMs }) + '\n\n');
  liveViews.set(r, groupContext.getStore()!.id);
  const timer = setInterval(() => r.write(': keepalive\n\n'), 25000);
  q.on('close', () => {
    clearInterval(timer);
    liveViews.delete(r);
  });
});
const globalManage = (u: any) => u.role === 'admin' || u.role === 'coordination';
async function activeAccount(tx: any, uid: string) {
  const [user] = await tx.select().from(s.users).where(eq(s.users.id, uid)).for('update');
  if (!user || user.disabledAt) fail(400, 'Selecciona una persona con acceso activo.');
}
async function membership(uid: string, cid: string, tx: any = db) {
  const [m] = await tx
    .select()
    .from(s.members)
    .where(and(eq(s.members.userId, uid), eq(s.members.commissionId, cid)));
  return m;
}
async function authorize(u: any, cid: string, manage = false, tx: any = db) {
  const [commission] = await tx.select().from(s.commissions).where(eq(s.commissions.id, cid));
  if (!commission || commission.deletedAt) fail(404, 'Comisión no encontrada.');
  if (globalManage(u)) return;
  const m = await membership(u.id, cid, tx);
  if (!m || (manage && m.role !== 'responsible'))
    fail(403, 'No tienes permiso para esta comisión.');
}
async function editableTask(u: any, taskId: string, tx: any = db, manage = false) {
  const [task] = await tx.select().from(s.tasks).where(eq(s.tasks.id, taskId));
  if (!task || task.deletedAt) fail(404, 'Tarea no encontrada.');
  await authorize(u, task.commissionId, false, tx);
  if (!globalManage(u)) {
    const m = await membership(u.id, task.commissionId, tx);
    const [a] = await tx
      .select()
      .from(s.assignments)
      .where(and(eq(s.assignments.taskId, taskId), eq(s.assignments.userId, u.id)));
    if (m?.role !== 'responsible' && (manage || !a))
      fail(403, 'Solo los responsables o coordinación pueden modificar esta tarea.');
  }
  const [project] = await tx
    .select({ archived: s.projects.archived })
    .from(s.projects)
    .innerJoin(s.commissions, eq(s.commissions.projectId, s.projects.id))
    .where(eq(s.commissions.id, task.commissionId));
  if (project?.archived === 'true') fail(409, 'El proyecto está archivado.');
  return task;
}
async function event(tx: any, taskId: string, uid: string, kind: string, body: string) {
  await tx
    .insert(s.activity)
    .values({ id: id(), taskId, userId: uid, kind, body, createdAt: now() });
}
async function removeAssignments(tx: any, uid: string, actor: string, name: string, cid?: string) {
  const removed = await tx
    .delete(s.assignments)
    .where(
      and(
        eq(s.assignments.userId, uid),
        ...(cid
          ? [sql`${s.assignments.taskId} in (select id from tasks where commission_id=${cid})`]
          : []),
      ),
    )
    .returning({ taskId: s.assignments.taskId });
  const ids = [...new Set(removed.map((row: { taskId: string }) => row.taskId))] as string[];
  if (!ids.length) return;
  const stamp = now();
  await tx.update(s.tasks).set({ updatedAt: stamp }).where(inArray(s.tasks.id, ids));
  await tx.insert(s.activity).values(
    ids.map((taskId) => ({
      id: id(),
      taskId,
      userId: actor,
      kind: 'unassigned',
      body: `Se ha retirado a ${name} de los responsables al darle de baja.`,
      createdAt: stamp,
    })),
  );
}
async function taskMail(
  tx: any,
  t: any,
  subject: string,
  key: string,
  options: { recipientId?: string; event?: 'creation' | 'updates' | 'scheduled' } = {},
) {
  const rows = await tx
    .select({ user: s.users })
    .from(s.assignments)
    .innerJoin(s.users, eq(s.users.id, s.assignments.userId))
    .where(eq(s.assignments.taskId, t.id));
  const [c] = await tx.select().from(s.commissions).where(eq(s.commissions.id, t.commissionId));
  if (!c || c.deletedAt) return;
  const [p] = await tx.select().from(s.projects).where(eq(s.projects.id, c.projectId));
  for (const { user } of rows) {
    if (user.disabledAt) continue;
    const pref = preferences(user.preferences);
    if (
      !pref.notifications ||
      (options.recipientId && user.id !== options.recipientId) ||
      (options.event === 'creation' && !pref.creation) ||
      ((options.event || 'updates') === 'updates' && !pref.updates)
    )
      continue;
    await queue(
      user.email,
      `${subject}: ${t.title}`,
      `Bandarlog\n${t.title}\n${c.name} · ${p.name}\nResponsables: ${rows.map((x: any) => x.user.name).join(', ')}\nFecha límite: ${new Date(t.due).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\nEstado: ${t.status}\n${t.description}\n\nAbrir tarea: ${groupUrl(appUrl)}?task=${t.id}\nMarcar en curso: ${groupUrl(appUrl)}?task=${t.id}&action=in_progress\nTerminar: ${groupUrl(appUrl)}?task=${t.id}&action=done\nBloquear: ${groupUrl(appUrl)}?task=${t.id}&action=blocked\nLas acciones requieren iniciar sesión y confirmar.`,
      `${key}-${user.id}`,
      tx,
      renderMail({
        title: `${subject}: ${t.title}`,
        appUrl,
        body: t.description + (t.blockedReason ? '\nMotivo del bloqueo: ' + t.blockedReason : ''),
        details: [
          { label: 'Grupo', value: groupContext.getStore()!.name },
          { label: 'Comisión', value: c.name },
          { label: 'Proyecto', value: p.name },
          { label: 'Responsables', value: rows.map((x: any) => x.user.name).join(', ') },
          {
            label: 'Fecha límite',
            value: new Date(t.due).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
          },
          {
            label: 'Estado',
            value:
              (
                {
                  pending: 'Pendiente',
                  in_progress: 'En curso',
                  blocked: 'Bloqueada',
                  done: 'Terminada',
                } as Record<string, string>
              )[t.status] || t.status,
          },
        ],
        actions: [
          { label: 'Ver tarea', url: `${groupUrl(appUrl)}?task=${t.id}` },
          ...(t.status !== 'done'
            ? [
                {
                  label: 'Marcar en curso',
                  kind: 'in_progress' as const,
                  url: `${groupUrl(appUrl)}?task=${t.id}&action=in_progress`,
                  secondary: true,
                },
                {
                  label: 'Completar tarea',
                  kind: 'done' as const,
                  url: `${groupUrl(appUrl)}?task=${t.id}&action=done`,
                  secondary: true,
                },
                {
                  label: 'Bloquear tarea',
                  kind: 'blocked' as const,
                  url: `${groupUrl(appUrl)}?task=${t.id}&action=blocked`,
                  secondary: true,
                },
              ]
            : []),
        ],
      }),
    );
    await tx
      .insert(s.pushOutbox)
      .values({
        id: hash(`${key}-${user.id}`),
        userId: user.id,
        payload: JSON.stringify({
          title: subject,
          body: `${t.title} · ${c.name}`,
          url: `${canonicalGroupPath()}/?task=${t.id}`,
          tag: `task-${t.id}`,
        }),
      })
      .onConflictDoNothing();
  }
}
app.get('/api/push/config', (_q, r) => r.json({ publicKey: push.publicKey }));
app.post('/api/push/subscriptions', async (q, r) => {
  const input = parse(
    z.object({
      endpoint: z.url().max(2000),
      expirationTime: z.number().nullable().optional(),
      keys: z.object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      }),
    }),
    q.body,
  );
  if (!validPushEndpoint(input.endpoint)) fail(400, 'Proveedor de notificaciones no admitido.');
  const key = hash(input.endpoint);
  await db
    .insert(s.pushSubscriptions)
    .values({ id: key, userId: r.locals.user.id, subscription: JSON.stringify(input) })
    .onConflictDoUpdate({
      target: [s.pushSubscriptions.groupId, s.pushSubscriptions.id],
      set: { userId: r.locals.user.id, subscription: JSON.stringify(input) },
    });
  r.json({ ok: true });
});
app.delete('/api/push/subscriptions', async (q, r) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().max(2000) }), q.body);
  await db
    .delete(s.pushSubscriptions)
    .where(
      and(
        eq(s.pushSubscriptions.id, hash(endpoint)),
        eq(s.pushSubscriptions.userId, r.locals.user.id),
      ),
    );
  r.json({ ok: true });
});
app.get('/api/group', (_q, r) => r.json(groupContext.getStore()));
app.patch('/api/group', async (q, r) => {
  if (r.locals.user.role !== 'admin') fail(403, 'Solo Administración puede configurar el grupo.');
  const input = parse(
    z
      .object({
        name: z.string().trim().min(2).max(100),
        colorPrimary: groupColor,
        colorSecondary: groupColor,
      })
      .strict(),
    q.body,
  );
  await ownerDb.update(s.groups).set(input).where(eq(s.groups.id, groupContext.getStore()!.id));
  r.json({ ok: true });
});
app.get('/api/me', (_q, r) => {
  rememberEntry(
    r,
    groupContext.getStore()!,
    r.locals.session.id,
    Math.min(+new Date(r.locals.session.expires), +new Date(r.locals.session.absoluteExpiresAt)),
    prod,
  );
  r.json({
    user: r.locals.user,
    group: groupContext.getStore(),
    csrf: r.locals.session.csrf,
    development: !prod,
    googleEnabled: Boolean(
      process.env.GOOGLE_LOGIN_CLIENT_ID && process.env.GOOGLE_LOGIN_CLIENT_SECRET,
    ),
  });
});
app.post('/api/onboarding', async (q, r) => {
  const input = parse(
    z.object({ name: text, avatarUrl: z.string().nullable().optional() }),
    q.body,
  );
  let photo: string | null | undefined;
  if (input.avatarUrl !== undefined) {
    try {
      photo = await normalizePhoto(input.avatarUrl);
    } catch (e) {
      fail(400, (e as Error).message);
    }
  }
  await db.transaction(async (tx: any) => {
    await tx
      .update(s.users)
      .set({
        name: input.name,
        ...(photo !== undefined ? { avatarUrl: photo } : {}),
        onboardingCompletedAt: now(),
      })
      .where(eq(s.users.id, r.locals.user.id));
  });
  r.json({ ok: true });
});
app.post('/api/logout', async (q, r) => {
  await db.delete(s.sessions).where(eq(s.sessions.id, r.locals.session.id));
  if (
    requestCookie(q.headers.cookie, ENTRY_COOKIE) ===
    groupContext.getStore()!.privateId + '.' + r.locals.session.id
  )
    r.clearCookie(ENTRY_COOKIE, { path: '/' });
  if (groupContext.getStore()?.id === legacyGroup.id) r.clearCookie('bandarlog', { path: '/' });
  r.clearCookie('bandarlog', { path: groupPath() || '/' }).json({ ok: true });
});
app.patch('/api/profile', async (q, r) => {
  const input = parse(
    z
      .object({
        name: text.optional(),
        avatarUrl: z.string().nullable().optional(),
        forestEffects: z.boolean().optional(),
        notifications: z.boolean().optional(),
        weekly: z.boolean().optional(),
        creation: z.boolean().optional(),
        updates: z.boolean().optional(),
        reminderDays: z.array(z.number().int().min(1).max(90)).max(10).optional(),
        onDue: z.boolean().optional(),
        overdueWeekly: z.boolean().optional(),
        overdueDaily: z.boolean().optional(),
      })
      .refine(
        (value) => Object.values(value).some((field) => field !== undefined),
        'Indica un cambio en tu perfil.',
      ),
    q.body,
  );
  const { name, avatarUrl, ...changes } = input;
  const previous = preferences(r.locals.user.preferences);
  const merged = preferenceSchema.parse({ ...previous, ...changes });
  let photo: string | null | undefined;
  if (avatarUrl !== undefined) {
    try {
      photo = await normalizePhoto(avatarUrl);
    } catch (e) {
      fail(400, (e as Error).message);
    }
  }
  await db
    .update(s.users)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(Object.keys(changes).length ? { preferences: JSON.stringify(merged) } : {}),
      ...(photo !== undefined ? { avatarUrl: photo } : {}),
    })
    .where(eq(s.users.id, r.locals.user.id));
  r.json({ ok: true });
});
async function extraArtwork(storage: Pick<Database, 'select'> = db) {
  const rows = await storage
    .select({
      id: s.artworkEntries.id,
      name: s.artworkEntries.name,
      collection: s.artworkEntries.collection,
      family: s.artworkEntries.family,
    })
    .from(s.artworkEntries);
  return rows.map((entry) => ({
    ...entry,
    collection: entry.collection as ArtworkTheme,
    familyName: artworkCatalog.find((a) => a.family === entry.family)?.familyName || 'Scouts',
    icon: 'Palette',
    iconUrl: `${canonicalGroupPath()}/api/artwork/assets/${entry.id}/icon`,
    mascotUrl: `${canonicalGroupPath()}/api/artwork/assets/${entry.id}/mascot`,
  }));
}
app.get('/api/artwork/catalog', async (_q, r) =>
  r.json([...artworkCatalog, ...(await extraArtwork())]),
);
app.post('/api/artwork/catalog', async (q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación puede ampliar el catálogo.');
  const input = parse(
    z.object({
      name: text,
      collection: z.enum(['scout', 'christmas']),
      family: text,
      icon: z.string().max(200000),
      mascot: z.string().max(200000),
    }),
    q.body,
  );
  if (!artworkCatalog.some((a) => a.family === input.family))
    fail(400, 'Selecciona un tipo de comisión.');
  let iconData: string, mascotData: string;
  try {
    iconData = await artworkImage(input.icon, 'icon');
    mascotData = await artworkImage(input.mascot, 'mascot');
  } catch {
    return fail(400, 'Usa imágenes PNG, JPEG o WebP válidas.');
  }
  const entryId = id();
  await db.insert(s.artworkEntries).values({
    id: entryId,
    name: input.name,
    collection: input.collection,
    family: input.family,
    iconData,
    mascotData,
    createdBy: r.locals.user.id,
    createdAt: now(),
  });
  r.status(201).json({ id: entryId });
});
app.get('/api/artwork/assets/:id/:kind', async (q, r) => {
  const kind = parse(z.enum(['icon', 'mascot']), q.params.kind);
  const [entry] = await db
    .select({ data: kind === 'icon' ? s.artworkEntries.iconData : s.artworkEntries.mascotData })
    .from(s.artworkEntries)
    .where(eq(s.artworkEntries.id, String(q.params.id)));
  if (!entry) return fail(404, 'Ilustración no encontrada.');
  r.type('image/webp').send(Buffer.from(entry.data.split(',')[1], 'base64'));
});
function visibleTaskIds(user: any) {
  return db
    .select({ id: s.tasks.id })
    .from(s.tasks)
    .innerJoin(s.commissions, eq(s.commissions.id, s.tasks.commissionId))
    .where(
      and(
        sql`${s.tasks.deletedAt} is null`,
        sql`${s.commissions.deletedAt} is null`,
        globalManage(user)
          ? undefined
          : sql`exists (select 1 from ${s.members} where ${s.members.commissionId} = ${s.commissions.id} and ${s.members.userId} = ${user.id})`,
      ),
    );
}
app.get('/api/activity', async (q, r) => {
  const filter = parse(
    z.object({ taskId: text.optional(), commissionId: text.optional() }),
    q.query,
  );
  const page = pageRequest(q.query, [
    groupContext.getStore()!.id,
    r.locals.user.id,
    'activity',
    filter,
  ]);
  const rows = await db
    .select()
    .from(s.activity)
    .where(
      and(
        inArray(s.activity.taskId, visibleTaskIds(r.locals.user)),
        filter.taskId ? eq(s.activity.taskId, filter.taskId) : undefined,
        filter.commissionId
          ? inArray(
              s.activity.taskId,
              db
                .select({ id: s.tasks.id })
                .from(s.tasks)
                .where(eq(s.tasks.commissionId, filter.commissionId)),
            )
          : undefined,
        page.before(s.activity.createdAt, s.activity.id),
      ),
    )
    .orderBy(sql`${s.activity.createdAt} desc`, sql`${s.activity.id} desc`)
    .limit(page.limit + 1);
  r.json(page.finish(rows));
});
app.get('/api/data', async (_q, r) => {
  const response = await db.transaction(async (tx) => {
    const db = tx as unknown as Database;
    const catalogueExtra = await extraArtwork(db);
    const u = r.locals.user;
    const cs = await db
      .select()
      .from(s.commissions)
      .where(
        and(
          sql`${s.commissions.deletedAt} is null`,
          globalManage(u)
            ? undefined
            : inArray(
                s.commissions.id,
                db
                  .select({ id: s.members.commissionId })
                  .from(s.members)
                  .where(eq(s.members.userId, u.id)),
              ),
        ),
      );
    const cids = cs.map((c) => c.id);
    const ts = cids.length
      ? await db
          .select()
          .from(s.tasks)
          .where(and(inArray(s.tasks.commissionId, cids), sql`${s.tasks.deletedAt} is null`))
      : [];
    const tids = ts.map((t) => t.id);
    const visibleMembers = cids.length
      ? await db.select().from(s.members).where(inArray(s.members.commissionId, cids))
      : [];
    const visibleProjects = await db
      .select()
      .from(s.projects)
      .where(
        globalManage(u)
          ? undefined
          : sql`(
      ${inArray(
        s.projects.id,
        cs.map((c) => c.projectId),
      )} or
      ${s.projects.id} in (select ${s.projectMembers.projectId} from ${s.projectMembers} where ${s.projectMembers.userId} = ${u.id})
    )`,
      );
    const visibleProjectMembers = visibleProjects.length
      ? await db
          .select()
          .from(s.projectMembers)
          .where(
            inArray(
              s.projectMembers.projectId,
              visibleProjects.map((p) => p.id),
            ),
          )
      : [];
    const projectsById = new Map(visibleProjects.map((project) => [project.id, project]));
    const uids = new Set([
      u.id,
      ...visibleMembers.map((m) => m.userId),
      ...visibleProjectMembers.map((m) => m.userId),
    ]);
    const us = await publicUsers(
      db,
      groupContext.getStore()!.id,
      globalManage(u) ? undefined : [...uids],
    );
    const responsibleIds = visibleMembers
      .filter((m) => m.userId === u.id && m.role === 'responsible')
      .map((m) => m.commissionId);
    const activeUsers = new Set(us.filter((user) => !user.disabledAt).map((user) => user.id));
    const taskCommissions = new Map(ts.map((task) => [task.id, task.commissionId]));
    const memberKeys = new Set(
      visibleMembers.map((member) => JSON.stringify([member.commissionId, member.userId])),
    );
    const assignments = tids.length
      ? (await db.select().from(s.assignments).where(inArray(s.assignments.taskId, tids))).filter(
          (assignment) =>
            activeUsers.has(assignment.userId) &&
            memberKeys.has(
              JSON.stringify([taskCommissions.get(assignment.taskId), assignment.userId]),
            ),
        )
      : [];
    const summaries = await projectSummaries(db, visibleProjects);
    return {
      projectSummaries: summaries,
      campSummaries: summaries.filter((summary) => projectsById.get(summary.id)?.type === 'camp'),
      artworkEnabled: true,
      artworkThemes,
      projects: visibleProjects.map((p) => ({ ...p, artworkTheme: projectArtworkTheme(p) })),
      projectMembers: visibleProjectMembers,
      commissions: cs.map((c) => {
        const theme = projectArtworkTheme(projectsById.get(c.projectId)!);
        const artworkLocked = hasArtworkAssociation(c.name, theme, catalogueExtra);
        const artwork = selectArtwork(
          {
            name: c.name,
            description: c.description,
            theme,
            key: artworkLocked ? null : c.artworkKey,
            seed: c.id,
          },
          catalogueExtra,
        );
        return {
          ...c,
          iconUrl: artwork.iconUrl,
          mascotUrl: artwork.mascotUrl,
          artworkStatus: 'ready',
          artworkKey: artwork.id,
          artworkLocked,
          artworkMode: !artworkLocked && c.artworkKey === artwork.id ? 'manual' : 'automatic',
        };
      }),
      group: groupContext.getStore(),
      members: visibleMembers,
      users: us,
      tasks: ts,
      assignments,
      activity: tids.length
        ? await db
            .select()
            .from(s.activity)
            .where(inArray(s.activity.taskId, tids))
            .orderBy(sql`${s.activity.createdAt} desc`, sql`${s.activity.id} desc`)
            .limit(100)
        : [],
      invitations: (globalManage(u) || responsibleIds.length
        ? await db
            .select()
            .from(s.invitations)
            .where(
              globalManage(u) ? undefined : inArray(s.invitations.commissionId, responsibleIds),
            )
        : []
      ).map((i) => ({
        ...i,
        status: i.status === 'pending' && new Date(i.expires) < new Date() ? 'expired' : i.status,
      })),
    };
  });
  r.json(response);
});
app.post('/api/projects', async (q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación puede crear proyectos.');
  const input = parse(
    z.object({
      name: text,
      type: projectTypeInput.default('general'),
      artworkTheme: z.enum(['scout', 'christmas']).optional(),
      parentId: z.string().trim().max(200).nullable().optional(),
      starts: z.iso.date(),
      ends: z.iso.date(),
    }),
    q.body,
  );
  if (input.ends < input.starts) fail(400, 'La fecha final debe ser posterior al inicio.');
  // Retained only for old API clients and historical imports, never inherited.
  const parentId = input.parentId || null;
  if (parentId) {
    const [parent] = await db.select().from(s.projects).where(eq(s.projects.id, parentId));
    if (!parent) fail(400, 'La referencia histórica de proyecto no existe.');
  }
  const [p] = await db
    .insert(s.projects)
    .values({
      ...input,
      artworkTheme: projectArtworkTheme(input),
      id: id(),
      parentId,
    })
    .returning();
  r.status(201).json(p);
});
app.patch('/api/projects/:id', async (q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación puede modificar proyectos.');
  const { archived, artworkTheme, type } = parse(
    z
      .object({
        archived: z.boolean().optional(),
        type: projectTypeInput.optional(),
        artworkTheme: z.enum(['scout', 'christmas']).optional(),
      })
      .refine(
        (v) => v.archived !== undefined || v.artworkTheme !== undefined || v.type !== undefined,
        'Indica un cambio.',
      ),
    q.body,
  );
  const [existingProject] = await db
    .select()
    .from(s.projects)
    .where(eq(s.projects.id, String(q.params.id)));
  if (!existingProject) fail(404, 'Proyecto no encontrado.');
  if (
    existingProject &&
    artworkTheme === 'scout' &&
    inferArtworkTheme(existingProject.name) === 'christmas'
  )
    fail(409, 'El nombre del proyecto tiene asociada la colección de Navidad.');
  await db
    .update(s.projects)
    .set({
      ...(archived !== undefined ? { archived: String(archived) } : {}),
      ...(artworkTheme ? { artworkTheme } : {}),
      ...(type !== undefined ? { type } : {}),
    })
    .where(eq(s.projects.id, String(q.params.id)));
  r.json({ ok: true });
});
app.post('/api/commissions', async (q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación puede crear comisiones.');
  const input = parse(
    z.object({
      name: text,
      projectId: text,
      description: z.string().max(3000).default(''),
      icon: z.string().default('tent'),
      members: z.array(z.object({ userId: text, role: commissionRole })).min(1),
    }),
    q.body,
  );
  const [p] = await db.select().from(s.projects).where(eq(s.projects.id, input.projectId));
  if (!p || p.archived === 'true') fail(400, 'Selecciona un proyecto activo.');
  const cid = q.body.clientId ? parse(z.uuid(), q.body.clientId) : id();
  const result = await withReceipt(q, r, async (tx: any) => {
    await tx.insert(s.commissions).values({
      id: cid,
      name: input.name,
      projectId: input.projectId,
      description: input.description,
      icon: input.icon,
    });
    for (const m of input.members) {
      await activeAccount(tx, m.userId);
      await tx.insert(s.members).values({ id: id(), commissionId: cid, ...m });
    }
    return { id: cid };
  });
  r.status(201).json(result);
});
// Commission deletion is logical: tasks, memberships and activity remain for history.
async function managedCommission(tx: any, user: any, cid: string) {
  await tx.execute(sql`select id from commissions where id=${cid} for update`);
  await authorize(user, cid, true, tx);
  const [commission] = await tx.select().from(s.commissions).where(eq(s.commissions.id, cid));
  const [project] = await tx
    .select()
    .from(s.projects)
    .where(eq(s.projects.id, commission.projectId));
  if (project?.archived === 'true') fail(409, 'El proyecto está archivado.');
  return commission;
}
app.patch('/api/commissions/:id', async (q, r) => {
  const cid = String(q.params.id);
  const input = parse(
    z
      .object({
        name: text.optional(),
        description: z.string().trim().max(3000).optional(),
        expected: z.object({ name: z.string(), description: z.string() }).strict().optional(),
      })
      .strict()
      .refine((v) => v.name !== undefined || v.description !== undefined, 'Indica un cambio.'),
    q.body,
  );
  await db.transaction(async (tx: any) => {
    const commission = await managedCommission(tx, r.locals.user, cid);
    if (
      input.expected &&
      (input.expected.name !== commission.name ||
        input.expected.description !== commission.description)
    )
      fail(409, 'La comisión ha cambiado. Cierra los ajustes y vuelve a abrirlos antes de editar.');
    await tx
      .update(s.commissions)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      })
      .where(eq(s.commissions.id, cid));
  });
  r.json({ ok: true });
});
app.delete('/api/commissions/:id', async (q, r) => {
  const cid = String(q.params.id);
  await db.transaction(async (tx: any) => {
    await managedCommission(tx, r.locals.user, cid);
    await tx
      .update(s.commissions)
      .set({ deletedAt: now(), deletedBy: r.locals.user.id })
      .where(eq(s.commissions.id, cid));
    await tx
      .update(s.invitations)
      .set({ status: 'cancelled' })
      .where(and(eq(s.invitations.commissionId, cid), eq(s.invitations.status, 'pending')));
  });
  r.json({ ok: true });
});
app.post('/api/commissions/:id/artwork', async (q, r) => {
  const cid = String(q.params.id);
  await authorize(r.locals.user, cid, true);
  const { key } = parse(z.object({ key: z.string().nullable().optional() }), q.body);
  const [c] = await db.select().from(s.commissions).where(eq(s.commissions.id, cid));
  const [p] = await db.select().from(s.projects).where(eq(s.projects.id, c.projectId));
  const extra = await extraArtwork();
  const theme = projectArtworkTheme(p);
  if (hasArtworkAssociation(c.name, theme, extra))
    fail(409, 'El nombre de esta comisión ya tiene ilustraciones asociadas.');
  const available = [...artworkCatalog, ...extra];
  if (key && !available.some((a) => a.id === key && a.collection === theme))
    fail(400, 'Selecciona una ilustración de la colección de este proyecto.');
  await db
    .update(s.commissions)
    .set({ artworkKey: key || null, artworkStatus: 'ready' })
    .where(eq(s.commissions.id, cid));
  r.json({ ok: true });
});
app.post('/api/projects/:id/members', async (q, r) => {
  if (!globalManage(r.locals.user))
    fail(403, 'Solo coordinación puede añadir personas al proyecto.');
  const pid = String(q.params.id);
  const { userIds } = parse(z.object({ userIds: z.array(text).min(1).max(100) }), q.body);
  const [p] = await db.select().from(s.projects).where(eq(s.projects.id, pid));
  if (!p || p.archived === 'true') fail(409, 'El proyecto no está disponible.');
  await db.transaction(async (tx: any) => {
    for (const userId of new Set(userIds)) {
      await activeAccount(tx, userId);
      await tx
        .insert(s.projectMembers)
        .values({ id: id(), projectId: pid, userId })
        .onConflictDoNothing();
    }
  });
  r.json({ ok: true });
});
app.post('/api/commissions/:id/members', async (q, r) => {
  const cid = String(q.params.id);
  await authorize(r.locals.user, cid, true);
  const input = parse(z.object({ userIds: z.array(text).min(1) }), q.body);
  await db.transaction(async (tx: any) => {
    for (const userId of new Set(input.userIds)) {
      await activeAccount(tx, userId);
      await tx
        .insert(s.members)
        .values({ id: id(), commissionId: cid, userId, role: 'scouter' })
        .onConflictDoNothing();
    }
  });
  r.json({ ok: true });
});
app.patch('/api/commissions/:id/members/:uid', async (q, r) => {
  const cid = String(q.params.id),
    uid = String(q.params.uid);
  await authorize(r.locals.user, cid, true);
  const { role } = parse(z.object({ role: commissionRole }), q.body);
  await db
    .update(s.members)
    .set({ role })
    .where(and(eq(s.members.commissionId, cid), eq(s.members.userId, uid)));
  r.json({ ok: true });
});
app.delete('/api/commissions/:id/members/:uid', async (q, r) => {
  const cid = String(q.params.id),
    uid = String(q.params.uid);
  await authorize(r.locals.user, cid, true);
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`select id from commissions where id=${cid} for update`);
    const [person] = await tx.select().from(s.users).where(eq(s.users.id, uid));
    await removeAssignments(tx, uid, r.locals.user.id, person?.name || 'esta persona', cid);
    await tx
      .delete(s.members)
      .where(and(eq(s.members.commissionId, cid), eq(s.members.userId, uid)));
  });
  r.json({ ok: true });
});
const taskInput = z.object({
  title: text,
  commissionId: text,
  description: z.string().max(5000).default(''),
  due: z.iso.datetime({ offset: true }),
  responsibleIds: z.array(text).min(1),
});
app.post('/api/tasks', async (q, r) => {
  const input = parse(taskInput, q.body);
  const tid = q.body.clientId ? parse(z.uuid(), q.body.clientId) : id();
  const result = await withReceipt(q, r, async (tx: any) => {
    await tx.execute(sql`select id from commissions where id=${input.commissionId} for update`);
    await authorize(r.locals.user, input.commissionId, true, tx);
    const [p] = await tx
      .select({ archived: s.projects.archived })
      .from(s.projects)
      .innerJoin(s.commissions, eq(s.commissions.projectId, s.projects.id))
      .where(eq(s.commissions.id, input.commissionId));
    if (p?.archived === 'true') fail(409, 'El proyecto está archivado.');
    for (const uid of input.responsibleIds)
      if (!(await membership(uid, input.commissionId, tx)))
        fail(400, 'Todos los responsables deben pertenecer a la comisión.');
    const { responsibleIds, ...data } = input;
    const [t] = await tx
      .insert(s.tasks)
      .values({ ...data, id: tid, status: 'pending', updatedAt: now() })
      .returning();
    for (const userId of new Set(responsibleIds))
      await tx.insert(s.assignments).values({ id: id(), taskId: tid, userId });
    await event(tx, tid, r.locals.user.id, 'created', 'Ha creado la tarea.');
    await taskMail(tx, t, 'Nueva asignación', `assigned-${tid}`, { event: 'creation' });
    return { id: tid, task: t };
  });
  void deliver();
  r.status(201).json(result);
});
app.patch('/api/tasks/:id', async (q, r) => {
  const tid = String(q.params.id);
  const input = parse(
    z
      .object({
        title: text.optional(),
        description: z.string().trim().max(5000).optional(),
        checklistChange: checklistChangeSchema.optional(),
        status: statuses.optional(),
        expectedUpdatedAt: z.string().optional(),
        blockedReason: z.string().trim().max(1000).optional(),
        responsibleIds: z.array(text).min(1).optional(),
        due: z.iso.datetime({ offset: true }).optional(),
      })
      .strict()
      .refine(
        (value) =>
          Object.keys(value).some((key) => key !== 'expectedUpdatedAt' && key !== 'blockedReason'),
        'Indica un cambio.',
      ),
    q.body,
  );
  const changedTask = await withReceipt(q, r, async (tx: any) => {
    await tx.execute(sql`select commission_id from tasks where id=${tid} for update`);
    const t = await editableTask(
      r.locals.user,
      tid,
      tx,
      !!(
        input.responsibleIds ||
        input.due ||
        input.title !== undefined ||
        input.description !== undefined ||
        (input.checklistChange && input.checklistChange.action !== 'toggle')
      ),
    );
    if (input.expectedUpdatedAt && +new Date(input.expectedUpdatedAt) !== +new Date(t.updatedAt))
      fail(409, 'La tarea ha cambiado. Actualiza la vista antes de modificarla.');
    await tx.execute(sql`select id from commissions where id=${t.commissionId} for update`);
    await authorize(r.locals.user, t.commissionId, false, tx);
    if (input.status === 'blocked' && !input.blockedReason)
      fail(400, 'Indica un motivo de bloqueo.');
    if (input.responsibleIds) {
      for (const uid of input.responsibleIds)
        if (!(await membership(uid, t.commissionId, tx)))
          fail(400, 'Los responsables deben ser miembros de la comisión.');
      const previous = await tx.select().from(s.assignments).where(eq(s.assignments.taskId, tid));
      for (const assignment of previous)
        if (!input.responsibleIds.includes(assignment.userId))
          await tx.delete(s.assignments).where(eq(s.assignments.id, assignment.id));
      for (const userId of new Set(input.responsibleIds))
        if (!previous.some((a: any) => a.userId === userId))
          await tx.insert(s.assignments).values({ id: id(), taskId: tid, userId });
    }
    const update: any = {
      updatedAt: new Date(Math.max(Date.now(), +new Date(t.updatedAt) + 1)).toISOString(),
    };
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.checklistChange) {
      try {
        update.checklist = changeChecklist(t.checklist, input.checklistChange);
      } catch (error) {
        if (error instanceof ChecklistError) fail(error.status, error.message);
        throw error;
      }
    }
    if (input.due) update.due = input.due;
    if (input.status) {
      Object.assign(update, {
        status: input.status,
        blockedReason: input.status === 'blocked' ? input.blockedReason : null,
        completedBy: input.status === 'done' ? r.locals.user.id : null,
        completedAt: input.status === 'done' ? now() : null,
      });
    }
    const [changed] = await tx.update(s.tasks).set(update).where(eq(s.tasks.id, tid)).returning();
    await event(
      tx,
      tid,
      r.locals.user.id,
      'updated',
      input.status
        ? `Estado: ${input.status}${input.blockedReason ? ` · ${input.blockedReason}` : ''}`
        : input.checklistChange
          ? {
              add: 'Ha añadido un paso.',
              edit: 'Ha editado un paso.',
              toggle:
                input.checklistChange.action === 'toggle' && input.checklistChange.done
                  ? 'Ha marcado un paso.'
                  : 'Ha desmarcado un paso.',
              remove: 'Ha eliminado un paso.',
            }[input.checklistChange.action]
          : [
              input.title !== undefined && 'Ha actualizado el título.',
              input.description !== undefined && 'Ha actualizado la descripción.',
              input.responsibleIds && 'Ha reasignado responsables.',
              input.due && 'Ha cambiado la fecha límite.',
            ]
              .filter(Boolean)
              .join(' '),
    );
    if (
      !input.checklistChange ||
      input.title !== undefined ||
      input.description !== undefined ||
      input.due ||
      input.responsibleIds ||
      input.status
    )
      await taskMail(
        tx,
        changed,
        input.responsibleIds
          ? 'Reasignación'
          : input.due
            ? 'Cambio de fecha'
            : 'Actualización de tarea',
        `updated-${tid}-${id()}`,
      );
    return changed;
  });
  void deliver();
  r.json({ ok: true, task: changedTask });
});
app.delete('/api/tasks/:id', async (q, r) => {
  const tid = String(q.params.id);
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`select id from tasks where id=${tid} for update`);
    await editableTask(r.locals.user, tid, tx, true);
    await tx
      .update(s.tasks)
      .set({ deletedAt: now(), deletedBy: r.locals.user.id, updatedAt: now() })
      .where(eq(s.tasks.id, tid));
    await event(
      tx,
      tid,
      r.locals.user.id,
      'deleted',
      'Ha eliminado la tarea. Se conserva el historial.',
    );
  });
  r.json({ ok: true });
});
app.post('/api/tasks/:id/comments', async (q, r) => {
  const tid = String(q.params.id);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(3000) }), q.body);
  const result = await withReceipt(q, r, async (tx: any) => {
    await editableTask(r.locals.user, tid, tx);
    await event(tx, tid, r.locals.user.id, 'comment', body);
    return { ok: true };
  });
  r.status(201).json(result);
});
async function createInvitations(q: express.Request, r: express.Response) {
  if (r.locals.user.role !== 'admin') fail(403, 'Solo administración puede dar de alta usuarios.');
  const input = parse(
    z
      .object({
        commissionId: text.nullable().optional(),
        projectId: text.nullable().optional(),
        email: email.optional(),
        emails: z.array(email).min(1).max(100).optional(),
        name: text.optional(),
        role: commissionRole.default('scouter'),
      })
      .refine((v) => !!v.email !== !!v.emails),
    q.body,
  );
  const cid = input.commissionId || null,
    pid = input.projectId || null;
  if (cid && pid) fail(400, 'Elige un único destino para la invitación.');
  if (cid) await authorize(r.locals.user, cid, true);
  else if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación puede invitar al grupo.');
  if (!cid && input.role !== 'scouter') fail(400, 'El rol Responsable pertenece a una comisión.');
  if (pid && !globalManage(r.locals.user))
    fail(403, 'Solo coordinación puede invitar a un proyecto.');
  const recipients = [...new Set(input.emails || [input.email!])];
  const created: string[] = [],
    skipped: { email: string; reason: string }[] = [];
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`lock table invitations in share row exclusive mode`);
    let commissionName = 'el grupo';
    if (pid) {
      const [p] = await tx.select().from(s.projects).where(eq(s.projects.id, pid));
      if (!p) fail(404, 'Proyecto no encontrado.');
      if (p.archived === 'true') fail(409, 'El proyecto está archivado.');
      commissionName = p.name;
    }
    if (cid) {
      const [c] = await tx
        .select({
          name: s.commissions.name,
          deletedAt: s.commissions.deletedAt,
          archived: s.projects.archived,
        })
        .from(s.commissions)
        .innerJoin(s.projects, eq(s.projects.id, s.commissions.projectId))
        .where(eq(s.commissions.id, cid));
      if (!c || c.deletedAt) fail(404, 'Comisión no encontrada.');
      if (c.archived === 'true') fail(409, 'El proyecto está archivado.');
      commissionName = c.name;
    }
    await tx
      .update(s.invitations)
      .set({ status: 'expired' })
      .where(and(eq(s.invitations.status, 'pending'), sql`${s.invitations.expires}<=now()`));
    for (const recipient of recipients) {
      const [user] = await tx.select().from(s.users).where(eq(s.users.email, recipient));
      if (user?.disabledAt) {
        // Legacy disabled accounts can still carry assignments from before automatic cleanup.
        await removeAssignments(tx, user.id, r.locals.user.id, user.name);
        await tx
          .update(s.users)
          .set({ disabledAt: null, role: 'member' })
          .where(eq(s.users.id, user.id));
      }
      if (
        user &&
        !user.disabledAt &&
        (cid
          ? await membership(user.id, cid, tx)
          : pid
            ? (
                await tx
                  .select()
                  .from(s.projectMembers)
                  .where(
                    and(eq(s.projectMembers.userId, user.id), eq(s.projectMembers.projectId, pid)),
                  )
              ).length > 0
            : true)
      ) {
        skipped.push({
          email: recipient,
          reason: cid
            ? 'Ya pertenece a la comisión'
            : pid
              ? 'Ya pertenece al proyecto'
              : 'Ya tiene acceso al grupo',
        });
        continue;
      }
      const [pending] = await tx
        .select()
        .from(s.invitations)
        .where(
          and(
            eq(s.invitations.email, recipient),
            cid
              ? eq(s.invitations.commissionId, cid)
              : pid
                ? eq(s.invitations.projectId, pid)
                : and(
                    sql`${s.invitations.commissionId} is null`,
                    sql`${s.invitations.projectId} is null`,
                  ),
            eq(s.invitations.status, 'pending'),
          ),
        );
      if (pending) {
        if (input.email) fail(409, 'Ya hay una invitación pendiente.');
        skipped.push({ email: recipient, reason: 'Ya tiene una invitación pendiente' });
        continue;
      }
      const iid = id(),
        name = input.name || user?.name || recipient,
        expires = new Date(Date.now() + 7 * 86400000).toISOString();
      await tx.insert(s.invitations).values({
        id: iid,
        commissionId: cid,
        projectId: pid,
        email: recipient,
        name,
        role: input.role,
        status: 'pending',
        expires,
      });
      await queue(
        recipient,
        'Te invitan a Bandarlog',
        `Hola ${name}, te han invitado a ${commissionName}${cid ? ' como ' + (input.role === 'responsible' ? 'Responsable' : 'Scouter') : ''}.\nAcepta la invitación para entrar con ${recipient}.\n\n${await invitationLink(recipient, iid, expires, tx)}\n\nLa invitación caduca en 7 días.`,
        `invite-${iid}`,
        tx,
      );
      created.push(recipient);
    }
  });
  void deliver();
  r.status(201).json({ created, skipped });
}

app.post('/api/invitations', createInvitations);
app.post(
  '/api/commissions/:id/invitations',
  (q, r, n) => {
    const cid = String(q.params.id);
    if ((q.body.commissionId && q.body.commissionId !== cid) || q.body.projectId)
      fail(400, 'La invitación debe dirigirse a esta comisión.');
    q.body = { ...q.body, commissionId: cid, projectId: null };
    n();
  },
  createInvitations,
);
app.post(
  '/api/projects/:id/invitations',
  (q, r, n) => {
    const pid = String(q.params.id);
    if ((q.body.projectId && q.body.projectId !== pid) || q.body.commissionId)
      fail(400, 'La invitación debe dirigirse a este proyecto.');
    q.body = { ...q.body, projectId: pid, commissionId: null };
    n();
  },
  createInvitations,
);
app.patch('/api/invitations/:id', async (q, r) => {
  if (r.locals.user.role !== 'admin')
    fail(403, 'Solo administración puede gestionar invitaciones.');
  const { action } = parse(z.object({ action: z.enum(['resend', 'revoke']) }), q.body);
  await db.transaction(async (tx: any) => {
    const [i] = await tx
      .select()
      .from(s.invitations)
      .where(eq(s.invitations.id, String(q.params.id)))
      .for('update');
    if (!i) fail(404, 'Invitación no encontrada.');
    if (i.commissionId) await authorize(r.locals.user, i.commissionId, true, tx);
    else if (!globalManage(r.locals.user))
      fail(403, 'Solo coordinación puede gestionar invitaciones al grupo.');
    if (i.status === 'accepted') fail(409, 'La invitación ya se aceptó.');
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();
    await tx
      .update(s.invitations)
      .set({
        status: action === 'revoke' ? 'revoked' : 'pending',
        expires,
      })
      .where(eq(s.invitations.id, i.id));
    if (action === 'resend')
      await queue(
        i.email,
        'Recordatorio de invitación a Bandarlog',
        `Acepta la invitación para entrar con ${i.email}.\n\n${await invitationLink(i.email, i.id, expires, tx)}\n\nTu invitación está disponible durante 7 días.`,
        id(),
        tx,
      );
  });
  void deliver();
  r.json({ ok: true });
});
app.get('/api/directory', async (q, r) => {
  const cid = parse(text, q.query.commissionId);
  await authorize(r.locals.user, cid, true);
  const search = parse(z.string().trim().min(2).max(100), q.query.q).toLowerCase();
  const users = await db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
      role: s.users.role,
      disabledAt: s.users.disabledAt,
    })
    .from(s.users)
    .where(
      and(
        sql`${s.users.disabledAt} is null`,
        sql`position(${search} in lower(${s.users.name} || ' ' || ${s.users.email})) > 0`,
      ),
    )
    .orderBy(s.users.id)
    .limit(20);
  r.json(
    users
      .filter((u) => !u.disabledAt && `${u.name} ${u.email}`.toLowerCase().includes(search))
      .slice(0, 20),
  );
});
app.delete('/api/users/:id', async (q, r) => {
  if (r.locals.user.role !== 'admin') fail(403, 'Solo administración puede eliminar usuarios.');
  const uid = String(q.params.id);
  if (uid === r.locals.user.id) fail(400, 'No puedes eliminar tu propia cuenta.');
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`lock table users in share row exclusive mode`);
    const [actor] = await tx.select().from(s.users).where(eq(s.users.id, r.locals.user.id));
    if (actor?.role !== 'admin' || actor.disabledAt) fail(403, 'Tu rol ha cambiado.');
    const [target] = await tx.select().from(s.users).where(eq(s.users.id, uid));
    if (!target || target.disabledAt) fail(404, 'Persona no encontrada.');
    await tx.execute(
      sql`select id from commissions where id in (select commission_id from members where user_id=${uid}) order by id for update`,
    );
    await removeAssignments(tx, uid, r.locals.user.id, target.name);
    await tx.update(s.users).set({ disabledAt: now() }).where(eq(s.users.id, uid));
    await tx.delete(s.sessions).where(eq(s.sessions.userId, uid));
    await tx.delete(s.tokens).where(eq(s.tokens.email, target.email));
    await tx.delete(s.authChallenges).where(eq(s.authChallenges.email, target.email));
    await tx.delete(s.members).where(eq(s.members.userId, uid));
    await tx.delete(s.projectMembers).where(eq(s.projectMembers.userId, uid));
    await tx.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.userId, uid));
    await tx.update(s.pushOutbox).set({ sentAt: now() }).where(eq(s.pushOutbox.userId, uid));
    await tx
      .update(s.notifications)
      .set({ status: 'cancelled' })
      .where(and(eq(s.notifications.email, target.email), eq(s.notifications.status, 'pending')));
    await tx
      .update(s.invitations)
      .set({ status: 'revoked' })
      .where(and(eq(s.invitations.email, target.email), eq(s.invitations.status, 'pending')));
  });
  r.json({ ok: true });
});
app.patch('/api/users/:id/role', async (q, r) => {
  const input = parse(z.object({ role: z.enum(['admin', 'coordination', 'member']) }), q.body);
  if (r.locals.user.role !== 'admin')
    fail(403, 'Solo administración puede cambiar roles globales.');
  const uid = String(q.params.id);
  if (uid === r.locals.user.id) fail(400, 'No puedes cambiar tu propio rol.');
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`lock table users in share row exclusive mode`);
    const [actor] = await tx.select().from(s.users).where(eq(s.users.id, r.locals.user.id));
    if (actor?.role !== 'admin' || actor.disabledAt) fail(403, 'Tu rol ha cambiado.');
    const changed = await tx
      .update(s.users)
      .set({ role: input.role })
      .where(and(eq(s.users.id, uid), sql`${s.users.disabledAt} is null`))
      .returning();
    if (!changed.length) fail(404, 'Persona no encontrada.');
  });
  r.json({ ok: true });
});
app.post('/api/notifications/process', async (_q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación.');
  await reminders();
  await deliver();
  r.json({ ok: true, mode: mailTransport?.kind || 'preview' });
});
app.get('/api/notifications', async (q, r) => {
  if (!globalManage(r.locals.user)) fail(403, 'Solo coordinación.');
  const page = pageRequest(q.query, [
    groupContext.getStore()!.id,
    r.locals.user.id,
    'notifications',
  ]);
  const { body: _body, ...columns } = getTableColumns(s.notifications);
  const rows = await db
    .select(columns)
    .from(s.notifications)
    .where(page.before(s.notifications.createdAt, s.notifications.id))
    .orderBy(sql`${s.notifications.createdAt} desc`, sql`${s.notifications.id} desc`)
    .limit(page.limit + 1);
  const result = page.finish(rows);
  if (result.nextCursor) r.set('X-Next-Cursor', result.nextCursor);
  r.json(q.query.page === '1' ? result : result.items);
});
const scheduling = new Set<string>();
async function reminders() {
  let nextCheck = nextMadridMidnight();
  const key = groupContext.getStore()!.id;
  if (scheduling.has(key)) return;
  scheduling.add(key);
  try {
    const activeCommissions = await db
      .select({ id: s.commissions.id })
      .from(s.commissions)
      .innerJoin(s.projects, eq(s.projects.id, s.commissions.projectId))
      .where(and(eq(s.projects.archived, 'false'), sql`${s.commissions.deletedAt} is null`));
    const ts = activeCommissions.length
      ? await db
          .select()
          .from(s.tasks)
          .where(
            and(
              sql`${s.tasks.deletedAt} is null`,
              inArray(
                s.tasks.commissionId,
                activeCommissions.map((c) => c.id),
              ),
            ),
          )
      : [];
    const openIds = ts.filter((t) => t.status !== 'done').map((t) => t.id);
    const assigned = openIds.length
      ? await db.select().from(s.assignments).where(inArray(s.assignments.taskId, openIds))
      : [];
    const { avatarUrl: _avatar, ...recipientColumns } = getTableColumns(s.users);
    const recipients = await db.select(recipientColumns).from(s.users);
    for (const t of ts) {
      if (t.status === 'done') continue;
      for (const assignment of assigned.filter((a) => a.taskId === t.id)) {
        const u = recipients.find((u) => u.id === assignment.userId);
        if (!u) continue;
        const pref = preferences(u.preferences);
        if (!u.disabledAt && pref.notifications && (pref.onDue || pref.overdueDaily)) {
          const due = +new Date(t.due) + 1000;
          if (due > Date.now()) nextCheck = Math.min(nextCheck, due);
        }
        for (const event of reminderEvents(t.due, t.status, pref)) {
          // Daily means once per Madrid day even if an overdue deadline is edited.
          // The other schedules retain their existing per-deadline identity.
          const suffix = event.key.startsWith('overdue-day-') ? '' : '-' + t.due;
          await taskMail(db, t, event.label, 'scheduled-' + event.key + '-' + t.id + suffix, {
            recipientId: u.id,
            event: 'scheduled',
          });
        }
      }
    }
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const week = new Date(localDate + 'T12:00:00Z');
    week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
    const stamp = week.toISOString().slice(0, 10);
    const us = recipients;
    const ps = await db.select().from(s.projects);
    const cs = await db.select().from(s.commissions);
    for (const u of us) {
      const pref = preferences(u.preferences);
      if (u.disabledAt || !globalManage(u) || !pref.notifications || !pref.weekly) continue;
      for (const p of ps.filter((p) => p.archived === 'false')) {
        const pts = ts.filter((t) =>
          cs.some((c) => c.id === t.commissionId && c.projectId === p.id),
        );
        const total = pts.length,
          done = pts.filter((t) => t.status === 'done').length;
        await queue(
          u.email,
          `Resumen semanal · ${p.name}`,
          `Bandarlog\n${total ? Math.round((done / total) * 100) + '%' : 'Sin tareas'} de progreso\n${pts.filter((t) => t.status === 'pending').length} pendientes · ${pts.filter((t) => t.status === 'blocked').length} bloqueadas · ${pts.filter((t) => t.status !== 'done' && new Date(t.due) < new Date()).length} vencidas\nConsulta comisiones y tareas: ${groupUrl(appUrl)}?project=${p.id}`,
          `weekly-${stamp}-${p.id}-${u.id}`,
        );
      }
    }
    return nextCheck;
  } finally {
    scheduling.delete(key);
  }
}
// An empty queue has no retry timer. Persisted work is recovered at startup and hourly.
const deliveryJobs = new IdleJobs<Group>(
  async (group) =>
    groupContext.run(group, async () => {
      await measureJob('delivery', deliverNow);
      const result = await db.execute(sql`select least(
    (select min(coalesce(next_attempt_at, now())) from notifications where ${Boolean(mailTransport)} and status='pending' and attempts::integer<5),
    (select now()+interval '1 minute' from push_outbox where sent_at is null limit 1)
  ) as next_at`);
      const at = result.rows[0]?.next_at;
      return at ? Math.max(Date.now() + 1000, +new Date(String(at))) : null;
    }),
  () => console.error('No se pudo completar la entrega pendiente.'),
);
async function deliver() {
  const group = groupContext.getStore();
  if (!group) throw Error('Falta el contexto privado del grupo.');
  await deliveryJobs.wake(group.id, group);
}
const platformJobs = new IdleJobs<void>(
  async () => {
    await measureJob('platform-delivery', deliverPlatformNow);
    if (!mailTransport) return null;
    const result = await ownerDb.execute(
      sql`select min(coalesce(next_attempt_at, now())) as next_at from platform_mail where status='pending' and attempts::integer<5`,
    );
    const at = result.rows[0]?.next_at;
    return at ? Math.max(Date.now() + 1000, +new Date(String(at))) : null;
  },
  () => console.error('No se pudo completar el correo pendiente.'),
);
async function deliverPlatform() {
  await platformJobs.wake('platform', undefined);
}
const activeGroups = () =>
  ownerDb
    .select()
    .from(s.groups)
    .where(sql`${s.groups.plan} <> 'audit-archived'`);
const reminderJobs = new IdleJobs<void>(
  async () =>
    measureJob('reminders', async () => {
      let next = nextMadridMidnight();
      for (const group of await activeGroups())
        await groupContext.run(group, async () => {
          next = Math.min(next, (await reminders()) ?? next);
          await deliver();
        });
      return next;
    }),
  () => console.error('No se pudieron revisar los recordatorios.'),
);
const recoveryJobs = new IdleJobs<void>(
  async () =>
    measureJob('outbox-recovery', async () => {
      // Metadata only: no idle per-group SELECTs, no message bodies or images.
      const pending = await ownerDb.execute(sql`select distinct group_id from (
    select group_id from notifications where ${Boolean(mailTransport)} and status='pending' and attempts::integer<5
    union select group_id from push_outbox where sent_at is null
  ) q`);
      const ids = pending.rows.map((row) => String(row.group_id));
      if (ids.length)
        for (const group of await ownerDb
          .select()
          .from(s.groups)
          .where(and(inArray(s.groups.id, ids), sql`${s.groups.plan} <> 'audit-archived'`)))
          await groupContext.run(group, deliver);
      await deliverPlatform();
      return Date.now() + 3600000;
    }),
  () => console.error('No se pudo recuperar el trabajo pendiente.'),
);
// These callbacks run after the server starts; shutdown cancels all future work.
reminderJobs.schedule('reminders', undefined, Date.now() + 1000);
recoveryJobs.schedule('recovery', undefined, Date.now() + 1000);
app.use('/api', (_q, r) => r.status(404).json({ error: 'Ruta no encontrada.' }));
if (prod) {
  const spaHtml = await readFile('dist/index.html', 'utf8');
  app.use(
    express.static('dist', {
      index: false,
      setHeaders(response, file) {
        const path = file.replaceAll('\\', '/');
        if (path.includes('/assets/') || /\/canopy\/mobile-[a-f0-9]{10}-[123]x\.webp$/.test(path))
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('/{*path}', (_q, r) => {
    r.type('html').send(
      spaHtml.replace('/manifest.webmanifest', groupPath() + '/manifest.webmanifest'),
    );
  });
}
app.use((error: any, _q: any, r: any, _n: any) => {
  const status =
    error instanceof Problem || error instanceof CursorError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : ['23505', '23514', '23503'].includes(error.code || error.cause?.code)
          ? 409
          : 500;
  if (status === 500)
    console.error({ name: error.name, code: error.code || error.cause?.code || 'INTERNAL_ERROR' });
  r.status(status).json({
    error:
      error instanceof z.ZodError
        ? 'Revisa los campos obligatorios y su formato.'
        : error instanceof Problem || error instanceof CursorError
          ? error.message
          : status === 409
            ? 'Ya existe un registro con estos datos.'
            : status === 500
              ? 'No se pudo completar la operación.'
              : error.message,
  });
});
site.use(
  groupRegistrationRoutes(ownerDb, appUrl, {
    queue: queuePlatform,
    deliver: deliverPlatform,
    createSession,
    cookie: (r, raw, group) => groupContext.run(group, () => sessionCookie(r, raw)),
    render: (path, message, token) => renderPublicForm(path, appUrl, message, token),
  }),
);
if (!prod)
  site.get('/api/dev/platform-mail', async (_q, r) =>
    r.json(await ownerDb.select().from(s.platformMail).orderBy(s.platformMail.createdAt)),
  );
site.use('/g/:groupId', groupResolver(ownerDb), app);
site.get('/acceso', (q, r) =>
  r
    .set('Cache-Control', 'no-store')
    .redirect(
      303,
      '/g/' +
        legacyGroup.privateId +
        '/' +
        (q.originalUrl.includes('?') ? q.originalUrl.slice(q.originalUrl.indexOf('?')) : ''),
    ),
);
site.get('/', async (q, r, next) => {
  r.set('Cache-Control', 'private, no-store').vary('Cookie');
  const legacyQuery = [
    'token',
    'task',
    'project',
    'commission',
    'view',
    'auth_error',
    'email',
    'action',
  ].some((key) => typeof q.query[key] === 'string');
  if (legacyQuery)
    return r.redirect(
      303,
      '/g/' + legacyGroup.privateId + '/' + q.originalUrl.slice(q.originalUrl.indexOf('?')),
    );
  const entry = await rememberedEntry(ownerDb, q.headers.cookie, legacyGroup.id);
  if (entry) return r.redirect(303, entry);
  if (requestCookie(q.headers.cookie, ENTRY_COOKIE)) r.clearCookie(ENTRY_COOKIE, { path: '/' });
  if (prod && legacyOrigins.includes('https://' + (q.get('host') || '').toLowerCase()))
    return r.redirect(308, appUrl + q.originalUrl);
  r.type('html').send(renderPublicHome(appUrl));
});
site.use(async (q, r, next) => {
  let group: Group = { ...legacyGroup, legacyAccess: true };
  if (q.path === '/api/auth/google/callback' && typeof q.query.state === 'string') {
    const [state] = await ownerDb
      .select()
      .from(s.googleStates)
      .where(eq(s.googleStates.id, hash(q.query.state)));
    if (state) {
      const [found] = await ownerDb.select().from(s.groups).where(eq(s.groups.id, state.groupId));
      if (found) group = found;
    }
  }
  groupContext.run(group, () => app(q, r, next));
});
site.use((_q, r) => r.status(404).type('text').send('Página no encontrada.'));
site.use((_error: any, _q: any, r: any, _next: any) =>
  r.status(500).type('text').send('No se pudo completar la operación.'),
);
const server = site.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log(
    `Bandarlog API preparada en puerto ${process.env.PORT || 3001} (${prod ? 'producción' : 'desarrollo con datos demostrativos'})`,
  ),
);
process.on('SIGTERM', () => {
  flushMetrics();
  deliveryJobs.stop();
  platformJobs.stop();
  reminderJobs.stop();
  recoveryJobs.stop();
  for (const view of liveViews.keys()) view.end();
  server.close(() => void close().then(() => process.exit(0)));
});
