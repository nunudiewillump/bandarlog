import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { groupContext, scopedPglite } from '../server/group-context';
import { publicUsers } from '../server/public-users';
import * as s from '../server/schema';
test('image content reuse preserves fresh permissions, photo changes and group isolation', async () => {
  const client = new PGlite(),
    owner = drizzle(client, { schema: s });
  const db = drizzle(scopedPglite(client) as PGlite, { schema: s });
  try {
    await migrate(owner, { migrationsFolder: 'migrations' });
    const groups = await owner
      .insert(s.groups)
      .values([{ name: 'Photo A' }, { name: 'Photo B' }])
      .returning();
    for (const g of groups)
      await groupContext.run(g, async () => {
        await db
          .insert(s.users)
          .values({
            id: g.id,
            name: 'Before',
            email: 'same@example.invalid',
            role: 'admin',
            avatarUrl: 'data:image/webp;base64,AAAA',
          });
        const first = await publicUsers(db as any, g.id, [g.id]);
        assert.equal(first[0].avatarUrl, 'data:image/webp;base64,AAAA');
        assert.deepEqual(await publicUsers(db as any, g.id, [g.id]), first);
        assert.ok(!('preferences' in first[0]));
        await db
          .update(s.users)
          .set({ name: 'After', role: 'member', avatarUrl: 'data:image/webp;base64,BBBB' })
          .where(eq(s.users.id, g.id));
        const changed = await publicUsers(db as any, g.id, [g.id]);
        assert.equal(changed[0].name, 'After');
        assert.equal(changed[0].role, 'member');
        assert.equal(changed[0].avatarUrl, 'data:image/webp;base64,BBBB');
        const other = groups.find((x) => x.id !== g.id)!;
        assert.deepEqual(await publicUsers(db as any, g.id, [other.id]), []);
        await db.update(s.users).set({ avatarUrl: null }).where(eq(s.users.id, g.id));
        assert.equal((await publicUsers(db as any, g.id, [g.id]))[0].avatarUrl, null);
      });
  } finally {
    await client.close();
  }
});
