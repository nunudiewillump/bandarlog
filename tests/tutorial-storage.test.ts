import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expireTutorials, readTutorial, ABANDON_AFTER_MS } from '../server/tutorial';
import { tutorialProgress, users } from '../server/schema';
test('persisted abandonment is recorded once at the inactivity boundary and never for skipped or unseen users', async () => {
  const client = new PGlite(),
    db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: 'migrations' });
    const start = '2026-01-01T09:00:00.000Z';
    for (const id of ['active', 'skip', 'unstarted'])
      await db
        .insert(users)
        .values({ id, name: 'Private', email: `${id}@example.test`, role: 'member' });
    await db.insert(tutorialProgress).values([
      {
        userId: 'active',
        events: { tutorial_shown: start, tutorial_started: start },
        lastActivityAt: start,
      },
      {
        userId: 'skip',
        events: { tutorial_shown: start, tutorial_started: start, tutorial_skipped: start },
        lastActivityAt: start,
      },
      { userId: 'unstarted', events: { tutorial_shown: start } },
    ]);
    const boundary = new Date(Date.parse(start) + ABANDON_AFTER_MS).toISOString();
    await expireTutorials(db, new Date(Date.parse(boundary) - 1).toISOString());
    assert.equal(
      (await db.select().from(tutorialProgress)).some((p) => p.events.tutorial_abandoned),
      false,
    );
    await expireTutorials(db, boundary);
    await expireTutorials(db, new Date(Date.parse(boundary) + 10000).toISOString());
    const rows = await db.select().from(tutorialProgress);
    const active = rows.find((p) => p.userId === 'active')!;
    assert.equal(active.events.tutorial_abandoned, boundary);
    assert.equal(active.version, 1);
    assert.equal(rows.filter((p) => p.events.tutorial_abandoned).length, 1);
    assert.deepEqual((await readTutorial(db, 'new-existing-user')).events, {});
    assert.equal(
      (await client.query<{ n: number }>('SELECT count(*) as n FROM tasks')).rows[0].n,
      0,
    );
  } finally {
    await client.close();
  }
});
