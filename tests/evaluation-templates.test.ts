import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { evaluationStructure, questionTypes } from '../shared/evaluations';
import { exerciseEvaluationTemplateBoundary } from './fixtures/evaluation-templates';

const base = { label: 'Pregunta', description: '', required: false };
const makeStructure = (questions: unknown[]) => ({
  title: 'Evaluación',
  description: '',
  sections: [{ id: randomUUID(), title: 'Aprendizajes', description: '', questions }],
});

test('validates every question type and rejects incompatible or duplicate fields', () => {
  const questions = questionTypes.map((type) => ({
    ...base,
    id: randomUUID(),
    type,
    ...(['singleChoice', 'multipleChoice', 'likert'].includes(type) ? { options: ['A', 'B'] } : {}),
    ...(type === 'numberScale' ? { min: 1, max: 5 } : {}),
  }));
  assert.ok(evaluationStructure.safeParse(makeStructure(questions)).success);
  for (const questions of [
    [{ ...base, id: randomUUID(), type: 'nps', options: ['A', 'B'] }],
    [{ ...base, id: randomUUID(), type: 'singleChoice', options: ['A', ' A '] }],
    [{ ...base, id: randomUUID(), type: 'numberScale', min: 5, max: 1 }],
    [{ ...base, id: randomUUID(), type: 'date', label: 'x'.repeat(161) }],
  ])
    assert.equal(evaluationStructure.safeParse(makeStructure(questions)).success, false);
  assert.equal(
    evaluationStructure.safeParse(makeStructure([questions[0], questions[0]])).success,
    false,
  );
});

test('SQL requires a group manager and prevents forged or mutable published versions', async () => {
  const client = new PGlite();
  try {
    await migrate(drizzle(client), { migrationsFolder: 'migrations' });
    await exerciseEvaluationTemplateBoundary(client);
  } finally {
    await client.close();
  }
});
