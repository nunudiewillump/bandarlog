import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRequest } from '../server/pagination';
test('keyset cursors preserve microseconds, reject changed scopes and enforce limits', () => {
  const rows = ['c', 'b', 'a'].map((id) => ({ id, createdAt: '2026-11-12 12:00:00.123456+00' }));
  const first = pageRequest({ limit: '2' }, ['group-a', 'user-a', 'activity']).finish(rows);
  assert.deepEqual(
    first.items.map((x) => x.id),
    ['c', 'b'],
  );
  const decoded = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
  assert.equal(decoded.at, '2026-11-12T12:00:00.123456+00:00');
  assert.doesNotThrow(() =>
    pageRequest({ cursor: first.nextCursor }, ['group-a', 'user-a', 'activity']),
  );
  for (const scope of [
    ['group-b', 'user-a', 'activity'],
    ['group-a', 'user-b', 'activity'],
    ['group-a', 'user-a', 'notifications'],
  ])
    assert.throws(() => pageRequest({ cursor: first.nextCursor }, scope));
  for (const limit of ['0', '101', 'NaN', ['5', '10']])
    assert.throws(() => pageRequest({ limit }, []));
  assert.throws(() => pageRequest({ cursor: 'not-a-cursor' }, []));
  assert.equal(pageRequest({ limit: '3' }, []).finish(rows).nextCursor, null);
});
