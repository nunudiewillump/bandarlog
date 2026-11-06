import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferences, reminderEvents } from '../server/preferences';
test('default reminders run at seven and three Madrid calendar days, due, and once per overdue week', () => {
  const p = preferences('{}'),
    due = '2027-03-28T12:00:00+02:00';
  assert.deepEqual(p.reminderDays, [7, 3]);
  assert.equal(p.creation, true);
  assert.equal(p.forestEffects, true);
  assert.equal(p.overdueDaily, false);
  assert.equal(
    reminderEvents(due, 'pending', p, new Date('2027-03-21T12:00:00+01:00'))[0].key,
    'before-7',
  );
  assert.equal(
    reminderEvents(due, 'pending', p, new Date('2027-03-25T12:00:00+01:00'))[0].key,
    'before-3',
  );
  assert.equal(reminderEvents(due, 'pending', p, new Date('2027-03-27T12:00:00+01:00')).length, 0);
  assert.equal(reminderEvents(due, 'pending', p, new Date(due))[0].key, 'due');
  assert.equal(
    reminderEvents(due, 'pending', p, new Date('2027-04-05T12:00:00+02:00'))[0].key,
    'overdue-week-1',
  );
  assert.equal(
    reminderEvents(due, 'pending', p, new Date('2027-04-10T12:00:00+02:00'))[0].key,
    'overdue-week-1',
  );
  assert.equal(
    reminderEvents(due, 'pending', p, new Date('2027-04-11T12:00:00+02:00'))[0].key,
    'overdue-week-2',
  );
});

test('daily overdue notices use Madrid calendar days across DST and stop when complete or disabled', () => {
  const due = '2027-03-27T23:59:59+01:00';
  const p = preferences({ overdueDaily: true, overdueWeekly: false, onDue: false });
  const morning = reminderEvents(due, 'pending', p, new Date('2027-03-28T00:10:00+01:00'));
  const evening = reminderEvents(due, 'blocked', p, new Date('2027-03-28T23:50:00+02:00'));
  const nextDay = reminderEvents(due, 'in_progress', p, new Date('2027-03-28T22:30:00Z'));
  assert.equal(morning.length, 1);
  assert.match(morning[0].key, /^overdue-day-/);
  assert.equal(morning[0].key, evening[0].key);
  assert.notEqual(morning[0].key, nextDay[0].key);
  assert.deepEqual(reminderEvents(due, 'pending', p, new Date(due)), []);
  assert.deepEqual(reminderEvents(due, 'done', p, new Date('2027-04-01T12:00:00+02:00')), []);
  assert.deepEqual(
    reminderEvents(
      due,
      'pending',
      preferences({ ...p, notifications: false }),
      new Date('2027-04-01T12:00:00+02:00'),
    ),
    [],
  );
  assert.deepEqual(reminderEvents(due, 'pending', p, new Date('2027-03-27T12:00:00+01:00')), []);
});

test('daily and weekly overdue notices stay independent and old preferences preserve their defaults', () => {
  const due = '2027-03-28T23:59:59+02:00',
    at = new Date('2027-04-06T12:00:00+02:00');
  const legacy = preferences('{"overdueWeekly":true,"creation":false}');
  assert.equal(legacy.overdueDaily, false);
  assert.equal(legacy.creation, false);
  const both = reminderEvents(
    due,
    'pending',
    preferences({ overdueDaily: true, overdueWeekly: true }),
    at,
  );
  assert.equal(both.length, 2);
  assert.ok(both.some((event) => event.key.startsWith('overdue-week-')));
  assert.ok(both.some((event) => event.key.startsWith('overdue-day-')));
  assert.equal(
    reminderEvents(due, 'pending', preferences({ overdueDaily: true, overdueWeekly: false }), at)
      .length,
    1,
  );
  assert.equal(reminderEvents(due, 'pending', legacy, at).length, 1);
});
test('custom reminder preferences and completion stop unwanted scheduled notices', () => {
  const due = '2027-06-10T12:00:00+02:00',
    at = new Date('2027-06-08T12:00:00+02:00');
  assert.equal(
    reminderEvents(due, 'pending', preferences({ reminderDays: [2] }), at)[0].key,
    'before-2',
  );
  assert.deepEqual(reminderEvents(due, 'done', preferences({ reminderDays: [2] }), at), []);
  assert.deepEqual(
    reminderEvents(due, 'pending', preferences({ notifications: false, reminderDays: [2] }), at),
    [],
  );
  assert.deepEqual(
    reminderEvents(
      due,
      'pending',
      preferences({ onDue: false, overdueWeekly: false }),
      new Date('2027-07-01T12:00:00+02:00'),
    ),
    [],
  );
});
