import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from './api';
import { deadlineDay, deadlineISO } from './deadline';
import type { Task, User } from './types';
type Draft = {
  base: Task;
  title: string;
  description: string;
  due: string;
  responsibleIds: string[];
  originalIds: string[];
};
export function TaskEditor({
  task,
  members,
  responsibleIds,
  busy,
  run,
}: {
  task: Task;
  members: User[];
  responsibleIds: string[];
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  function close() {
    if (details.current) {
      details.current.open = false;
      details.current.querySelector('summary')?.focus();
    }
    setDraft(null);
    setError('');
  }
  const changes: Record<string, unknown> = {};
  if (draft) {
    if (draft.title !== draft.base.title) changes.title = draft.title.trim();
    if (draft.description !== draft.base.description)
      changes.description = draft.description.trim();
    if (draft.due && draft.due !== deadlineDay(draft.base.due))
      changes.due = deadlineISO(draft.due);
    if ([...draft.responsibleIds].sort().join(',') !== [...draft.originalIds].sort().join(','))
      changes.responsibleIds = draft.responsibleIds;
  }
  return (
    <details
      className="reassign"
      ref={details}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setDraft(
            (current) =>
              current || {
                base: task,
                title: task.title,
                description: task.description,
                due: deadlineDay(task.due),
                responsibleIds: [...responsibleIds],
                originalIds: [...responsibleIds],
              },
          );
        } else {
          setDraft(null);
          setError('');
        }
      }}
    >
      <summary>
        <Pencil size={18} aria-hidden="true" />
        <span>Editar tarea</span>
      </summary>
      {draft && (
        <form
          className="task-edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            if (!draft.title.trim() || !draft.responsibleIds.length || !Object.keys(changes).length)
              return;
            if (
              await run(async () => {
                try {
                  await api(`/tasks/${task.id}`, 'PATCH', {
                    ...changes,
                    expectedUpdatedAt: draft.base.updatedAt,
                  });
                } catch (e) {
                  setError((e as Error).message);
                  throw e;
                }
              }, 'Tarea actualizada')
            )
              close();
          }}
        >
          <label>
            Título
            <input
              name="title"
              disabled={busy}
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Descripción
            <textarea
              aria-label="Descripción"
              name="description"
              disabled={busy}
              maxLength={5000}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label>
            Fecha límite
            <input
              name="due"
              disabled={busy}
              type="date"
              required
              value={draft.due}
              onChange={(e) => setDraft({ ...draft, due: e.target.value })}
            />
          </label>
          <fieldset disabled={busy}>
            <legend>Responsables · al menos uno</legend>
            {members.map((user) => (
              <label className="checkbox-line" key={user.id}>
                <input
                  type="checkbox"
                  name="responsibleIds"
                  value={user.id}
                  checked={draft.responsibleIds.includes(user.id)}
                  disabled={Boolean(user.disabledAt) && !draft.responsibleIds.includes(user.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      responsibleIds: e.target.checked
                        ? [...draft.responsibleIds, user.id]
                        : draft.responsibleIds.filter((id) => id !== user.id),
                    })
                  }
                />
                {user.name}
                {user.disabledAt && ' (sin acceso)'}
              </label>
            ))}
          </fieldset>
          {!draft.responsibleIds.length && (
            <p className="hint">Selecciona al menos una persona responsable.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="task-edit-actions">
            <button
              className="primary"
              disabled={
                busy ||
                !draft.title.trim() ||
                !draft.due ||
                !draft.responsibleIds.length ||
                !Object.keys(changes).length
              }
            >
              Guardar cambios
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={close}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </details>
  );
}
