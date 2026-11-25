import { z } from 'zod';

export const questionTypes = [
  'shortText',
  'longText',
  'singleChoice',
  'multipleChoice',
  'yesNo',
  'numberScale',
  'likert',
  'tags',
  'date',
  'nps',
] as const;

const label = z.string().trim().min(1).max(160);
const description = z.string().trim().max(1000);
const key = z.uuid();
const base = {
  id: key,
  label,
  description,
  required: z.boolean(),
};
const choices = z
  .array(label)
  .min(2)
  .max(20)
  .refine((values) => new Set(values).size === values.length, 'Cada opción debe ser distinta.');
const question = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.enum(['shortText', 'longText', 'yesNo', 'tags', 'date', 'nps']),
  }),
  z.strictObject({
    ...base,
    type: z.enum(['singleChoice', 'multipleChoice', 'likert']),
    options: choices,
  }),
  z
    .strictObject({
      ...base,
      type: z.literal('numberScale'),
      min: z.int().min(-100).max(100),
      max: z.int().min(-100).max(100),
    })
    .refine((value) => value.min < value.max, 'El máximo debe ser mayor que el mínimo.'),
]);

export const evaluationStructure = z
  .strictObject({
    title: label,
    description,
    sections: z
      .array(
        z.strictObject({
          id: key,
          title: label,
          description,
          questions: z.array(question).min(1).max(40),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((value, ctx) => {
    const questions = value.sections.flatMap((section) => section.questions);
    const ids = [...value.sections, ...questions].map((item) => item.id);
    if (
      new Set(ids).size !== ids.length ||
      questions.length > 80 ||
      new TextEncoder().encode(JSON.stringify(value)).length > 96_000
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Revisa los identificadores y el tamaño de la plantilla.',
      });
    }
  });

export type EvaluationStructure = z.infer<typeof evaluationStructure>;
