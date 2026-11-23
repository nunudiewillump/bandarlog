import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, formatDay, timelineTicks } from '../src/project-timeline';

test('calendar days preserve stored dates and use Madrid for timestamps across midnight', () => {
  assert.equal(calendarDay('2026-10-24T22:05:00Z'), calendarDay('2026-10-25'));
  assert.equal(calendarDay('2026-10-25T22:05:00Z'), calendarDay('2026-10-25'));
  assert.equal(calendarDay(null), null);
  assert.equal(calendarDay('invalid'), null);
  assert.equal(formatDay(null), 'Sin fecha registrada');
});

test('timeline adapts to days, ISO weeks and calendar months', () => {
  const jan1 = calendarDay('2027-01-01')!;
  assert.deepEqual(timelineTicks(jan1, jan1 + 3, 600).ticks, [jan1, jan1 + 1, jan1 + 2, jan1 + 3]);
  assert.equal(timelineTicks(jan1, jan1 + 42, 735).ticks[0], calendarDay('2027-01-04'));
  const scale = timelineTicks(jan1, jan1 + 365, 800);
  assert.equal(scale.month, true);
  assert.ok(scale.ticks.every((tick) => new Date(tick * 86_400_000).getUTCDate() === 1));
});
