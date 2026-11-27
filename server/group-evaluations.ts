import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { EvaluationStructure } from '../shared/evaluations.js';
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
  commissions,
  members,
} from './schema.js';

export const evaluationPublication = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    templateId: z.uuid(),
    templateRevision: z.int().positive(),
    userIds: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    dueAt: z.iso.datetime({ offset: true }),
    responseMode: z.enum(['identified', 'anonymous', 'collective']).default('identified'),
    commissionId: z.string().min(1).max(200).optional(),
    sectionScopes: z
      .array(
        z.strictObject({
          sectionId: z.uuid(),
          commissionId: z.string().min(1).max(200),
        }),
      )
      .min(1)
      .max(12)
      .refine((scopes) => new Set(scopes.map((scope) => scope.sectionId)).size === scopes.length)
      .optional(),
  })
  .refine((input) => input.responseMode !== 'collective' || input.userIds.length === 1);
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
  closureEventNo?: number,
) {
  const id = randomUUID();
  const [version] = await tx
    .select({ structure: versions.structure })
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
  const templateSections = (version.structure as EvaluationStructure).sections;
  const selectedScopes = new Set(input.sectionScopes?.map(({ sectionId }) => sectionId));
  if (templateSections.some(({ id, audience }) =>
    (audience === 'commission' && !selectedScopes.has(id)) ||
    (audience === 'project' && selectedScopes.has(id))
  )) return null;
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, input.userIds), isNull(users.disabledAt)));
  if (recipients.length !== input.userIds.length) return null;
  const sectionsByUser = new Map<string, string[]>();
  if (input.commissionId) {
    if (!projectId) return null;
    const eligible = await tx
      .select({ id: members.userId })
      .from(members)
      .innerJoin(
        commissions,
        and(eq(commissions.id, members.commissionId), eq(commissions.groupId, members.groupId)),
      )
      .where(
        and(
          eq(commissions.id, input.commissionId),
          eq(commissions.projectId, projectId),
          isNull(commissions.deletedAt),
          inArray(members.userId, input.userIds),
        ),
      );
    if (new Set(eligible.map(({ id }) => id)).size !== input.userIds.length) return null;
    if (templateSections.some(({ audience }) => audience === 'project')) {
      const ids = templateSections.filter(({ audience }) => audience !== 'project').map(({ id }) => id);
      if (!ids.length) return null;
      for (const { id } of recipients) sectionsByUser.set(id, ids);
    }
  }
  if (input.sectionScopes) {
    if (!projectId || input.commissionId) return null;
    const sections = templateSections;
    const scopes = new Map(
      input.sectionScopes.map((scope) => [scope.sectionId, scope.commissionId]),
    );
    if (
      input.sectionScopes.some(
        (scope) => !sections.some((section) => section.id === scope.sectionId),
      )
    )
      return null;
    const memberships = await tx
      .select({ userId: members.userId, commissionId: members.commissionId })
      .from(members)
      .innerJoin(
        commissions,
        and(eq(commissions.id, members.commissionId), eq(commissions.groupId, members.groupId)),
      )
      .where(
        and(
          eq(commissions.projectId, projectId),
          isNull(commissions.deletedAt),
          inArray(members.commissionId, [...new Set(scopes.values())]),
          inArray(members.userId, input.userIds),
        ),
      );
    const byCommission = new Map<string, Set<string>>();
    for (const membership of memberships) {
      const users = byCommission.get(membership.commissionId) ?? new Set<string>();
      users.add(membership.userId);
      byCommission.set(membership.commissionId, users);
    }
    if ([...scopes.values()].some((commissionId) => !byCommission.has(commissionId))) return null;
    for (const userId of input.userIds) {
      const visible = sections
        .filter(({ id }) => {
          const scope = scopes.get(id);
          return !scope || byCommission.get(scope)?.has(userId);
        })
        .map(({ id }) => id);
      if (!visible.length) return null;
      sectionsByUser.set(userId, visible);
    }
  }
  await tx.insert(evaluations).values({
    id,
    title: input.title,
    templateId: input.templateId,
    templateRevision: input.templateRevision,
    dueAt: input.dueAt,
    projectId,
    closureEventNo,
    responseMode: input.responseMode,
    commissionId: input.commissionId,
  });
  await tx
    .insert(assignments)
    .values(
      recipients.map(({ id: userId }) => ({
        evaluationId: id,
        userId,
        sectionIds: sectionsByUser.get(userId),
      })),
    );
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
        responseMode: evaluations.responseMode,
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

  router.get('/pending', async (_q, r) => {
    const [item] = await db
      .select({ id: evaluations.id })
      .from(assignments)
      .innerJoin(evaluations, matchEvaluation)
      .where(and(eq(assignments.userId, r.locals.user.id), isNull(assignments.submittedAt), active))
      .orderBy(sql`${evaluations.publishedAt} desc nulls last`, desc(evaluations.dueAt), evaluations.id)
      .limit(1);
    r.json({ id: item?.id ?? null });
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

  const details = async (id: string, userId: string) => {
    const [row] = await db
      .select({
        title: evaluations.title,
        responseMode: evaluations.responseMode,
        dueAt: evaluations.dueAt,
        open: active,
        paused,
        structure: versions.structure,
        answers: assignments.answers,
        sectionIds: assignments.sectionIds,
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
    if (!row) return undefined;
    const { sectionIds, structure, ...detail } = row;
    const template = structure as EvaluationStructure;
    return {
      ...detail,
      structure: sectionIds
        ? { ...template, sections: template.sections.filter(({ id }) => sectionIds.includes(id)) }
        : template,
    };
  };

  router.use('/manage', (_q, r, next) => {
    if (!['admin', 'coordination'].includes(r.locals.user.role))
      return r
        .status(403)
        .json({ error: 'Solo Coordinación y Administración pueden consultar resultados.' });
    next();
  });

  router.get('/manage', async (q, r) => {
    const { after, projectId, status } = z
      .strictObject({
        after: z.uuid().optional(),
        projectId: z.string().min(1).max(200).optional(),
        status: z.enum(['open', 'paused', 'closed']).optional(),
      })
      .parse(q.query);
    const rows = await db
      .select({
        id: evaluations.id,
        title: evaluations.title,
        responseMode: evaluations.responseMode,
        dueAt: evaluations.dueAt,
        open: active,
        paused,
        templateRevision: evaluations.templateRevision,
      })
      .from(evaluations)
      .where(
        and(
          after ? gt(evaluations.id, after) : undefined,
          projectId ? eq(evaluations.projectId, projectId) : undefined,
          status === 'open'
            ? active
            : status === 'paused'
              ? paused
              : status === 'closed'
                ? sql`not (${beforeDeadline})`
                : undefined,
        ),
      )
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

  const reportRows = (ids: string[]) =>
    db
      .select({
        id: evaluations.id,
        title: evaluations.title,
        dueAt: evaluations.dueAt,
        templateRevision: evaluations.templateRevision,
        templateId: evaluations.templateId,
        open: active,
        paused,
        structure: versions.structure,
        body: conclusions.body,
        conclusionRevision: conclusions.revision,
        responseMode: evaluations.responseMode,
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
      .where(inArray(evaluations.id, ids));

  router.post('/manage/memo', async (q, r) => {
    const { ids } = z
      .strictObject({
        ids: z
          .array(z.uuid())
          .min(2)
          .max(8)
          .refine((values) => new Set(values).size === values.length),
      })
      .parse(q.body);
    const reports = await reportRows(ids);
    if (reports.length !== ids.length || reports.some(({ summary }) => !summary))
      return r
        .status(404)
        .json({ error: 'Selecciona evaluaciones cerradas con resultados disponibles.' });
    const byId = new Map(reports.map((report) => [report.id, report]));
    r.json({ reports: ids.map((id) => byId.get(id)) });
  });

  router.post('/manage/consolidation', async (q, r) => {
    const { ids, action, revision } = z.strictObject({
      ids: z.array(z.uuid()).min(2).max(8).refine((values) => new Set(values).size === values.length),
      action: z.enum(['save', 'list', 'open']),
      revision: z.int().positive().optional(),
    }).parse(q.body);
    if (action === 'open' && !revision) return r.status(400).json({ error: 'Elige una versión.' });
    const scope = createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');
    const result = await db.execute(sql`select bandarlog_api.evaluation_consolidations(
      ${scope},${action === 'save' ? sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`,`)}]` : sql`NULL`}::text[],
      ${action === 'open' ? revision : null}
    ) as value`);
    const value = result.rows[0]?.value;
    if (value == null) return r.status(404).json({ error: 'Necesitas evaluaciones cerradas con resultados disponibles.' });
    r.json(value);
  });

  router.get('/manage/:id', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const [evaluation] = await reportRows([id]);
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

  router.get('/manage/:id/deadline', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const result = await db.execute(sql`select bandarlog_api.evaluation_deadline_history(${id}) as history`);
    r.json(result.rows[0]?.history ?? []);
  });
  router.put('/manage/:id/deadline', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const { previous, dueAt, reason } = z.strictObject({
      previous: z.iso.datetime({ offset: true }), dueAt: z.iso.datetime({ offset: true }),
      reason: z.string().trim().min(1).max(400),
    }).parse(q.body);
    const result = await db.execute(sql`select bandarlog_api.evaluation_deadline(
      ${id},${previous}::timestamptz,${dueAt}::timestamptz,${reason},${r.locals.user.id}
    ) as ok`);
    if (!result.rows[0]?.ok) return r.status(409).json({ error: 'El plazo cambió, ya venció o la fecha elegida no es válida.' });
    r.json({ ok: true });
  });

  router.post('/manage/:id/annex', async (q, r) => {
    if (r.locals.user.role !== 'admin')
      return r.status(403).json({ error: 'El anexo requiere Administración de grupo.' });
    const id = z.uuid().parse(q.params.id);
    const result = await db.execute(sql`select bandarlog_api.group_evaluation_annex(
      ${id}, ${r.locals.user.id}) as answers`);
    const answers = result.rows[0]?.answers;
    if (!answers)
      return r.status(404).json({ error: 'El anexo no está disponible para esta evaluación.' });
    r.json({ answers });
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
    const item = await details(z.uuid().parse(q.params.id), r.locals.user.id);
    if (!item) return r.status(404).json({ error: 'Evaluación no encontrada.' });
    r.json(item);
  });

  router.put('/:id/response', async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const command = response.parse(q.body);
    const userId: string = r.locals.user.id;
    const item = await details(id, userId);
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
    r.json({
      revision: result[0].revision,
      submittedAt: result[0].submittedAt,
      answers: result[0].answers,
    });
  });
  return router;
}
