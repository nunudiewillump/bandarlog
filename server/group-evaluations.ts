import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { evaluationAnswers } from '../shared/evaluation-answers.js';
import type { Database } from './db.js';
import {
  groupEvaluations as evaluations,
  groupEvaluationConclusions as conclusions,
  groupEvaluationAssignments as assignments,
  groupEvaluationActions as evaluationActions,
  tasks,
  evaluationTemplates as templates,
  evaluationTemplateVersions as versions,
  users,
} from './schema.js';

export const evaluationPublication = z.strictObject({
  title: z.string().trim().min(1).max(160),
  templateId: z.uuid(),
  templateRevision: z.int().positive(),
  userIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  dueAt: z.iso.datetime({ offset: true }),
});
const response = z.strictObject({
  action: z.enum(['draft', 'submission']),
  revision: z.int().nonnegative(),
  answers: z.unknown(),
});

const beforeDeadline = sql<boolean>`${evaluations.dueAt} > statement_timestamp()`;
const projectClosed = sql<boolean>`(${evaluations.projectId} is null or bandarlog_api.group_evaluation_project_closed(${evaluations.id}))`;
const active = sql<boolean>`${beforeDeadline} and ${projectClosed}`;
const paused = sql<boolean>`${beforeDeadline} and not ${projectClosed}`;
const matchEvaluation = and(
  eq(evaluations.id, assignments.evaluationId),
  eq(evaluations.groupId, assignments.groupId),
);

export async function createGroupEvaluation(
  tx: Database,
  input: z.infer<typeof evaluationPublication>,
  projectId?: string,
) {
  const id = randomUUID();
  const [version] = await tx
    .select({ revision: versions.revision })
    .from(versions)
    .innerJoin(
      templates,
      and(eq(templates.groupId, versions.groupId), eq(templates.id, versions.templateId)),
    )
    .where(
      and(
        eq(versions.templateId, input.templateId),
        eq(versions.revision, input.templateRevision),
        eq(templates.archived, false),
      ),
    );
  if (!version) return null;
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, input.userIds), isNull(users.disabledAt)));
  if (recipients.length !== input.userIds.length) return null;
  await tx.insert(evaluations).values({
    id,
    title: input.title,
    templateId: input.templateId,
    templateRevision: input.templateRevision,
    dueAt: input.dueAt,
    projectId,
  });
  await tx
    .insert(assignments)
    .values(recipients.map(({ id: userId }) => ({ evaluationId: id, userId })));
  return id;
}

export function groupEvaluationRoutes(db: Database) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (_q, r) => r.locals.user.id }));

  router.get('/', async (q, r) => {
    const after = z.uuid().optional().parse(q.query.after);
    const rows = await db
      .select({
        id: evaluations.id,
        title: evaluations.title,
        dueAt: evaluations.dueAt,
        open: active,
        paused,
        submittedAt: assignments.submittedAt,
      })
      .from(assignments)
      .innerJoin(evaluations, matchEvaluation)
      .where(
        and(
          eq(assignments.userId, r.locals.user.id),
          after ? gt(evaluations.id, after) : undefined,
        ),
      )
      .orderBy(evaluations.id)
      .limit(31);
    r.json({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].id : null });
  });

  router.post('/', async (q, r) => {
    if (!['admin', 'coordination'].includes(r.locals.user.role))
      return r
        .status(403)
        .json({ error: 'Solo Coordinación y Administración pueden publicar evaluaciones.' });
    const input = evaluationPublication.parse(q.body);
    if (+new Date(input.dueAt) <= Date.now())
      return r.status(400).json({ error: 'Selecciona una fecha límite futura.' });
    const id = await db.transaction((tx) =>
      createGroupEvaluation(tx as unknown as Database, input),
    );
    if (!id)
      return r
        .status(400)
        .json({ error: 'Selecciona una versión publicada y participantes activos del grupo.' });
    r.status(201).json({ id });
  });

  const details = (id: string, userId: string) =>
    db
      .select({
        title: evaluations.title,
        dueAt: evaluations.dueAt,
        open: active,
        paused,
        structure: versions.structure,
        answers: assignments.answers,
        revision: assignments.revision,
        submittedAt: assignments.submittedAt,
      })
      .from(assignments)
      .innerJoin(evaluations, matchEvaluation)
      .innerJoin(
        versions,
        and(
          eq(versions.groupId, evaluations.groupId),
          eq(versions.templateId, evaluations.templateId),
          eq(versions.revision, evaluations.templateRevision),
        ),
      )
      .where(and(eq(evaluations.id, id), eq(assignments.userId, userId)));

  router.use('/manage', (_q, r, next) => {
    if (!['admin', 'coordination'].includes(r.locals.user.role))
      return r
        .status(403)
        .json({ error: 'Solo Coordinación y Administración pueden consultar resultados.' });
    next();
  });

  router.get('/manage', async (q, r) => {
    const after = z.uuid().optional().parse(q.query.after);
    const rows = await db
      .select({
        id: evaluations.id,
        title: evaluations.title,
        dueAt: evaluations.dueAt,
        open: active,
        paused,
        templateRevision: evaluations.templateRevision,
      })
      .from(evaluations)
      .where(after ? gt(evaluations.id, after) : undefined)
      .orderBy(evaluations.id)
      .limit(31);
    r.json({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].id : null });
  });

  router.get('/manage/task/:taskId', async (q, r) => {
    const taskId = z.string().min(1).max(200).parse(q.params.taskId);
    const [origin] = await db
      .select({ id: evaluations.id, title: evaluations.title })
      .from(evaluationActions)
      .innerJoin(
        evaluations,
        and(
          eq(evaluations.groupId, evaluationActions.groupId),
          eq(evaluations.id, evaluationActions.evaluationId),
        ),
      )
      .innerJoin(
        tasks,
        and(eq(tasks.groupId, evaluationActions.groupId), eq(tasks.id, evaluationActions.taskId)),
      )
      .where(and(eq(evaluationActions.taskId, taskId), isNull(tasks.deletedAt)))
      .limit(1);
    r.json({ origin: origin ?? null });
  });

  router.get('/manage/:id', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const [evaluation] = await db
      .select({
        title: evaluations.title,
        dueAt: evaluations.dueAt,
        templateRevision: evaluations.templateRevision,
        open: active,
        paused,
        structure: versions.structure,
        body: conclusions.body,
        conclusionRevision: conclusions.revision,
        summary: sql`bandarlog_api.group_evaluation_results(${evaluations.id})`,
      })
      .from(evaluations)
      .innerJoin(
        versions,
        and(
          eq(versions.groupId, evaluations.groupId),
          eq(versions.templateId, evaluations.templateId),
          eq(versions.revision, evaluations.templateRevision),
        ),
      )
      .leftJoin(
        conclusions,
        and(
          eq(conclusions.groupId, evaluations.groupId),
          eq(conclusions.evaluationId, evaluations.id),
        ),
      )
      .where(eq(evaluations.id, id));
    if (!evaluation) return r.status(404).json({ error: 'Evaluación no encontrada.' });
    const actions = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(evaluationActions)
      .innerJoin(
        tasks,
        and(eq(tasks.groupId, evaluationActions.groupId), eq(tasks.id, evaluationActions.taskId)),
      )
      .where(and(eq(evaluationActions.evaluationId, id), isNull(tasks.deletedAt)))
      .orderBy(tasks.updatedAt)
      .limit(100);
    r.json({ ...evaluation, actions });
  });

  router.put('/manage/:id/conclusion', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const { body, revision } = z
      .strictObject({
        body: z.string().trim().min(1).max(8000),
        revision: z.int().nonnegative(),
      })
      .parse(q.body);
    const [evaluation] = await db
      .select({ open: beforeDeadline })
      .from(evaluations)
      .where(eq(evaluations.id, id));
    if (!evaluation) return r.status(404).json({ error: 'Evaluación no encontrada.' });
    if (evaluation.open) return r.status(409).json({ error: 'La evaluación sigue abierta.' });
    const authorId: string = r.locals.user.id;
    const rows =
      revision === 0
        ? await db
            .insert(conclusions)
            .values({ evaluationId: id, body, authorId })
            .onConflictDoNothing()
            .returning()
        : await db
            .update(conclusions)
            .set({ body, authorId, revision: revision + 1, updatedAt: sql`statement_timestamp()` })
            .where(and(eq(conclusions.evaluationId, id), eq(conclusions.revision, revision)))
            .returning();
    if (!rows.length)
      return r
        .status(409)
        .json({ error: 'Las conclusiones han cambiado. Vuelve a abrir la evaluación.' });
    r.json({ body: rows[0].body, revision: rows[0].revision });
  });

  router.get('/:id', async (q, r) => {
    const [item] = await details(z.uuid().parse(q.params.id), r.locals.user.id);
    if (!item) return r.status(404).json({ error: 'Evaluación no encontrada.' });
    r.json(item);
  });

  router.put('/:id/response', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const command = response.parse(q.body);
    const userId: string = r.locals.user.id;
    const [item] = await details(id, userId);
    if (!item) return r.status(404).json({ error: 'Evaluación no encontrada.' });
    if (!item.open || item.submittedAt || item.revision !== command.revision)
      return r
        .status(409)
        .json({ error: 'La respuesta ha cambiado o ya no admite cambios. Vuelve a abrirla.' });
    const answers = evaluationAnswers(item.structure, command.action).parse(command.answers);
    const revision = command.revision + 1;
    const result = await db
      .update(assignments)
      .set({
        answers,
        revision,
        submittedAt: command.action === 'submission' ? sql`statement_timestamp()` : null,
      })
      .where(
        and(
          eq(assignments.evaluationId, id),
          eq(assignments.userId, userId),
          eq(assignments.revision, command.revision),
          isNull(assignments.submittedAt),
        ),
      )
      .returning();
    if (!result.length)
      return r.status(409).json({ error: 'La respuesta ha cambiado. Vuelve a abrirla.' });
    r.json({ revision: result[0].revision, submittedAt: result[0].submittedAt });
  });
  return router;
}
