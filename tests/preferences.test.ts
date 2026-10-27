import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferences, reminderEvents } from '../server/preferences';
test('default reminders run at seven and three Madrid calendar days, due, and once per overdue week', () => {
  const p = preferences('{}'),
    due = '2027-03-28T12:00:00+02:00';
  assert.deepEqual(p.reminderDays, [7, 3]);
  assert.equal(p.creation, true);
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
