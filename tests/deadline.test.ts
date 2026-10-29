import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineISO, deadlineDay } from '../src/deadline';
test('date-only deadlines end on the selected Madrid calendar day across DST changes', () => {
  for (const day of ['2026-03-29', '2026-10-25', '2027-06-14', '2026-12-31'])
    assert.equal(deadlineDay(deadlineISO(day)), day);
  assert.equal(deadlineISO('2026-12-31'), '2026-12-31T22:59:59.999Z');
  assert.equal(deadlineISO('2027-06-14'), '2027-06-14T21:59:59.999Z');
});
