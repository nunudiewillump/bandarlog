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
  const now = Date.now();
  const summarize = (items: typeof rows) => {
    const open = items.filter((item) => item.status !== 'done');
    return {
      total: items.length,
      open: open.length,
      done: items.length - open.length,
      blocked: open.filter((item) => item.status === 'blocked').length,
      overdue: open.filter((item) => +new Date(item.due) < now).length,
      nextDue:
        open
          .filter((item) => +new Date(item.due) >= now)
          .map((item) => item.due)
          .sort()[0] || null,
    };
  };
  return projects.map((project) => {
    const members = groups.filter((group) => group.projectId === project.id);
    const ids = new Set(members.map((group) => group.id));
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      ...summarize(rows.filter((row) => ids.has(row.commissionId))),
      commissions: members.map((group) => ({
        id: group.id,
        name: group.name,
        ...summarize(rows.filter((row) => row.commissionId === group.id)),
      })),
    };
  });
}
