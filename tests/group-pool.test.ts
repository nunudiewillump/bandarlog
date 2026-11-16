import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupContext, scopedPool, configureGroupSigning } from '../server/group-context';
const group = {
  id: 'A',
  privateId: 'a'.repeat(32),
  name: 'A',
  colorPrimary: '#112233',
  colorSecondary: '#334455',
  plan: 'free',
};
configureGroupSigning('42'.repeat(32));
test('a failed rollback destroys the connection and preserves the original query error', async () => {
  const original = Error('query failed');
  let destroyed: unknown;
  const pool = scopedPool({
    connect: async () => ({
      query: async (q: string) => {
        if (q === 'select failing') throw original;
        if (q === 'rollback') throw Error('connection lost');
        return {};
      },
      release: (bad: unknown) => {
        destroyed = bad;
      },
    }),
  });
  await groupContext.run(group, async () => {
    await assert.rejects(pool.query('select failing'), (e) => e === original);
  });
  assert.equal(destroyed, true);
});
test('releasing an unfinished transaction discards the connection and rejects later queries', async () => {
  let destroyed: unknown;
  let releases = 0;
  const pool = scopedPool({
    connect: async () => ({
      query: async () => ({}),
      release: (bad: unknown) => {
        destroyed = bad;
        releases++;
      },
    }),
  });
  await groupContext.run(group, async () => {
    const client = await pool.connect();
    await client.query('begin');
    client.release();
    client.release();
    await assert.rejects(client.query('select 1'), /devuelta/);
  });
  assert.equal(destroyed, true);
  assert.equal(releases, 1);
});
