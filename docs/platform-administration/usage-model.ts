/** Synthetic review data. Never imported by the ordinary application. */
export type UsagePeriod = '7' | '30';
export type UsageWindow = {
  active: number;
  contributors: number;
  recurring: number;
  previous: number;
  returning: number;
  days: number;
  activeProjects: number;
  created: number;
  createdUsers: number;
  updated: number;
  updatedUsers: number;
  done: number;
  doneUsers: number;
  comments: number;
  commentUsers: number;
  checklist: number;
  checklistUsers: number;
};
export type UsageGroup = {
  name: string;
  members: number;
  projects: number;
  daily: number;
  completed: number;
  total: number;
  last: string;
  created: string;
  periods: Record<UsagePeriod, UsageWindow>;
};
const window = (values: number[]): UsageWindow => {
  const [
    active,
    contributors,
    recurring,
    previous,
    returning,
    days,
    activeProjects,
    created,
    createdUsers,
    updated,
    updatedUsers,
    done,
    doneUsers,
    comments,
    commentUsers,
    checklist,
    checklistUsers,
  ] = values;
  return {
    active,
    contributors,
    recurring,
    previous,
    returning,
    days,
    activeProjects,
    created,
    createdUsers,
    updated,
    updatedUsers,
    done,
    doneUsers,
    comments,
    commentUsers,
    checklist,
    checklistUsers,
  };
};
export const usageGroups: UsageGroup[] = [
  {
    name: 'Grupo Alameda',
    members: 42,
    projects: 3,
    daily: 9,
    completed: 26,
    total: 40,
    last: 'Hoy, 10:24',
    created: '12 sep 2026',
    periods: {
      '7': window([24, 15, 15, 21, 19, 73, 2, 9, 4, 34, 13, 6, 4, 14, 5, 20, 4]),
      '30': window([34, 23, 22, 31, 25, 260, 3, 22, 10, 92, 20, 15, 9, 39, 13, 57, 11]),
    },
  },
  {
    name: 'Grupo Encina',
    members: 31,
    projects: 2,
    daily: 6,
    completed: 21,
    total: 32,
    last: 'Hoy, 09:48',
    created: '21 sep 2026',
    periods: {
      '7': window([18, 12, 11, 16, 14, 51, 2, 5, 3, 24, 8, 4, 2, 8, 4, 14, 4]),
      '30': window([27, 17, 17, 23, 19, 170, 2, 15, 7, 67, 15, 10, 6, 26, 9, 39, 8]),
    },
  },
  {
    name: 'Grupo Pinar',
    members: 28,
    projects: 4,
    daily: 4,
    completed: 15,
    total: 28,
    last: 'Ayer, 19:12',
    created: '4 oct 2026',
    periods: {
      '7': window([15, 8, 7, 12, 11, 33, 3, 4, 2, 16, 5, 2, 1, 5, 3, 9, 2]),
      '30': window([23, 11, 12, 18, 15, 95, 4, 12, 5, 48, 10, 6, 4, 18, 6, 30, 5]),
    },
  },
  {
    name: 'Grupo Mirador',
    members: 17,
    projects: 1,
    daily: 0,
    completed: 0,
    total: 8,
    last: 'Hace 17 días',
    created: '1 nov 2026',
    periods: {
      '7': window([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      '30': window([2, 1, 1, 2, 2, 3, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]),
    },
  },
];
/** Closure-free so the generator can embed the very same calculation in the offline preview. */
export function deriveUsage(period: UsagePeriod, groups: UsageGroup[]) {
  const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
  const sum = (key: keyof UsageWindow) => groups.reduce((n, g) => n + g.periods[period][key], 0);
  const members = groups.reduce((n, g) => n + g.members, 0);
  const active = sum('active'),
    previous = sum('previous');
  const features = [
    { label: 'Tareas creadas', events: sum('created'), users: sum('createdUsers') },
    { label: 'Tareas actualizadas', events: sum('updated'), users: sum('updatedUsers') },
    { label: 'Finalizaciones', events: sum('done'), users: sum('doneUsers') },
    { label: 'Comentarios', events: sum('comments'), users: sum('commentUsers') },
    {
      label: 'Pasos de checklist marcados',
      events: sum('checklist'),
      users: sum('checklistUsers'),
    },
  ].map((f) => ({ ...f, reach: ratio(f.users, active) }));
  return {
    members,
    active,
    previous,
    contributors: sum('contributors'),
    recurring: sum('recurring'),
    returning: sum('returning'),
    daily: groups.reduce((n, g) => n + g.daily, 0),
    weekly: groups.reduce((n, g) => n + g.periods['7'].active, 0),
    monthly: groups.reduce((n, g) => n + g.periods['30'].active, 0),
    adoption: ratio(active, members),
    collaboration: ratio(sum('contributors'), active),
    recurrence: ratio(sum('recurring'), active),
    retention: ratio(sum('returning'), previous),
    change: previous > 0 ? (active - previous) / previous : null,
    meanDays: ratio(sum('days'), active),
    projects: groups.reduce((n, g) => n + g.projects, 0),
    activeProjects: sum('activeProjects'),
    activeGroups: groups.filter((g) => g.periods[period].active > 0).length,
    events: sum('created') + sum('updated') + sum('comments'),
    features,
    rows: groups.map((g) => ({
      name: g.name,
      members: g.members,
      projects: g.projects,
      last: g.last,
      ...g.periods[period],
      adoption: ratio(g.periods[period].active, g.members),
      collaboration: ratio(g.periods[period].contributors, g.periods[period].active),
    })),
  };
}
