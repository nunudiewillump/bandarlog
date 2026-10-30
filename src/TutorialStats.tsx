import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from './api';
import type { summarizeTutorial } from '../server/tutorial';
type Stats = ReturnType<typeof summarizeTutorial>;
export function TutorialStats() {
  const [stats, setStats] = useState<Stats | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setStats(await api('/tutorial/stats'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="tutorial-stats"
      onToggle={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.open) void load();
      }}
    >
      <summary>
        Estadísticas del tutorial <ChevronRight size={18} />
      </summary>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Cargando estadísticas…</p>}
      {stats && (
        <>
          <dl className="tutorial-stats-grid">
            {[
              ['Usuarios a los que se mostró', stats.shown],
              ['Lo iniciaron', stats.started],
              ['Lo omitieron', stats.skipped],
              ['Lo completaron', stats.completed],
              ['Tasa de inicio', `${stats.rates.started} %`],
              ['Tasa de omisión', `${stats.rates.skipped} %`],
              ['Tasa de finalización', `${stats.rates.completed} %`],
              ['Finalización entre quienes lo iniciaron', `${stats.rates.completedAmongStarted} %`],
              [
                'Tiempo mediano de finalización',
                stats.medianCompletionMs === null
                  ? 'Sin finalizaciones'
                  : `${Math.round(stats.medianCompletionMs / 1000)} s`,
              ],
              ['Nunca iniciado ni omitido', stats.neverStarted],
              ['Iniciados sin finalizar ni omitir', stats.active],
              ['Abandono actual', stats.currentlyAbandoned],
              ['Abandonaron alguna vez', stats.abandoned],
              ['Lo reabrieron', stats.reopened],
              ['Usaron la checklist', stats.features.checklist],
              ['Publicaron una actualización', stats.features.update],
              ['Completaron la tarea', stats.features.completed],
              ['Usaron Deshacer', stats.features.undo],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            Personas únicas. Las tasas de inicio, omisión y finalización usan como base a quienes lo
            vieron; una persona puede omitirlo y completarlo más tarde. La mediana mide desde el
            primer inicio e incluye pausas.
          </p>
          <p className="hint">
            Abandono: 24 horas sin actividad tras iniciarlo, sin omisión ni finalización. Nunca
            iniciado no cuenta como abandono.
          </p>
        </>
      )}
      <button className="secondary" disabled={busy} onClick={() => void load()}>
        Actualizar estadísticas
      </button>
    </details>
  );
}
