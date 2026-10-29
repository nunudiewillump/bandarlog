import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smartFocus } from '../src/focus';
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
