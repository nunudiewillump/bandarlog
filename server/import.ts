import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { connect, type Database } from './db.js';
import * as s from './schema.js';
import { projectTypeInput } from './project-input.js';
const key = z.string().trim().min(1).max(100);
const bundle = z.object({
  users: z
    .array(
      z.object({
        id: key,
        name: key,
        email: z.email(),
        role: z.enum(['admin', 'coordination', 'member']),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        id: key,
        name: key,
        type: projectTypeInput.default('general'),
        parentId: key.nullable().default(null),
        starts: z.iso.date(),
        ends: z.iso.date(),
      }),
    )
    .default([]),
  commissions: z
    .array(
      z.object({
        id: key,
        projectId: key,
        name: key,
        description: z.string().default(''),
        icon: z.string().default('tent'),
      }),
    )
    .default([]),
  members: z
    .array(
      z.object({
        commissionId: key,
        userId: key,
        role: z
          .enum(['scouter', 'responsible', 'member', 'coordinator'])
          .transform((v) => (v === 'coordinator' ? 'responsible' : v === 'member' ? 'scouter' : v)),
      }),
    )
    .default([]),
  tasks: z
    .array(
      z.object({
        id: key,
        commissionId: key,
        title: key,
        description: z.string().default(''),
        due: z.iso.datetime({ offset: true }),
        status: z.enum(['pending', 'in_progress', 'blocked', 'done']),
        responsibleIds: z.array(key).min(1),
        blockedReason: z.string().nullable().default(null),
        completedBy: key.nullable().default(null),
        completedAt: z.iso.datetime({ offset: true }).nullable().default(null),
      }),
    )
    .default([]),
});
const prefix = (id: string) => `import-${id}`;
const stable = (...parts: string[]) =>
  `import-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)}`;
class Preview extends Error {
  constructor(public report: unknown) {
    super('preview');
  }
}
export async function importBundle(db: Database, input: unknown, apply = false) {
  const parsed = bundle.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      applied: false,
      conflicts: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  const b = parsed.data;
  const conflicts: string[] = [];
  const duplicates = (xs: string[], label: string) => {
    if (new Set(xs).size !== xs.length) conflicts.push(`Identificadores duplicados en ${label}`);
  };
  for (const [name, rows] of Object.entries(b))
    duplicates(
      rows.map((r: any) => r.id || `${r.commissionId}-${r.userId}`),
      name,
    );
  const users = new Map(b.users.map((u) => [u.id, u])),
    projects = new Map(b.projects.map((p) => [p.id, p])),
    cs = new Map(b.commissions.map((c) => [c.id, c]));
  for (const p of b.projects) {
    if (p.ends < p.starts) conflicts.push(`Proyecto ${p.id}: fechas invertidas`);
    if (p.parentId && !projects.has(p.parentId))
      conflicts.push(`Proyecto ${p.id}: referencia histórica desconocida`);
  }
  // Only order optional historical FK references; all types remain independent.
  const orderedProjects: typeof b.projects = [],
    visited = new Set<string>(),
    visiting = new Set<string>();
  function visitProject(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      conflicts.push(`Proyecto ${id}: referencia histórica circular`);
      return;
    }
    const project = projects.get(id);
    if (!project) return;
    visiting.add(id);
    if (project.parentId) visitProject(project.parentId);
    visiting.delete(id);
    visited.add(id);
    orderedProjects.push(project);
  }
  b.projects.forEach((project) => visitProject(project.id));
  for (const c of b.commissions)
    if (!projects.has(c.projectId)) conflicts.push(`Comisión ${c.id}: proyecto desconocido`);
  for (const m of b.members)
    if (!users.has(m.userId) || !cs.has(m.commissionId))
      conflicts.push(`Membresía ${m.userId}/${m.commissionId}: referencia desconocida`);
  for (const t of b.tasks) {
    if (!cs.has(t.commissionId)) conflicts.push(`Tarea ${t.id}: comisión desconocida`);
    if (t.status === 'blocked' && !t.blockedReason?.trim())
      conflicts.push(`Tarea ${t.id}: falta motivo de bloqueo`);
    if (t.status === 'done' && (!t.completedBy || !users.has(t.completedBy) || !t.completedAt))
      conflicts.push(`Tarea ${t.id}: faltan datos de finalización`);
    for (const uid of t.responsibleIds)
      if (!b.members.some((m) => m.userId === uid && m.commissionId === t.commissionId))
        conflicts.push(`Tarea ${t.id}: ${uid} no pertenece a la comisión`);
  }
  if (conflicts.length) return { ok: false, applied: false, conflicts };
  const rows: { name: string; table: any; values: any[] }[] = [
    {
      name: 'users',
      table: s.users,
      values: b.users.map((u) => ({ ...u, id: prefix(u.id), email: u.email.toLowerCase() })),
    },
    {
      name: 'projects',
      table: s.projects,
      values: orderedProjects.map((p) => ({
        ...p,
        id: prefix(p.id),
        parentId: p.parentId ? prefix(p.parentId) : null,
      })),
    },
    {
      name: 'commissions',
      table: s.commissions,
      values: b.commissions.map((c) => ({
        ...c,
        id: prefix(c.id),
        projectId: prefix(c.projectId),
      })),
    },
    {
      name: 'members',
      table: s.members,
      values: b.members.map((m) => ({
        ...m,
        id: stable(m.commissionId, m.userId),
        commissionId: prefix(m.commissionId),
        userId: prefix(m.userId),
      })),
    },
    {
      name: 'tasks',
      table: s.tasks,
      values: b.tasks.map(({ responsibleIds, ...t }) => ({
        ...t,
        id: prefix(t.id),
        commissionId: prefix(t.commissionId),
        completedBy: t.completedBy ? prefix(t.completedBy) : null,
        completedAt: t.status === 'done' ? t.completedAt : null,
        updatedAt: new Date().toISOString(),
      })),
    },
    {
      name: 'assignments',
      table: s.assignments,
      values: b.tasks.flatMap((t) =>
        [...new Set(t.responsibleIds)].map((uid) => ({
          id: stable(t.id, uid),
          taskId: prefix(t.id),
          userId: prefix(uid),
        })),
      ),
    },
  ];
  const counts: Record<string, number> = {};
  try {
    return await db.transaction(async (tx: any) => {
      for (const group of rows) {
        counts[group.name] = 0;
        for (const row of group.values) {
          const [existing] = await tx.select().from(group.table).where(eq(group.table.id, row.id));
          if (existing) {
            const changed = Object.keys(row)
              .filter((k) => k !== 'updatedAt')
              .some((k) =>
                ['due', 'completedAt'].includes(k)
                  ? (existing[k] ? new Date(existing[k]).getTime() : null) !==
                    (row[k] ? new Date(row[k]).getTime() : null)
                  : existing[k] !== row[k],
              );
            if (changed)
              conflicts.push(
                `${group.name}/${row.id}: difiere del registro existente; no se sobrescribe`,
              );
            continue;
          }
          await tx.insert(group.table).values(row);
          counts[group.name]++;
        }
      }
      if (conflicts.length) throw new Preview({ ok: false, applied: false, conflicts });
      const report = { ok: true, applied: apply, created: counts, conflicts: [] };
      if (!apply) throw new Preview(report);
      return report;
    });
  } catch (e) {
    if (e instanceof Preview) return e.report;
    return {
      ok: false,
      applied: false,
      conflicts: [
        'Conflicto de integridad: revisa correos duplicados, nombres de comisiones y referencias. No se ha importado ningún registro.',
      ],
    };
  }
}
if (process.argv[1]?.endsWith('/import.ts')) {
  const path = process.argv[2];
  if (!path) throw new Error('Uso: npm run import -- fichero.json [--apply]');
  const input = JSON.parse(await readFile(path, 'utf8'));
  const { db, close } = await connect();
  try {
    const report: any = await importBundle(db, input, process.argv.includes('--apply'));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await close();
  }
}
