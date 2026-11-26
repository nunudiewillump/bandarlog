import { useEffect, useState } from 'react';
import { api } from './api';
import { Select } from './Select';
import {
  EvaluationDocument,
  EvaluationMemoDocument,
  type EvaluationReport,
  EvaluationStatistics,
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
    setBody(result.body ?? '');
  }

  useEffect(() => {
    void run(() => (initialResultId ? openResult(initialResultId) : list()));
  }, []);

  const result = selected?.result;
  const summary = result?.summary;
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
                if (event.target.value === 'memo') {
                  void run(async () => {
                    const { reports } = await api(endpoint + '/memo', 'POST', {
                      ids: memoSelection,
                    });
                    setMemo(reports);
                  });
                } else void run(() => list(error ? undefined : (next ?? undefined)));
              }}
            >
              <option value="" disabled>
                Opciones del histórico
              </option>
              {(next || error) && <option value="load">{error ? 'Recargar' : 'Ver más'}</option>}
              {memoSelection.length >= 2 && <option value="memo">Preparar memoria conjunta</option>}
            </Select>
          )}
        </div>
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
      {result.open && (
        <Select
          aria-label="Opciones de seguimiento"
          value=""
          disabled={busy}
          onChange={() => {
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
          <option value="reminder">Recordar por correo</option>
        </Select>
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
