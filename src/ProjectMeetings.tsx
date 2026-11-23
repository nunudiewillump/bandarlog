import { deadlineISO } from './deadline';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import type { Commission, Data, Task } from './types';
import { calendarDay, formatDay } from './project-timeline';

type Editable = { id: string; title: string; revision: number; authorId: string };
export type Decision = Editable & {
  description: string;
  target: string | null;
  commissionId: string | null;
  ownerId: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
};
type Minutes = Editable & {
  heldOn: string;
  agenda: string;
  notes: string;
  closedAt: string | null;
  updatedAt: string;
  decisionIds: string[];
  taskIds: string[];
  closedReferences: {
    decisions: { title: string; resolution: string | null }[];
    tasks: { title: string }[];
  } | null;
};
type Meeting = {
  decisions: Decision[];
  minutes: Minutes[];
  followups: { decisionId: string; taskId: string }[];
  canManage: boolean;
};
type Editor =
  | { kind: 'decision'; row?: Decision }
  | { kind: 'minutes'; row?: Minutes }
  | { kind: 'followup'; decision: Decision };

export function useProjectMeetings(id: string, snapshot: object, refresh: () => Promise<unknown>) {
  const path = `/projects/${encodeURIComponent(id)}/meetings`;
  const [data, setData] = useState<Meeting>();
  const [error, setError] = useState('');
  const [revision, reload] = useState(0);
  useEffect(() => {
    let current = true;
    void api(path).then(
      (response: Meeting) => {
        if (current && Array.isArray(response.decisions)) {
          setData(response);
          setError('');
        }
      },
      (error: Error) => {
        if (current) setError(error.message);
      },
    );
    return () => {
      current = false;
    };
  }, [path, snapshot, revision]);
  return {
    data,
    error,
    save: async (body: { kind: string }) => {
      try {
        await api(path, 'POST', body);
        if (body.kind === 'followup') await refresh();
      } finally {
        reload((value) => value + 1);
      }
    },
  };
}

export function ProjectMeetings({
  model,
  data,
  projectId,
  activeCommission,
  archived,
  fullscreen,
  commissions,
  tasks,
  today,
  milestones,
  save,
  pickTask,
  pickDecision,
  pickMilestone,
}: {
  model: Meeting;
  data: Data;
  projectId: string;
  activeCommission?: string;
  archived: boolean;
  fullscreen: boolean;
  commissions: Commission[];
  tasks: Task[];
  today: number;
  milestones: {
    id: string;
    name: string;
    planned: string;
    achieved: string | null;
    commissionId: string | null;
  }[];
  save: (input: { kind: string }) => Promise<void>;
  pickTask: (task: Task) => void;
  pickDecision: (decision: Decision) => void;
  pickMilestone: (id: string, date: string) => void;
}) {
  const [editor, setEditor] = useState<Editor>();
  const [view, setView] = useState<Minutes>();
  const [commissionId, setCommission] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const writable = model.canManage && !archived;
  const visible = (cid: string | null) => !activeCommission || !cid || cid === activeCommission;
  const pending = model.decisions.filter((d) => !d.resolvedAt && visible(d.commissionId));
  const scopedTasks = tasks.filter((t) => visible(t.commissionId));
  const byDeadline = (a: Task, b: Task) => (a.due ?? '').localeCompare(b.due ?? '');
  const blocked = scopedTasks.filter((t) => t.status === 'blocked').sort(byDeadline);
  const overdue = scopedTasks
    .filter((t) => t.status !== 'done' && (calendarDay(t.due) ?? today) < today)
    .sort(byDeadline);
  const next = milestones.filter(
    (m) => !m.achieved && visible(m.commissionId) && (calendarDay(m.planned) ?? 0) >= today,
  );
  const commitments = new Set([
    ...model.followups.map((f) => f.taskId),
    ...model.minutes.filter((m) => m.closedAt).flatMap((m) => m.taskIds),
  ]);
  const open = scopedTasks
    .filter((t) => commitments.has(t.id) && t.status !== 'done')
    .sort(byDeadline);
  const names = new Map(data.users.map((u) => [u.id, u.name]));
  const row = editor && 'row' in editor ? editor.row : undefined;
  const newEditor = (value: Editor) => {
    setError('');
    setView(undefined);
    setEditor(value);
    setCommission(
      value.kind === 'decision'
        ? (value.row?.commissionId ?? activeCommission ?? '')
        : value.kind === 'followup'
          ? (value.decision.commissionId ?? activeCommission ?? '')
          : '',
    );
  };
  const memberIds = new Set(
    commissionId
      ? data.members.filter((m) => m.commissionId === commissionId).map((m) => m.userId)
      : [
          ...data.members
            .filter((m) => commissions.some((c) => c.id === m.commissionId))
            .map((m) => m.userId),
          ...data.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId),
        ],
  );
  const people = data.users.filter((u) => !u.disabledAt && memberIds.has(u.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy || !writable) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const common = { kind: editor.kind, ...(row && { id: row.id, revision: row.revision }) };
    const body =
      editor.kind === 'decision'
        ? {
            ...values,
            ...common,
            commissionId: commissionId || null,
            ownerId: values.ownerId || null,
            target: values.target || null,
            resolution: values.resolution || null,
          }
        : editor.kind === 'minutes'
          ? {
              ...values,
              ...common,
              decisionIds: form.getAll('decisionIds'),
              taskIds: form.getAll('taskIds'),
              close:
                (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'close',
            }
          : {
              ...common,
              decisionId: editor.decision.id,
              task: {
                title: values.title,
                description: values.description,
                commissionId,
                due: deadlineISO(String(values.due)),
                responsibleIds: form.getAll('responsibleIds'),
              },
            };
    setBusy(true);
    setError('');
    try {
      await save(body);
      setEditor(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const taskList = (title: string, items: Task[]) => (
    <details open={fullscreen && items.length > 0}>
      <summary>
        {title} ({items.length})
      </summary>
      {items.length > 0 && (
        <ul>
          {items.map((task) => (
            <li key={task.id}>
              <button onClick={() => pickTask(task)}>{task.title}</button>
              <small>
                {' '}
                · {formatDay(calendarDay(task.due))}
                {task.blockedReason ? ' · ' + task.blockedReason : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
  const decision = editor?.kind === 'decision' ? editor.row : undefined;
  const minutes = editor?.kind === 'minutes' ? editor.row : undefined;
  return (
    <section className="pm-meetings" aria-label="Agenda y actas">
      <div className="pm-header">
        <h3>Agenda del kraal</h3>
        {writable && (
          <div className="pm-controls">
            <button onClick={() => newEditor({ kind: 'decision' })}>Registrar decisión</button>
            <button onClick={() => newEditor({ kind: 'minutes' })}>Nueva acta</button>
          </div>
        )}
      </div>
      <div className="pm-agenda">
        <section>
          <h4>Registrado por coordinación</h4>
          <details open={fullscreen && pending.length > 0}>
            <summary>Decisiones pendientes ({pending.length})</summary>
            <ul>
              {pending.map((d) => (
                <li key={d.id}>
                  <button onClick={() => pickDecision(d)}>{d.title}</button>
                  {d.target && <small> · {formatDay(calendarDay(d.target))}</small>}
                </li>
              ))}
            </ul>
          </details>
        </section>
        <section>
          <h4>Detectado en el proyecto</h4>
          {taskList('Bloqueos', blocked)}
          {taskList('Tareas vencidas', overdue)}
          {taskList('Compromisos pendientes', open)}
          <details open={fullscreen && next.length > 0}>
            <summary>Próximos hitos ({next.length})</summary>
            <ul>
              {next.map((m) => (
                <li key={m.id}>
                  <button onClick={() => pickMilestone(m.id, m.planned)}>{m.name}</button> ·{' '}
                  {formatDay(calendarDay(m.planned))}
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>
      {editor && (
        <form className="pm-form pm-meeting-form" key={row?.id ?? editor.kind} onSubmit={submit}>
          <label>
            {editor.kind === 'decision' ? 'Cuestión' : 'Título'}
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={row?.title ?? (editor.kind === 'followup' ? editor.decision.title : '')}
            />
          </label>
          {editor.kind !== 'minutes' && (
            <>
              <label>
                Descripción
                <textarea
                  name="description"
                  maxLength={3000}
                  defaultValue={decision?.description}
                />
              </label>
              <label>
                Comisión
                <select
                  aria-label="Comisión"
                  value={commissionId}
                  onChange={(event) => setCommission(event.target.value)}
                  required={editor.kind === 'followup'}
                >
                  <option value="">
                    {editor.kind === 'followup' ? 'Seleccionar' : 'Todo el proyecto'}
                  </option>
                  {commissions
                    .filter(
                      (c) =>
                        editor.kind !== 'followup' ||
                        !editor.decision.commissionId ||
                        c.id === editor.decision.commissionId,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {editor.kind === 'decision' && (
            <>
              <label>
                Responsable
                <select
                  key={commissionId}
                  name="ownerId"
                  defaultValue={
                    commissionId === (decision?.commissionId ?? '') ? (decision?.ownerId ?? '') : ''
                  }
                >
                  <option value="">Sin responsable</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha objetivo
                <input name="target" type="date" defaultValue={decision?.target ?? ''} />
              </label>
              <label>
                Resolución
                <textarea
                  name="resolution"
                  maxLength={3000}
                  readOnly={!!decision?.resolvedAt}
                  defaultValue={decision?.resolution ?? ''}
                />
              </label>
            </>
          )}
          {editor.kind === 'minutes' && (
            <>
              <label>
                Fecha de reunión
                <input name="heldOn" type="date" required defaultValue={minutes?.heldOn} />
              </label>
              <label>
                Orden del día
                <textarea name="agenda" maxLength={12000} defaultValue={minutes?.agenda} />
              </label>
              <label>
                Notas
                <textarea name="notes" maxLength={20000} defaultValue={minutes?.notes} />
              </label>
              <label>
                Decisiones relacionadas
                <select
                  aria-label="Decisiones relacionadas"
                  name="decisionIds"
                  multiple
                  defaultValue={minutes?.decisionIds}
                >
                  {model.decisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tareas de seguimiento
                <select
                  aria-label="Tareas de seguimiento"
                  name="taskIds"
                  multiple
                  defaultValue={minutes?.taskIds}
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.kind === 'followup' && (
            <>
              <label>
                Fecha límite
                <input name="due" type="date" required />
              </label>
              <label>
                Responsables
                <select
                  aria-label="Responsables"
                  key={commissionId}
                  name="responsibleIds"
                  multiple
                  required
                >
                  {(commissionId ? people : []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="pm-controls">
            <button disabled={busy} type="submit">
              {editor.kind === 'minutes' ? 'Guardar borrador' : 'Guardar'}
            </button>
            {editor.kind === 'minutes' && (
              <button disabled={busy} type="submit" value="close">
                Cerrar acta
              </button>
            )}
            <button disabled={busy} type="button" onClick={() => setEditor(undefined)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="pm-empty" role="alert">
          {error}
        </p>
      )}
      <details className="pm-meeting-history">
        <summary>Historial de decisiones ({model.decisions.length})</summary>
        <ul>
          {model.decisions.map((d) => (
            <li key={d.id}>
              <button onClick={() => pickDecision(d)}>{d.title}</button> ·{' '}
              {d.resolvedAt ? 'Resuelta' : 'Pendiente'}
              {writable && (
                <div className="pm-controls">
                  <button onClick={() => newEditor({ kind: 'decision', row: d })}>
                    Editar decisión
                  </button>
                  <button onClick={() => newEditor({ kind: 'followup', decision: d })}>
                    Crear tarea de seguimiento
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
      {model.canManage && (
        <details className="pm-meeting-history">
          <summary>Actas ({model.minutes.length})</summary>
          <ul>
            {model.minutes.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => {
                    setView(m);
                    setEditor(undefined);
                  }}
                >
                  {m.title}
                </button>{' '}
                · {formatDay(calendarDay(m.heldOn))} · {m.closedAt ? 'Cerrada' : 'Borrador'}
                {writable && !m.closedAt && (
                  <button onClick={() => newEditor({ kind: 'minutes', row: m })}>
                    Editar borrador
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {view && (
        <article className="pm-minute-view" aria-label="Acta de reunión">
          <h4>{view.title}</h4>
          <p>
            {formatDay(calendarDay(view.heldOn))} · {names.get(view.authorId) || 'Autor registrado'}{' '}
            · {view.closedAt ? 'Cerrada' : 'Borrador'}
          </p>
          <p>Última modificación · {formatDay(calendarDay(view.updatedAt))}</p>
          <h5>Orden del día</h5>
          <p>{view.agenda || 'Sin asuntos registrados'}</p>
          <h5>Notas</h5>
          <p>{view.notes || 'Sin notas'}</p>
          <h5>Decisiones</h5>
          <ul>
            {(
              view.closedReferences?.decisions ??
              model.decisions.filter((d) => view.decisionIds.includes(d.id))
            ).map((d, i) => (
              <li key={i}>
                {d.title}
                {d.resolution && ' · ' + d.resolution}
              </li>
            ))}
          </ul>
          <h5>Tareas de seguimiento</h5>
          <ul>
            {(view.closedReferences?.tasks ?? tasks.filter((t) => view.taskIds.includes(t.id))).map(
              (t, i) => (
                <li key={i}>{t.title}</li>
              ),
            )}
          </ul>
          <button onClick={() => setView(undefined)}>Cerrar consulta</button>
        </article>
      )}
    </section>
  );
}
