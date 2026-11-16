import type { Data, User } from './types';

export function isFoundingAdministrator(user: User | null): boolean {
  if (user?.role !== 'admin') return false;
  try {
    return JSON.parse(user.preferences || '{}').foundingAdmin === true;
  } catch {
    return false;
  }
}
export function hasFinishedAdminGuide(user: User | null): boolean {
  if (!user) return false;
  try {
    return JSON.parse(user.preferences || '{}').adminGuideCompleted === true;
  } catch {
    return false;
  }
}
export function setupMilestones(
  data: Pick<Data, 'projects' | 'commissions' | 'invitations' | 'users' | 'tasks'>,
) {
  return {
    project: data.projects.some((project) => project.archived !== 'true'),
    commission: data.commissions.length > 0,
    invitation: data.users.length > 1 || data.invitations.some((invite) => invite.status === 'pending' || invite.status === 'accepted'),
    task: data.tasks.length > 0,
  };
}
