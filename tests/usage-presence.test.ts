import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPresenceBudget, authenticationDenials } from '../server/usage-presence';
test('presence adds no warm-query work and is isolated by group, hashed session and Madrid date', () => {
  let now = Date.parse('2026-11-19T22:59:00Z');
  const budget = dailyPresenceBudget(() => now, 2);
  assert.equal(budget.claim('a', 'hash'), true);
  assert.equal(budget.claim('a', 'hash'), false);
  assert.equal(budget.claim('b', 'hash'), true);
  now = Date.parse('2026-11-19T23:01:00Z');
  assert.equal(budget.claim('a', 'hash'), true);
});
test('presence failures back off and the observation cache stays bounded', () => {
  let now = 0;
  const budget = dailyPresenceBudget(() => now, 1);
  assert.equal(budget.claim('a', 'one'), true);
  budget.retry('a', 'one');
  now = 59999;
  assert.equal(budget.claim('a', 'one'), false);
  now = 60001;
  assert.equal(budget.claim('a', 'one'), true);
  assert.equal(budget.claim('b', 'two'), true);
  assert.equal(budget.claim('a', 'one'), true);
});
test('credential rejection telemetry batches only fixed counters and drains at shutdown', async () => {
  const rows: any[] = [];
  const recorder = authenticationDenials(async (method, count) => {
    rows.push({ method, count });
  });
  recorder.record('email');
  recorder.record('email');
  recorder.record('google');
  assert.deepEqual(rows, []);
  await recorder.flush();
  assert.deepEqual(rows, [
    { method: 'email', count: 2 },
    { method: 'google', count: 1 },
  ]);
  await recorder.flush();
  assert.equal(rows.length, 2);
});
