import { useEffect, useState } from 'react';
import type { EvaluationStructure } from '../shared/evaluations';
import { evaluationAnswers } from '../shared/evaluation-answers';
import { api } from './api';
import { Select } from './Select';
import './evaluation-templates.css';
import './group-evaluations.css';

type Question = EvaluationStructure['sections'][number]['questions'][number];
type Answer = string | number | boolean | string[];
type Entry = {
  id: string;
  title: string;
  dueAt: string;
  open: boolean;
  paused?: boolean;
  responseMode?: 'identified' | 'anonymous' | 'collective';
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
  id,
  describedBy,
  invalid,
  value,
  onChange,
}: {
  question: Question;
  id: string;
  describedBy?: string;
  invalid: boolean;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
}) {
  const accessibility = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
  };
  const setText = (text: string) => onChange(text || undefined);
  switch (question.type) {
    case 'shortText':
      return (
        <input
          {...accessibility}
          value={String(value ?? '')}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case 'longText':
      return (
        <textarea
          {...accessibility}
          value={String(value ?? '')}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case 'date':
      return (
        <input
          {...accessibility}
          type="date"
          value={String(value ?? '')}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case 'numberScale':
    case 'nps':
      return (
        <input
          {...accessibility}
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
          {...accessibility}
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
          {...accessibility}
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => onChange(e.target.value ? e.target.value.split('\n') : undefined)}
        />
      );
    case 'multipleChoice': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset {...accessibility} aria-labelledby={id + '-label'} tabIndex={-1}>
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

export default function GroupEvaluations({ onBack, initialId }: { onBack: () => void; initialId?: string }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; detail: Detail } | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [invalidQuestion, setInvalidQuestion] = useState<string | null>(null);

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
    void run(async () => {
      await load();
      if (initialId) {
        const detail: Detail = await api(endpoint + '/' + encodeURIComponent(initialId));
        if (detail.open && !detail.submittedAt) {
          setSelected({ id: initialId, detail });
          setAnswers(detail.answers);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (invalidQuestion && !busy) document.getElementById('response-' + invalidQuestion)?.focus();
  }, [invalidQuestion, busy, sectionIndex]);

  function open(id: string) {
    void run(async () => {
      const detail: Detail = await api(endpoint + '/' + id);
      setSelected({ id, detail });
      setAnswers(detail.answers);
      setSectionIndex(0);
      setInvalidQuestion(null);
    });
  }

  function save(action: 'draft' | 'submission') {
    if (!selected || busy || !selected.detail.open || selected.detail.submittedAt) return;
    setInvalidQuestion(null);
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
        if (index >= 0 && typeof first === 'string') {
          setSectionIndex(index);
          setInvalidQuestion(first);
        }
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
      const persisted = (saved.answers ?? parsed.data) as Record<string, Answer>;
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
  const questions = detail?.structure.sections.flatMap((part) => part.questions) ?? [];
  const answered = questions.filter(({ id }) => {
    const value = answers[id];
    if (Array.isArray(value)) return value.some((entry) => entry.trim());
    if (typeof value === 'string') return Boolean(value.trim());
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'boolean';
  }).length;

  return (
    <section className="panel evaluation-templates group-evaluations" aria-busy={busy}>
      <h1>{detail?.title ?? 'Mis evaluaciones'}</h1>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Cargando…' : message}</p>
      {detail && section ? (
        <>
          <div className="evaluation-context">
            <p>
              <strong>{statusOf(detail)}</strong>{' '}
              <span>Plazo {deadline.format(new Date(detail.dueAt))}</span>
            </p>
            <p>
              {detail.responseMode === 'anonymous'
                ? 'Al enviar, el contenido se separa de tu cuenta. Evita identificarte en los textos.'
                : detail.responseMode === 'collective'
                  ? 'Envía la respuesta consensuada por el equipo. Tu cuenta figura como representante.'
                  : 'Respuesta identificada. Solo tú puedes consultar tu borrador.'}
            </p>
            {detail.structure.description && <p>{detail.structure.description}</p>}
          </div>
          <div className="evaluation-controls response-controls">
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
                setInvalidQuestion(null);
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
          <div className="evaluation-progress">
            <p id="evaluation-progress-label">
              {answered} de {questions.length} preguntas respondidas
            </p>
            <progress
              aria-labelledby="evaluation-progress-label"
              value={answered}
              max={questions.length}
            />
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
                  id={'response-' + question.id}
                  describedBy={
                    question.description || question.type === 'tags'
                      ? 'response-' + question.id + '-hint'
                      : undefined
                  }
                  invalid={invalidQuestion === question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => {
                    if (invalidQuestion === question.id) {
                      setInvalidQuestion(null);
                      setError('');
                    }
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
                    <strong id={'response-' + question.id + '-label'}>{label}</strong>
                  ) : (
                    <label htmlFor={'response-' + question.id}>{label}</label>
                  )}
                  {(question.description || question.type === 'tags') && (
                    <p id={'response-' + question.id + '-hint'} className="evaluation-hint">
                      {question.description}
                      {question.description && question.type === 'tags' ? ' ' : ''}
                      {question.type === 'tags' && 'Escribe una etiqueta por línea.'}
                    </p>
                  )}
                  {field}
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
                <span className="evaluation-list-context">
                  <strong>{item.title}</strong>
                  <small>
                    {statusOf(item)} · {deadline.format(new Date(item.dueAt))}
                  </small>
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
