import { useEffect, useState } from 'react';
import { CalendarDays, Tent, Check, LockKeyhole, ChevronRight, Leaf } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { BananaLoader } from './BananaLoader';
import { smartFocus } from './focus';
import {
  date,
  overdue,
  labels,
  type Data,
  type Task,
  type User,
  type Project,
  type CampSummary,
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
  const Icon = project?.type === 'camp' ? Tent : CalendarDays;
  return (
    <span className={`project-identity ${project?.type === 'camp' ? 'camp' : 'round'}`}>
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
}: {
  tasks: Task[];
  data: Data;
  me: User;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  pending: Set<string>;
  canManage: (id: string) => boolean;
}) {
  return (
    <div className="mobile-task-rows">
      {tasks.length ? (
        tasks.map((task) => {
          const commission = data.commissions.find((c) => c.id === task.commissionId);
          const project = data.projects.find((p) => p.id === commission?.projectId);
          const assignments = data.assignments.filter((a) => a.taskId === task.id);
          const own = assignments.some((a) => a.userId === me.id);
          const writable = project?.archived !== 'true' && (own || canManage(task.commissionId));
          return (
            <div
              className={`mobile-task-row ${task.status === 'done' ? 'done' : ''}`}
              key={task.id}
              data-task-id={task.id}
            >
              {writable && task.status !== 'done' ? (
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
              ) : (
                <span
                  className="task-read-marker"
                  aria-label={task.status === 'done' ? 'Terminada' : 'Solo consulta'}
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
                    Responsable:{' '}
                    {assignments
                      .map((a) => data.users.find((u) => u.id === a.userId)?.name || 'Miembro')
                      .join(', ') || 'Sin asignación'}
                  </span>
                )}
                <span className="mobile-task-meta">
                  <span className={overdue(task) ? 'late-text' : ''}>{date(task.due)}</span>
                  <span className={`badge ${task.status} ${overdue(task) ? 'late-text' : ''}`}>
                    {overdue(task) ? 'Vencida' : labels[task.status]}
                  </span>
                </span>
              </button>
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
export function CampOverview({ camp }: { camp: CampSummary }) {
  return (
    <div className="camp-overview">
      <ProjectIdentity project={{ id: camp.id, name: camp.name, type: 'camp' } as Project} />
      <MobileProgress total={camp.total} done={camp.done} />
      <p>
        <AnimatedCounter value={camp.open} /> pendientes ·{' '}
        <AnimatedCounter value={camp.commissions.length} /> comisiones
      </p>
      <CountMetric value={camp.blocked} label="bloqueadas" />
      <CountMetric value={camp.overdue} label="vencidas" />
      {camp.nextDue && <p>Próximo plazo: {date(camp.nextDue, true)}</p>}
      {camp.commissions.length > 0 && (
        <details className="camp-commission-summary">
          <summary>Ver comisiones</summary>
          <ul>
            {camp.commissions.map((commission) => (
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
  canManage: (id: string) => boolean;
  navigate: (view: string, project?: string) => void;
}) {
  const { data, me, holding, navigate } = props;
  const focus = smartFocus(data, me);
  const personalClear = focus.personalOpen.length === 0;
  const hasContext =
    data.commissions.length > 0 || data.projects.length > 0 || data.tasks.length > 0;
  const scope = holding || focus.level === 'personal' ? focus.personal : focus.commissionTasks;
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
                : focus.level === 'camps'
                  ? 'Campamento'
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
        <TaskSummary
          key={holding || focus.level === 'personal' ? 'personal' : 'commissions'}
          tasks={scope}
          holding={holding}
        />
      )}
      {holding ? (
        <p className="satisfaction-pause">Tarea completada</p>
      ) : (
        <>
          {(focus.level === 'personal' || focus.level === 'commissions') && (
            <section className="focus-primary">
              {focus.level === 'commissions' && (
                <div className="section-heading">
                  <h2>Tareas del equipo</h2>
                </div>
              )}
              {focus.level === 'commissions' && (
                <p className="focus-context-note">
                  Tus tareas están al día. Estas tareas pertenecen a tu equipo.
                </p>
              )}
              <MobileTasks {...props} tasks={focus.featured} />
            </section>
          )}
          {focus.level === 'camps' && (
            <section className="focus-primary">
              <h2>Tus comisiones están al día</h2>
              <p>Así avanzan tus campamentos.</p>
              {focus.camps.slice(0, 2).map((camp) => (
                <section key={camp.id}>
                  <CampOverview camp={camp} />
                  <button className="text-link" onClick={() => navigate('project', camp.id)}>
                    Ver campamento
                    <ChevronRight size={16} />
                  </button>
                </section>
              ))}
              {focus.camps.length > 2 && (
                <button className="secondary" onClick={() => navigate('camps')}>
                  Ver todos los campamentos
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
                    ? 'No quedan tareas abiertas en tus comisiones ni campamentos.'
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
      )}
      <button className="secondary focus-full-list" onClick={() => navigate('tasks')}>
        {focus.level === 'clear' ? 'Ver mi historial de tareas' : 'Ver todas mis tareas'}
      </button>
    </section>
  );
}
