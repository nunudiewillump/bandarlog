import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('unassigned migration preserves existing data and membership integrity while allowing removal of the last assignee', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-unassigned-migration-'));
  const pg = new PGlite();
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 17);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile('migrations/' + entry.tag + '.sql', join(folder, entry.tag + '.sql'));
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: folder });
    await pg.transaction(async (tx) => {
      await tx.exec(`INSERT INTO users(id,name,email,role) VALUES ('departing','Persona','person@example.test','member'),('outsider','Otra','other@example.test','member');
      INSERT INTO projects(id,name,type) VALUES ('project','Proyecto','general');
      INSERT INTO commissions(id,project_id,name,description,icon) VALUES ('commission','project','Material','Conservado','tent');
      INSERT INTO members(id,commission_id,user_id,role) VALUES ('member','commission','departing','scouter');
      INSERT INTO tasks(id,commission_id,title,description,due,status,updated_at) VALUES ('task','commission','Tarea','Conservada',now(),'pending',now());
      INSERT INTO assignments(id,task_id,user_id) VALUES ('assignment','task','departing');
      INSERT INTO activity(id,task_id,user_id,kind,body,created_at) VALUES ('history','task','departing','created','Historial conservado',now());`);
    });
    const snapshot = async () =>
      Promise.all(
        ['users', 'projects', 'commissions', 'members', 'tasks', 'assignments', 'activity'].map(
          async (table) => (await pg.query(`select * from ${table} order by id`)).rows,
        ),
      );
    const before = await snapshot();
    await assert.rejects(pg.exec("delete from assignments where id='assignment'"));
    await migrate(db, { migrationsFolder: 'migrations' });
    assert.deepEqual(await snapshot(), before);
    await pg.transaction(async (tx) => {
      await tx.exec(
        "delete from assignments where id='assignment'; delete from members where id='member';",
      );
    });
    assert.equal((await pg.query('select * from tasks')).rows.length, 1);
    assert.equal((await pg.query('select * from activity')).rows.length, 1);
    await assert.rejects(
      pg.exec("insert into assignments(id,task_id,user_id) values ('invalid','task','outsider')"),
    );
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
});
