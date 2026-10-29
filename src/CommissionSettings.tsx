import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from './api';
import type { Commission } from './types';
export function CommissionSettings({
  commission,
  busy,
  run,
  onDeleted,
}: {
  commission: Commission;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    name: commission.name,
    description: commission.description,
  }));
  const [base, setBase] = useState(() => ({
    name: commission.name,
    description: commission.description,
  }));
  const [error, setError] = useState('');
  return (
    <>
      <details className="commission-edit">
        <summary>
          <Pencil size={18} aria-hidden="true" /> Editar comisión
        </summary>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            const saved = await run(async () => {
              try {
                await api(`/commissions/${commission.id}`, 'PATCH', {
                  ...draft,
                  name: draft.name.trim(),
                  expected: base,
                });
              } catch (e) {
                setError((e as Error).message);
                throw e;
              }
            }, 'Comisión actualizada');
            if (saved) {
              const next = { name: draft.name.trim(), description: draft.description.trim() };
              setBase(next);
              setDraft(next);
            }
          }}
        >
          <label>
            Nombre
            <input
              required
              maxLength={200}
              disabled={busy}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Descripción
            <textarea
              aria-label="Descripción"
              maxLength={3000}
              disabled={busy}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !draft.name.trim() ||
              (draft.name === base.name && draft.description === base.description)
            }
          >
            Guardar comisión
          </button>
        </form>
      </details>
      <details className="commission-delete">
        <summary>
          <Trash2 size={18} aria-hidden="true" /> Eliminar comisión
        </summary>
        <p>
          Se quitará la comisión y sus tareas de los listados y avisos. Conservaremos el historial.
          Se cancelarán las invitaciones pendientes.
        </p>
        <button
          className="secondary danger"
          disabled={busy}
          onClick={async () => {
            if (
              await run(async () => {
                await api(`/commissions/${commission.id}`, 'DELETE');
              }, 'Comisión eliminada')
            )
              onDeleted();
          }}
        >
          Confirmar eliminación de comisión
        </button>
      </details>
    </>
  );
}
