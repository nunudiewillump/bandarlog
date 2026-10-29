import { z } from 'zod';
export const preferenceSchema = z.object({
  forestEffects: z.boolean().default(true),
  notifications: z.boolean().default(true),
  weekly: z.boolean().default(true),
  creation: z.boolean().default(true),
  updates: z.boolean().default(true),
  reminderDays: z.array(z.number().int().min(1).max(90)).max(10).default([7, 3]),
  onDue: z.boolean().default(true),
  overdueWeekly: z.boolean().default(true),
});
export function preferences(value: string | unknown) {
  let input = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value);
    } catch {
      input = {};
    }
  }
  const parsed = preferenceSchema.safeParse(input);
  return parsed.success ? parsed.data : preferenceSchema.parse({});
}
const dayNumber = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return Math.floor(Date.parse(parts + 'T00:00:00Z') / 86400000);
};
export function reminderEvents(
  due: string,
  status: string,
  p: ReturnType<typeof preferences>,
  at = new Date(),
) {
  if (!p.notifications || status === 'done') return [];
  const target = new Date(due),
    days = dayNumber(target) - dayNumber(at),
    result: { label: string; key: string }[] = [];
  if (target > at) {
    for (const before of new Set(p.reminderDays))
      if (days === before)
        result.push({ label: `Recordatorio · vence en ${before} días`, key: `before-${before}` });
  } else if (days > -7 && p.onDue) result.push({ label: 'Vencimiento', key: 'due' });
  if (days <= -7 && p.overdueWeekly)
    result.push({
      label: 'Recordatorio semanal · tarea vencida',
      key: `overdue-week-${Math.floor(-days / 7)}`,
    });
  return result;
}
