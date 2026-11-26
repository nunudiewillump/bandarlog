import { useEffect, useState } from 'react';
import { api } from './api';
import { deadlineDay, deadlineISO } from './deadline';
import { Select } from './Select';
import {
  EvaluationDocument,
  EvaluationMemoDocument,
  type EvaluationReport,
  EvaluationStatistics,
  evaluationMean,
  type EvaluationSummary,
  type EvaluationAnnex,
} from './EvaluationDocument';
import type { Project, ScoutGroup } from './types';
import type { EvaluationStructure } from '../shared/evaluations';

type Evaluation = {
  id: string;
  title: string;
  dueAt: string;
  open: boolean;
  paused?: boolean;
  responseMode?: 'identified' | 'anonymous' | 'collective';
  templateRevision: number;
};
type Result = Omit<Evaluation, 'id'> & {
  structure: EvaluationStructure;
  body: string | null;
  actions?: { id: string; title: string }[];
  conclusionRevision: number | null;
  summary: EvaluationSummary | null;
};

type ComparableReport = EvaluationReport & {
  id: string;
  templateId?: string;
  summary: EvaluationSummary;
};
type DeadlineRevision = { changedAt: string; dueAt: string; reason: string };

const endpoint = '/group-evaluations/manage';
const date = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

export default function EvaluationResults({
  onBack,
  group,
  canExportAnnex,
  projects,
  initialResultId,
  onCreateAction,
  onOpenTask,
}: {
  onBack: () => void;
  group?: ScoutGroup;
  canExportAnnex: boolean;
  projects: Project[];
  initialResultId: string | null;
  onCreateAction: (action: { id: string; revision: number; title: string }) => void;
  onOpenTask: (id: string) => void;
}) {
  const [memo, setMemo] = useState<
    (EvaluationReport & { id: string; summary: EvaluationSummary })[]
  >([]);
  const [comparison, setComparison] = useState<ComparableReport[]>([]);
  const [revisions, setRevisions] = useState<{ revision: number; created_at: string }[] | null>(
    null,
  );
  const [deadline, setDeadline] = useState<{
    day: string;
    reason: string;
    history: DeadlineRevision[];
  } | null>(null);
  const [memoSelection, setMemoSelection] = useState<string[]>([]);
  const [annex, setAnnex] = useState<EvaluationAnnex>();
  const [preview, setPreview] = useState(false);
  const [filters, setFilters] = useState({ projectId: '', status: '' });
  const [items, setItems] = useState<Evaluation[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; result: Result } | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function list(cursor?: string, selectedFilters = filters) {
    const params = new URLSearchParams();
    if (cursor) params.set('after', cursor);
    if (selectedFilters.projectId) params.set('projectId', selectedFilters.projectId);
    if (selectedFilters.status) params.set('status', selectedFilters.status);
    const result = await api(endpoint + (params.size ? '?' + params.toString() : ''));
    setItems((previous) => (cursor ? [...previous, ...result.items] : result.items));
    setNext(result.next);
  }

  function filter(key: 'projectId' | 'status', value: string) {
    const selectedFilters = { ...filters, [key]: value };
    setFilters(selectedFilters);
    setItems([]);
    setNext(null);
    void run(() => list(undefined, selectedFilters));
  }

  async function openResult(id: string) {
    const result: Result = await api(endpoint + '/' + id);
    setSelected({ id, result });
    setDeadline(null);
    setBody(result.body ?? '');
  }

  useEffect(() => {
    void run(() => (initialResultId ? openResult(initialResultId) : list()));
  }, []);

  const result = selected?.result;
  const summary = result?.summary;
  if (comparison.length) {
    const comparable = comparison.every(
      (report) =>
        report.templateId &&
        report.templateId === comparison[0].templateId &&
        report.templateRevision === comparison[0].templateRevision,
    );
    return (
      <section>
        <h1>Comparar evaluaciones</h1>
        <button type="button" className="secondary" onClick={() => setComparison([])}>
          Volver
        </button>
        <dl>
          {comparison.map(({ id, title, summary }) => (
            <div key={id}>
              <dt>{title}</dt>
              <dd>
                {summary.submitted} de {summary.assigned} respuestas
              </dd>
            </div>
          ))}
        </dl>
        {comparable ? (
          <div
            className="evaluation-comparison"
            role="region"
            aria-label="Comparación por pregunta"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Pregunta</th>
                  {comparison.map(({ id, title }) => (
                    <th key={id} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison[0].structure.sections.flatMap((section) =>
                  section.questions.map((question) => (
                    <tr key={question.id}>
                      <th scope="row">{question.label}</th>
                      {comparison.map(({ id, summary }) => {
                        const stats = summary.questions[question.id];
                        if (!stats) return <td key={id}>—</td>;
                        const mean = evaluationMean(question.type, stats);
                        return (
                          <td key={id}>
                            {stats.answered} respuestas
                            {mean === null
                              ? ''
                              : ' · Media ' +
                                mean.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                            {!!stats.distribution.length && (
                              <ul>
                                {stats.distribution.map((entry) => (
                                  <li key={String(entry.value)}>
                                    {typeof entry.value === 'boolean'
                                      ? entry.value
                                        ? 'Sí'
                                        : 'No'
                                      : entry.value}{' '}
                                    · {entry.count}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Para comparar preguntas, selecciona evaluaciones de la misma plantilla y versión.</p>
        )}
      </section>
    );
  }
  if (memo.length)
    return <EvaluationMemoDocument reports={memo} group={group} onBack={() => setMemo([])} />;
  if (preview && result && summary)
    return (
      <EvaluationDocument
        report={result}
        annex={annex}
        summary={summary}
        group={group}
        onBack={() => {
          setPreview(false);
          setAnnex(undefined);
        }}
      />
    );
  if (!selected || !result)
    return (
      <section aria-busy={busy}>
        <h1>Histórico de evaluaciones</h1>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Cargando evaluaciones…</p>}
        <div className="evaluation-controls">
          <button className="secondary" disabled={busy} onClick={onBack}>
            Volver
          </button>
          {(next || error || memoSelection.length >= 2) && (
            <Select
              aria-label="Opciones del histórico"
              value=""
              disabled={busy}
              onChange={(event) => {
                const action = event.target.value;
                if (action === 'save' || action === 'versions') {
                  void run(async () => {
                    const value = await api(endpoint + '/consolidation', 'POST', {
                      ids: memoSelection,
                      action: action === 'save' ? 'save' : 'list',
                    });
                    if (action === 'save') {
                      setStatus('Consolidación guardada · versión ' + value.revision);
                      setRevisions(null);
                    } else setRevisions(value);
                  });
                } else if (action === 'memo' || action === 'compare') {
                  void run(async () => {
                    const { reports } = await api(endpoint + '/memo', 'POST', {
                      ids: memoSelection,
                    });
                    if (action === 'compare') setComparison(reports);
                    else setMemo(reports);
                  });
                } else void run(() => list(error ? undefined : (next ?? undefined)));
              }}
            >
              <option value="" disabled>
                Opciones del histórico
              </option>
              {(next || error) && <option value="load">{error ? 'Recargar' : 'Ver más'}</option>}
              {memoSelection.length >= 2 && (
                <>
                  <option value="memo">Preparar memoria conjunta</option>
                  <option value="compare">Comparar resultados</option>
                  <option value="save">Guardar versión consolidada</option>
                  <option value="versions">Ver versiones consolidadas</option>
                </>
              )}
            </Select>
          )}
        </div>
        {status && <p role="status">{status}</p>}
        {revisions && (
          <label>
            Versiones consolidadas
            <Select
              value=""
              onChange={(event) => {
                const revision = Number(event.target.value);
                void run(async () =>
                  setMemo(
                    await api(endpoint + '/consolidation', 'POST', {
                      ids: memoSelection,
                      action: 'open',
                      revision,
                    }),
                  ),
                );
              }}
            >
              <option value="" disabled>
                {revisions.length
                  ? 'Elige una versión'
                  : 'Aún no hay versiones para esta selección'}
              </option>
              {revisions.map((item) => (
                <option key={item.revision} value={item.revision}>
                  Versión {item.revision} · {date.format(new Date(item.created_at))}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="evaluation-controls">
          <label>
            <span id="history-project-label">Proyecto</span>
            <select
              aria-labelledby="history-project-label"
              disabled={busy}
              value={filters.projectId}
              onChange={(event) => filter('projectId', event.target.value)}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span id="history-status-label">Estado</span>
            <select
              aria-labelledby="history-status-label"
              disabled={busy}
              value={filters.status}
              onChange={(event) => filter('status', event.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="open">Abiertas</option>
              <option value="paused">Pausadas</option>
              <option value="closed">Cerradas</option>
            </select>
          </label>
        </div>
        {!busy && !items.length && !error && (
          <p>
            {filters.projectId || filters.status
              ? 'No hay evaluaciones con estos filtros.'
              : 'Todavía no hay evaluaciones publicadas.'}
          </p>
        )}
        <ul className="evaluation-template-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {!item.open && !item.paused && (
                  <label className="evaluation-checkbox">
                    <input
                      type="checkbox"
                      checked={memoSelection.includes(item.id)}
                      disabled={
                        busy || (memoSelection.length >= 8 && !memoSelection.includes(item.id))
                      }
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setRevisions(null);
                        setMemoSelection((previous) =>
                          checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        );
                      }}
                    />
                    Incluir en memoria: {item.title}
                  </label>
                )}
                <strong>{item.title}</strong>
                <br />
                {item.paused ? 'Pausada' : item.open ? 'Abierta' : 'Cerrada'} ·{' '}
                {date.format(new Date(item.dueAt))}
              </span>
              <Select
                aria-label={'Opciones de ' + item.title}
                value=""
                disabled={busy}
                onChange={() => void run(() => openResult(item.id))}
              >
                <option value="" disabled>
                  Opciones
                </option>
                <option value="results">Ver resultados</option>
              </Select>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <form
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !summary || !body.trim()) return;
        void run(async () => {
          const saved = await api(endpoint + '/' + selected.id + '/conclusion', 'PUT', {
            body,
            revision: result.conclusionRevision ?? 0,
          });
          setSelected({
            ...selected,
            result: { ...result, body: saved.body, conclusionRevision: saved.revision },
          });
          setBody(saved.body);
          setStatus('Conclusiones guardadas.');
        });
      }}
    >
      <h1>{result.title}</h1>
      <p>
        Versión {result.templateRevision} · Plazo {date.format(new Date(result.dueAt))}
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Guardando…' : status}</p>
      <div className="evaluation-controls">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (body !== (result.body ?? '') && !window.confirm('¿Volver sin guardar los cambios?'))
              return;
            setSelected(null);
            void run(() => list());
          }}
        >
          Volver
        </button>
        {summary && (
          <button
            type="submit"
            className="primary"
            disabled={busy || !body.trim() || body === result.body}
          >
            Guardar conclusiones
          </button>
        )}
      </div>
      {(result.open || result.paused) && (
        <Select
          aria-label="Opciones de seguimiento"
          value=""
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === 'deadline') {
              void run(async () =>
                setDeadline({
                  day: deadlineDay(result.dueAt),
                  reason: '',
                  history: await api(endpoint + '/' + selected.id + '/deadline'),
                }),
              );
              return;
            }
            if (
              !window.confirm(
                '¿Enviar un recordatorio a quienes aún no han respondido y tienen los avisos activados?',
              )
            )
              return;
            void run(async () => {
              const { queued } = await api(endpoint + '/' + selected.id + '/reminder', 'POST', {});
              setStatus(
                queued
                  ? `Recordatorios en cola: ${queued}.`
                  : 'No hay recordatorios nuevos para enviar.',
              );
            });
          }}
        >
          <option value="" disabled>
            Opciones de seguimiento
          </option>
          {result.open && <option value="reminder">Recordar por correo</option>}
          <option value="deadline">Ajustar plazo</option>
        </Select>
      )}
      {deadline && (
        <fieldset>
          <legend>Ajustar plazo</legend>
          <label>
            Último día para responder (hora de Madrid)
            <input
              type="date"
              value={deadline.day}
              min={deadlineDay(new Date().toISOString())}
              onChange={(event) => setDeadline({ ...deadline, day: event.target.value })}
            />
          </label>
          <label>
            Motivo
            <input
              maxLength={400}
              value={deadline.reason}
              onChange={(event) => setDeadline({ ...deadline, reason: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || !deadline.day || !deadline.reason.trim()}
            onClick={() =>
              void run(async () => {
                await api(endpoint + '/' + selected.id + '/deadline', 'PUT', {
                  previous: new Date(result.dueAt).toISOString(),
                  dueAt: deadlineISO(deadline.day),
                  reason: deadline.reason,
                });
                await openResult(selected.id);
                setStatus('Plazo actualizado.');
              })
            }
          >
            Guardar plazo
          </button>
          {!!deadline.history.length && (
            <ul>
              {deadline.history.map((entry) => (
                <li key={entry.changedAt}>
                  {date.format(new Date(entry.dueAt))} · {entry.reason}
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
      {summary && (
        <Select
          aria-label="Opciones del informe"
          value=""
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === 'annex') {
              if (!window.confirm('¿Incluir nombres y respuestas individuales en el documento?'))
                return;
              void run(async () => {
                const { answers } = await api(endpoint + '/' + selected.id + '/annex', 'POST', {});
                setAnnex(answers);
                setPreview(true);
              });
            } else setPreview(true);
          }}
        >
          <option value="" disabled>
            Opciones del informe
          </option>
          <option value="print">Vista previa y PDF</option>
          {canExportAnnex && result.responseMode !== 'anonymous' && (
            <option value="annex">PDF con anexo identificado</option>
          )}
        </Select>
      )}
      {result.conclusionRevision && (
        <Select
          aria-label="Acciones de mejora"
          value=""
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === 'create') {
              onCreateAction({
                id: selected.id,
                revision: result.conclusionRevision!,
                title: result.title,
              });
            } else if (event.target.value === 'reload') {
              void run(async () => {
                const updated: Result = await api(endpoint + '/' + selected.id);
                setSelected({ ...selected, result: updated });
                setBody(updated.body ?? '');
              });
            } else onOpenTask(event.target.value);
          }}
        >
          <option value="" disabled>
            Acciones de mejora
          </option>
          <option value="create" disabled={body !== result.body}>
            Crear tarea
          </option>
          <option value="reload" disabled={body !== result.body}>
            Actualizar lista de tareas
          </option>
          {result.actions?.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </Select>
      )}
      {!summary ? (
        <p>
          {result.responseMode === 'anonymous' && !result.open && !result.paused
            ? 'Los resultados anónimos requieren al menos cinco respuestas.'
            : 'Los resultados estarán disponibles cuando termine el plazo.'}
        </p>
      ) : (
        <>
          <p>
            {summary.submitted} de {summary.assigned} participantes han enviado su evaluación.
          </p>
          <label>
            Conclusiones de Coordinación
            <textarea
              maxLength={8000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={busy}
            />
          </label>
          <EvaluationStatistics structure={result.structure} summary={summary} />
        </>
      )}
    </form>
  );
}
