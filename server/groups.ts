import { Router, urlencoded, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { publicInfo } from '../shared/public-info.js';
import { renderApprovalPage } from './public-site.js';
import type { GlobalOperations } from './global-operations.js';
import { groupContext, type Group } from './group-context.js';

export const groupColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const registration = z.object({
  groupName: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[^\r\n]+$/),
  name: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[^\r\n]+$/),
  email: z.email().transform((v) => v.toLowerCase()),
  colorPrimary: groupColor.default('#d75a9e'),
  colorSecondary: groupColor.default('#7b3d93'),
  terms: z.literal('accepted'),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function groupRegistrationRoutes(
  platform: GlobalOperations,
  origin: string,
  callbacks: {
    mail: (subject: string, body: string) => unknown;
    deliver: () => Promise<void>;
    cookie: (r: Response, raw: string, group: Group) => void;
    render: (path: string, message?: string, token?: string) => string;
  },
) {
  const router = Router();
  router.use(
    ['/crear-grupo', '/confirmar-grupo', '/aprobar-grupo'],
    urlencoded({ extended: false, limit: '16kb' }),
  );
  router.use(
    '/crear-grupo',
    rateLimit({
      windowMs: 3600000,
      limit: 12,
      skip: (q) => q.method !== 'POST',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.use(['/crear-grupo', '/confirmar-grupo', '/aprobar-grupo'], (q, r, next) => {
    if (q.method === 'POST' && q.get('Origin') !== origin)
      return r.status(403).type('text').send('Origen no permitido.');
    next();
  });
  router.use(
    ['/aprobar-grupo', '/confirmar-grupo'],
    rateLimit({
      windowMs: 3600000,
      limit: 60,
      skip: (q) => q.method !== 'POST',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.post('/crear-grupo', async (q, r, next) => {
    const parsed = registration.safeParse(q.body);
    if (!parsed.success)
      return r
        .status(400)
        .type('html')
        .send(
          callbacks.render(
            '/crear-grupo',
            'Revisa nombre, correo, colores y aceptación de las condiciones.',
          ),
        );
    try {
      const input = parsed.data,
        raw = randomBytes(32).toString('hex');
      await platform.requestGroup(
        hash(raw),
        input,
        callbacks.mail(
          'Solicitud de grupo · Bandarlog',
          `Nueva solicitud de ${input.groupName}.\nSolicitante: ${input.name}\nCorreo: ${input.email}\n\nRevisa y aprueba o rechaza la solicitud. Abrir el enlace no crea el grupo.\n\n${origin}/aprobar-grupo?token=${raw}\n\nEl enlace caduca en 7 días. El grupo no puede activarse sin tu aprobación.`,
        ),
      );
      void callbacks
        .deliver()
        .catch(() => console.error('No se pudo procesar el correo de registro.'));
      r.status(202)
        .type('html')
        .send(
          callbacks.render(
            '/crear-grupo',
            'Solicitud enviada. El grupo solo podrá activarse si el responsable lo aprueba. Después recibirás un enlace en tu correo.',
          ),
        );
    } catch (error) {
      next(error);
    }
  });
  router.get('/aprobar-grupo', async (q, r, next) => {
    const token =
      typeof q.query.token === 'string' && /^[a-f0-9]{64}$/.test(q.query.token)
        ? q.query.token
        : '';
    try {
      const request = token ? await platform.registration(hash(token)) : null;
      r.set({
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'same-origin',
        'X-Robots-Tag': 'noindex,nofollow',
      })
        .status(request ? 200 : 404)
        .type('html')
        .send(renderApprovalPage(origin, request, token));
    } catch (error) {
      next(error);
    }
  });
  router.post('/aprobar-grupo', async (q, r, next) => {
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        decision: z.enum(['approve', 'reject']),
      })
      .safeParse(q.body);
    if (!input.success) return r.status(400).type('text').send('Solicitud no válida.');
    try {
      const request = await platform.registration(hash(input.data.token));
      const activation = randomBytes(32).toString('hex');
      const result =
        request &&
        (await platform.reviewGroup(
          hash(input.data.token),
          input.data.decision,
          hash(activation),
          input.data.decision === 'reject'
            ? callbacks.mail(
                'Solicitud de grupo revisada',
                `La solicitud de ${request.groupName} no se ha autorizado. Si necesitas más información, contacta con ${publicInfo.contact}.`,
              )
            : callbacks.mail(
                'Tu grupo ha sido aprobado · Bandarlog',
                `Hola ${request.name}. La solicitud de ${request.groupName} ha sido aprobada. Confirma tu correo para activar el grupo gratuito y entrar como su primer administrador.\n\n${origin}/confirmar-grupo?token=${activation}\n\nEl enlace caduca en 7 días.`,
              ),
        ));
      if (!result)
        return r.status(409).type('text').send('Esta solicitud no está disponible o ya se revisó.');
      void callbacks
        .deliver()
        .catch(() => console.error('No se pudo procesar el correo de revisión.'));
      r.set('Cache-Control', 'no-store')
        .type('html')
        .send(
          renderApprovalPage(
            origin,
            null,
            '',
            input.data.decision === 'approve'
              ? 'Solicitud aprobada. Se ha enviado el enlace de activación al solicitante.'
              : 'Solicitud rechazada. No se ha creado el grupo.',
          ),
        );
    } catch (error) {
      next(error);
    }
  });
  router.get('/confirmar-grupo', (q, r) => {
    const token =
      typeof q.query.token === 'string' && /^[a-f0-9]{64}$/.test(q.query.token)
        ? q.query.token
        : '';
    r.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' })
      .type('html')
      .send(
        callbacks.render(
          '/confirmar-grupo',
          token ? 'Confirma para crear el grupo.' : 'El enlace no es válido. Solicita uno nuevo.',
          token,
        ),
      );
  });
  router.post('/confirmar-grupo', async (q, r, next) => {
    const raw = typeof q.body.token === 'string' ? q.body.token : '';
    if (!/^[a-f0-9]{64}$/.test(raw))
      return r
        .status(400)
        .type('html')
        .send(callbacks.render('/confirmar-grupo', 'El enlace no es válido.'));
    try {
      const session = {
        raw: randomBytes(32).toString('hex'),
        csrf: randomBytes(32).toString('hex'),
      };
      const group = await platform.activateGroup(hash(raw), hash(session.raw), session.csrf);
      const result = group ? { group, session } : null;
      if (!result)
        return r
          .status(400)
          .type('html')
          .send(
            callbacks.render('/confirmar-grupo', 'El enlace ha caducado o ya se ha utilizado.'),
          );
      callbacks.cookie(r, result.session.raw, result.group);
      r.redirect(303, `/g/${result.group.privateId}/`);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
export function groupResolver(platform: GlobalOperations) {
  return async (q: Request, r: Response, next: () => void) => {
    const key = String(q.params.groupId);
    if (!/^[a-f0-9]{32}$/.test(key)) return r.status(404).type('text').send('Grupo no encontrado.');
    // URL spelling, cookie Path, service-worker scope and IndexedDB must agree.
    const canonical = '/g/' + key;
    if (q.baseUrl !== canonical) {
      if (['GET', 'HEAD'].includes(q.method)) return r.redirect(308, canonical + q.url);
      return r.status(400).json({ error: 'Utiliza el enlace original del grupo.' });
    }
    const group = await platform.resolveGroup(key);
    if (!group) return r.status(404).type('text').send('Grupo no encontrado.');
    if (['GET', 'HEAD'].includes(q.method) && q.originalUrl.split('?')[0] === canonical)
      return r.redirect(
        308,
        canonical +
          '/' +
          (q.originalUrl.includes('?') ? q.originalUrl.slice(q.originalUrl.indexOf('?')) : ''),
      );
    r.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    groupContext.run(group, next);
  };
}
