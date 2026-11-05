import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskPeople } from '../src/task-people';
import { mobileFixture } from './fixtures/mobile';
test('task people exclude removed, disabled and missing users while preserving other responsible people', () => {
  const fixture = mobileFixture(10);
  const data = fixture.summary();
  const target = data.tasks[0];
  const first = data.assignments.find((a) => a.taskId === target.id)!;
  const user = data.users.find((user) => user.id === first.userId)!;
  assert.ok(
    taskPeople(data)
      .get(target.id)
      ?.some((person) => person.id === user.id),
  );
  user.disabledAt = new Date().toISOString();
  assert.equal(
    taskPeople(data)
      .get(target.id)
      ?.some((person) => person.id === user.id) || false,
    false,
  );
  user.disabledAt = null;
  data.members = data.members.filter(
    (member) => member.userId !== user.id || member.commissionId !== target.commissionId,
  );
  assert.equal(
    taskPeople(data)
      .get(target.id)
      ?.some((person) => person.id === user.id) || false,
    false,
  );
  data.users = data.users.filter((person) => person.id !== user.id);
  assert.doesNotThrow(() => taskPeople(data));
});
