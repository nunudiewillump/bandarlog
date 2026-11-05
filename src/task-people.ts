import type { Data, User } from './types';
/** One pass per data revision, shared by desktop and mobile task lists. */
export function taskPeople(data: Pick<Data, 'users' | 'tasks' | 'members' | 'assignments'>) {
  const users = new Map(data.users.filter((u) => !u.disabledAt).map((u) => [u.id, u]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const memberships = new Set(data.members.map((m) => JSON.stringify([m.commissionId, m.userId])));
  const result = new Map<string, User[]>();
  for (const assignment of data.assignments) {
    const task = tasks.get(assignment.taskId),
      user = users.get(assignment.userId);
    if (!task || !user || !memberships.has(JSON.stringify([task.commissionId, user.id]))) continue;
    const list = result.get(task.id) || [];
    list.push(user);
    result.set(task.id, list);
  }
  return result;
}
