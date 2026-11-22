import { ProjectMeetings, useProjectMeetings, type Decision } from './ProjectMeetings';
import { PlanningEditor, useProjectPlanning } from './ProjectPlanning';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react';
import { calendarDay, formatDay, formatTick, timelineTicks } from './project-timeline';
import { labels, progress, type Commission, type Data, type Project, type Task } from './types';
import './project-map.css';

type Props = {
  project: Project;
  data: Data;
  commissionIcon: (commission: Commission) => ReactNode;
  openTask: (task: Task) => void;
  refresh: () => Promise<unknown>;
};
const states = ['pending', 'in_progress', 'blocked', 'done'] as const;
const stateNames = {
  pending: 'Pendientes',
  in_progress: 'En curso',
  blocked: 'Bloqueadas',
  done: 'Terminadas',
};
const laneLabelWidth = 204;

export default function ProjectMap({ project, data, commissionIcon, openTask, refresh }: Props) {
  const planning = useProjectPlanning(project.id, data);
  const plan = planning.data;
  const meetings = useProjectMeetings(project.id, data, refresh);
  const [presentation, setPresentation] = useState(false);
  const [presentationError, setPresentationError] = useState('');
  const [activeCommission, setActiveCommission] = useState<string>();
  const [selectedDecision, setSelectedDecision] = useState<string>();
  const mapRef = useRef<HTMLElement>(null);
  const meetingButton = useRef<HTMLButtonElement>(null);
  const focusedRow = useRef<string | undefined>(undefined);
  useEffect(() => {
    const onFullscreen = () => {
      const active = document.fullscreenElement === mapRef.current;
      setPresentation(active);
      if (!active) meetingButton.current?.focus({ preventScroll: true });
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
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
  const planDays = [
    ...(plan?.phases.flatMap((p) => [calendarDay(p.starts), calendarDay(p.ends)]) ?? []),
    ...(plan?.milestones.flatMap((m) => [calendarDay(m.planned), calendarDay(m.achieved)]) ?? []),
  ].filter((day): day is number => day !== null);
  for (const decision of meetings.data?.decisions ?? []) {
    const target = calendarDay(decision.target);
    if (target !== null) planDays.push(target);
  }
  const start = Math.min(first, ...planDays) - 1;
  const end = Math.max(last, ...planDays) + 2;
  const viewport = Math.max(1, width - laneLabelWidth);
  const track = Math.max(360, viewport) * zoom;
  const position = (day: number) => ((day - start) / (end - start)) * track;
  const { ticks, month } = useMemo(() => timelineTicks(start, end, track), [start, end, track]);
  const counts = Object.fromEntries(states.map((state) => [state, 0])) as Record<string, number>;
  for (const task of tasks.values()) counts[task.status] = (counts[task.status] ?? 0) + 1;
  const total = tasks.size;
  const task = selected ? tasks.get(selected) : undefined;
  const taskLane = task && lanes.find(({ commission }) => commission.id === task.commissionId);

  const decision = meetings.data?.decisions.find((d) => d.id === selectedDecision);
  const laneIndex = lanes.findIndex((lane) => lane.commission.id === activeCommission);
  function focusRow(key: string) {
    const node = scroller.current;
    if (!node) return;
    const row = [...node.querySelectorAll<HTMLElement>('[data-pm-row]')].find(
      (element) => element.dataset.pmRow === key,
    );
    if (row) node.scrollTop = Math.max(0, row.offsetTop - 58);
    else focusedRow.current = key;
  }
  useLayoutEffect(() => {
    if (focusedRow.current) {
      const key = focusedRow.current;
      focusedRow.current = undefined;
      focusRow(key);
    }
  });

  function tour(id?: string) {
    setActiveCommission(id);
    setFilter(undefined);
    if (id) {
      setExpanded(new Set([id]));
      focusRow(id);
    } else {
      setExpanded(new Set());
      scroller.current?.scrollTo(0, 0);
    }
  }
  function pickTask(task: Task) {
    setSelectedDecision(undefined);
    setFilter(undefined);
    setExpanded((current) => new Set([...current, task.commissionId]));
    setSelected(task.id);
    focusRow(task.id);
    const day = calendarDay(task.due) ?? calendarDay(task.completedAt);
    if (day !== null) scroller.current!.scrollLeft = position(day) - viewport / 2;
  }
  function pickDecision(decision: Decision) {
    setSelected(undefined);
    setSelectedDecision(decision.id);
    const day = calendarDay(decision.target);
    if (day !== null) {
      focusRow(decision.id);
      scroller.current!.scrollLeft = position(day) - viewport / 2;
    }
  }
  function decisionRows(commissionId: string | null) {
    return (meetings.data?.decisions ?? [])
      .filter((d) => d.commissionId === commissionId && d.target && !d.resolvedAt)
      .flatMap((d) => [
        <div className="pm-label pm-plan-label" key={'label-' + d.id} data-pm-row={d.id}>
          <button aria-pressed={selectedDecision === d.id} onClick={() => pickDecision(d)}>
            <span>
              <strong>{d.title}</strong>
              <small>Decisión pendiente</small>
            </span>
          </button>
        </div>,
        <div className="pm-track pm-plan-track" key={d.id}>
          <button
            className="pm-decision-point"
            style={{ left: position(calendarDay(d.target)!) }}
            title={formatDay(calendarDay(d.target))}
            aria-label={d.title + ', decisión pendiente'}
            onClick={() => pickDecision(d)}
          >
            ?
          </button>
        </div>,
      ]);
  }
  const related =
    plan?.dependencies.filter((edge) => edge.sourceId === task?.id || edge.targetId === task?.id) ??
    [];
  const milestoneRows = (commissionId: string | null) =>
    (plan?.milestones ?? [])
      .filter((milestone) => milestone.commissionId === commissionId)
      .flatMap((milestone) => [
        <div
          className="pm-label pm-plan-label"
          key={'label-' + milestone.id}
          data-pm-row={milestone.id}
          title={milestone.description}
        >
          <strong>{milestone.name}</strong>
          <small>Hito · {milestone.achieved ? 'Cumplido' : 'Pendiente'}</small>
        </div>,
        <div className="pm-track pm-plan-track" key={milestone.id}>
          <span
            className="pm-diamond"
            title={'Previsto · ' + formatDay(calendarDay(milestone.planned))}
            style={{ left: position(calendarDay(milestone.planned)!) }}
          />
          {milestone.achieved && (
            <span
              className="pm-diamond achieved"
              title={'Cumplido · ' + formatDay(calendarDay(milestone.achieved))}
              style={{ left: position(calendarDay(milestone.achieved)!) }}
            />
          )}
        </div>,
      ]);

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
    const dates =
      due === done && done !== null
        ? [{ day: done, label: 'Vencimiento y finalización', solid: true }]
        : [
            { day: due, label: 'Vencimiento', solid: false },
            { day: done, label: 'Finalización', solid: true },
          ];
    return dates.map(
      ({ day, label, solid }) =>
        day !== null && (
          <button
            key={label}
            className={`pm-mark ${t.status} ${solid ? 'solid' : ''}`}
            style={{ left: position(day) }}
            title={`${t.title} · ${label} · ${formatDay(day)}`}
            aria-label={`${t.title}, ${labels[t.status]}, ${label}, ${formatDay(day)}`}
            aria-pressed={selected === t.id}
            onClick={() => {
              setSelectedDecision(undefined);
              setSelected(t.id);
            }}
          />
        ),
    );
  }

  return (
    <section className="project-map" ref={mapRef} aria-label="Mapa temporal del proyecto">
      <header className="pm-header">
        <div>
          <h2>{presentation ? project.name : 'Mapa del proyecto'}</h2>
          <p>
            {formatDay(calendarDay(project.starts))} – {formatDay(calendarDay(project.ends))}
          </p>
        </div>
        <div className="pm-controls" role="group" aria-label="Navegación temporal">
          <button
            ref={meetingButton}
            onClick={async () => {
              try {
                if (presentation) await document.exitFullscreen();
                else await mapRef.current!.requestFullscreen();
                setPresentationError('');
              } catch {
                setPresentationError('El navegador no ha podido cambiar a pantalla completa.');
              }
            }}
          >
            {presentation ? 'Salir del modo reunión' : 'Modo reunión'}
          </button>
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
      {presentationError && (
        <p className="pm-empty" role="alert">
          {presentationError}
        </p>
      )}
      {presentation && (
        <div className="pm-tour pm-controls" role="group" aria-label="Recorrido por comisiones">
          <button onClick={() => tour()} disabled={!activeCommission}>
            Todas las comisiones
          </button>
          <button
            onClick={() => tour(lanes[laneIndex - 1]?.commission.id)}
            disabled={laneIndex < 1}
          >
            Anterior
          </button>
          <label>
            Comisión{' '}
            <select
              value={activeCommission ?? ''}
              onChange={(event) => tour(event.target.value || undefined)}
            >
              <option value="">Proyecto completo</option>
              {lanes.map(({ commission }) => (
                <option key={commission.id} value={commission.id}>
                  {commission.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => tour(lanes[laneIndex + 1]?.commission.id)}
            disabled={laneIndex + 1 >= lanes.length}
          >
            Siguiente
          </button>
        </div>
      )}
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
            <i className={`pm-dot ${state}`} /> {counts[state]} {stateNames[state]}
          </button>
        ))}
        {plan && (
          <button
            onClick={() => {
              const next = plan.milestones.find(
                (m) => !m.achieved && calendarDay(m.planned)! >= today,
              );
              if (next) {
                focusRow(next.id);
                scroller.current!.scrollLeft = position(calendarDay(next.planned)!) - viewport / 2;
              }
            }}
            disabled={!plan.milestones.some((m) => !m.achieved && calendarDay(m.planned)! >= today)}
          >
            {plan.milestones.filter((m) => !m.achieved && calendarDay(m.planned)! >= today).length}{' '}
            próximos hitos
          </button>
        )}
        {meetings.data && (
          <button
            onClick={() => {
              const next = meetings.data?.decisions.find((d) => !d.resolvedAt);
              if (next) pickDecision(next);
            }}
            disabled={!meetings.data.decisions.some((d) => !d.resolvedAt)}
          >
            {meetings.data.decisions.filter((d) => !d.resolvedAt).length} decisiones pendientes
          </button>
        )}
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
          {(plan?.phases ?? []).flatMap((phase) => [
            <div
              className="pm-label pm-plan-label"
              key={'label-' + phase.id}
              title={phase.description}
            >
              <strong>{phase.name}</strong>
              <small>Fase</small>
            </div>,
            <div className="pm-track pm-plan-track" key={phase.id}>
              <div
                className="pm-phase"
                style={{
                  left: position(calendarDay(phase.starts)!),
                  width: Math.max(
                    3,
                    position(calendarDay(phase.ends)! + 1) - position(calendarDay(phase.starts)!),
                  ),
                }}
                title={
                  formatDay(calendarDay(phase.starts)) + ' – ' + formatDay(calendarDay(phase.ends))
                }
              />
            </div>,
          ])}
          {milestoneRows(null)}
          {decisionRows(null)}
          {lanes.flatMap(({ commission, tasks: list }) => {
            const open = expanded.has(commission.id);
            const visible = filter ? list.filter((t) => t.status === filter) : list;
            const marksByPixel = new Map<number, { day: number; status: string }>();
            const priority = ['pending', 'done', 'in_progress', 'blocked'];
            for (const t of visible) {
              const { due, done } = timestamps.get(t.id)!;
              for (const day of [due, done]) {
                if (day === null) continue;
                const bucket = Math.round(position(day) / 10);
                const previous = marksByPixel.get(bucket);
                if (!previous || priority.indexOf(t.status) > priority.indexOf(previous.status))
                  marksByPixel.set(bucket, { day, status: t.status });
              }
            }
            return [
              <div
                className="pm-label pm-commission"
                data-pm-row={commission.id}
                data-active={activeCommission === commission.id}
                key={`label-${commission.id}`}
              >
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
              <div
                className="pm-track pm-lane"
                data-active={activeCommission === commission.id}
                key={`lane-${commission.id}`}
              >
                <i className="pm-baseline" />
                {[...marksByPixel].map(([bucket, { day, status }]) => (
                  <i
                    key={bucket}
                    aria-hidden="true"
                    className={`pm-dot pm-summary-dot ${status}`}
                    style={{ left: position(day) }}
                  />
                ))}
              </div>,
              ...milestoneRows(commission.id),
              ...decisionRows(commission.id),
              ...(open
                ? visible.flatMap((t) => [
                    <div className="pm-label pm-task" data-pm-row={t.id} key={`task-${t.id}`}>
                      <button
                        aria-pressed={selected === t.id}
                        onClick={() => {
                          setSelectedDecision(undefined);
                          setSelected(t.id);
                        }}
                      >
                        <i className={`pm-dot ${t.status}`} />
                        <span>
                          <strong>{t.title}</strong>
                          <small>{owners.get(t.id)?.join(', ') || 'Sin responsable visible'}</small>
                        </span>
                      </button>
                    </div>,
                    <div className="pm-track pm-task-track" key={`track-${t.id}`}>
                      {selected === t.id &&
                        related.map(({ sourceId, targetId }) => {
                          const source = tasks.get(sourceId);
                          const target = tasks.get(targetId);
                          const from = calendarDay(source?.due) ?? calendarDay(source?.completedAt);
                          const to = calendarDay(target?.due) ?? calendarDay(target?.completedAt);
                          if (from === null || to === null || from === to) return null;
                          const x = position(from),
                            y = position(to);
                          const sign = Math.sign(y - x);
                          return (
                            <svg
                              key={sourceId + ':' + targetId}
                              className={source?.status === 'done' ? 'pm-edge met' : 'pm-edge'}
                              width={track}
                              height={36}
                              aria-hidden="true"
                            >
                              <path
                                d={`M ${x} 18 V 8 H ${y} V 18 M ${y - sign * 4} 4 L ${y} 8 L ${y - sign * 4} 12`}
                              />
                            </svg>
                          );
                        })}
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
        <span>
          <i className="pm-dot pending" /> Vencimiento
        </span>
        <span>
          <i className="pm-dot done" /> Finalización registrada
        </span>
        <span>Hoy · {formatDay(today)}</span>
        {!!plan?.milestones.length && (
          <span>
            <i className="pm-key-diamond" /> Hito previsto ·{' '}
            <i className="pm-key-diamond achieved" /> Hito cumplido
          </span>
        )}
        {!!meetings.data?.decisions.some((d) => !d.resolvedAt && d.target) && (
          <span>
            <strong className="pm-key-question">?</strong> Decisión pendiente
          </span>
        )}
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
            {related.length > 0 && (
              <ul className="pm-relations" aria-label="Dependencias">
                {related.map((edge) => {
                  const source = tasks.get(edge.sourceId);
                  const incoming = edge.targetId === task.id;
                  const other = tasks.get(incoming ? edge.sourceId : edge.targetId);
                  if (!other) return null;
                  return (
                    <li key={other.id + String(incoming)}>
                      {incoming ? 'Requiere' : 'Condiciona'} ·{' '}
                      <button
                        onClick={() => {
                          pickTask(other);
                        }}
                      >
                        {other.title}
                      </button>{' '}
                      · {source?.status === 'done' ? 'Cumplida' : 'Por cumplir'}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="pm-controls">
            <button
              onClick={async () => {
                if (presentation) await document.exitFullscreen();
                openTask(task);
              }}
            >
              Abrir ficha
            </button>
            <button onClick={() => setSelected(undefined)}>Cerrar detalle</button>
          </div>
        </aside>
      )}
      {planning.error && (
        <p className="pm-empty" role="status">
          Planificación no disponible. {planning.error}
        </p>
      )}
      {!presentation && plan?.canManage && project.archived !== 'true' && (
        <PlanningEditor
          plan={plan}
          commissions={lanes.map((lane) => lane.commission)}
          tasks={[...tasks.values()]}
          save={planning.save}
        />
      )}
      {decision && (
        <aside className="pm-detail" aria-label="Detalle de decisión">
          <div>
            <p>
              {decision.resolvedAt ? 'Decisión resuelta' : 'Decisión pendiente'} ·{' '}
              {decision.commissionId
                ? lanes.find((lane) => lane.commission.id === decision.commissionId)?.commission
                    .name
                : 'Proyecto'}
            </p>
            <h3>{decision.title}</h3>
            {decision.description && <p>{decision.description}</p>}
            <p>Fecha objetivo · {formatDay(calendarDay(decision.target))}</p>
            <p>
              Autor ·{' '}
              {data.users.find((u) => u.id === decision.authorId)?.name ?? 'Autor registrado'} ·{' '}
              {formatDay(calendarDay(decision.createdAt))}
            </p>
            {decision.ownerId && (
              <p>
                Responsable ·{' '}
                {data.users.find((u) => u.id === decision.ownerId)?.name ??
                  'Responsable registrado'}
              </p>
            )}
            {decision.resolution && (
              <p>
                Resolución · {decision.resolution} · {formatDay(calendarDay(decision.resolvedAt))}
              </p>
            )}
            {meetings.data?.followups
              .filter((f) => f.decisionId === decision.id)
              .map((f) => {
                const followup = tasks.get(f.taskId);
                return (
                  followup && (
                    <p key={f.taskId}>
                      Seguimiento ·{' '}
                      <button onClick={() => pickTask(followup)}>{followup.title}</button>
                    </p>
                  )
                );
              })}
          </div>
          <div className="pm-controls">
            <button onClick={() => setSelectedDecision(undefined)}>Cerrar decisión</button>
          </div>
        </aside>
      )}
      {meetings.error && (
        <p className="pm-empty" role="status">
          Agenda no disponible. {meetings.error}
        </p>
      )}
      {meetings.data && (
        <ProjectMeetings
          model={meetings.data}
          data={data}
          projectId={project.id}
          activeCommission={activeCommission}
          archived={project.archived === 'true'}
          fullscreen={presentation}
          commissions={lanes.map((lane) => lane.commission)}
          tasks={[...tasks.values()]}
          today={today}
          milestones={plan?.milestones ?? []}
          save={meetings.save}
          pickTask={pickTask}
          pickDecision={pickDecision}
          pickMilestone={(id, date) => {
            focusRow(id);
            scroller.current!.scrollLeft = position(calendarDay(date)!) - viewport / 2;
          }}
        />
      )}
    </section>
  );
}
