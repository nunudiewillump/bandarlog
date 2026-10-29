export type User = {
  onboardingCompletedAt?: string | null;
  id: string;
  name: string;
  email: string;
  role: string;
  preferences?: string;
  avatarUrl?: string | null;
};
export type Project = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  starts: string;
  ends: string;
  archived: string;
  artworkTheme?: 'scout' | 'christmas';
};
export type Commission = {
  id: string;
  name: string;
  projectId: string;
  description: string;
  icon: string;
  iconUrl?: string | null;
  mascotUrl?: string | null;
  artworkStatus?: string;
  artworkKey?: string;
  artworkMode?: 'automatic' | 'manual';
  artworkLocked?: boolean;
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
export type CampSummary = {
  id: string;
  name: string;
  total: number;
  open: number;
  done: number;
  blocked: number;
  overdue: number;
  nextDue: string | null;
  commissions: {
    id: string;
    name: string;
    total: number;
    open: number;
    done: number;
    blocked: number;
    overdue: number;
    nextDue: string | null;
  }[];
};
export type Data = {
  campSummaries?: CampSummary[];
  artworkEnabled: boolean;
  users: User[];
  projects: Project[];
  commissions: Commission[];
  tasks: Task[];
  members: Member[];
  projectMembers: { id: string; projectId: string; userId: string }[];
  assignments: { id: string; taskId: string; userId: string; assignedAt?: string | null }[];
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
    projectId: string | null;
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
