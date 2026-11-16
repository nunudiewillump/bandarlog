import { useState } from 'react';
import { api } from './api';
import { clearOffline } from './offline';
type Session = {
  id: string;
  createdAt: string;
  renewedAt: string;
  expires: string;
  current: boolean;
};
export function SessionSettings() {
  const [sessions, setSessions] = useState<Session[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const read = async () => {
    setError('');
    setBusy(true);
    try {
      setSessions(await api('/sessions'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel">
      <summary>Sesiones abiertas</summary>
      <p>
        Consulta dónde tienes accesos activos y revoca los que ya no necesites. Para revocarlos
        debes haber iniciado sesión en los últimos 15 minutos.
      </p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void read()}>
        Consultar sesiones
      </button>
      {error && <p role="alert">{error}</p>}
      {sessions && (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <span>
                {session.current ? 'Esta sesión' : 'Otra sesión'} · Inicio:{' '}
                {new Date(session.createdAt).toLocaleString('es-ES')}
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-link"
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void api('/sessions/' + session.id, 'DELETE')
                    .then(async () => {
                      if (session.current) await clearOffline();
                      else await read();
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
