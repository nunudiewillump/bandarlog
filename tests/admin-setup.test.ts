import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFoundingAdministrator, hasFinishedAdminGuide, canPreviewAdminGuide, setupMilestones } from '../src/admin-setup';
import { previewDataFor } from '../src/admin-guide-preview-data';

test('guide belongs only to the founding administrator', () => {
  const founder = { id: 'a', role: 'admin', name: 'Fundador', email: 'a@example.test',
    preferences: '{"foundingAdmin":true,"adminGuideCompleted":false}' };
  assert.equal(isFoundingAdministrator(founder), true);
  assert.equal(hasFinishedAdminGuide(founder), false);
  assert.equal(hasFinishedAdminGuide({ ...founder, preferences: '{"foundingAdmin":true,"adminGuideCompleted":true}' }), true);
  assert.equal(isFoundingAdministrator({ ...founder, role: 'member' }), false);
  assert.equal(isFoundingAdministrator({ ...founder, preferences: '{"adminGuideCompleted":false}' }), false);
  assert.equal(isFoundingAdministrator({ ...founder, preferences: '{bad' }), false);
});
test('milestones reflect real progress', () => {
  const empty = { projects: [], commissions: [], users: [{ id: 'a' }], invitations: [], tasks: [] } as any;
  assert.deepEqual(setupMilestones(empty), { project: false, commission: false, invitation: false, task: false });
  const active = { projects: [{ archived: 'false' }], commissions: [{ id: 'c' }], users: [{ id: 'a' }],
    invitations: [{ status: 'pending' }], tasks: [{ id: 't' }] } as any;
  assert.deepEqual(setupMilestones(active), { project: true, commission: true, invitation: true, task: true });
});

test('operator-provisioned preview does not alter roles or real group data', () => {
  const user: any = { id: 'coord', role: 'coordination', name: 'Demo', email: 'demo@example.test',
    preferences: '{"adminGuidePreview":true}' };
  assert.equal(canPreviewAdminGuide(user), true);
  assert.equal(isFoundingAdministrator(user), false);
  assert.equal(canPreviewAdminGuide({ ...user, role: 'member' }), false);
  assert.equal(canPreviewAdminGuide({ ...user, preferences: '{}' }), false);
  const data: any = {
    group: { id: 'rosales-702', privateId: 'group-url', name: 'Real', colorPrimary: '#123456',
      colorSecondary: '#789abc', plan: 'free' },
    users: [user, { id: 'other' }], projects: [{ id: 'actual-project' }],
    commissions: [{ id: 'actual-commission' }], invitations: [], tasks: [{ id: 'actual-task' }],
  };
  for (const n of [0, 1, 2, 3, 4]) {
    const demo = previewDataFor(data, user, n);
    assert.equal(demo.projects.length, Number(n >= 1));
    assert.equal(demo.commissions.length, Number(n >= 2));
    assert.equal(demo.invitations.length, Number(n >= 3));
    assert.equal(demo.tasks.length, Number(n >= 4));
    assert.equal(demo.users.length, 1);
    assert.equal(demo.group.name, 'Grupo scout de ejemplo');
    assert.equal(data.group.name, 'Real');
    assert.equal(data.projects[0].id, 'actual-project');
  }
});
