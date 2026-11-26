import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Minus,
  Plus,
} from 'lucide-react';
import { calendarDay, formatDay, formatTick, timelineTicks } from './project-timeline';
import { labels, progress, type Commission, type Data, type Project, type Task } from './types';
import './project-map.css';

type Props = {
  project: Project;
  data: Data;
  commissionIcon: (commission: Commission) => ReactNode;
  openTask: (task: Task) => void;
};
const states = ['pending', 'in_progress', 'blocked', 'done'] as const;
const stateNames = {
  pending: 'Pendientes',
  in_progress: 'En curso',
  blocked: 'Bloqueadas',
  done: 'Terminadas',
};
const laneLabelWidth = 204;

function TaskSymbol({ status }: { status: string }) {
  return (
    <span className="pm-symbol" data-status={status} aria-hidden="true">
      {status === 'done' && <Check size={11} strokeWidth={3} />}
      {status === 'blocked' && <Minus size={10} strokeWidth={3} />}
    </span>
  );
}

export default function ProjectMap({ project, data, commissionIcon, openTask }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [today, setToday] = useState(() => calendarDay(new Date().toISOString())!);
  const scroller = useRef<HTMLDivElement>(null);
  const zoomCenter = useRef<number | null>(null);
  const previousSpan = useRef<{ track: number; viewport: number } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(calendarDay(new Date().toISOString())!),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    const node = scroller.current!;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { lanes, tasks, owners, timestamps, first, last } = useMemo(() => {
    const lanes = data.commissions
      .filter((c) => c.projectId === project.id)
      .map((commission) => ({ commission, tasks: [] as Task[] }));
    const byCommission = new Map(lanes.map((lane) => [lane.commission.id, lane]));
    const owners = new Map<string, string[]>();
    const names = new Map(data.users.map((u) => [u.id, u.name]));
    const tasks = new Map<string, Task>();
    const timestamps = new Map<string, { due: number | null; done: number | null }>();
    const dates = [calendarDay(project.starts), calendarDay(project.ends)];
    for (const task of data.tasks) {
      const lane = byCommission.get(task.commissionId);
      if (!lane) continue;
      tasks.set(task.id, task);
      lane.tasks.push(task);
      const due = calendarDay(task.due);
      const done = calendarDay(task.completedAt);
      timestamps.set(task.id, { due, done });
      dates.push(due, done);
    }
    for (const assignment of data.assignments) {
      const name = names.get(assignment.userId);
      if (!tasks.has(assignment.taskId) || !name) continue;
      const list = owners.get(assignment.taskId) ?? [];
      list.push(name);
      owners.set(assignment.taskId, list);
    }
    for (const lane of lanes) lane.tasks.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
    const known = dates.filter((value): value is number => value !== null);
    return {
      lanes,
      tasks,
      owners,
      timestamps,
      first: Math.min(...known, today),
      last: Math.max(...known, today),
    };
  }, [data, project, today]);
  const start = first - 1;
  const end = last + 2;
  const viewport = Math.max(1, width - laneLabelWidth);
  const track = Math.max(360, viewport) * zoom;
  const position = (day: number) => ((day - start) / (end - start)) * track;
  const { ticks, month } = useMemo(() => timelineTicks(start, end, track), [start, end, track]);
  const counts = Object.fromEntries(states.map((state) => [state, 0])) as Record<string, number>;
  for (const task of tasks.values()) counts[task.status] = (counts[task.status] ?? 0) + 1;
  const total = tasks.size;
  const task = selected ? tasks.get(selected) : undefined;
  const taskLane = task && lanes.find(({ commission }) => commission.id === task.commissionId);

  useLayoutEffect(() => {
    const node = scroller.current!;
    const previous = previousSpan.current;
    const center =
      zoomCenter.current ??
      (previous && node.scrollLeft > 0
        ? (node.scrollLeft + previous.viewport / 2) / previous.track
        : null);
    if (center !== null) node.scrollLeft = center * track - viewport / 2;
    zoomCenter.current = null;
    previousSpan.current = { track, viewport };
  }, [track, viewport]);

  function changeZoom(multiplier: number) {
    const next = Math.min(16, Math.max(1, zoom * multiplier));
    if (next === zoom) return;
    zoomCenter.current = ((scroller.current?.scrollLeft ?? 0) + viewport / 2) / track;
    setZoom(next);
  }
  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function marks(t: Task) {
    const { due, done } = timestamps.get(t.id)!;
    const separate = due !== null && done !== null && due !== done;
    const dates =
      due === done && done !== null
        ? [{ day: done, label: 'Vencimiento y finalización', completed: true }]
        : [
            { day: due, label: 'Vencimiento', completed: false },
            { day: done, label: 'Finalización', completed: true },
          ];
    return dates.map(
      ({ day, label, completed }) =>
        day !== null && (
          <button
            key={label}
            className={`pm-mark ${completed ? 'pm-completion' : ''}`}
            data-position={separate ? (completed ? 'lower' : 'upper') : undefined}
            style={{ left: position(day) }}
            title={`${t.title} · ${label} · ${formatDay(day)}`}
            aria-label={`${t.title}, ${labels[t.status]}, ${label}, ${formatDay(day)}`}
            aria-pressed={selected === t.id}
            onClick={() => setSelected(t.id)}
          >
            <TaskSymbol status={t.status} />
          </button>
        ),
    );
  }

  return (
    <section className="project-map" aria-label="Mapa temporal del proyecto">
      <header className="pm-header">
        <div>
          <h2>Mapa del proyecto</h2>
          <p>
            {formatDay(calendarDay(project.starts))} – {formatDay(calendarDay(project.ends))}
          </p>
        </div>
        <div className="pm-controls" role="group" aria-label="Navegación temporal">
          <button
            onClick={() => {
              setZoom(1);
              scroller.current!.scrollLeft = 0;
            }}
          >
            Proyecto completo
          </button>
          <button
            onClick={() => {
              scroller.current!.scrollLeft = position(today) - viewport / 2;
            }}
          >
            Hoy
          </button>
          <button aria-label="Alejar" disabled={zoom === 1} onClick={() => changeZoom(0.5)}>
            <Minus size={16} />
          </button>
          <button aria-label="Acercar" disabled={zoom === 16} onClick={() => changeZoom(2)}>
            <Plus size={16} />
          </button>
          <button
            aria-label="Mover a la izquierda"
            onClick={() => {
              scroller.current!.scrollLeft -= viewport * 0.75;
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Mover a la derecha"
            onClick={() => {
              scroller.current!.scrollLeft += viewport * 0.75;
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <div className="pm-metrics" role="group" aria-label="Progreso y estados">
        <strong>
          {counts.done}/{total} terminadas · {total ? Math.round((counts.done / total) * 100) : 0} %
        </strong>
        {states.map((state) => (
          <button
            key={state}
            aria-pressed={filter === state}
            onClick={() => {
              const next = filter === state ? undefined : state;
              setFilter(next);
              if (next)
                setExpanded(
                  new Set(
                    lanes
                      .filter((lane) => lane.tasks.some((t) => t.status === next))
                      .map((lane) => lane.commission.id),
                  ),
                );
            }}
          >
            <TaskSymbol status={state} /> {counts[state]} {stateNames[state]}
          </button>
        ))}
      </div>
      <div
        className="pm-scroll"
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="Cronología desplazable"
      >
        <div
          className="pm-grid"
          style={{
            width: laneLabelWidth + track,
            gridTemplateColumns: `${laneLabelWidth}px ${track}px`,
          }}
        >
          <div className="pm-label pm-axis-label">Comisiones</div>
          <div className="pm-track pm-axis" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                className="pm-tick"
                data-end={track - position(tick) < 85}
                key={tick}
                style={{ left: position(tick) }}
              >
                {formatTick(tick, month)}
              </span>
            ))}
            {(
              [
                ['Inicio', calendarDay(project.starts)],
                ['Fin', calendarDay(project.ends)],
              ] as const
            ).map(
              ([label, day]) =>
                day !== null && (
                  <span
                    className="pm-boundary"
                    data-side={label}
                    key={label}
                    title={formatDay(day)}
                    style={{ left: position(day) }}
                  >
                    {label}
                  </span>
                ),
            )}
            <span className="pm-today-tag" style={{ left: position(today) }}>
              Hoy
            </span>
          </div>
          <div className="pm-guides" aria-hidden="true">
            {ticks.map((tick) => (
              <i key={tick} style={{ left: position(tick) }} />
            ))}
            {[calendarDay(project.starts), calendarDay(project.ends)].map(
              (day, index) =>
                day !== null && (
                  <i
                    key={'boundary-' + index}
                    className="pm-boundary-line"
                    style={{ left: position(day) }}
                  />
                ),
            )}
            <i className="pm-today-line" style={{ left: position(today) }} />
          </div>
          {lanes.flatMap(({ commission, tasks: list }) => {
            const open = expanded.has(commission.id);
            const visible = filter ? list.filter((t) => t.status === filter) : list;
            const marksByPixel = new Map<number, { day: number; status: string }>();
            const priority = ['pending', 'done', 'in_progress', 'blocked'];
            for (const t of visible) {
              const { due, done } = timestamps.get(t.id)!;
              for (const day of [due, done]) {
                if (day === null) continue;
                const bucket = Math.round(position(day) / 16);
                const previous = marksByPixel.get(bucket);
                if (!previous || priority.indexOf(t.status) > priority.indexOf(previous.status))
                  marksByPixel.set(bucket, { day, status: t.status });
              }
            }
            return [
              <div className="pm-label pm-commission" key={`label-${commission.id}`}>
                <button onClick={() => toggle(commission.id)} aria-expanded={open}>
                  {commissionIcon(commission)}
                  <span>
                    <strong>{commission.name}</strong>
                    <small>
                      {list.length} tareas · {progress(list)} %
                    </small>
                  </span>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>,
              <div className="pm-track pm-lane" key={`lane-${commission.id}`}>
                <i className="pm-baseline" />
                {[...marksByPixel].map(([bucket, { day, status }]) => (
                  <i
                    key={bucket}
                    aria-hidden="true"
                    className="pm-summary-dot"
                    style={{ left: position(day) }}
                  >
                    <TaskSymbol status={status} />
                  </i>
                ))}
              </div>,
              ...(open
                ? visible.flatMap((t) => [
                    <div className="pm-label pm-task" key={`task-${t.id}`}>
                      <button aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>
                        <TaskSymbol status={t.status} />
                        <span>
                          <strong>{t.title}</strong>
                          <small>
                            {labels[t.status]} ·{' '}
                            {owners.get(t.id)?.join(', ') || 'Sin responsable visible'}
                          </small>
                        </span>
                      </button>
                    </div>,
                    <div className="pm-track pm-task-track" key={`track-${t.id}`}>
                      {marks(t)}
                    </div>,
                  ])
                : []),
            ];
          })}
        </div>
        {lanes.length === 0 && (
          <p className="pm-empty">Todavía no hay comisiones disponibles en este proyecto.</p>
        )}
      </div>
      <footer className="pm-legend">
        <span>Marcador de tarea · Vencimiento</span>
        <span>
          <i className="pm-completion-key" aria-hidden="true">
            <TaskSymbol status="done" />
          </i>{' '}
          Finalización registrada
        </span>
        <span>Hoy · {formatDay(today)}</span>
      </footer>
      {task && (
        <aside className="pm-detail" aria-label="Detalle contextual de tarea">
          <div>
            <p>
              {taskLane?.commission.name} · {labels[task.status]}
            </p>
            <h3>{task.title}</h3>
            <dl>
              <div>
                <dt>Responsables</dt>
                <dd>{owners.get(task.id)?.join(', ') || 'Sin responsable visible'}</dd>
              </div>
              <div>
                <dt>Vencimiento</dt>
                <dd>{formatDay(calendarDay(task.due))}</dd>
              </div>
              {task.status === 'done' && (
                <div>
                  <dt>Finalización</dt>
                  <dd>{formatDay(calendarDay(task.completedAt))}</dd>
                </div>
              )}
              {task.status === 'blocked' && (
                <div>
                  <dt>Bloqueo</dt>
                  <dd>{task.blockedReason || 'Sin motivo registrado'}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="pm-controls">
            <button onClick={() => openTask(task)}>Abrir ficha</button>
            <button onClick={() => setSelected(undefined)}>Cerrar detalle</button>
          </div>
        </aside>
      )}
    </section>
  );
}
