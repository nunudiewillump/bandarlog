import { useEffect, useState } from 'react';
import type { EvaluationStructure } from '../shared/evaluations';
import { evaluationAnswers } from '../shared/evaluation-answers';
import { api } from './api';
import { Select } from './Select';
import './evaluation-templates.css';

type Question = EvaluationStructure['sections'][number]['questions'][number];
type Answer = string | number | boolean | string[];
type Entry = {
  id: string;
  title: string;
  dueAt: string;
  open: boolean;
  paused?: boolean;
  submittedAt: string | null;
};
type Detail = Omit<Entry, 'id'> & {
  structure: EvaluationStructure;
  answers: Record<string, Answer>;
  revision: number;
};
const endpoint = '/group-evaluations';
const deadline = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});
const statusOf = (item: Omit<Entry, 'id'>) =>
  item.submittedAt ? 'Enviada' : item.paused ? 'Pausada' : item.open ? 'Pendiente' : 'Cerrada';

function AnswerField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
}) {
  const setText = (text: string) => onChange(text || undefined);
  switch (question.type) {
    case 'shortText':
      return (
        <input
          value={String(value ?? '')}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case 'longText':
      return (
        <textarea
          value={String(value ?? '')}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case 'date':
      return (
        <input type="date" value={String(value ?? '')} onChange={(e) => setText(e.target.value)} />
      );
    case 'numberScale':
    case 'nps':
      return (
        <input
          type="number"
          step={1}
          min={'min' in question ? question.min : 0}
          max={'max' in question ? question.max : 10}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
        />
      );
    case 'yesNo':
    case 'likert':
    case 'singleChoice': {
      const options = 'options' in question ? question.options : ['Sí', 'No'];
      const selection = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value ?? '');
      return (
        <select
          value={selection}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === '' ? undefined : question.type === 'yesNo' ? next === 'Sí' : next);
          }}
        >
          <option value="">Selecciona una respuesta</option>
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    case 'tags':
      return (
        <textarea
          aria-label={question.label + ' (una etiqueta por línea)'}
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => onChange(e.target.value ? e.target.value.split('\n') : undefined)}
        />
      );
    case 'multipleChoice': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset aria-label={question.label}>
          {question.options.map((option) => (
            <label key={option} className="evaluation-checkbox">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, option]
                    : selected.filter((entry) => entry !== option);
                  onChange(next.length ? next : undefined);
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>
      );
    }
  }
}

export default function GroupEvaluations({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; detail: Detail } | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function load(cursor?: string) {
    const page = await api(endpoint + (cursor ? '?after=' + encodeURIComponent(cursor) : ''));
    setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
    setNext(page.next);
  }

  useEffect(() => {
    void run(() => load());
  }, []);

  function open(id: string) {
    void run(async () => {
      const detail: Detail = await api(endpoint + '/' + id);
      setSelected({ id, detail });
      setAnswers(detail.answers);
      setSectionIndex(0);
    });
  }

  function save(action: 'draft' | 'submission') {
    if (!selected || busy || !selected.detail.open || selected.detail.submittedAt) return;
    void run(async () => {
      const { id, detail } = selected;
      const normalized = Object.fromEntries(
        Object.entries(answers).flatMap<[string, Answer]>(([key, value]) => {
          if (typeof value === 'string' && !value.trim()) return [];
          if (!Array.isArray(value)) return [[key, value]];
          const entries = value.filter((entry) => entry.trim());
          return entries.length ? [[key, entries]] : [];
        }),
      );
      const parsed = evaluationAnswers(detail.structure, action).safeParse(normalized);
      if (!parsed.success) {
        const first = parsed.error.issues[0].path[0];
        const index = detail.structure.sections.findIndex((section) =>
          section.questions.some((question) => question.id === first),
        );
        if (index >= 0) setSectionIndex(index);
        throw Error(
          action === 'submission'
            ? 'Revisa las respuestas obligatorias y su formato.'
            : 'Revisa el formato de las respuestas.',
        );
      }
      if (
        action === 'submission' &&
        !window.confirm('¿Enviar la evaluación? Después no podrás cambiar las respuestas.')
      )
        return;
      const saved = await api(endpoint + '/' + id + '/response', 'PUT', {
        action,
        revision: detail.revision,
        answers: parsed.data,
      });
      const persisted = parsed.data as Record<string, Answer>;
      setAnswers(persisted);
      setSelected({ id, detail: { ...detail, ...saved, answers: persisted } });
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === id ? { ...entry, submittedAt: saved.submittedAt } : entry,
        ),
      );
      setMessage(action === 'draft' ? 'Borrador guardado.' : 'Evaluación enviada.');
    });
  }

  const detail = selected?.detail;
  const section = detail?.structure.sections[sectionIndex];
  const editable = detail?.open && !detail.submittedAt;

  return (
    <section className="panel evaluation-templates" aria-busy={busy}>
      <h1>{detail?.title ?? 'Mis evaluaciones'}</h1>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Cargando…' : message}</p>
      {detail && section ? (
        <>
          <p>
            {statusOf(detail)} · Plazo {deadline.format(new Date(detail.dueAt))}
          </p>
          <p>Respuesta identificada. Solo tú puedes consultar tu borrador.</p>
          {detail.structure.description && <p>{detail.structure.description}</p>}
          <div className="evaluation-controls">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (
                  JSON.stringify(answers) !== JSON.stringify(detail.answers) &&
                  !window.confirm('¿Volver sin guardar los cambios?')
                )
                  return;
                setSelected(null);
                setError('');
                setMessage('');
              }}
            >
              Volver
            </button>
            {editable && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => save('submission')}
              >
                Enviar
              </button>
            )}
            {editable && (
              <Select
                aria-label="Opciones de respuesta"
                value=""
                disabled={busy}
                onChange={() => save('draft')}
              >
                <option value="" disabled>
                  Opciones
                </option>
                <option value="save">Guardar borrador</option>
              </Select>
            )}
          </div>
          <label>
            Sección {sectionIndex + 1} de {detail.structure.sections.length}
            <select
              value={sectionIndex}
              onChange={(event) => setSectionIndex(Number(event.target.value))}
            >
              {detail.structure.sections.map((part, index) => (
                <option key={part.id} value={index}>
                  {part.title}
                </option>
              ))}
            </select>
          </label>
          {section.description && <p>{section.description}</p>}
          <fieldset disabled={busy || !editable} className="evaluation-section">
            {section.questions.map((question) => {
              const label = (
                <>
                  {question.label}
                  {question.required ? ' (obligatoria)' : ''}
                </>
              );
              const field = (
                <AnswerField
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => {
                    setAnswers((previous) => {
                      const nextAnswers = { ...previous };
                      if (value === undefined) delete nextAnswers[question.id];
                      else nextAnswers[question.id] = value;
                      return nextAnswers;
                    });
                  }}
                />
              );
              return (
                <div key={question.id} className="evaluation-question">
                  {question.type === 'multipleChoice' ? (
                    <>
                      {label}
                      {field}
                    </>
                  ) : (
                    <label>
                      {label}
                      {field}
                    </label>
                  )}
                  {question.description && <p>{question.description}</p>}
                </div>
              );
            })}
          </fieldset>
        </>
      ) : (
        <>
          <button type="button" className="secondary" disabled={busy} onClick={onBack}>
            Volver a Inicio
          </button>
          {!busy && !error && !items.length && <p>No tienes evaluaciones asignadas.</p>}
          <ul className="evaluation-template-list">
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.title} · {statusOf(item)}
                </span>
                <Select
                  aria-label={'Acciones de ' + item.title}
                  value=""
                  disabled={busy}
                  onChange={() => open(item.id)}
                >
                  <option value="" disabled>
                    Acciones
                  </option>
                  <option value="open">Abrir evaluación</option>
                </Select>
              </li>
            ))}
          </ul>
          {(next || error) && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => load(error ? undefined : (next ?? undefined)))}
            >
              {error ? 'Reintentar' : 'Ver más'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
