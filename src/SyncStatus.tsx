import { useEffect, useState } from 'react';
import { offline, notifyDataChanged, type OfflineConfirmation, type PendingTask } from './offline';
import { groupBasePath } from './group-location';
export function SyncStatus({
  onSynced,
  onPendingTasks,
}: {
  onSynced: (confirmed?: OfflineConfirmation[]) => Promise<unknown>;
  onPendingTasks?: (tasks: PendingTask[], pending: number) => void;
}) {
  const [state, setState] = useState({ pending: 0, error: '' }),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let active = true,
      flushing = false;
    const status = () => {
      if (active)
        void offline.status().then((s) => {
          if (active) {
            setState(s);
            onPendingTasks?.(s.tasks || [], s.pending);
          }
        });
    };
    const refresh = async () => {
      setOnline(navigator.onLine);
      status();
      if (flushing || !navigator.onLine) return;
      flushing = true;
      try {
        const before = await offline.status();
        const confirmed = await offline.flush();
        status();
        if (before.pending) {
          await onSynced(confirmed);
          notifyDataChanged();
        }
      } catch {
      } finally {
        flushing = false;
      }
    };
    const message = (e: MessageEvent) => {
      if (e.data?.type === 'bandarlog:synced') {
        status();
        void onSynced(e.data.groupBase === groupBasePath() ? e.data.confirmed : undefined);
        notifyDataChanged();
      }
    };
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('bandarlog:queue', status);
    window.addEventListener('focus', refresh);
    navigator.serviceWorker?.addEventListener('message', message);
    void refresh();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('bandarlog:queue', status);
      window.removeEventListener('focus', refresh);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, []);
  if (online && !state.pending && !state.error) return null;
  return (
    <aside className="sync-status" role="status">
      <span>
        {!online && 'Sin cobertura. '}
        {state.pending
          ? `${state.pending} ${state.pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de sincronizar.`
          : 'Consultando la última información guardada.'}{' '}
        {state.error}
      </span>
      {online && state.pending > 0 && (
        <button
          onClick={() =>
            void offline
              .retry()
              .then(onSynced)
              .then(() => offline.status())
              .then((s) => {
                setState(s);
                onPendingTasks?.(s.tasks || [], s.pending);
              })
          }
        >
          Reintentar
        </button>
      )}
      {state.error && (
        <details>
          <summary>Resolver cambios pendientes</summary>
          <p>
            Si el servidor ha cambiado, descarta los cambios de este dispositivo para volver a
            consultar los datos actuales.
          </p>
          <button
            onClick={() =>
              void offline
                .discard()
                .then(() => onSynced())
                .then(() => offline.status())
                .then((s) => {
                  setState(s);
                  onPendingTasks?.(s.tasks || [], s.pending);
                })
            }
          >
            Descartar cambios de este dispositivo
          </button>
        </details>
      )}
    </aside>
  );
}
