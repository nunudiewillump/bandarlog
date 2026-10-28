import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('existing memberships and pending invitations survive the migration to commission roles', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-migrations-'));
  const client = new PGlite();
  const db = drizzle(client);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(`migrations/${entry.tag}.sql`, join(folder, entry.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    await client.exec(
      `INSERT INTO users(id,name,email,role) VALUES ('u','Persona','u@example.test','member'); INSERT INTO projects(id,name,type) VALUES ('p','Ronda','ronda'); INSERT INTO commissions(id,project_id,name,description,icon) VALUES ('c','p','Cocina','','chef'); INSERT INTO members(id,commission_id,user_id,role) VALUES ('m','c','u','coordinator'); INSERT INTO invitations(id,commission_id,email,name,status,expires) VALUES ('i','c','new@example.test','Nueva','pending',now()+interval '7 days');`,
    );
    await migrate(db, { migrationsFolder: 'migrations' });
    const roles = await client.query<{ role: string }>(`select role from members where id='m'`);
    assert.equal(roles.rows[0].role, 'responsible');
    const invites = await client.query<{ role: string; status: string }>(
      `select role,status from invitations where id='i'`,
    );
    assert.equal(invites.rows[0].role, 'scouter');
    assert.equal(invites.rows[0].status, 'pending');
    const configured = await client.query<{ name: string; onboarding_completed_at: string | null }>(
      `select name,onboarding_completed_at from users where id='u'`,
    );
    assert.equal(configured.rows[0].name, 'Persona');
    assert.ok(
      configured.rows[0].onboarding_completed_at,
      'existing users stay configured after migration',
    );
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});
