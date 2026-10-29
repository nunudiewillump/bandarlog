import type { Data, Task, User } from './types';
export function workloadRows(data: Data, users: User[], tasks: Task[], now = Date.now()) {
  return users
    .map((user) => {
      const assignments = data.assignments.filter((a) => a.userId === user.id);
      const mine = tasks.filter((t) => assignments.some((a) => a.taskId === t.id));
      const done = mine.filter((t) => t.status === 'done' && t.completedAt);
      const times = done
        .flatMap((t) => {
          const assigned = assignments.find((a) => a.taskId === t.id)?.assignedAt;
          if (!assigned) return [];
          const elapsed = +new Date(t.completedAt!) - +new Date(assigned);
          return elapsed >= 0 ? [elapsed / 86400000] : [];
        })
        .sort((a, b) => a - b);
      const mid = Math.floor(times.length / 2);
      return {
        user,
        total: mine.length,
        commissions: new Set(mine.map((t) => t.commissionId)).size,
        done: done.length,
        open: mine.filter((t) => t.status !== 'done').length,
        overdue: mine.filter((t) => t.status !== 'done' && +new Date(t.due) < now).length,
        blocked: mine.filter((t) => t.status === 'blocked').length,
        onTime: done.filter((t) => +new Date(t.completedAt!) <= +new Date(t.due)).length,
        timed: times.length,
        medianDays: times.length
          ? times.length % 2
            ? times[mid]
            : (times[mid - 1] + times[mid]) / 2
          : null,
      };
    })
    .filter((row) => row.total)
    .sort((a, b) => b.open - a.open || a.user.name.localeCompare(b.user.name));
}
