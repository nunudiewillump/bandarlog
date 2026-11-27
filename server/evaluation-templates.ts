import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { evaluationStructure } from '../shared/evaluations.js';
import type { Database } from './db.js';
import {
  evaluationTemplates as templates,
  evaluationTemplateVersions as versions,
} from './schema.js';

const revision = z.int().positive();
const edit = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('save'), revision, structure: evaluationStructure }),
  z.strictObject({ action: z.literal('archive'), revision, archived: z.boolean() }),
  z.strictObject({ action: z.literal('publish'), revision }),
]);

export function evaluationTemplateRoutes(db: Database) {
  const router = Router();
  router.use((_q, r, next) => {
    if (!['admin', 'coordination'].includes(r.locals.user.role))
      return r
        .status(403)
        .json({ error: 'Solo Coordinación y Administración pueden gestionar plantillas.' });
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (_q, r) => r.locals.user.id }));

  router.get('/', async (q, r) => {
    const after = z.uuid().optional().parse(q.query.after);
    const rows = await db
      .select({
        id: templates.id,
        title: sql<string>`${templates.structure}->>'title'`,
        revision: templates.revision,
        archived: templates.archived,
      })
      .from(templates)
      .where(after ? gt(templates.id, after) : undefined)
      .orderBy(templates.id)
      .limit(31);
    r.json({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].id : null });
  });

  router.post('/', async (q, r) => {
    const structure = evaluationStructure.parse(q.body);
    const id = randomUUID();
    await db.insert(templates).values({ id, structure });
    r.status(201).json({ id, revision: 1 });
  });

  router.get('/:id', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const [template] = await db
      .select({
        id: templates.id,
        structure: templates.structure,
        revision: templates.revision,
        archived: templates.archived,
      })
      .from(templates)
      .where(eq(templates.id, id));
    if (!template) return r.status(404).json({ error: 'Plantilla no encontrada.' });
    r.json(template);
  });

  router.get('/:id/versions', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const before = z.coerce.number().int().positive().optional().parse(q.query.before);
    const rows = await db
      .select({
        revision: versions.revision,
        publishedAt: versions.publishedAt,
        requiresCommission: sql<boolean>`jsonb_path_exists(${versions.structure}, '$.sections[*] ? (@.audience == "commission")')`,
        projectOnly: sql<boolean>`not exists (
          select from jsonb_array_elements(${versions.structure}->'sections') as section
          where section->>'audience' is distinct from 'project'
        )`,
      })
      .from(versions)
      .where(and(eq(versions.templateId, id), before ? lt(versions.revision, before) : undefined))
      .orderBy(desc(versions.revision))
      .limit(31);
    r.json({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].revision : null });
  });

  router.get('/:id/versions/:revision', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const number = z.coerce.number().int().positive().parse(q.params.revision);
    const [version] = await db
      .select({ structure: versions.structure })
      .from(versions)
      .where(and(eq(versions.templateId, id), eq(versions.revision, number)));
    if (!version) return r.status(404).json({ error: 'Versión no encontrada.' });
    r.json(version);
  });

  router.patch('/:id', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const command = edit.parse(q.body);
    const result = await db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .for('update');
      if (!template) return 'missing';
      if (template.revision !== command.revision) return 'stale';
      if (command.action === 'publish') {
        if (template.archived) return 'archived';
        await tx
          .insert(versions)
          .values({
            templateId: id,
            revision: template.revision,
            structure: template.structure,
            publishedBy: r.locals.user.id,
          })
          .onConflictDoNothing();
        return template.revision;
      }
      if (command.action === 'save' && template.archived) return 'archived';
      if (command.action === 'archive' && command.archived === template.archived)
        return template.revision;
      const next = template.revision + 1;
      await tx
        .update(templates)
        .set({
          revision: next,
          ...(command.action === 'save'
            ? { structure: command.structure }
            : { archived: command.archived }),
        })
        .where(eq(templates.id, id));
      return next;
    });
    if (result === 'missing') return r.status(404).json({ error: 'Plantilla no encontrada.' });
    if (result === 'archived')
      return r.status(409).json({ error: 'Restaura la plantilla antes de modificarla.' });
    if (result === 'stale')
      return r.status(409).json({ error: 'La plantilla ha cambiado. Vuelve a abrirla.' });
    r.json({ revision: result });
  });
  return router;
}
