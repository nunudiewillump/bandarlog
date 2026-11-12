import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { commissions, tasks } from './schema.js';
export async function projectSummaries(
  db: Database,
  projects: { id: string; name: string; type: string }[],
) {
  if (!projects.length) return [];
  const at = new Date().toISOString();
  // One compact row per commission, including empty commissions. No task bodies cross the wire.
  const groups = await db
    .select({
      id: commissions.id,
      name: commissions.name,
      projectId: commissions.projectId,
      total: sql<number>`count(${tasks.id})::int`,
      open: sql<number>`count(${tasks.id}) filter (where ${tasks.status} <> 'done')::int`,
      done: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
      blocked: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'blocked')::int`,
      overdue: sql<number>`count(${tasks.id}) filter (where ${tasks.status} <> 'done' and ${tasks.due} < ${at}::timestamptz)::int`,
      nextDue: sql<
        string | null
      >`min(${tasks.due}) filter (where ${tasks.status} <> 'done' and ${tasks.due} >= ${at}::timestamptz)`.mapWith(
        (value: string | Date | null) => (value === null ? null : new Date(value).toISOString()),
      ),
    })
    .from(commissions)
    .leftJoin(tasks, and(eq(tasks.commissionId, commissions.id), sql`${tasks.deletedAt} is null`))
    .where(
      and(
        sql`${commissions.deletedAt} is null`,
        inArray(
          commissions.projectId,
          projects.map((p) => p.id),
        ),
      ),
    )
    .groupBy(commissions.id);
  return projects.map((project) => {
    const members = groups.filter((group) => group.projectId === project.id);
    const next = members
      .map((group) => group.nextDue)
      .filter((value): value is string => !!value)
      .sort();
    const sum = (key: 'total' | 'open' | 'done' | 'blocked' | 'overdue') =>
      members.reduce((n, group) => n + group[key], 0);
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      total: sum('total'),
      open: sum('open'),
      done: sum('done'),
      blocked: sum('blocked'),
      overdue: sum('overdue'),
      nextDue: next[0] || null,
      commissions: members.map(({ projectId: _, ...group }) => group),
    };
  });
}
