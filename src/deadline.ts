// Task deadlines are calendar days in the group's timezone, not the device timezone.
export function deadlineISO(day: string) {
  const noon = new Date(day + 'T12:00:00Z');
  const madridHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(noon),
  );
  return new Date(
    Date.parse(day + 'T00:00:00Z') + 86400000 - (madridHour - 12) * 3600000 - 1,
  ).toISOString();
}
export function deadlineDay(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
