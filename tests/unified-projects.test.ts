import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectType, projectTypeName, projectView } from '../shared/project-types';
test('legacy categories and routes map to the same independent project experience', () => {
  assert.equal(projectType('ronda'), 'general');
  assert.equal(projectTypeName('ronda'), 'General');
  assert.equal(projectTypeName('camp'), 'Campamento');
  assert.equal(projectTypeName('event'), 'Evento');
  for (const old of ['camps', 'rounds', 'projects']) assert.equal(projectView(old), 'projects');
  assert.equal(projectView('project'), 'project');
  assert.equal(projectView('commission'), 'commission');
});
