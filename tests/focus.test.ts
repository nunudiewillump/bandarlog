import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smartFocus, teamPendingTone } from '../src/focus';
import { mobileFixture } from './fixtures/mobile';
for (const count of [1, 5, 10] as const)
  test(`Smart Focus stays bounded with ${count} commissions and 74 authorised tasks`, () => {
    const fixture = mobileFixture(count),
      { data, user, allTasks, summary } = fixture;
    assert.equal(allTasks.length, 74);
    assert.equal(data.commissions.length, count);
    let focus = smartFocus(data, user);
    assert.equal(focus.personalOpen.length, 7);
    assert.equal(focus.commissionOpen.length, 37);
    assert.equal(focus.level, 'personal');
    assert.equal(focus.featured.length, 3);
    assert.equal(focus.featured[0].id, 'v2-task-0');
    assert.ok(focus.personalOpen.some((t) => t.status === 'blocked'));
    for (const t of focus.personalOpen) t.status = 'done';
    focus = smartFocus(summary(), user);
    assert.equal(focus.level, 'commissions');
    assert.equal(focus.featured.length, 3);
    assert.equal(focus.commissionOpen.length, 30);
    for (const t of data.tasks) t.status = 'done';
    focus = smartFocus(summary(), user);
    assert.equal(focus.level, 'projects');
    assert.equal(focus.projects[0].open, 14);
    assert.equal(
      data.tasks.some((t) => t.commissionId === 'camp-other'),
      false,
    );
    for (const t of allTasks) t.status = 'done';
    focus = smartFocus(summary(), user);
    assert.equal(focus.level, 'clear');
  });

test('personal and team scopes never share task counts, including after the last personal completion', () => {
  const { data, user } = mobileFixture();
  const initial = smartFocus(data, user);
  assert.equal(
    initial.teamOpen.length,
    initial.commissionOpen.length - initial.personalOpen.length,
  );
  assert.ok(initial.teamTasks.every((t) => !initial.personal.some((p) => p.id === t.id)));
  for (const task of initial.personalOpen) task.status = 'done';
  const done = smartFocus(data, user);
  assert.equal(done.personalOpen.length, 0);
  assert.equal(done.teamOpen.length, initial.teamOpen.length);
  assert.equal(done.level, 'commissions');
});

test('team pending color has exact 30 and 60 percent boundaries and handles an empty team', () => {
  for (const [pending, total, tone] of [
    [0, 0, 'green'],
    [0, 10, 'green'],
    [3, 10, 'green'],
    [4, 10, 'yellow'],
    [6, 10, 'yellow'],
    [7, 10, 'red'],
    [10, 10, 'red'],
  ] as const)
    assert.equal(teamPendingTone(pending, total), tone);
});
