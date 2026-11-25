import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { evaluationAnswers } from '../shared/evaluation-answers.js';
import { evaluationStructure, questionTypes } from '../shared/evaluations.js';

const questions = questionTypes.map((type) => ({
  id: randomUUID(),
  label: 'Pregunta',
  description: '',
  required: type !== 'tags',
  type,
  ...(['singleChoice', 'multipleChoice', 'likert'].includes(type) && { options: ['Uno', 'Dos'] }),
  ...(type === 'numberScale' && { min: -2, max: 2 }),
}));
const structure = evaluationStructure.parse({
  title: 'Plantilla de prueba',
  description: '',
  sections: [{ id: randomUUID(), title: 'Sección', description: '', questions }],
});
const valid = [
  ' Texto ',
  'Texto largo',
  'Dos',
  ['Uno', 'Dos'],
  false,
  -2,
  'Uno',
  ['Equipo'],
  '2028-02-29',
  0,
];
const invalid = [
  ' ',
  'x'.repeat(4001),
  'Tres',
  ['Uno', 'Uno'],
  0,
  -3,
  'Tres',
  ['x', ' x '],
  '2027-02-29',
  11,
];

test('accepts every answer type, preserves zero and false, and trims text', () => {
  const source = Object.fromEntries(questions.map(({ id }, i) => [id, valid[i]]));
  const parsed = evaluationAnswers(structure, 'submission').parse(source);
  assert.equal(parsed[questions[0].id], 'Texto');
  assert.equal(parsed[questions[4].id], false);
  assert.equal(parsed[questions[9].id], 0);
});

test('allows incomplete drafts and rejects unknown, invalid or missing required answers', () => {
  const draft = evaluationAnswers(structure, 'draft');
  const submission = evaluationAnswers(structure, 'submission');
  assert.deepEqual(draft.parse({}), {});
  assert.equal(submission.safeParse({}).success, false);
  assert.equal(draft.safeParse({ [randomUUID()]: 'Ajena' }).success, false);
  for (const [i, { id }] of questions.entries())
    assert.equal(draft.safeParse({ [id]: invalid[i] }).success, false, questions[i].type);
  const withoutTag = Object.fromEntries(
    questions.flatMap(({ id, required }, i) => (required ? [[id, valid[i]]] : [])),
  );
  assert.ok(submission.safeParse(withoutTag).success);
});
