import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNavigation, navigationURL } from '../src/navigation';
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
