import { test } from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readWelcome, recordWelcome } from '../server/welcome-presentation';
import { projects, tutorialProgress, users } from '../server/schema';

test('legacy tutorial and preferences survive migration; welcome updates preserve the first timestamps', async () => {
  const client = new PGlite();
  const db = drizzle(client);
  const previous = await mkdtemp(join(tmpdir(), 'bandarlog-welcome-'));
  try {
    await cp('migrations', previous, { recursive: true });
    const journalPath = join(previous, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 56);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrate(db, { migrationsFolder: previous });
    await client.query("select set_config('bandarlog.group_id','rosales-702',false)");
    const id = 'legacy-welcome';
    const prefs = JSON.stringify({ notifications: false, adminGuideCompleted: true });
    await db.insert(users).values({
      id,
      name: 'Test',
      email: 'legacy@example.test',
      role: 'member',
      preferences: prefs,
    });
    await db
      .insert(tutorialProgress)
      .values({ userId: id, events: { tutorial_completed: '2026-01-01T09:00:00Z' } });
    await db.insert(projects).values({
      id: 'legacy-welcome-project',
      name: 'Campamento anterior',
      type: 'camp',
      starts: '2026-05-01',
      ends: '2026-05-09',
    });
    await migrate(db, { migrationsFolder: 'migrations' });
    const scope = 'rosales-702';
    assert.equal((await readWelcome(db, scope, id)).viewedAt, null);
    const first = await recordWelcome(db, scope, id, 'view');
    const finished = await recordWelcome(db, scope, id, 'complete');
    assert.ok(finished.completedAt);
    assert.equal(first.viewedAt, finished.viewedAt);
    const reopened = await recordWelcome(db, scope, id, 'reopen');
    assert.ok(reopened.reopenedAt);
    assert.equal(reopened.completedAt, finished.completedAt);
    assert.deepEqual(await recordWelcome(db, scope, id, 'complete'), reopened);
    assert.equal((await db.select().from(users))[0].preferences, prefs);
    assert.equal((await db.select().from(projects))[0].name, 'Campamento anterior');
    assert.ok((await db.select().from(tutorialProgress))[0].events.tutorial_completed);
  } finally {
    await client.close();
    await rm(previous, { recursive: true, force: true });
  }
});
