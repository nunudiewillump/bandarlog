import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { groupContext } from '../../server/group-context';
import { pendingPushWork } from '../../server/push-work';
import * as s from '../../server/schema';
export async function exercisePushWork(db: any, owner: any) {
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
