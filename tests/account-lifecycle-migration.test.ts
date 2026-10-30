import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('historical responsibility migration preserves data and enforces live task membership', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-history-migration-'));
  const client = new PGlite();
  const db = drizzle(client);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 14);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(`migrations/${entry.tag}.sql`, join(folder, entry.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    await client.exec(`
      INSERT INTO users(id,name,email,role) VALUES ('actor','Admin','actor@example.test','admin'),('former','Anterior','former@example.test','member');
      INSERT INTO projects(id,name,type) VALUES ('p','Proyecto conservado','general');
      INSERT INTO commissions(id,project_id,name,description,icon) VALUES ('removed','p','Eliminada','','chef'),('completed','p','Completada','','chef'),('live','p','Vigente','','chef');
      INSERT INTO members(id,commission_id,user_id,role) VALUES ('m1','removed','former','scouter'),('m2','completed','former','scouter'),('m3','live','actor','responsible'),('m4','completed','actor','responsible');
      INSERT INTO tasks(id,commission_id,title,description,due,status,completed_by,completed_at,updated_at) VALUES ('hidden','removed','Pendiente histórica','Descripción original',now(),'pending',null,null,now()),('done','completed','Terminada','Descripción original',now(),'done','actor',now(),now()),('open','live','Pendiente vigente','',now(),'pending',null,null,now());
      INSERT INTO assignments(id,task_id,user_id) VALUES ('a1','hidden','former'),('a2','done','former'),('a3','open','actor');
      INSERT INTO activity(id,task_id,user_id,kind,body,created_at) VALUES ('event','hidden','actor','created','Historial original',now());
      UPDATE commissions SET deleted_at=now(),deleted_by='actor' WHERE id='removed';
    `);
    const snapshot = async () =>
      Promise.all(
        ['users', 'projects', 'commissions', 'members', 'tasks', 'assignments', 'activity'].map(
          async (table) => (await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
        ),
      );
    const before = await snapshot();
    await migrate(db, { migrationsFolder: 'migrations' });
    assert.deepEqual(await snapshot(), before);
    await client.exec(`DELETE FROM members WHERE user_id='former';`);
    assert.equal(
      (await client.query(`SELECT * FROM assignments WHERE user_id='former'`)).rows.length,
      2,
    );
    assert.equal(
      (await client.query<{ body: string }>(`SELECT body FROM activity WHERE id='event'`)).rows[0]
        .body,
      'Historial original',
    );
    await assert.rejects(client.exec(`DELETE FROM members WHERE id='m3'`), /Reasigna/);
    await assert.rejects(
      client.exec(`INSERT INTO assignments(id,task_id,user_id) VALUES ('bad','open','former')`),
      /pertenecer/,
    );
    await assert.rejects(
      client.exec(`DELETE FROM assignments WHERE id='a3'`),
      /al menos un responsable/,
    );
    await client.exec(`UPDATE tasks SET title='Historial editable' WHERE id='done'`);
    await assert.rejects(
      client.exec(
        `UPDATE tasks SET status='pending',completed_by=null,completed_at=null WHERE id='done'`,
      ),
      /pertenecer/,
    );
    await client.exec(
      `BEGIN; UPDATE assignments SET user_id='actor' WHERE id='a2'; UPDATE tasks SET status='pending',completed_by=null,completed_at=null WHERE id='done'; COMMIT;`,
    );
    assert.equal(
      (await client.query<{ status: string }>(`SELECT status FROM tasks WHERE id='done'`)).rows[0]
        .status,
      'pending',
    );
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});
