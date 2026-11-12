import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { scopedPglite, groupContext } from '../server/group-context';
import { pushService } from '../server/push';
import * as s from '../server/schema';

test('ten groups retain device delivery isolation and retries skip already accepted devices', async () => {
  const client = new PGlite();
  const owner = drizzle(client, { schema: s });
  const db = drizzle(scopedPglite(client) as PGlite, { schema: s });
  try {
    await migrate(owner, { migrationsFolder: 'migrations' });
    const groups = await owner
      .insert(s.groups)
      .values(Array.from({ length: 10 }, (_, n) => ({ name: `Synthetic ${n}` })))
      .returning();
    const calls = new Map<string, number>();
    let failSecond = true;
    const sender = async (subscription: any) => {
      const key = subscription.endpoint;
      calls.set(key, (calls.get(key) || 0) + 1);
      if (key.endsWith('/second') && failSecond) throw { statusCode: 503 };
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { statusCode: 201, body: '', headers: {} };
    };
    const service = await pushService(db, 'https://bandarlog.app', owner, sender);
    for (const group of groups)
      await groupContext.run(group, async () => {
        await db
          .insert(s.users)
          .values({
            id: group.id,
            name: 'Synthetic',
            email: 'same@example.invalid',
            role: 'admin',
          });
        await db.insert(s.pushOutbox).values({ id: group.id, userId: group.id, payload: '{}' });
        await db
          .insert(s.pushSubscriptions)
          .values(
            ['first', 'second'].map((device) => ({
              id: group.id + '-' + device,
              userId: group.id,
              subscription: JSON.stringify({
                endpoint: 'https://fcm.googleapis.com/' + group.id + '/' + device,
              }),
            })),
          );
        assert.equal(
          await service.send(group.id, { title: 'QA', body: 'QA', url: '/', tag: 'QA' }, group.id),
          false,
        );
        assert.equal((await db.select().from(s.pushDeliveries)).length, 2);
      });
    failSecond = false;
    for (const group of groups)
      await groupContext.run(group, async () => {
        await db.update(s.pushDeliveries).set({ nextAttemptAt: '2000-01-01T00:00:00Z' });
        await Promise.all([
          service.send(group.id, { title: 'QA', body: 'QA', url: '/', tag: 'QA' }, group.id),
          service.send(group.id, { title: 'QA', body: 'QA', url: '/', tag: 'QA' }, group.id),
        ]);
        assert.equal(
          await service.send(group.id, { title: 'QA', body: 'QA', url: '/', tag: 'QA' }, group.id),
          true,
        );
        assert.equal(calls.get('https://fcm.googleapis.com/' + group.id + '/first'), 1);
        assert.equal(calls.get('https://fcm.googleapis.com/' + group.id + '/second'), 2);
        const other = groups.find((g) => g.id !== group.id)!;
        assert.equal(
          (await db.select().from(s.pushDeliveries).where(eq(s.pushDeliveries.outboxId, other.id)))
            .length,
          0,
        );
        await assert.rejects(
          db
            .insert(s.pushDeliveries)
            .values({
              id: 'cross-' + group.id,
              outboxId: other.id,
              subscriptionId: 'bad',
              claimedAt: new Date().toISOString(),
            }),
        );
      });
  } finally {
    await client.close();
  }
});
