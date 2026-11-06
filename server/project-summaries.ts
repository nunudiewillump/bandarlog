import { and, inArray, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { commissions, tasks } from './schema.js';
export async function projectSummaries(
  db: Database,
  projects: { id: string; name: string; type: string }[],
) {
  if (!projects.length) return [];
  const groups = await db
    .select({ id: commissions.id, name: commissions.name, projectId: commissions.projectId })
    .from(commissions)
    .where(
      and(
        sql`${commissions.deletedAt} is null`,
        inArray(
          commissions.projectId,
          projects.map((project) => project.id),
        ),
      ),
    );
  const rows = groups.length
    ? await db
        .select({ commissionId: tasks.commissionId, status: tasks.status, due: tasks.due })
        .from(tasks)
        .where(
          and(
            inArray(
              tasks.commissionId,
              groups.map((group) => group.id),
            ),
            sql`${tasks.deletedAt} is null`,
          ),
        )
    : [];
  return summarizeProjects(projects, groups, rows);
}
export function summarizeProjects(
  projects: { id: string; name: string; type: string }[],
  groups: { id: string; name: string; projectId: string }[],
  rows: { commissionId: string; status: string; due: string }[],
  now = Date.now(),
) {
  const empty = () => ({
    total: 0,
    open: 0,
    done: 0,
    blocked: 0,
    overdue: 0,
    nextDue: null as string | null,
  });
  const byProject = new Map(
    projects.map((project) => [
      project.id,
      {
        ...project,
        ...empty(),
        commissions: [] as ({ id: string; name: string } & ReturnType<typeof empty>)[],
      },
    ]),
  );
  const byCommission = new Map<
    string,
    { project: ReturnType<typeof empty>; summary: ReturnType<typeof empty> }
  >();
  for (const group of groups) {
    const project = byProject.get(group.projectId);
    if (!project) continue;
    const summary = { id: group.id, name: group.name, ...empty() };
    project.commissions.push(summary);
    byCommission.set(group.id, { project, summary });
  }
  for (const row of rows) {
    const entry = byCommission.get(row.commissionId);
    if (!entry) continue;
    for (const summary of [entry.summary, entry.project]) {
      summary.total++;
      if (row.status === 'done') {
        summary.done++;
        continue;
      }
      summary.open++;
      if (row.status === 'blocked') summary.blocked++;
      if (+new Date(row.due) < now) summary.overdue++;
      else if (!summary.nextDue || row.due < summary.nextDue) summary.nextDue = row.due;
    }
  }
  return [...byProject.values()];
}
