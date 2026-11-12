import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdleJobs, nextMadridMidnight } from '../server/idle-jobs';
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
test('an empty queue performs no periodic work, while a persisted deadline wakes exactly once', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let calls = 0;
  const jobs = new IdleJobs<void>(async () => {
    calls++;
    return calls === 1 ? Date.now() + 60000 : null;
  });
  await jobs.wake('group', undefined);
  t.mock.timers.tick(59999);
  await settle();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls, 2);
  t.mock.timers.tick(24 * 3600000);
  await settle();
  assert.equal(calls, 2);
  jobs.stop();
});
test('new work during delivery is drained without overlapping workers or losing the last wakeup', async () => {
  let release!: () => void,
    calls = 0,
    active = 0,
    max = 0;
  const jobs = new IdleJobs<string>(async () => {
    calls++;
    active++;
    max = Math.max(max, active);
    if (calls === 1) await new Promise<void>((r) => (release = r));
    active--;
    return null;
  });
  const first = jobs.wake('a', 'a');
  await settle();
  const second = jobs.wake('a', 'a');
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(max, 1);
  await jobs.wake('b', 'b');
  assert.equal(calls, 3);
  jobs.stop();
});
test('failed work backs off and shutdown cancels scheduled retries', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let calls = 0,
    errors = 0;
  const jobs = new IdleJobs<void>(
    async () => {
      calls++;
      throw Error('offline');
    },
    () => errors++,
  );
  await assert.rejects(jobs.wake('a', undefined));
  t.mock.timers.tick(59999);
  await settle();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls, 2);
  assert.equal(errors, 1);
  t.mock.timers.tick(119999);
  await settle();
  assert.equal(calls, 2);
  jobs.stop();
  t.mock.timers.tick(10 * 3600000);
  await settle();
  assert.equal(calls, 2);
});
test('a nearer reminder replaces a daily timer but later edits never postpone it', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let calls = 0;
  const jobs = new IdleJobs<void>(async () => {
    calls++;
    return null;
  });
  jobs.schedule('daily', undefined, Date.now() + 86400000);
  jobs.schedule('daily', undefined, Date.now() + 15 * 60000);
  jobs.schedule('daily', undefined, Date.now() + 3600000);
  t.mock.timers.tick(15 * 60000);
  await settle();
  assert.equal(calls, 1);
  jobs.stop();
});
test('Madrid calendar wakeups preserve midnight through winter and DST transitions', () => {
  for (const [start, end] of [
    ['2026-11-12T12:00:00Z', '2026-11-12T23:00:00Z'],
    ['2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
    ['2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
  ])
    assert.equal(
      new Date(nextMadridMidnight(Date.parse(start))).toISOString(),
      new Date(end).toISOString(),
    );
});
