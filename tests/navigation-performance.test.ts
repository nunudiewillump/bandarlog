import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNavigation, navigationURL } from '../src/navigation';
import { summarizeProjects } from '../server/project-summaries';
import { groupContext, groupUrl, groupPath } from '../server/group-context';
test('routes keep the group and normalize legacy project views and detail context', () => {
  const base = 'https://example.test/g/' + 'a'.repeat(32) + '/';
  assert.equal(navigationURL(base + '?task=old', 'camps').pathname, new URL(base).pathname);
  assert.equal(readNavigation('?commission=c').view, 'commission');
  assert.equal(readNavigation('?project=p').view, 'project');
  assert.equal(readNavigation('?view=unknown').view, 'home');
  assert.equal(readNavigation('?view=camp&project=p').view, 'project');
  assert.equal(readNavigation('?view=rounds').view, 'projects');
  assert.equal(readNavigation('?view=camp&project=p&task=t').task, 't');
  assert.equal(navigationURL(base, 'tasks').search, '?view=tasks');
});
test('mail destinations are canonical even when the request uses legacy API transport', () => {
  const group = {
    id: 'rosales-702',
    privateId: 'a'.repeat(32),
    name: 'Test',
    colorPrimary: '#123456',
    colorSecondary: '#654321',
    plan: 'free',
    legacyAccess: true,
  };
  groupContext.run(group, () => {
    assert.equal(groupPath(), '');
    assert.equal(
      groupUrl('https://example.test'),
      'https://example.test/g/' + group.privateId + '/',
    );
  });
});
test('linear project aggregates preserve order, empty projects, deadlines and statuses', () => {
  const result = summarizeProjects(
    [
      { id: 'p', name: 'P', type: 'camp' },
      { id: 'empty', name: 'Empty', type: 'general' },
    ],
    [
      { id: 'c', name: 'C', projectId: 'p' },
      { id: 'd', name: 'D', projectId: 'p' },
    ],
    [
      { commissionId: 'c', status: 'done', due: '2026-01-01' },
      { commissionId: 'c', status: 'blocked', due: '2026-01-01' },
      { commissionId: 'd', status: 'pending', due: '2026-12-01' },
      { commissionId: 'hidden', status: 'pending', due: '2026-01-01' },
    ],
    Date.parse('2026-11-06'),
  );
  assert.deepEqual(
    result.map((p) => [p.id, p.total, p.open, p.done, p.blocked, p.overdue, p.nextDue]),
    [
      ['p', 3, 2, 1, 1, 1, '2026-12-01'],
      ['empty', 0, 0, 0, 0, 0, null],
    ],
  );
  assert.deepEqual(
    result[0].commissions.map((c) => c.id),
    ['c', 'd'],
  );
});
