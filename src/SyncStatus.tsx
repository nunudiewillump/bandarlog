import { useEffect, useState } from 'react';
import { offline, notifyDataChanged } from './offline';
export function SyncStatus({ onSynced }: { onSynced: () => Promise<unknown> }) {
  const [state, setState] = useState({ pending: 0, error: '' }),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let active = true,
      flushing = false;
    const status = () => {
      if (active)
        void offline.status().then((s) => {
          if (active) setState(s);
        });
    };
    const refresh = async () => {
      setOnline(navigator.onLine);
      status();
      if (flushing || !navigator.onLine) return;
      flushing = true;
      try {
        const before = await offline.status();
        await offline.flush();
        status();
        if (before.pending) {
          await onSynced();
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
        void onSynced();
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
              .then(setState)
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
                .then(onSynced)
                .then(() => offline.status())
                .then(setState)
            }
          >
            Descartar cambios de este dispositivo
          </button>
        </details>
      )}
    </aside>
  );
}
