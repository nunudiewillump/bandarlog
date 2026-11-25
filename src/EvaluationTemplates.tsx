import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { api } from './api';
import {
  evaluationStructure,
  questionTypes,
  type EvaluationStructure,
} from '../shared/evaluations';
import './evaluation-templates.css';

type Question = EvaluationStructure['sections'][number]['questions'][number];
type Entry = { id: string; title: string; revision: number; archived: boolean };
type Template = Omit<Entry, 'title'> & { structure: EvaluationStructure };
type Version = { revision: number; publishedAt: string };
const root = '/evaluation-templates';
const names = {
  shortText: 'Texto corto',
  longText: 'Texto largo',
  singleChoice: 'Selección única',
  multipleChoice: 'Selección múltiple',
  yesNo: 'Sí o no',
  numberScale: 'Escala numérica',
  likert: 'Escala Likert',
  tags: 'Etiquetas',
  date: 'Fecha',
  nps: 'NPS (0 a 10)',
} satisfies Record<Question['type'], string>;

function questionOf(type: Question['type'], previous?: Question): Question {
  const base = {
    id: previous?.id ?? crypto.randomUUID(),
    label: previous?.label ?? '',
    description: previous?.description ?? '',
    required: previous?.required ?? false,
  };
  if (type === 'numberScale') return { ...base, type, min: 1, max: 5 };
  if (type === 'singleChoice' || type === 'multipleChoice' || type === 'likert')
    return { ...base, type, options: ['', ''] };
  return { ...base, type };
}

const newSection = () => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  questions: [questionOf('shortText')],
});

export default function EvaluationTemplates() {
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [draft, setDraft] = useState<EvaluationStructure | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [older, setOlder] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function list(after?: string) {
    const result = await api(root + (after ? '?after=' + after : ''));
    setItems((rows) => (after ? [...rows, ...result.items] : result.items));
    setNext(result.next);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void run(() => list());
  }, []);

  async function loadVersions(id: string, before?: number) {
    const result = await api(root + '/' + id + '/versions' + (before ? '?before=' + before : ''));
    setVersions((rows) => (before ? [...rows, ...result.items] : result.items));
    setOlder(result.next);
  }

  async function open(id: string) {
    const template: Template = await api(root + '/' + id);
    setSelected(template);
    setDraft(template.structure);
    setVersions([]);
    setOlder(null);
    await loadVersions(id);
  }

  function start(structure: EvaluationStructure) {
    setSelected(null);
    setDraft(structure);
    setError('');
    setStatus('');
  }

  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(selected?.structure);

  function exportStructure(structure: EvaluationStructure) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(structure, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-evaluacion.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="evaluation-templates" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Cargando…' : status}</p>
      {!draft ? (
        <>
          <div className="evaluation-controls">
            <button
              className="primary"
              disabled={busy}
              onClick={() => start({ title: '', description: '', sections: [newSection()] })}
            >
              <Plus size={16} /> Nueva plantilla
            </button>
            <label>
              Importar estructura JSON
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file)
                    void run(async () => {
                      if (file.size > 256_000)
                        throw Error('El archivo supera el tamaño permitido.');
                      const structure = evaluationStructure.safeParse(
                        JSON.parse(await file.text()),
                      );
                      if (!structure.success)
                        throw Error('El archivo no contiene una estructura de plantilla válida.');
                      start(structure.data);
                    });
                }}
              />
            </label>
          </div>
          {!busy && !items.length && <p>No hay plantillas guardadas.</p>}
          <ul className="evaluation-template-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(() => open(item.id))}
                >
                  {item.title}
                  {item.archived ? ' · Archivada' : ''}
                </button>
              </li>
            ))}
          </ul>
          {next && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => list(next))}
            >
              Más plantillas
            </button>
          )}
          {error && (
            <button className="secondary" disabled={busy} onClick={() => void run(() => list())}>
              Volver a cargar
            </button>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = evaluationStructure.safeParse(draft);
              if (!result.success)
                throw Error('Revisa los títulos, las opciones y los límites de la plantilla.');
              if (selected)
                await api(root + '/' + selected.id, 'PATCH', {
                  action: 'save',
                  revision: selected.revision,
                  structure: result.data,
                });
              const id = selected?.id ?? (await api(root, 'POST', result.data)).id;
              await open(id);
              await list();
              setStatus('Plantilla guardada.');
            });
          }}
        >
          <h2>{selected ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
          <fieldset disabled={busy || selected?.archived}>
            <label>
              Nombre de la plantilla
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              Descripción de la plantilla
              <textarea
                maxLength={1000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            {draft.sections.map((section, sectionIndex) => {
              const updateSection = (next: typeof section) =>
                setDraft({
                  ...draft,
                  sections: draft.sections.map((row) => (row.id === next.id ? next : row)),
                });
              return (
                <fieldset className="evaluation-section" key={section.id}>
                  <legend>Sección {sectionIndex + 1}</legend>
                  <label>
                    Título de sección
                    <input
                      required
                      maxLength={160}
                      value={section.title}
                      onChange={(event) => updateSection({ ...section, title: event.target.value })}
                    />
                  </label>
                  <label>
                    Descripción de sección
                    <textarea
                      maxLength={1000}
                      value={section.description}
                      onChange={(event) =>
                        updateSection({ ...section, description: event.target.value })
                      }
                    />
                  </label>
                  {section.questions.map((question, index) => {
                    const update = (next: Question) =>
                      updateSection({
                        ...section,
                        questions: section.questions.map((row) =>
                          row.id === next.id ? next : row,
                        ),
                      });
                    const move = (offset: number) => {
                      const questions = [...section.questions];
                      [questions[index], questions[index + offset]] = [
                        questions[index + offset],
                        questions[index],
                      ];
                      updateSection({ ...section, questions });
                    };
                    return (
                      <fieldset className="evaluation-question" key={question.id}>
                        <legend>Pregunta {index + 1}</legend>
                        <label>
                          Enunciado
                          <input
                            required
                            maxLength={160}
                            value={question.label}
                            onChange={(event) => update({ ...question, label: event.target.value })}
                          />
                        </label>
                        <label>
                          Descripción de la pregunta
                          <textarea
                            maxLength={1000}
                            value={question.description}
                            onChange={(event) =>
                              update({ ...question, description: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Tipo de pregunta
                          <select
                            value={question.type}
                            onChange={(event) =>
                              update(questionOf(event.target.value as Question['type'], question))
                            }
                          >
                            {questionTypes.map((type) => (
                              <option key={type} value={type}>
                                {names[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {'options' in question && (
                          <label>
                            Opciones, una por línea
                            <textarea
                              required
                              rows={4}
                              value={question.options.join('\n')}
                              onChange={(event) =>
                                update({ ...question, options: event.target.value.split('\n') })
                              }
                            />
                          </label>
                        )}
                        {'min' in question && (
                          <div className="evaluation-controls">
                            <label>
                              Mínimo
                              <input
                                type="number"
                                required
                                min={-100}
                                max={100}
                                value={Number.isNaN(question.min) ? '' : question.min}
                                onChange={(event) =>
                                  update({ ...question, min: event.target.valueAsNumber })
                                }
                              />
                            </label>
                            <label>
                              Máximo
                              <input
                                type="number"
                                required
                                min={-100}
                                max={100}
                                value={Number.isNaN(question.max) ? '' : question.max}
                                onChange={(event) =>
                                  update({ ...question, max: event.target.valueAsNumber })
                                }
                              />
                            </label>
                          </div>
                        )}
                        <label className="evaluation-checkbox">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(event) =>
                              update({ ...question, required: event.target.checked })
                            }
                          />{' '}
                          Obligatoria
                        </label>
                        <div className="evaluation-controls">
                          <button
                            type="button"
                            className="secondary"
                            aria-label="Subir pregunta"
                            disabled={!index}
                            onClick={() => move(-1)}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            aria-label="Bajar pregunta"
                            disabled={index === section.questions.length - 1}
                            onClick={() => move(1)}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={section.questions.length < 2}
                            onClick={() =>
                              updateSection({
                                ...section,
                                questions: section.questions.filter(
                                  (row) => row.id !== question.id,
                                ),
                              })
                            }
                          >
                            Quitar pregunta
                          </button>
                        </div>
                      </fieldset>
                    );
                  })}
                  <div className="evaluation-controls">
                    <button
                      type="button"
                      className="secondary"
                      disabled={section.questions.length >= 40}
                      onClick={() =>
                        updateSection({
                          ...section,
                          questions: [...section.questions, questionOf('shortText')],
                        })
                      }
                    >
                      Añadir pregunta
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={draft.sections.length < 2}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          sections: draft.sections.filter((row) => row.id !== section.id),
                        })
                      }
                    >
                      Quitar sección
                    </button>
                  </div>
                </fieldset>
              );
            })}
            <div className="evaluation-controls">
              <button type="submit" className="primary" disabled={!dirty}>
                Guardar borrador
              </button>
              <button
                type="button"
                className="secondary"
                disabled={draft.sections.length >= 12}
                onClick={() => setDraft({ ...draft, sections: [...draft.sections, newSection()] })}
              >
                Añadir sección
              </button>
            </div>
          </fieldset>
          <div className="evaluation-controls">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (dirty && !window.confirm('¿Salir sin guardar los cambios?')) return;
                setDraft(null);
                setError('');
                setStatus('');
              }}
            >
              Volver a plantillas
            </button>
            {selected && (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !!dirty}
                  onClick={() => {
                    start({
                      ...selected.structure,
                      title: ('Copia de ' + selected.structure.title).slice(0, 160),
                    });
                  }}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => exportStructure(selected.structure)}
                >
                  Exportar estructura
                </button>
                {[selected.archived ? 'Restaurar' : 'Archivar', 'Publicar versión'].map(
                  (label, index) => (
                    <button
                      key={label}
                      type="button"
                      className="secondary"
                      disabled={busy || !!dirty || (index === 1 && selected.archived)}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            root + '/' + selected.id,
                            'PATCH',
                            index === 1
                              ? { action: 'publish', revision: selected.revision }
                              : {
                                  action: 'archive',
                                  revision: selected.revision,
                                  archived: !selected.archived,
                                },
                          );
                          await open(selected.id);
                          await list();
                          setStatus(
                            index === 1
                              ? 'Versión publicada.'
                              : selected.archived
                                ? 'Plantilla restaurada.'
                                : 'Plantilla archivada.',
                          );
                        })
                      }
                    >
                      {label}
                    </button>
                  ),
                )}
              </>
            )}
          </div>
          {!!versions.length && (
            <section>
              <h3>Versiones publicadas</h3>
              <ul className="evaluation-template-list">
                {versions.map((version) => (
                  <li key={version.revision}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const { structure } = await api(
                            root + '/' + selected?.id + '/versions/' + version.revision,
                          );
                          exportStructure(structure);
                        })
                      }
                    >
                      Exportar versión {version.revision}
                    </button>
                  </li>
                ))}
              </ul>
              {older && selected && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(() => loadVersions(selected.id, older))}
                >
                  Más versiones
                </button>
              )}
            </section>
          )}
        </form>
      )}
    </div>
  );
}
