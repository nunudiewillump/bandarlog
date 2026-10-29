import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadRows } from '../src/workload';
import { mobileFixture } from './fixtures/mobile';
test('workload computes assignment-to-completion median, load and on-time delivery without inventing legacy timestamps', () => {
  const fixture = mobileFixture(5),
    data = fixture.summary();
  const user = data.users[0];
  const base = data.tasks[0];
  data.tasks = [
    {
      ...base,
      id: 'a',
      due: '2026-10-10T23:59:59Z',
      status: 'done',
      completedAt: '2026-10-09T00:00:00Z',
    },
    {
      ...base,
      id: 'b',
      due: '2026-10-07T23:59:59Z',
      status: 'done',
      completedAt: '2026-10-08T00:00:00Z',
    },
    {
      ...base,
      id: 'legacy',
      status: 'done',
      completedAt: '2026-10-01T00:00:00Z',
      due: '2026-10-02T23:59:59Z',
    },
    { ...base, id: 'pending', status: 'blocked', completedAt: null, due: '2026-10-10T00:00:00Z' },
  ];
  data.assignments = data.tasks.map((t, i) => ({
    id: t.id,
    taskId: t.id,
    userId: user.id,
    assignedAt: i < 2 ? '2026-10-05T00:00:00Z' : null,
  }));
  const [row] = workloadRows(data, [user], data.tasks, +new Date('2026-10-11T00:00:00Z'));
  assert.equal(row.open, 1);
  assert.equal(row.overdue, 1);
  assert.equal(row.blocked, 1);
  assert.equal(row.done, 3);
  assert.equal(row.onTime, 2);
  assert.equal(row.timed, 2);
  assert.equal(row.medianDays, 3.5);
});
