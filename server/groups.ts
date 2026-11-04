import { Router, urlencoded, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from './schema.js';
import { publicInfo } from '../shared/public-info.js';
import { renderApprovalPage } from './public-site.js';
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
  owner: any,
  origin: string,
  callbacks: {
    queue: (to: string, subject: string, body: string, key: string, tx: any) => Promise<void>;
    deliver: () => Promise<void>;
    createSession: (tx: any, uid: string) => Promise<{ raw: string; csrf: string }>;
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
      await owner.transaction(async (tx: any) => {
        // Per-email quota also prevents distributing the requests across IPs.
        await tx.execute(sql`lock table group_registrations in share row exclusive mode`);
        const recent = await tx
          .select()
          .from(s.groupRegistrations)
          .where(
            and(
              eq(s.groupRegistrations.email, input.email),
              sql`${s.groupRegistrations.createdAt}>now()-interval '1 hour'`,
            ),
          );
        if (recent.length >= 3) return;
        await tx.insert(s.groupRegistrations).values({
          id: hash(raw),
          ...input,
          expires: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
        // Registration is platform mail; it does not write any group's outbox.
        await callbacks.queue(
          publicInfo.contact,
          'Solicitud de grupo · Bandarlog',
          `Nueva solicitud de ${input.groupName}.\nSolicitante: ${input.name}\nCorreo: ${input.email}\n\nRevisa y aprueba o rechaza la solicitud. Abrir el enlace no crea el grupo.\n\n${origin}/aprobar-grupo?token=${raw}\n\nEl enlace caduca en 7 días. El grupo no puede activarse sin tu aprobación.`,
          `group-request-${hash(raw)}`,
          tx,
        );
      });
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
      const [request] = token
        ? await owner
            .select()
            .from(s.groupRegistrations)
            .where(
              and(
                eq(s.groupRegistrations.id, hash(token)),
                sql`${s.groupRegistrations.expires}>now()`,
              ),
            )
        : [];
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
      const result = await owner.transaction(async (tx: any) => {
        const [request] = await tx
          .select()
          .from(s.groupRegistrations)
          .where(
            and(
              eq(s.groupRegistrations.id, hash(input.data.token)),
              sql`${s.groupRegistrations.expires}>now()`,
              sql`${s.groupRegistrations.approvedAt} is null`,
              sql`${s.groupRegistrations.rejectedAt} is null`,
              sql`${s.groupRegistrations.consumedAt} is null`,
            ),
          )
          .for('update');
        if (!request) return false;
        if (input.data.decision === 'reject') {
          await tx
            .update(s.groupRegistrations)
            .set({ rejectedAt: new Date().toISOString() })
            .where(eq(s.groupRegistrations.id, request.id));
          await callbacks.queue(
            request.email,
            'Solicitud de grupo revisada',
            `La solicitud de ${request.groupName} no se ha autorizado. Si necesitas más información, contacta con ${publicInfo.contact}.`,
            `group-rejected-${request.id}`,
            tx,
          );
          return true;
        }
        const activation = randomBytes(32).toString('hex');
        await tx
          .update(s.groupRegistrations)
          .set({
            approvedAt: new Date().toISOString(),
            activationId: hash(activation),
            expires: new Date(Date.now() + 7 * 86400000).toISOString(),
          })
          .where(eq(s.groupRegistrations.id, request.id));
        await callbacks.queue(
          request.email,
          'Tu grupo ha sido aprobado · Bandarlog',
          `Hola ${request.name}. La solicitud de ${request.groupName} ha sido aprobada. Confirma tu correo para activar el grupo gratuito y entrar como su primer administrador.\n\n${origin}/confirmar-grupo?token=${activation}\n\nEl enlace caduca en 7 días.`,
          `group-approved-${request.id}`,
          tx,
        );
        return true;
      });
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
      const result = await owner.transaction(async (tx: any) => {
        const [pending] = await tx
          .select()
          .from(s.groupRegistrations)
          .where(
            and(
              eq(s.groupRegistrations.activationId, hash(raw)),
              sql`${s.groupRegistrations.approvedAt} is not null`,
              sql`${s.groupRegistrations.rejectedAt} is null`,
              sql`${s.groupRegistrations.consumedAt} is null`,
              sql`${s.groupRegistrations.expires}>now()`,
            ),
          )
          .for('update');
        if (!pending) return null;
        const [group] = await tx
          .insert(s.groups)
          .values({
            name: pending.groupName,
            colorPrimary: pending.colorPrimary,
            colorSecondary: pending.colorSecondary,
          })
          .returning();
        await tx.execute(sql`select set_config('bandarlog.group_id',${group.id},true)`);
        const uid = randomUUID();
        await tx.insert(s.users).values({
          id: uid,
          groupId: group.id,
          name: pending.name,
          email: pending.email,
          role: 'admin',
        });
        const session = await callbacks.createSession(tx, uid);
        await tx
          .update(s.groupRegistrations)
          .set({ consumedAt: new Date().toISOString() })
          .where(eq(s.groupRegistrations.id, pending.id));
        return { group, session };
      });
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
export function groupResolver(owner: any) {
  return async (q: Request, r: Response, next: () => void) => {
    const key = String(q.params.groupId);
    if (!/^[a-f0-9]{32}$/.test(key)) return r.status(404).type('text').send('Grupo no encontrado.');
    // URL spelling, cookie Path, service-worker scope and IndexedDB must agree.
    const canonical = '/g/' + key;
    if (q.baseUrl !== canonical) {
      if (['GET', 'HEAD'].includes(q.method)) return r.redirect(308, canonical + q.url);
      return r.status(400).json({ error: 'Utiliza el enlace original del grupo.' });
    }
    const [group] = await owner.select().from(s.groups).where(eq(s.groups.privateId, key));
    if (!group) return r.status(404).type('text').send('Grupo no encontrado.');
    r.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    groupContext.run(group, next);
  };
}
