import { z } from 'zod';
export type ChecklistItem = { id: string; title: string; done: boolean };
const stepTitle = z.string().trim().min(1).max(240);
export const checklistChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), id: z.uuid(), title: stepTitle }).strict(),
  z.object({ action: z.literal('edit'), id: z.uuid(), title: stepTitle }).strict(),
  z.object({ action: z.literal('toggle'), id: z.uuid(), done: z.boolean() }).strict(),
  z.object({ action: z.literal('remove'), id: z.uuid() }).strict(),
]);
export type ChecklistChange = z.infer<typeof checklistChangeSchema>;
export class ChecklistError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function changeChecklist(items: ChecklistItem[], change: ChecklistChange): ChecklistItem[] {
  const index = items.findIndex((item) => item.id === change.id);
  if (change.action === 'add') {
    if (index >= 0) throw new ChecklistError(409, 'Este paso ya existe.');
    if (items.length >= 100) throw new ChecklistError(400, 'Una tarea admite hasta 100 pasos.');
    return [...items, { id: change.id, title: change.title, done: false }];
  }
  if (index < 0) throw new ChecklistError(404, 'El paso ya no está disponible.');
  if (change.action === 'remove') return items.filter((item) => item.id !== change.id);
  return items.map((item) =>
    item.id !== change.id
      ? item
      : change.action === 'edit'
        ? { ...item, title: change.title }
        : { ...item, done: change.done },
  );
}
