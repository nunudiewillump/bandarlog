import { useEffect, useState } from 'react';
import { api } from './api';
import { Select } from './Select';
import type { EvaluationStructure } from '../shared/evaluations';

type Evaluation = {
  id: string;
  title: string;
  dueAt: string;
  open: boolean;
  templateRevision: number;
};
type Distribution = { value: string | number | boolean; count: number };
type Result = Omit<Evaluation, 'id'> & {
  structure: EvaluationStructure;
  body: string | null;
  actions?: { id: string; title: string }[];
  conclusionRevision: number | null;
  summary: {
    assigned: number;
    submitted: number;
    questions: Record<string, { answered: number; distribution: Distribution[] }>;
  } | null;
};

const endpoint = '/group-evaluations/manage';
const date = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export default function EvaluationResults({
  onBack,
  onCreateAction,
  onOpenTask,
}: {
  onBack: () => void;
  onCreateAction: (action: { id: string; revision: number; title: string }) => void;
  onOpenTask: (id: string) => void;
}) {
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

  async function list(cursor?: string) {
    const result = await api(endpoint + (cursor ? '?after=' + encodeURIComponent(cursor) : ''));
    setItems((previous) => (cursor ? [...previous, ...result.items] : result.items));
    setNext(result.next);
  }

  useEffect(() => {
    void run(() => list());
  }, []);

  const result = selected?.result;
  const summary = result?.summary;
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
          {(next || error) && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => list(error ? undefined : (next ?? undefined)))}
            >
              {error ? 'Recargar' : 'Ver más'}
            </button>
          )}
        </div>
        {!busy && !items.length && !error && <p>Todavía no hay evaluaciones publicadas.</p>}
        <ul className="evaluation-template-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <br />
                {item.open ? 'Abierta' : 'Cerrada'} · {date.format(new Date(item.dueAt))}
              </span>
              <Select
                aria-label={'Opciones de ' + item.title}
                value=""
                disabled={busy}
                onChange={() =>
                  void run(async () => {
                    const result: Result = await api(endpoint + '/' + item.id);
                    setSelected({ id: item.id, result });
                    setBody(result.body ?? '');
                  })
                }
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
            setError('');
            setStatus('');
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
        <p>Los resultados estarán disponibles cuando termine el plazo.</p>
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
          {result.structure.sections.map((section) => (
            <section key={section.id} className="evaluation-section">
              <h2>{section.title}</h2>
              {section.questions.map((question) => {
                const stats = summary.questions[question.id];
                if (!stats) return null;
                const numeric = question.type === 'numberScale' || question.type === 'nps';
                const sum = numeric
                  ? stats.distribution.reduce(
                      (total, entry) => total + Number(entry.value) * entry.count,
                      0,
                    )
                  : 0;
                return (
                  <div key={question.id} className="evaluation-question">
                    <h3>{question.label}</h3>
                    <p>
                      {stats.answered} respuestas · {summary.submitted - stats.answered} omitidas
                      {numeric &&
                        stats.answered > 0 &&
                        ' · Media ' + number.format(sum / stats.answered)}
                    </p>
                    {stats.distribution.length > 0 && (
                      <ul>
                        {stats.distribution.map(({ value, count }) => (
                          <li key={String(value)}>
                            {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value} · {count}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </form>
  );
}
