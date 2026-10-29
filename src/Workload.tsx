import { useState } from 'react';
import type { Data, Task, User } from './types';
import { workloadRows } from './workload';
import { Select } from './Select';
export function Workload({ data, users, tasks }: { data: Data; users: User[]; tasks: Task[] }) {
  const [commission, setCommission] = useState('');
  const active = tasks.filter(
    (t) =>
      data.projects.find(
        (p) => p.id === data.commissions.find((c) => c.id === t.commissionId)?.projectId,
      )?.archived !== 'true' &&
      (!commission || t.commissionId === commission),
  );
  const rows = workloadRows(data, users, active);
  return (
    <section className="workload" aria-label="Carga y evolución del equipo">
      <h2>Carga y evolución del equipo</h2>
      <p>
        Carga pendiente, entregas dentro de plazo y tiempo desde la asignación hasta finalizar. Las
        tareas compartidas cuentan para cada responsable. El plazo se compara con la fecha límite
        vigente.
      </p>
      <label>
        Comisión del análisis
        <Select
          aria-label="Comisión del análisis"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
        >
          <option value="">Todas las comisiones de este ámbito</option>
          {data.commissions
            .filter((c) => tasks.some((t) => t.commissionId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {data.projects.find((p) => p.id === c.projectId)?.name}
              </option>
            ))}
        </Select>
      </label>
      <div className="workload-scroll">
        <table>
          <thead>
            <tr>
              <th>Scouter</th>
              <th>Carga abierta</th>
              <th>Progreso</th>
              <th>Entregas en plazo</th>
              <th>Tiempo hasta completar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user.id}>
                <th scope="row">
                  {row.user.name}
                  <small>{row.commissions} comisiones con tareas</small>
                </th>
                <td>
                  {row.open} pendientes
                  <small>
                    {row.overdue} vencidas · {row.blocked} bloqueadas
                  </small>
                </td>
                <td>
                  {row.done}/{row.total} terminadas{' '}
                  <progress
                    value={row.done}
                    max={row.total || 1}
                    aria-label={`Progreso de ${row.user.name}`}
                  />
                </td>
                <td>
                  {row.done ? `${Math.round((row.onTime / row.done) * 100)} %` : 'Sin entregas'}
                  <small>
                    {row.onTime} de {row.done} terminadas
                  </small>
                </td>
                <td>
                  {row.medianDays === null
                    ? 'Sin histórico de asignación'
                    : row.medianDays < 1 / 1440
                      ? 'Menos de 1 minuto'
                      : row.medianDays < 1
                        ? `${Math.round(row.medianDays * 1440)} minutos`
                        : `${row.medianDays.toLocaleString('es-ES', { maximumFractionDigits: 1 })} días`}
                  <small>Mediana · {row.timed} tareas con asignación registrada</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>El equipo aún no tiene tareas asignadas en este ámbito.</p>}
    </section>
  );
}
