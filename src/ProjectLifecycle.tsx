import { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import { api } from './api';

type State = {
  archived: boolean;
  last: { kind: 'closed' | 'reopened'; reopenUntil: string; canReopen: boolean } | null;
};
const formatDate = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

export function ProjectLifecycle({
  projectId,
  refresh,
}: {
  projectId: string;
  refresh: (work: () => Promise<void>, message: string) => Promise<boolean>;
}) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const projectPath = '/projects/' + encodeURIComponent(projectId);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setState(await api(projectPath + '/lifecycle'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);
  if (!state)
    return error ? (
      <>
        <p role="alert">{error}</p>
        <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>
          Reintentar
        </button>
      </>
    ) : (
      <p role="status">Cargando estado del proyecto…</p>
    );

  const closed = state.last?.kind === 'closed';
  const reopen = closed && state.last?.canReopen;
  if (closed && !reopen) return <p>Proyecto archivado. El plazo de reapertura terminó.</p>;
  const legacy = state.archived && !state.last;
  return (
    <>
      {reopen && (
        <p>Se puede reabrir hasta el {formatDate.format(new Date(state.last!.reopenUntil))}.</p>
      )}
      <button
        type="button"
        className="text-link archive"
        disabled={busy}
        onClick={async () => {
          if (
            !state.archived &&
            !window.confirm(
              '¿Cerrar el proyecto sin evaluación? Las tareas y su historial se conservan.',
            )
          )
            return;
          setBusy(true);
          await refresh(
            async () => {
              if (legacy) await api(projectPath, 'PATCH', { archived: false });
              else
                await api(projectPath + '/lifecycle', 'POST', {
                  action: reopen ? 'reopen' : 'close',
                });
            },
            state.archived ? 'Proyecto reabierto' : 'Proyecto cerrado',
          );
          await load();
        }}
      >
        <Archive size={16} />
        {legacy ? 'Restaurar proyecto' : reopen ? 'Reabrir proyecto' : 'Cerrar sin evaluar'}
      </button>
    </>
  );
}
