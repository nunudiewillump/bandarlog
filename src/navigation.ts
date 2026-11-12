import { projectView } from '../shared/project-types';
const views = new Set([
  'home',
  'tasks',
  'projects',
  'commissions',
  'people',
  'alerts',
  'profile',
  'project',
  'commission',
  'tutorial',
]);
export function readNavigation(search: string) {
  const params = new URLSearchParams(search);
  const project = params.get('project') || '',
    commission = params.get('commission') || '';
  const requested = projectView(
    ['camp', 'round'].includes(params.get('view') || '')
      ? project
        ? 'project'
        : 'projects'
      : params.get('view') || (commission ? 'commission' : project ? 'project' : 'home'),
  );
  return {
    view: views.has(requested) ? requested : 'home',
    project,
    commission,
    task: params.get('task') || '',
    action: params.get('action') || '',
  };
}
export function navigationURL(current: string, view: string, project = '', commission = '') {
  const url = new URL(current);
  url.search = '';
  const normalized = projectView(view);
  if (normalized !== 'home') url.searchParams.set('view', normalized);
  if (project) url.searchParams.set('project', project);
  if (commission) url.searchParams.set('commission', commission);
  return url;
}
