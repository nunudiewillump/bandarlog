import { getTableColumns, inArray, sql } from 'drizzle-orm';
import * as s from './schema.js';
import type { Database } from './db.js';

// Cache image content only. Permissions and account fields are queried afresh.
// Include group in every key; use a snapshot so concurrent eviction cannot lose a photo.
const images = new Map<string, string>();
export async function publicUsers(db: Database, groupId: string, ids?: string[]) {
  const prefix = groupId + ':';
  const snapshot = new Map(
    [...images]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
  const digest = sql<string>`md5(${s.users.avatarUrl})`;
  const { preferences: _preferences, avatarUrl: _avatar, ...columns } = getTableColumns(s.users);
  const rows = await db
    .select({
      ...columns,
      avatarHash: digest,
      avatarUrl: sql<
        string | null
      >`case when ${snapshot.size ? inArray(digest, [...snapshot.keys()]) : sql`false`} then null else ${s.users.avatarUrl} end`,
    })
    .from(s.users)
    .where(ids ? inArray(s.users.id, ids) : undefined);
  return rows.map(({ avatarHash, avatarUrl, ...user }) => {
    const photo = avatarHash ? (avatarUrl ?? snapshot.get(avatarHash) ?? null) : null;
    if (avatarHash && photo) {
      const key = prefix + avatarHash;
      images.delete(key);
      images.set(key, photo);
      while (images.size > 256) images.delete(images.keys().next().value!);
    }
    return { ...user, avatarUrl: photo };
  });
}
