export type User = { id: string; name: string; email: string; role: string; preferences?: string };
export type Project = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  starts: string;
  ends: string;
  archived: string;
};
export type Commission = {
  id: string;
  name: string;
  projectId: string;
  description: string;
  icon: string;
};
export type Task = {
  id: string;
  title: string;
  commissionId: string;
  description: string;
  due: string;
  status: string;
  blockedReason: string | null;
  completedBy: string | null;
  completedAt: string | null;
  updatedAt: string;
};
export type Member = { id: string; commissionId: string; userId: string; role: string };
export type Data = {
  users: User[];
  projects: Project[];
  commissions: Commission[];
  tasks: Task[];
  members: Member[];
  assignments: { id: string; taskId: string; userId: string }[];
  activity: {
    id: string;
    taskId: string;
    userId: string;
    kind: string;
    body: string;
    createdAt: string;
  }[];
  invitations: {
    id: string;
    commissionId: string | null;
    email: string;
    name: string;
    status: string;
    role: string;
  }[];
};
export const labels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Terminada',
};
export const overdue = (t: Task) => t.status !== 'done' && new Date(t.due) < new Date();
export const progress = (ts: Task[]) =>
  ts.length ? Math.round((ts.filter((t) => t.status === 'done').length / ts.length) * 100) : 0;
export function date(v: string, full = false) {
  return new Date(v).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'short',
    ...(full ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}
