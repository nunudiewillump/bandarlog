import type { Data, Task, User, Project, Commission, CampSummary } from '../../src/types';
export function mobileFixture(count: 1 | 5 | 10 = 10) {
  const user: User = {
    id: 'mobile-scouter',
    name: 'Scouter Prueba',
    email: 'mobile@example.test',
    role: 'member',
  };
  const projects: Project[] = [
    {
      id: 'round-v2',
      name: 'Ronda Solar 2026–2027',
      type: 'ronda',
      parentId: null,
      starts: '2026-09-01',
      ends: '2027-08-31',
      archived: 'false',
    },
    {
      id: 'camp-v2',
      name: 'Campamento de verano 2027',
      type: 'camp',
      parentId: 'round-v2',
      starts: '2027-07-01',
      ends: '2027-07-15',
      archived: 'false',
    },
  ];
  const names = [
    'Material',
    'Infraestructura',
    'Botiquín',
    'Animación',
    'Electricidad',
    'Cocina',
    'Menú',
    'Logística',
    'Servicios',
    'Staff',
  ];
  const indexes = count === 10 ? names.map((_, i) => i) : count === 5 ? [0, 1, 5, 6, 7] : [5];
  const commissions: Commission[] = indexes.map((i) => ({
    id: `commission-v2-${i}`,
    name: names[i],
    projectId: i < 5 ? 'round-v2' : 'camp-v2',
    description: '',
    icon: 'tent',
    artworkStatus: 'ready',
  }));
  const hidden: Commission = {
    id: 'camp-other',
    name: 'Otras comisiones del campamento',
    projectId: 'camp-v2',
    description: '',
    icon: 'tent',
  };
  const allTasks: Task[] = Array.from({ length: 74 }, (_, i) => ({
    id: `v2-task-${i}`,
    title:
      i < 7
        ? `Mi tarea ${i + 1}`
        : i < 37
          ? `Trabajo del equipo ${i - 6}`
          : i < 51
            ? `Tarea de otra comisión ${i - 36}`
            : `Trabajo terminado ${i - 50}`,
    commissionId: i >= 37 && i < 51 ? hidden.id : commissions[i % commissions.length].id,
    description: 'Datos de prueba aislados',
    due: new Date(Date.now() + (i === 0 ? -86400000 : (i + 1) * 86400000)).toISOString(),
    status: i >= 51 ? 'done' : i === 6 || i === 17 || i === 40 ? 'blocked' : 'pending',
    blockedReason: i === 6 || i === 17 || i === 40 ? 'Esperando material' : null,
    completedBy: i >= 51 ? 'other' : null,
    completedAt: i >= 51 ? new Date().toISOString() : null,
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  }));
  const assignments = allTasks.map((task, i) => ({
    id: 'assign-' + i,
    taskId: task.id,
    userId: i < 7 || (i >= 51 && i < 59) ? user.id : 'other',
  }));
  const data: Data = {
    artworkEnabled: true,
    users: [
      user,
      { id: 'other', name: 'Otra persona', email: 'other@example.test', role: 'member' },
    ],
    projects,
    commissions,
    members: commissions.map((c) => ({
      id: 'member-' + c.id,
      userId: user.id,
      commissionId: c.id,
      role: 'scouter',
    })),
    projectMembers: [],
    tasks: allTasks.filter((task) => task.commissionId !== hidden.id),
    assignments: assignments.filter(
      (a) => !allTasks.some((t) => t.id === a.taskId && t.commissionId === hidden.id),
    ),
    activity: [],
    invitations: [],
  };
  const summary = () => {
    const groups = [...commissions.filter((c) => c.projectId === 'camp-v2'), hidden];
    const summarize = (tasks: Task[]) => {
      const open = tasks.filter((t) => t.status !== 'done');
      return {
        total: tasks.length,
        open: open.length,
        done: tasks.length - open.length,
        blocked: open.filter((t) => t.status === 'blocked').length,
        overdue: open.filter((t) => +new Date(t.due) < Date.now()).length,
        nextDue:
          open
            .filter((t) => +new Date(t.due) >= Date.now())
            .map((t) => t.due)
            .sort()[0] || null,
      };
    };
    const ids = new Set(groups.map((c) => c.id));
    data.campSummaries = [
      {
        id: 'camp-v2',
        name: projects[1].name,
        ...summarize(allTasks.filter((t) => ids.has(t.commissionId))),
        commissions: groups.map((c) => ({
          id: c.id,
          name: c.name,
          ...summarize(allTasks.filter((t) => t.commissionId === c.id)),
        })),
      },
    ];
    return data;
  };
  summary();
  return { user, data, allTasks, summary };
}
