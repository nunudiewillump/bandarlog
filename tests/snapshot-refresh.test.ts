import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotRefresh, covers } from '../src/snapshot-refresh';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const turn = () => new Promise((r) => setImmediate(r));
test('ready and same mutation events reuse the snapshot, a new revision refreshes', async () => {
  let calls = 0;
  const loader = new SnapshotRefresh(
    async () => ({ revision: `epoch:${++calls}` }),
    (x) => x.revision,
  );
  await loader.read();
  await loader.read('epoch:1');
  await loader.read('epoch:0');
  assert.equal(calls, 1);
  await loader.read('epoch:2');
  assert.equal(calls, 2);
});
test('change between snapshot and subscription is reconciled; restarts do not loop', async () => {
  let revision = 'old:1',
    calls = 0;
  const loader = new SnapshotRefresh(
    async () => {
      calls++;
      return { revision };
    },
    (x) => x.revision,
  );
  await loader.read();
  revision = 'old:2';
  await loader.read('old:2');
  revision = 'new:0';
  await loader.read('old:3');
  assert.equal(calls, 3);
});
test('events during a read cause one follow-up unless the result already covers the burst', async () => {
  for (const covered of [false, true]) {
    const gate = deferred<{ revision: string }>();
    let calls = 0;
    const loader = new SnapshotRefresh(
      async () => (++calls === 1 ? gate.promise : { revision: 'a:3' }),
      (x) => x.revision,
    );
    const first = loader.read();
    await turn();
    const second = loader.read('a:2');
    loader.read('a:3');
    gate.resolve({ revision: covered ? 'a:3' : 'a:1' });
    assert.equal((await first).revision, 'a:3');
    await second;
    assert.equal(calls, covered ? 1 : 2);
  }
});
test('unknown/offline signals during a request are not lost; failed reads can retry', async () => {
  const gate = deferred<{ revision: string }>();
  let calls = 0;
  const loader = new SnapshotRefresh(
    async () => (++calls === 1 ? gate.promise : { revision: 'b:1' }),
    (x) => x.revision,
  );
  const p = loader.read();
  await turn();
  loader.read();
  gate.resolve({ revision: 'b:1' });
  await p;
  assert.equal(calls, 2);
  let fail = true;
  const retry = new SnapshotRefresh(
    async () => {
      if (fail) throw Error('offline');
      return 1;
    },
    () => undefined,
  );
  await assert.rejects(retry.read());
  fail = false;
  assert.equal(await retry.read(), 1);
  assert.equal(covers('a:2', 'b:1'), false);
});
