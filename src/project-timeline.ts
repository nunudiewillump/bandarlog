const day = 86_400_000;
const zone = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function calendarDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : zone.format(date);
  return Date.parse(iso) / day;
}

export function timelineTicks(start: number, end: number, width: number) {
  const daysPerLabel = (end - start) / Math.max(1, Math.floor(width / 105));
  const ticks: number[] = [];
  if (daysPerLabel <= 7) {
    const step = daysPerLabel <= 1 ? 1 : 7;
    const first = step === 1 ? start : start + ((7 - ((((start + 3) % 7) + 7) % 7)) % 7);
    for (let n = first; n <= end; n += step) ticks.push(n);
    return { ticks, month: false };
  }
  const cursor = new Date(start * day);
  const monthStep = Math.max(1, Math.ceil(daysPerLabel / 30));
  cursor.setUTCDate(1);
  if (+cursor / day < start) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  for (; +cursor / day <= end; cursor.setUTCMonth(cursor.getUTCMonth() + monthStep))
    ticks.push(+cursor / day);
  return { ticks, month: true };
}

const dateLabel = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', dateStyle: 'medium' });
const monthLabel = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});
const tickLabel = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});
export const formatDay = (value: number | null) =>
  value === null ? 'Sin fecha registrada' : dateLabel.format(value * day);
export const formatTick = (value: number, month: boolean) =>
  (month ? monthLabel : tickLabel).format(value * day);
