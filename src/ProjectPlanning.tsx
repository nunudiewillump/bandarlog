import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import type { Commission, Task } from './types';

type PlanRow = { id: string; name: string; description: string; revision: number };
type Phase = PlanRow & { starts: string; ends: string; position: number };
type Milestone = PlanRow & {
  planned: string;
  achieved: string | null;
  commissionId: string | null;
};
export type Planning = {
  phases: Phase[];
  milestones: Milestone[];
  dependencies: { sourceId: string; targetId: string }[];
  canManage: boolean;
};
type Editor =
  { kind: 'phase'; row?: Phase } | { kind: 'milestone'; row?: Milestone } | { kind: 'dependency' };

export function useProjectPlanning(id: string, snapshot: object) {
  const path = `/projects/${encodeURIComponent(id)}/planning`;
  const [data, setData] = useState<Planning>();
  const [error, setError] = useState('');
  const [revision, reload] = useState(0);
  useEffect(() => {
    let current = true;
    void api(path).then(
      (response: Planning) => {
        if (current) {
          if (Array.isArray(response.phases)) setData(response);
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
    save: async (body: object) => {
      try {
        await api(path, 'POST', body);
      } finally {
        reload((value) => value + 1);
      }
    },
  };
}

export function PlanningEditor({
  plan,
  commissions,
  tasks,
  save,
}: {
  plan: Planning;
  commissions: Commission[];
  tasks: Task[];
  save: (input: object) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const row = editor && 'row' in editor ? editor.row : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    setBusy(true);
    try {
      await save({
        kind: editor.kind,
        ...values,
        ...(row && { id: row.id, revision: row.revision }),
        ...(editor.kind === 'phase' && { position: Number(values.position) }),
        ...(editor.kind === 'milestone' && {
          achieved: values.achieved || null,
          commissionId: values.commissionId || null,
        }),
      });
      setEditor(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(next: Editor) {
    setEditor(next);
    setError('');
  }
  const taskNames = new Map(tasks.map((t) => [t.id, t.title]));
  return (
    <details className="pm-planning">
      <summary>Gestionar planificación</summary>
      <div className="pm-controls">
        <button onClick={() => edit({ kind: 'phase' })}>Nueva fase</button>
        <button onClick={() => edit({ kind: 'milestone' })}>Nuevo hito</button>
        <button onClick={() => edit({ kind: 'dependency' })} disabled={tasks.length < 2}>
          Nueva dependencia
        </button>
      </div>
      <ul>
        {plan.phases.map((row) => (
          <li key={row.id}>
            <button onClick={() => edit({ kind: 'phase', row })}>Editar fase · {row.name}</button>
          </li>
        ))}
        {plan.milestones.map((row) => (
          <li key={row.id}>
            <button onClick={() => edit({ kind: 'milestone', row })}>
              Editar hito · {row.name}
            </button>
          </li>
        ))}
        {plan.dependencies.map((d) => (
          <li key={`${d.sourceId}:${d.targetId}`}>
            {taskNames.get(d.sourceId)} → {taskNames.get(d.targetId)}{' '}
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await save({ kind: 'dependency', ...d, remove: true });
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Quitar dependencia
            </button>
          </li>
        ))}
      </ul>
      {editor && (
        <form className="pm-form" key={row?.id ?? editor.kind} onSubmit={submit}>
          {editor.kind !== 'dependency' && (
            <>
              <label>
                Nombre
                <input name="name" required maxLength={200} defaultValue={row?.name} />
              </label>
              <label>
                Descripción
                <textarea name="description" maxLength={3000} defaultValue={row?.description} />
              </label>
            </>
          )}
          {editor.kind === 'phase' && (
            <>
              <label>
                Inicio
                <input name="starts" type="date" required defaultValue={editor.row?.starts} />
              </label>
              <label>
                Fin
                <input name="ends" type="date" required defaultValue={editor.row?.ends} />
              </label>
              <label>
                Orden
                <input
                  name="position"
                  type="number"
                  min={0}
                  max={10000}
                  required
                  defaultValue={editor.row?.position ?? plan.phases.length}
                />
              </label>
            </>
          )}
          {editor.kind === 'milestone' && (
            <>
              <label>
                Fecha prevista
                <input name="planned" type="date" required defaultValue={editor.row?.planned} />
              </label>
              <label>
                Fecha real de cumplimiento
                <input name="achieved" type="date" defaultValue={editor.row?.achieved ?? ''} />
              </label>
              <label>
                Comisión
                <select name="commissionId" defaultValue={editor.row?.commissionId ?? ''}>
                  <option value="">Todo el proyecto</option>
                  {commissions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.kind === 'dependency' && (
            <>
              <label>
                Tarea previa
                <select name="sourceId" required defaultValue="">
                  <option value="">Seleccionar</option>
                  {tasks.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tarea que depende de la anterior
                <select name="targetId" required defaultValue="">
                  <option value="">Seleccionar</option>
                  {tasks.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="pm-controls">
            <button disabled={busy} type="submit">
              Guardar
            </button>
            <button disabled={busy} type="button" onClick={() => setEditor(undefined)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
