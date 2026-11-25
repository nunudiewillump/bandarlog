import { z } from 'zod';
import type { EvaluationStructure } from './evaluations.js';

type Question = EvaluationStructure['sections'][number]['questions'][number];

const shortText = z.string().trim().min(1).max(280);
const longText = z.string().trim().min(1).max(4000);
const unique = (items: string[]) => new Set(items).size === items.length;

function answerFor(question: Question) {
  switch (question.type) {
    case 'shortText':
      return shortText;
    case 'longText':
      return longText;
    case 'singleChoice':
    case 'likert':
      return z.enum(question.options);
    case 'multipleChoice':
      return z.array(z.enum(question.options)).min(1).max(question.options.length).refine(unique);
    case 'yesNo':
      return z.boolean();
    case 'numberScale':
      return z.int().min(question.min).max(question.max);
    case 'nps':
      return z.int().min(0).max(10);
    case 'tags':
      return z.array(z.string().trim().min(1).max(50)).min(1).max(20).refine(unique);
    case 'date':
      return z.iso.date();
  }
}

export function evaluationAnswers(structure: EvaluationStructure, mode: 'draft' | 'submission') {
  const fields = Object.fromEntries(
    structure.sections.flatMap((section) =>
      section.questions.map((question) => {
        const field = answerFor(question);
        return [question.id, mode === 'submission' && question.required ? field : field.optional()];
      }),
    ),
  );
  return z
    .strictObject(fields)
    .refine(
      (answers) => new TextEncoder().encode(JSON.stringify(answers)).length <= 96_000,
      'Las respuestas superan el tamaño permitido.',
    );
}
