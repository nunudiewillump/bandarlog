import { renderMail } from './mail-template.js';

type Task = {
  id: string;
  title: string;
  commissionId: string;
  due: string;
  status: string;
  blockedReason?: string | null;
};
export const mailDate = (value: string | Date) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

/** Uses the scheduler's already scoped snapshot; it performs no additional database reads. */
export function weeklyMail({
  project,
  groupName,
  tasks,
  commissions,
  appUrl,
  projectUrl,
  taskUrl,
  at = new Date(),
}: {
  project: string;
  groupName: string;
  tasks: Task[];
  commissions: { id: string; name: string }[];
  appUrl: string;
  projectUrl: string;
  taskUrl: (id: string) => string;
  at?: Date;
}) {
  const open = tasks.filter((t) => t.status !== 'done');
  const completed = tasks.length - open.length;
  const overdue = (t: Task) => +new Date(t.due) < +at;
  // Seven local calendar days, including weeks that cross a daylight-saving change.
  const localDay = (value: string | Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  const day = Date.parse(localDay(at));
  const upcoming = (t: Task) => !overdue(t) && Date.parse(localDay(t.due)) - day <= 7 * 86400000;
  const counts = [
    { label: 'Pendientes', value: String(open.filter((t) => t.status === 'pending').length) },
    { label: 'En curso', value: String(open.filter((t) => t.status === 'in_progress').length) },
    { label: 'Bloqueadas', value: String(open.filter((t) => t.status === 'blocked').length) },
    { label: 'Vencidas', value: String(open.filter(overdue).length) },
    { label: 'Vencen en los próximos 7 días', value: String(open.filter(upcoming).length) },
  ];
  const priority = (t: Task) => (t.status === 'blocked' ? 0 : overdue(t) ? 1 : 2);
  const attention = open
    .filter((t) => t.status === 'blocked' || overdue(t) || upcoming(t))
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        +new Date(a.due) - +new Date(b.due) ||
        a.id.localeCompare(b.id),
    );
  const items = attention.slice(0, 5).map((t) => ({
    title: t.title,
    url: taskUrl(t.id),
    context: `${commissions.find((c) => c.id === t.commissionId)?.name || 'Comisión'} · ${t.status === 'blocked' ? 'Bloqueada · ' : ''}${overdue(t) ? 'Vencida desde' : 'Vence el'} ${mailDate(t.due)}`,
    note: t.status === 'blocked' && t.blockedReason ? `Motivo del bloqueo: ${t.blockedReason}` : '',
  }));
  const intro = !tasks.length
    ? 'Este proyecto todavía no tiene tareas. Cuando las añadáis, aquí verás su avance.'
    : !open.length
      ? 'Todas las tareas del proyecto están terminadas. Gracias por sacar el trabajo adelante.'
      : 'Este es el estado del proyecto. Revisa primero los bloqueos, las tareas vencidas y los próximos plazos.';
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : null;
  const body = [
    `Resumen semanal · ${project}`,
    groupName,
    `Situación a ${mailDate(at)}`,
    intro,
    progress === null
      ? 'Sin tareas'
      : `Progreso total: ${progress}% · ${completed} de ${tasks.length} tareas terminadas`,
    ...counts.map((c) => `${c.label}: ${c.value}`),
    'Necesita atención',
    ...items.map((t) => `${t.title}\n${t.context}${t.note ? '\n' + t.note : ''}\n${t.url}`),
    ...(!items.length
      ? ['Sin bloqueos, tareas vencidas ni vencimientos en los próximos 7 días.']
      : []),
    ...(attention.length > items.length
      ? [`${attention.length - items.length} tareas más requieren atención.`]
      : []),
    'Las tareas vencidas y bloqueadas pueden coincidir. El progreso es acumulado, no solo de esta semana.',
    `Ver proyecto: ${projectUrl}`,
  ].join('\n');
  return {
    body,
    html: renderMail({
      title: project,
      eyebrow: `Resumen semanal · ${groupName}`,
      intro,
      body: `Situación a ${mailDate(at)}`,
      appUrl,
      summary: {
        progress,
        completed,
        total: tasks.length,
        counts,
        heading: 'Necesita atención',
        empty: 'Sin bloqueos, tareas vencidas ni vencimientos en los próximos 7 días.',
        items,
        remaining: Math.max(0, attention.length - items.length),
      },
      actions: [{ label: 'Ver proyecto', url: projectUrl }],
    }),
  };
}
