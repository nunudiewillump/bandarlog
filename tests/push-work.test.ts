import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { scopedPglite, groupContext } from '../server/group-context';
import { pendingPushWork } from '../server/push-work';
import { connect } from '../server/db';
import * as s from '../server/schema';

async function exercise(db: any, owner: any) {
  const [group] = await owner.insert(s.groups).values({ name: 'Due work fixture' }).returning();
  await groupContext.run(group, async () => {
    const userId = group.id;
    await db
      .insert(s.users)
      .values({ id: userId, name: 'QA', email: 'same@example.invalid', role: 'admin' });
    const sub = group.id + '-device';
    await db.insert(s.pushSubscriptions).values({ id: sub, userId, subscription: '{}' });
    const ids = Array.from({ length: 101 }, (_, n) => group.id + '-' + String(n).padStart(3, '0'));
    await db.insert(s.pushOutbox).values(ids.map((id) => ({ id, userId, payload: '{}' })));
    await db.insert(s.pushDeliveries).values(
      ids.slice(0, 100).map((id, n) => ({
        id: id + '-delivery',
        outboxId: id,
        subscriptionId: sub,
        claimedAt: n === 0 ? new Date().toISOString() : '2000-01-01T00:00:00Z',
        nextAttemptAt: n === 0 ? null : new Date(Date.now() + 3600000).toISOString(),
      })),
    );
    const ready = () =>
      db.execute(
        sql`select id from (${pendingPushWork}) work where ready_at<=now() order by ready_at,id limit 100`,
      );
    assert.deepEqual(
      (await ready()).rows.map((r: any) => r.id),
      [ids[100]],
      '100 deferred outboxes must not hide the new job',
    );
    await db
      .update(s.pushOutbox)
      .set({ sentAt: new Date().toISOString() })
      .where(eq(s.pushOutbox.id, ids[100]));
    const next = await db.execute(sql`select min(ready_at) as at from (${pendingPushWork}) work`);
    const wait = +new Date(next.rows[0].at) - Date.now();
    assert.ok(
      wait > 14 * 60000 && wait <= 15 * 60000,
      `active lease should wait ~15 min, got ${wait}`,
    );
    await db
      .update(s.pushDeliveries)
      .set({ claimedAt: '2000-01-01T00:00:00Z' })
      .where(eq(s.pushDeliveries.outboxId, ids[0]));
    assert.deepEqual(
      (await ready()).rows.map((r: any) => r.id),
      [ids[0]],
    );
    await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id, sub));
    assert.equal(
      (await ready()).rows.length,
      100,
      'removed subscriptions allow completion, without sending',
    );
  });
}
test('device deadlines respect backoff/leases, and a full deferred batch cannot starve new work', async () => {
  const client = new PGlite();
  const owner = drizzle(client, { schema: s });
  try {
    await migrate(owner, { migrationsFolder: 'migrations' });
    await exercise(drizzle(scopedPglite(client) as PGlite, { schema: s }), owner);
  } finally {
    await client.close();
  }
});
test(
  'push eligibility SQL also executes on real PostgreSQL',
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    assert.ok(
      ['localhost', '127.0.0.1'].includes(new URL(process.env.TEST_POSTGRES_URL!).hostname),
    );
    const old = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
    const { db, ownerDb, close } = await connect();
    try {
      await exercise(db, ownerDb);
    } finally {
      await close();
      if (old === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = old;
    }
  },
);
