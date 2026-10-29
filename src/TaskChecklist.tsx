import { useRef, useState } from 'react';
import { Check, Circle, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from './api';
import type { Task } from './types';
import type { ChecklistChange } from '../server/task-checklist';
import './task-details.css';
export function TaskChecklist({
  task,
  canManage,
  canAct,
  busy,
  run,
}: {
  task: Task;
  canManage: boolean;
  canAct: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
}) {
  const items = task.checklist || [];
  const [draft, setDraft] = useState<{
      id: string;
      title: string;
      version: string;
      adding: boolean;
    } | null>(null),
    [error, setError] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  async function save(change: ChecklistChange, version = task.updatedAt) {
    setError('');
    return run(async () => {
      try {
        await api(`/tasks/${task.id}`, 'PATCH', {
          checklistChange: change,
          expectedUpdatedAt: version,
        });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    }, { add: 'Paso añadido', edit: 'Paso actualizado', remove: 'Paso eliminado', toggle: '' }[change.action]);
  }
  function cancel() {
    setDraft(null);
    setError('');
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function editor() {
    if (!draft || !canManage) return null;
    return (
      <form
        className="checklist-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.title.trim()) return;
          if (
            await save(
              { action: draft.adding ? 'add' : 'edit', id: draft.id, title: draft.title.trim() },
              draft.version,
            )
          )
            cancel();
        }}
      >
        <label className="sr-only" htmlFor={`step-${task.id}`}>
          {draft.adding ? 'Nuevo paso' : 'Texto del paso'}
        </label>
        <input
          id={`step-${task.id}`}
          autoFocus
          disabled={busy}
          required
          maxLength={240}
          value={draft.title}
          placeholder="¿Qué hay que hacer?"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <button
          className="icon-button"
          aria-label={draft.adding ? 'Guardar paso' : 'Guardar texto del paso'}
          disabled={busy || !draft.title.trim()}
        >
          <Check size={19} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancelar edición del paso"
          disabled={busy}
          onClick={cancel}
        >
          <X size={19} />
        </button>
      </form>
    );
  }
  if (!items.length && !canManage) return null;
  return (
    <section className="task-checklist" aria-label="Pasos de la tarea">
      {(items.length > 0 || draft) && (
        <>
          <div className="checklist-heading">
            <h3>Pasos</h3>
            <span>
              {items.filter((item) => item.done).length}/{items.length}
            </span>
          </div>
          <p className="hint">Opcional · no impide completar la tarea.</p>
        </>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {canAct ? (
                <label className="checklist-step">
                  <input
                    type="checkbox"
                    aria-label={`Completar paso: ${item.title}`}
                    checked={item.done}
                    disabled={busy}
                    onChange={(event) =>
                      void save({ action: 'toggle', id: item.id, done: event.target.checked })
                    }
                  />
                  <span className={item.done ? 'step-done' : ''}>{item.title}</span>
                </label>
              ) : (
                <span className="checklist-step">
                  {item.done ? (
                    <Check size={18} aria-label="Paso completado" />
                  ) : (
                    <Circle size={18} aria-label="Paso pendiente" />
                  )}
                  <span className={item.done ? 'step-done' : ''}>{item.title}</span>
                </span>
              )}
              {canManage && !draft && (
                <details className="checklist-options">
                  <summary aria-label={`Acciones del paso: ${item.title}`}>
                    <MoreHorizontal size={19} />
                  </summary>
                  <div>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy}
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        setDraft({
                          id: item.id,
                          title: item.title,
                          version: task.updatedAt,
                          adding: false,
                        });
                        setError('');
                      }}
                    >
                      <Pencil size={16} />
                      Editar paso
                    </button>
                    <button
                      type="button"
                      className="text-link danger"
                      disabled={busy}
                      onClick={() => void save({ action: 'remove', id: item.id })}
                    >
                      <Trash2 size={16} />
                      Eliminar paso
                    </button>
                  </div>
                </details>
              )}
              {draft?.id === item.id && !draft.adding && editor()}
            </li>
          ))}
        </ul>
      )}
      {draft?.adding && editor()}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {canManage && !draft && (
        <button
          type="button"
          ref={addButton}
          className="text-link checklist-add"
          disabled={busy || items.length >= 100}
          onClick={() =>
            setDraft({ id: crypto.randomUUID(), title: '', version: task.updatedAt, adding: true })
          }
        >
          <Plus size={17} />
          {items.length ? 'Añadir paso' : 'Añadir pasos'}
        </button>
      )}
    </section>
  );
}
