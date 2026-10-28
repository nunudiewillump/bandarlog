import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Forest migration preserves existing profiles and sessions while new users require onboarding', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-forest-migration-'));
  const client = new PGlite();
  const db = drizzle(client);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.slice(0, 7);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(`migrations/${entry.tag}.sql`, join(folder, entry.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    await client.exec(`INSERT INTO users(id,name,email,role,avatar_url) VALUES('old','Persona existente','old@example.test','member','avatar-preserved');
      INSERT INTO sessions(id,user_id,csrf,expires) VALUES('session-existing','old','csrf-existing',now()+interval '7 days');`);
    await migrate(db, { migrationsFolder: 'migrations' });
    const old = (
      await client.query<{ name: string; avatar_url: string; onboarding_completed_at: string }>(
        `SELECT name,avatar_url,onboarding_completed_at FROM users WHERE id='old'`,
      )
    ).rows[0];
    assert.equal(old.name, 'Persona existente');
    assert.equal(old.avatar_url, 'avatar-preserved');
    assert.ok(old.onboarding_completed_at);
    const session = (
      await client.query<{ csrf: string; absolute_expires_at: string; expires: string }>(
        `SELECT csrf,absolute_expires_at,expires FROM sessions WHERE id='session-existing'`,
      )
    ).rows[0];
    assert.equal(session.csrf, 'csrf-existing');
    assert.ok(new Date(session.absolute_expires_at) > new Date(session.expires));
    await client.exec(
      `INSERT INTO users(id,name,email,role) VALUES('new','Invitada','new@example.test','member')`,
    );
    const fresh = (
      await client.query<{ onboarding_completed_at: string | null }>(
        `SELECT onboarding_completed_at FROM users WHERE id='new'`,
      )
    ).rows[0];
    assert.equal(fresh.onboarding_completed_at, null);
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
});
