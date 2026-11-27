import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adoptionInvitation, type AdoptionState } from '../shared/adoption';

const at = '2026-11-27T12:00:00Z';
const founder: AdoptionState = {
  founder: true, management: true, legacyGuideDone: false, events: { welcome_eligible: at },
};

test('founders keep their options and only see one invitation', () => {
  assert.equal(adoptionInvitation(founder, true), 'welcome');
  assert.equal(adoptionInvitation(founder, false), null);
  const explored = { ...founder, events: { ...founder.events, choice_explore: at } };
  assert.equal(adoptionInvitation(explored, false), 'prepare');
  assert.equal(adoptionInvitation({ ...explored, events: { ...explored.events, preparation_dismissed: at } }, false), null);
  assert.equal(adoptionInvitation({ ...explored, events: { ...explored.events, guide_started: at } }, false), 'resume');
  assert.equal(adoptionInvitation({ ...explored, events: { ...explored.events, guide_started: at, guide_completed: at } }, false), null);
});

test('global management takes priority and prior outcomes survive promotion', () => {
  const member: AdoptionState = { ...founder, founder: false, management: false, events: { mission_eligible: at } };
  assert.equal(adoptionInvitation(member, true), 'mission');
  const manager: AdoptionState = { ...member, management: true, events: { ...member.events, guide_eligible: at } };
  assert.equal(adoptionInvitation(manager, true), 'guide');
  assert.equal(adoptionInvitation({ ...manager, events: { ...manager.events, guide_skipped: at } }, true), null);
  assert.equal(adoptionInvitation({ ...manager, legacyGuideDone: true }, true), null);
  assert.equal(adoptionInvitation({ ...member, events: {} }, true), null);
  assert.equal(adoptionInvitation({ ...member, events: {} }, true, true), 'mission');
});
