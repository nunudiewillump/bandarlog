import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as s from '../server/schema';
import { rememberedEntry } from '../server/remembered-entry';

test('remembered entry preserves legacy sessions, isolates groups, and rejects expired or revoked access', async () => {
  const client = new PGlite();
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: 'migrations' });
    const [legacy] = await db.select().from(s.groups).where(eq(s.groups.id, 'rosales-702'));
    const [group] = await db.insert(s.groups).values({ name: 'Otro grupo' }).returning();
    const raw = 'legacy-session-before-private-group-cookies',
      rawOther = 'b'.repeat(64);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 60000).toISOString();
    for (const [g, token] of [
      [legacy, raw],
      [group, rawOther],
    ] as const) {
      await db.insert(s.users).values({
        id: g.id,
        groupId: g.id,
        name: g.name,
        email: 'same@example.test',
        role: 'member',
      });
      await db.insert(s.sessions).values({
        id: hash(token),
        groupId: g.id,
        userId: g.id,
        csrf: 'test-only',
        expires: future,
        absoluteExpiresAt: future,
      });
    }
    assert.equal(await rememberedEntry(db, undefined, legacy.id), null);
    assert.equal(
      await rememberedEntry(db, 'bandarlog=' + raw, legacy.id),
      '/g/' + legacy.privateId + '/',
    );
    assert.equal(
      await rememberedEntry(db, 'bandarlog=' + rawOther, legacy.id),
      null,
      'a tenant bearer cannot be interpreted as a legacy session',
    );
    const marker = 'bandarlog_entry=' + group.privateId + '.' + hash(rawOther);
    assert.equal(await rememberedEntry(db, marker, legacy.id), '/g/' + group.privateId + '/');
    assert.equal(
      await rememberedEntry(db, marker + '; bandarlog=' + raw, legacy.id),
      '/g/' + group.privateId + '/',
      'last active group has priority',
    );
    assert.equal(
      await rememberedEntry(
        db,
        'bandarlog_entry=' + legacy.privateId + '.' + hash(rawOther),
        legacy.id,
      ),
      null,
      'a marker cannot change the session group',
    );
    assert.equal(
      await rememberedEntry(db, 'bandarlog_entry=https://evil.example', legacy.id),
      null,
    );
    await db
      .update(s.sessions)
      .set({ expires: past })
      .where(eq(s.sessions.id, hash(rawOther)));
    assert.equal(await rememberedEntry(db, marker, legacy.id), null);
    await db
      .update(s.sessions)
      .set({ expires: future, absoluteExpiresAt: past })
      .where(eq(s.sessions.id, hash(rawOther)));
    assert.equal(await rememberedEntry(db, marker, legacy.id), null);
    await db
      .update(s.sessions)
      .set({ absoluteExpiresAt: future })
      .where(eq(s.sessions.id, hash(rawOther)));
    await db.update(s.users).set({ disabledAt: past }).where(eq(s.users.id, group.id));
    assert.equal(await rememberedEntry(db, marker, legacy.id), null);
    await db.update(s.users).set({ disabledAt: null }).where(eq(s.users.id, group.id));
    await db.delete(s.sessions).where(eq(s.sessions.id, hash(rawOther)));
    assert.equal(
      await rememberedEntry(db, marker, legacy.id),
      null,
      'logout invalidates navigation hints',
    );
  } finally {
    await client.close();
  }
});
