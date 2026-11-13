import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CONSUMPTION_METRICS = '1';
const { measuredClient, measureJob, flushMetrics } = await import('../server/metrics');
test('driver metrics count context, payload estimates and queries without leaking content', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  try {
    const client = measuredClient({
      query: async (_text: string) => ({ rows: [['secret@example.invalid', 4]] }),
    });
    await measureJob('fixture', async () => {
      await client.query('begin');
      await client.query("select set_config('bandarlog.group_id', 'secret', true)");
      await client.query('select email from users');
      await client.query('update users set name=$1');
      await client.query('commit');
    });
    flushMetrics();
    const op = JSON.parse(logs[0]).operations[0];
    assert.equal(op.driverStatements, 5);
    assert.equal(op.contextStatements, 3);
    assert.equal(op.reads, 1);
    assert.equal(op.writes, 1);
    assert.ok(op.dbValueBytesEstimate > 0);
    assert.ok(op.dbMs >= 0);
    assert.ok(!logs[0].includes('secret'));
    assert.ok(!logs[0].includes('select'));
    for (let i = 0; i < 300; i++) await measureJob('histogram', async () => {});
    flushMetrics();
    assert.equal(JSON.parse(logs[1]).operations[0].latencyObservationCount, 300);
  } finally {
    console.log = original;
  }
});
test('callback and rejected driver queries preserve behavior and nested durations are separate', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  try {
    const c = measuredClient({
      query(_sql: string, callback: any) {
        callback(null, { rows: [] });
      },
    });
    await measureJob('parent', async () => {
      await measureJob(
        'child',
        () => new Promise<void>((resolve) => c.query('select 1', () => resolve())),
      );
      await assert.rejects(
        measuredClient({
          query: async () => {
            throw Error('broken');
          },
        }).query(),
      );
    });
    flushMetrics();
    const ops = JSON.parse(logs[0]).operations;
    assert.equal(ops.find((o: any) => o.operation === 'job:child').driverStatements, 1);
    const parent = ops.find((o: any) => o.operation === 'job:parent');
    assert.equal(parent.driverStatements, 1);
    assert.ok(parent.exclusiveMs <= parent.ms);
  } finally {
    console.log = original;
  }
});

test('instrumented pool preserves callback results and discards a failed connection', async () => {
  const failure = new Error('test query failed');
  const released: unknown[] = [];
  let fail = true;
  const pool = measuredClient({
    totalCount: 1,
    connect: async () => ({
      query: async () => {
        if (fail) throw failure;
        return { rows: [] };
      },
      release: (error?: unknown) => released.push(error),
    }),
    query: (..._args: any[]): any => {
      throw Error('must acquire through the observer');
    },
  });
  await assert.rejects(pool.query('select 1'), failure);
  assert.equal(released[0], failure);
  fail = false;
  await new Promise<void>((resolve, reject) =>
    pool.query('select 1', (error: unknown, result: any) => {
      if (error) return reject(error);
      assert.deepEqual(result, { rows: [] });
      resolve();
    }),
  );
  assert.equal(released.length, 2);
  assert.equal(released[1], undefined);
});
