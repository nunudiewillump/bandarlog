import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFoundingAdministrator, hasFinishedAdminGuide, setupMilestones } from '../src/admin-setup';

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
