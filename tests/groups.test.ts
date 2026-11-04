import { importBundle } from '../server/import';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { scopedPglite, groupContext } from '../server/group-context';
import * as s from '../server/schema';

test('database group isolation covers selects, transactions, writes and cross-group relationships', async () => {
  const client = new PGlite();
  const owner = drizzle(client);
  try {
    await migrate(owner, { migrationsFolder: 'migrations' });
    const groups = await owner
      .insert(s.groups)
      .values([{ name: 'Grupo A' }, { name: 'Grupo B' }])
      .returning();
    const db = drizzle(scopedPglite(client) as PGlite, { schema: s });
    await assert.rejects(db.select().from(s.users));
    for (const group of groups)
      await groupContext.run(group, async () => {
        await db
          .insert(s.users)
          .values({ id: group.id, name: group.name, email: 'shared@example.test', role: 'admin' });
        await db
          .insert(s.projects)
          .values({ id: 'project-' + group.id, name: 'Proyecto', type: 'general' });
        await db.insert(s.authChallenges).values({
          email: 'shared@example.test',
          id: 'challenge-' + group.id,
          verifier: 'hash',
          expires: new Date(Date.now() + 60000).toISOString(),
          requestedAt: new Date().toISOString(),
          windowStartedAt: new Date().toISOString(),
        });
        await db
          .insert(s.googleIdentities)
          .values({ subject: 'shared-google-subject', userId: group.id });
      });
    for (const [index, group] of groups.entries())
      await groupContext.run(group, async () => {
        assert.equal((await db.select().from(s.users)).length, 1);
        assert.equal((await db.select().from(s.authChallenges)).length, 1);
        assert.equal((await db.select().from(s.googleIdentities)).length, 1);
        assert.equal(
          (
            await db
              .select()
              .from(s.users)
              .where(eq(s.users.id, groups[1 - index].id))
          ).length,
          0,
        );
        assert.equal(
          (
            await db
              .update(s.users)
              .set({ name: 'No' })
              .where(eq(s.users.id, groups[1 - index].id))
              .returning()
          ).length,
          0,
        );
        assert.equal(
          (
            await db
              .delete(s.projects)
              .where(eq(s.projects.id, 'project-' + groups[1 - index].id))
              .returning()
          ).length,
          0,
        );
        await db.transaction(async (tx) =>
          assert.equal((await tx.select().from(s.users))[0].groupId, group.id),
        );
        await assert.rejects(
          db.insert(s.users).values({
            id: 'outside-' + group.id,
            groupId: groups[1 - index].id,
            name: 'No',
            email: 'outside@example.test',
            role: 'admin',
          }),
        );
        await assert.rejects(
          db.insert(s.commissions).values({
            id: 'cross-' + group.id,
            projectId: 'project-' + groups[1 - index].id,
            name: 'No',
            description: '',
            icon: 'tent',
          }),
        );
      });
    assert.equal(
      (await owner.select().from(s.users)).length,
      2,
      'owner access must be separate from scoped API access',
    );
    assert.equal((await owner.select().from(s.authChallenges)).length, 2);
    const source = {
      users: [
        {
          id: 'same-source-user',
          name: 'Imported',
          email: 'imported@example.test',
          role: 'member',
        },
      ],
    };
    for (const group of groups)
      await groupContext.run(group, async () => {
        const report = await importBundle(db, source, true);
        assert.ok(report && typeof report === 'object' && 'ok' in report);
        assert.equal(report.ok, true);
        await assert.rejects(db.select().from(s.groupRegistrations));
      });
    const imported = (await owner.select().from(s.users)).filter(
      (u) => u.email === 'imported@example.test',
    );
    assert.equal(imported.length, 2);
    assert.notEqual(imported[0].id, imported[1].id);
  } finally {
    await client.close();
  }
});

test('existing group migration preserves IDs, memberships, completed work and history', async () => {
  const { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-group-upgrade-')),
    client = new PGlite(),
    db = drizzle(client);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 15);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile('migrations/' + entry.tag + '.sql', join(folder, entry.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    await client.exec(
      `INSERT INTO users(id,name,email,role) VALUES ('existing-admin','Coordinación','existing@example.test','admin'); INSERT INTO projects(id,name,type) VALUES ('existing-project','Campamento','camp'); INSERT INTO commissions(id,project_id,name,description,icon) VALUES ('existing-commission','existing-project','Material','Datos conservados','tent'); INSERT INTO members(id,commission_id,user_id,role) VALUES ('existing-member','existing-commission','existing-admin','responsible'); INSERT INTO tasks(id,commission_id,title,description,due,status,completed_by,completed_at,updated_at) VALUES ('existing-task','existing-commission','Tarea conservada','Historial',now(),'done','existing-admin',now(),now()); INSERT INTO assignments(id,task_id,user_id) VALUES ('existing-assignment','existing-task','existing-admin'); INSERT INTO activity(id,task_id,user_id,kind,body,created_at) VALUES ('existing-activity','existing-task','existing-admin','created','Historial conservado',now());`,
    );
    const tables = [
      'users',
      'projects',
      'commissions',
      'members',
      'tasks',
      'assignments',
      'activity',
    ];
    const snapshot = async () =>
      Promise.all(
        tables.map(async (table) =>
          (
            await client.query<Record<string, unknown>>(`select * from ${table} order by id`)
          ).rows.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'group_id')),
          ),
        ),
      );
    const old = await snapshot();
    await migrate(db, { migrationsFolder: 'migrations' });
    assert.deepEqual(await snapshot(), old);
    for (const table of tables)
      assert.equal(
        (await client.query<{ group_id: string }>(`select group_id from ${table}`)).rows[0]
          .group_id,
        'rosales-702',
      );
    const [legacy] = await db.select().from(s.groups);
    assert.equal(legacy.name, 'Rosales del Canal 702');
    assert.match(legacy.privateId, /^[a-f0-9]{32}$/);
    const scoped = drizzle(scopedPglite(client) as PGlite);
    await groupContext.run(legacy, async () =>
      assert.equal((await scoped.select().from(s.tasks))[0].id, 'existing-task'),
    );
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});
