import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('unifying projects preserves legacy IDs, links, assignments, roles, task steps and activity', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-project-migration-')),
    client = new PGlite(),
    db = drizzle(client);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.filter((entry: any) => entry.idx < 11);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(`migrations/${entry.tag}.sql`, join(folder, entry.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    await client.exec(
      `BEGIN; INSERT INTO users(id,name,email,role) VALUES('u','Scouter','migration@example.test','member'); INSERT INTO projects(id,name,type,starts,ends) VALUES('annual','Original anual','ronda','2026-01-01','2026-12-31'); INSERT INTO projects(id,name,type,parent_id,starts,ends) VALUES('camp','Original campamento','camp','annual','2026-07-01','2026-07-03'); INSERT INTO commissions(id,project_id,name,description,icon) VALUES('c','camp','Material','','tent'); INSERT INTO members(id,commission_id,user_id,role) VALUES('m','c','u','responsible'); INSERT INTO tasks(id,commission_id,title,description,due,status,updated_at,checklist) VALUES('t','c','Conservar tarea','Historia','2026-07-02T12:00:00Z','pending',now(),'[{"id":"step","title":"Conservar paso","done":false}]'); INSERT INTO assignments(id,task_id,user_id) VALUES('a','t','u'); INSERT INTO activity(id,task_id,user_id,kind,body,created_at) VALUES('act','t','u','created','Actividad conservada',now()); COMMIT;`,
    );
    const before = await client.query(
      'SELECT id,name,type,parent_id,starts,ends FROM projects ORDER BY id',
    );
    await migrate(db, { migrationsFolder: 'migrations' });
    assert.deepEqual(
      (await client.query('SELECT id,name,type,parent_id,starts,ends FROM projects ORDER BY id'))
        .rows,
      before.rows,
    );
    assert.deepEqual(
      (
        await client.query<any>(
          `select id,name,deleted_at,deleted_by from commissions where id='c'`,
        )
      ).rows,
      [{ id: 'c', name: 'Material', deleted_at: null, deleted_by: null }],
    );
    assert.equal(
      (await client.query<any>(`select role from members where id='m'`)).rows[0].role,
      'responsible',
    );
    assert.equal(
      (await client.query<any>(`select body from activity where id='act'`)).rows[0].body,
      'Actividad conservada',
    );
    assert.equal(
      (await client.query<any>(`select checklist from tasks where id='t'`)).rows[0].checklist[0]
        .title,
      'Conservar paso',
    );
    assert.equal((await client.query(`select id from assignments where id='a'`)).rows.length, 1);
    await client.exec(
      `INSERT INTO projects(id,name,starts,ends) VALUES('general','Independiente','2027-01-01','2027-01-02'); INSERT INTO projects(id,name,type,starts,ends) VALUES('event','Evento','event','2027-01-01','2027-01-02');`,
    );
    assert.equal(
      (await client.query<any>(`select type from projects where id='general'`)).rows[0].type,
      'general',
    );
    assert.equal(
      (await client.query<any>(`select parent_id from projects where id='event'`)).rows[0]
        .parent_id,
      null,
    );
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});
