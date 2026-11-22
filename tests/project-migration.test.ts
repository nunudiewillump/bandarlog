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
    await client.query("select set_config('bandarlog.group_id','rosales-702',false)");
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

test('the actor SQL role sees only its project and commission records and keeps closed minutes immutable', async () => {
  const client = new PGlite();
  try {
    await migrate(drizzle(client), { migrationsFolder: 'migrations' });
    const token = 'a'.repeat(64);
    await client.exec(`
      INSERT INTO scout_groups(id,name) VALUES('map-a','Grupo A'),('map-b','Grupo B');
      INSERT INTO users(group_id,id,name,email,role) VALUES('map-a','map-member','Member','member@example.test','member'),('map-a','map-admin','Admin','admin@example.test','admin');
      INSERT INTO sessions(group_id,id,user_id,csrf,expires,assurance,primary_verified_at)
        VALUES('map-a',encode(sha256(convert_to('${token}','UTF8')),'hex'),'map-member','synthetic',now()+interval '1 day','primary',now());
      INSERT INTO projects(group_id,id,name) VALUES('map-a','map-project','A'),('map-b','map-foreign','B'),('map-a','map-other','Otra');
      INSERT INTO commissions(group_id,id,project_id,name,description,icon) VALUES
        ('map-a','map-own','map-project','A','','tent'),('map-a','map-hidden','map-project','Oculta','','tent'),
        ('map-a','map-separate','map-other','Otra','','tent');
      INSERT INTO members(group_id,id,user_id,commission_id,role) VALUES('map-a','map-role','map-member','map-own','scouter');
      INSERT INTO tasks(group_id,id,commission_id,title,description,due,status,updated_at) VALUES
        ('map-a','map-task-own','map-own','Tarea A','',now(),'pending',now()),
        ('map-a','map-task-hidden','map-hidden','Tarea oculta','',now(),'pending',now()),
        ('map-a','map-task-separate','map-separate','Otra tarea','',now(),'pending',now());
      INSERT INTO project_phases(group_id,id,project_id,name,starts,ends,position) VALUES
        ('map-a','map-phase','map-project','A','2027-01-01','2027-01-03',1),
        ('map-b','map-phase-foreign','map-foreign','B','2027-01-01','2027-01-03',1);
      INSERT INTO project_milestones(group_id,id,project_id,commission_id,name,planned) VALUES
        ('map-a','map-milestone','map-project','map-own','Visible','2027-01-01'),
        ('map-a','map-milestone-hidden','map-project','map-hidden','Oculto','2027-01-01');
      INSERT INTO project_decisions(group_id,id,project_id,commission_id,author_id,title) VALUES
        ('map-a','map-decision','map-project','map-own','map-admin','Visible'),
        ('map-a','map-decision-hidden','map-project','map-hidden','map-admin','Oculta');
      INSERT INTO project_dependencies(group_id,project_id,source_id,target_id) VALUES
        ('map-a','map-project','map-task-own','map-task-hidden');
      INSERT INTO project_minutes(group_id,id,project_id,author_id,held_on,title,agenda,notes,closed_at)
        VALUES('map-a','map-minutes','map-project','map-admin','2027-01-01','Acta','Orden','Contenido',now());
    `);
    await assert.rejects(
      client.query(
        "insert into project_dependencies (group_id,project_id,source_id,target_id) values('map-a','map-project','map-task-own','map-task-separate')",
      ),
      /must belong to the project/,
    );
    await assert.rejects(
      client.query("update project_minutes set notes='Editado' where id='map-minutes'"),
      /Minutes already closed/,
    );
    await client.transaction(async (tx) => {
      await tx.query(
        "select set_config('bandarlog.group_id','map-a',true),set_config('bandarlog.session_token',$1,true)",
        [token],
      );
      await tx.query('set local session authorization bandarlog_http');
      await tx.query('set local role bandarlog_user_app');
      assert.deepEqual((await tx.query('select id from project_phases')).rows, [
        { id: 'map-phase' },
      ]);
      assert.deepEqual((await tx.query('select id from project_milestones')).rows, [
        { id: 'map-milestone' },
      ]);
      assert.deepEqual((await tx.query('select id from project_decisions')).rows, [
        { id: 'map-decision' },
      ]);
      assert.deepEqual((await tx.query('select * from project_dependencies')).rows, []);
      assert.deepEqual((await tx.query('select id from project_minutes')).rows, []);
    });
    await assert.rejects(
      client.transaction(async (tx) => {
        await tx.query(
          "select set_config('bandarlog.group_id','map-a',true),set_config('bandarlog.session_token',$1,true)",
          [token],
        );
        await tx.query('set local session authorization bandarlog_http');
        await tx.query('set local role bandarlog_user_app');
        await tx.query(
          "insert into project_phases(group_id,id,project_id,name,starts,ends,position) values('map-a','forbidden','map-project','A','2027-01-01','2027-01-03',1)",
        );
      }),
      /row-level security/,
    );
  } finally {
    await client.close();
  }
});
