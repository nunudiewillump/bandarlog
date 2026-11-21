import { useEffect, useState, useMemo } from 'react';
import { HomeTaskAction } from './HomeTaskAction';
import { taskPeople } from './task-people';
import { CalendarDays, Tent, Check, LockKeyhole, ChevronRight, Leaf, Clock3 } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { BananaLoader } from './BananaLoader';
import { projectType } from '../shared/project-types';
import { smartFocus, teamPendingTone } from './focus';
import {
  date,
  overdue,
  labels,
  type Data,
  type Task,
  type User,
  type Project,
  type ProjectSummary,
} from './types';
export function MobileEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mobile-empty-state">
      <Leaf size={28} aria-hidden="true" />

      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
export function ProjectIdentity({
  project,
  commission,
}: {
  project?: Project;
  commission?: string;
}) {
  const Icon = projectType(project?.type) === 'camp' ? Tent : CalendarDays;
  return (
    <span
      className={`project-identity ${projectType(project?.type) === 'camp' ? 'camp' : 'round'}`}
    >
      <Icon size={14} aria-hidden="true" />
      <span>
        {project?.name || 'Proyecto'}
        {commission ? ` · ${commission}` : ''}
      </span>
    </span>
  );
}
export function MobileTasks({
  tasks,
  data,
  me,
  onOpen,
  onComplete,
  pending,
  canManage,
  homeActions,
  queued,
}: {
  tasks: Task[];
  data: Data;
  me: User;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  pending: Set<string>;
  canManage: (id: string) => boolean;
  homeActions?: { start: (task: Task) => void; finish: (task: Task) => void };
  queued?: Set<string>;
}) {
  const people = useMemo(
    () => taskPeople(data),
    [data.users, data.tasks, data.members, data.assignments],
  );
  return (
    <div className="mobile-task-rows">
      {tasks.length ? (
        tasks.map((task) => {
          const commission = data.commissions.find((c) => c.id === task.commissionId);
          const project = data.projects.find((p) => p.id === commission?.projectId);
          const assigned = people.get(task.id) || [];
          const own = assigned.some((user) => user.id === me.id);
          const writable = project?.archived !== 'true' && (own || canManage(task.commissionId));
          return (
            <div
              className={`mobile-task-row ${homeActions ? 'home-quick-row' : ''} ${task.status === 'done' ? 'done' : ''}`}
              key={task.id}
              data-task-id={task.id}
            >
              {!homeActions && writable && task.status !== 'done' ? (
                <button
                  className="quick-complete"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Completar ${task.title}`}
                  disabled={pending.has(task.id)}
                  onClick={() => onComplete(task)}
                >
                  {pending.has(task.id) ? (
                    <BananaLoader compact label="Guardando tarea…" />
                  ) : (
                    <span />
                  )}
                </button>
              ) : homeActions && writable && ['pending', 'in_progress'].includes(task.status) ? (
                <span className="home-task-marker" aria-hidden="true">
                  {task.status === 'in_progress' ? (
                    <Clock3 size={18} />
                  ) : (
                    <span className="home-pending-dot" />
                  )}
                </span>
              ) : (
                <span
                  className="task-read-marker"
                  aria-label={
                    task.status === 'done'
                      ? 'Terminada'
                      : homeActions && task.status === 'blocked'
                        ? 'Bloqueada'
                        : 'Solo consulta'
                  }
                >
                  {task.status === 'done' ? <Check size={20} /> : <LockKeyhole size={16} />}
                </span>
              )}
              <button
                className="mobile-task-open"
                aria-label={task.title}
                onClick={() => onOpen(task)}
              >
                <strong>{task.title}</strong>
                <ProjectIdentity project={project} commission={commission?.name} />
                {!own && (
                  <span className="task-assigned-to">
                    Responsable: {assigned.map((user) => user.name).join(', ') || 'Sin asignación'}
                  </span>
                )}
                <span className="mobile-task-meta">
                  <span className={overdue(task) ? 'late-text' : ''}>{date(task.due)}</span>
                  <span
                    className={`badge ${overdue(task) && (!homeActions || task.status === 'pending') ? 'overdue' : task.status}`}
                  >
                    {overdue(task) && (!homeActions || task.status === 'pending')
                      ? 'Vencida'
                      : labels[task.status]}
                  </span>
                </span>
              </button>
              {homeActions && writable && ['pending', 'in_progress'].includes(task.status) && (
                <div className="home-task-actions">
                  <HomeTaskAction
                    title={task.title}
                    status={task.status}
                    version={task.updatedAt}
                    disabled={pending.has(task.id) || !!queued?.has(task.id)}
                    queued={queued?.has(task.id)}
                    onStart={() => homeActions.start(task)}
                    onFinish={() => homeActions.finish(task)}
                  />
                </div>
              )}
              {homeActions && task.status === 'blocked' && (
                <p className="home-task-blocked">
                  {task.blockedReason || 'Abre la tarea para consultar el bloqueo.'}
                </p>
              )}
            </div>
          );
        })
      ) : (
        <MobileEmpty
          title="Sin tareas por aquí"
          detail="No hay tareas que coincidan con esta vista."
        />
      )}
    </div>
  );
}
export function MobileProgress({ total, done }: { total: number; done: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mobile-progress" aria-label={`Progreso: ${percent}%`}>
      <span className="progress">
        <i style={{ width: `${percent}%` }} />
      </span>
      <span>
        <AnimatedCounter value={percent} />%
      </span>
    </div>
  );
}
export function ProjectOverview({ project }: { project: ProjectSummary }) {
  return (
    <div className="project-overview">
      <ProjectIdentity
        project={{ id: project.id, name: project.name, type: project.type || 'camp' } as Project}
      />
      <MobileProgress total={project.total} done={project.done} />
      <p>
        <AnimatedCounter value={project.open} /> pendientes ·{' '}
        <AnimatedCounter value={project.commissions.length} /> comisiones
      </p>
      <CountMetric value={project.blocked} label="bloqueadas" />
      <CountMetric value={project.overdue} label="vencidas" />
      {project.nextDue && <p>Próximo plazo: {date(project.nextDue, true)}</p>}
      {project.commissions.length > 0 && (
        <details className="project-commission-summary">
          <summary>Ver comisiones</summary>
          <ul>
            {project.commissions.map((commission) => (
              <li key={commission.id}>
                <strong>{commission.name}</strong>
                <span>
                  <AnimatedCounter value={commission.open} /> pendientes
                </span>
                <MobileProgress total={commission.total} done={commission.done} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function CountMetric({
  value,
  label,
  keepZero = false,
}: {
  value: number;
  label: string;
  keepZero?: boolean;
}) {
  const [visible, setVisible] = useState(value > 0 || keepZero);
  useEffect(() => {
    if (value > 0 || keepZero) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(timer);
  }, [value, keepZero]);
  return visible ? (
    <span>
      <strong>
        <AnimatedCounter value={value} />
      </strong>{' '}
      {label}
    </span>
  ) : null;
}
export function TeamTaskCount({ open, total }: { open: number; total: number }) {
  const percent = total ? Math.round((open / total) * 100) : 0;
  return (
    <span
      className={`team-task-count ${teamPendingTone(open, total)}`}
      data-pending={open}
      data-total={total}
      title={`${percent} % por completar`}
      aria-label={`${open} tareas del equipo por completar de ${total}, ${percent} %`}
    >
      <AnimatedCounter value={open} />
    </span>
  );
}
export function TaskSummary({ tasks, holding = false }: { tasks: Task[]; holding?: boolean }) {
  return (
    <div className="focus-counts" aria-label="Resumen de tareas">
      <CountMetric
        value={tasks.filter((t) => t.status !== 'done').length}
        label="Por completar"
        keepZero={holding}
      />
      <CountMetric value={tasks.filter(overdue).length} label="Vencidas" />
      <CountMetric value={tasks.filter((t) => t.status === 'blocked').length} label="Bloqueadas" />
      <CountMetric value={tasks.filter((t) => t.status === 'done').length} label="Terminadas" />
      {tasks.length > 0 && (
        <MobileProgress
          total={tasks.length}
          done={tasks.filter((t) => t.status === 'done').length}
        />
      )}
    </div>
  );
}
export function MobileHome(props: {
  data: Data;
  me: User;
  holding: boolean;
  pending: Set<string>;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onStart: (task: Task) => void;
  queued: Set<string>;
  canManage: (id: string) => boolean;
  navigate: (view: string, project?: string) => void;
}) {
  const { data, me, holding, navigate } = props;
  const focus = smartFocus(data, me);
  const personalClear = focus.personalOpen.length === 0;
  const hasContext =
    data.commissions.length > 0 || data.projects.length > 0 || data.tasks.length > 0;
  const finished = focus.personal.filter((task) => task.status === 'done');
  const recent = [...finished]
    .sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt))
    .slice(0, 2);
  return (
    <section
      className="mobile-focus"
      aria-label="Tu situación"
      data-focus-level={focus.level}
      data-holding={holding}
    >
      <header>
        <h1>
          {holding
            ? 'Tus tareas están al día'
            : focus.level === 'personal'
              ? 'Mis tareas'
              : focus.level === 'commissions'
                ? 'Mis comisiones'
                : focus.level === 'projects'
                  ? 'Proyectos'
                  : hasContext
                    ? 'Todo al día'
                    : 'Sin tareas asignadas'}
        </h1>
      </header>
      {personalClear && (holding || focus.level !== 'clear') && (
        <section className={`personal-clear ${holding ? 'just-finished' : ''}`}>
          <div>
            <h2>¡Tus tareas están al día!</h2>
          </div>
          <img src="/brand-mark.webp" alt="" width="52" height="52" />
        </section>
      )}
      {(holding || focus.level === 'personal' || focus.level === 'commissions') && (
        <TaskSummary tasks={focus.personal} holding={holding || personalClear} />
      )}
      <>
        {(focus.level === 'personal' || focus.level === 'commissions') && (
          <section className="focus-primary">
            {focus.level === 'commissions' && (
              <div className="section-heading">
                <h2 className="team-tasks-heading">
                  Tareas del equipo{' '}
                  <TeamTaskCount open={focus.teamOpen.length} total={focus.teamTasks.length} />
                </h2>
              </div>
            )}
            {focus.level === 'commissions' && (
              <p className="focus-context-note">
                Tus tareas están al día. Estas tareas pertenecen a tu equipo.
              </p>
            )}
            <MobileTasks
              {...props}
              tasks={focus.featured}
              homeActions={{ start: props.onStart, finish: props.onComplete }}
            />
          </section>
        )}
        {focus.level === 'projects' && (
          <section className="focus-primary">
            <h2>Tus comisiones están al día</h2>
            <p>Así avanzan tus proyectos.</p>
            {focus.projects.slice(0, 2).map((camp) => (
              <section key={camp.id}>
                <ProjectOverview project={camp} />
                <button className="text-link" onClick={() => navigate('project', camp.id)}>
                  Ver proyecto
                  <ChevronRight size={16} />
                </button>
              </section>
            ))}
            {focus.projects.length > 2 && (
              <button className="secondary" onClick={() => navigate('projects')}>
                Ver todos los proyectos
              </button>
            )}
          </section>
        )}
        {focus.level === 'clear' && (
          <>
            <section className="all-clear rich-state">
              <span className="clear-status">
                <Check size={16} /> Sin pendientes
              </span>

              <Check size={34} aria-hidden="true" />
              {hasContext && (
                <div className="personal-clear compact">
                  <p>¡Tus tareas están al día!</p>
                </div>
              )}
              <p>
                {hasContext
                  ? 'No quedan tareas abiertas en tus comisiones ni proyectos.'
                  : 'Aquí verás tus tareas y comisiones cuando te añadan al equipo.'}
              </p>
              {(finished.length > 0 || focus.ownCommissions.size > 0) && (
                <div className="clear-summary">
                  {finished.length > 0 && (
                    <span>
                      <strong>
                        <AnimatedCounter value={finished.length} />
                      </strong>{' '}
                      tus tareas terminadas
                    </span>
                  )}
                  {focus.ownCommissions.size > 0 && (
                    <span>
                      <strong>
                        <AnimatedCounter value={focus.ownCommissions.size} />
                      </strong>{' '}
                      comisiones al día
                    </span>
                  )}
                </div>
              )}
            </section>
            {recent.length > 0 && (
              <section className="recent-finished">
                <h2>Últimas tareas terminadas</h2>
                <MobileTasks {...props} tasks={recent} />
              </section>
            )}
          </>
        )}
      </>
    </section>
  );
}
