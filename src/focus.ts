import type { Data, Task, User } from './types';
export const openTasks = (tasks: Task[]) => tasks.filter((task) => task.status !== 'done');
export function smartFocus(data: Data, user: User, now = Date.now()) {
  const assigned = new Set(
    data.assignments.filter((a) => a.userId === user.id).map((a) => a.taskId),
  );
  const personal = data.tasks.filter((task) => assigned.has(task.id));
  const global = ['admin', 'coordination'].includes(user.role);
  const ownCommissions = new Set(
    global
      ? data.commissions.map((c) => c.id)
      : data.members.filter((m) => m.userId === user.id).map((m) => m.commissionId),
  );
  const commissionTasks = data.tasks.filter((task) => ownCommissions.has(task.commissionId));
  const personalOpen = openTasks(personal),
    commissionOpen = openTasks(commissionTasks);
  const camps = (data.campSummaries || []).filter((camp) => camp.open > 0);
  const level = personalOpen.length
    ? 'personal'
    : commissionOpen.length
      ? 'commissions'
      : camps.length
        ? 'camps'
        : 'clear';
  const rank = (task: Task) => [
    Number(new Date(task.due).getTime() >= now),
    Number(task.status !== 'blocked'),
    new Date(task.due).getTime(),
  ];
  const tasks = [
    ...(level === 'personal' ? personalOpen : level === 'commissions' ? commissionOpen : []),
  ].sort((a, b) => {
    const x = rank(a),
      y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.id.localeCompare(b.id);
  });
  return {
    level,
    personal,
    personalOpen,
    commissionTasks,
    commissionOpen,
    featured: tasks.slice(0, 3),
    camps: camps.sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.blocked - a.blocked ||
        (a.nextDue || '').localeCompare(b.nextDue || ''),
    ),
    ownCommissions,
  };
}
