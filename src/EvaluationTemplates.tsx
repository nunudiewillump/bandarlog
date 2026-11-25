import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from './api';
import { Select } from './Select';
import PublishEvaluation from './PublishEvaluation';
import EvaluationResults from './EvaluationResults';
import type { User } from './types';
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

function Actions({
  label,
  caption = label,
  disabled,
  children,
  onAction,
}: {
  label: string;
  caption?: string;
  disabled?: boolean;
  children: React.ReactNode;
  onAction: (action: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      value=""
      disabled={disabled}
      onChange={(event) => onAction(event.target.value)}
    >
      <option value="" disabled>
        {caption}
      </option>
      {children}
    </Select>
  );
}

export default function EvaluationTemplates({
  onBack,
  canPublish,
  people,
}: {
  onBack: () => void;
  canPublish: boolean;
  people: User[];
}) {
  const [showResults, setShowResults] = useState(false);
  const [publication, setPublication] = useState<Entry | null>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [draft, setDraft] = useState<EvaluationStructure | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [older, setOlder] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

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
    setVersions([]);
    setOlder(null);
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

  async function save() {
    if (!draft) throw Error('Abre una plantilla.');
    const result = evaluationStructure.safeParse(draft);
    if (!result.success)
      throw Error('Revisa los títulos, las opciones y los límites de la plantilla.');
    if (selected && !dirty) return selected;
    const saved = selected
      ? await api(root + '/' + selected.id, 'PATCH', {
          action: 'save',
          revision: selected.revision,
          structure: result.data,
        })
      : await api(root, 'POST', result.data);
    const template: Template = {
      id: selected?.id ?? saved.id,
      revision: saved.revision,
      archived: false,
      structure: result.data,
    };
    setSelected(template);
    setDraft(template.structure);
    return template;
  }

  async function rowAction(item: Entry, action: string) {
    if (action === 'open') return open(item.id);
    if (action === 'publishEvaluation') {
      await loadVersions(item.id);
      setPublication(item);
      return;
    }
    if (action === 'archive') {
      await api(root + '/' + item.id, 'PATCH', {
        action: 'archive',
        revision: item.revision,
        archived: !item.archived,
      });
      await list();
      setStatus(item.archived ? 'Plantilla restaurada.' : 'Plantilla archivada.');
      return;
    }
    const template: Template = await api(root + '/' + item.id);
    if (action === 'export') exportStructure(template.structure);
    if (action === 'duplicate') {
      start({
        ...template.structure,
        title: ('Copia de ' + template.structure.title).slice(0, 160),
      });
    }
  }

  if (showResults)
    return (
      <section className="panel evaluation-templates">
        <EvaluationResults onBack={() => setShowResults(false)} />
      </section>
    );

  return (
    <section className="panel evaluation-templates" aria-busy={busy}>
      {!draft && !publication && <h1>Plantillas de evaluación</h1>}
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Cargando…' : status}</p>
      {publication ? (
        <PublishEvaluation
          template={publication}
          versions={versions}
          busy={busy}
          more={older !== null}
          people={people}
          loadMore={() => {
            if (older !== null) void run(() => loadVersions(publication.id, older));
          }}
          onBack={() => {
            setPublication(null);
            setError('');
          }}
        />
      ) : !draft ? (
        <>
          <div className="evaluation-controls">
            <button
              type="button"
              className="secondary"
              aria-label="Volver a proyectos"
              disabled={busy}
              onClick={onBack}
            >
              <ArrowLeft size={16} /> Volver
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => start({ title: '', description: '', sections: [newSection()] })}
            >
              <Plus size={16} /> Nueva plantilla
            </button>
            <Actions
              label="Opciones de plantillas"
              disabled={busy}
              onAction={(action) => {
                if (action === 'results') setShowResults(true);
                if (action === 'import') fileInput.current?.click();
                if (action === 'more' && next) void run(() => list(next));
                if (action === 'reload') void run(() => list());
              }}
            >
              {canPublish && <option value="results">Histórico y resultados</option>}
              <option value="import">Importar estructura JSON</option>
              {next && <option value="more">Más plantillas</option>}
              {error && <option value="reload">Volver a cargar</option>}
            </Actions>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file)
                  void run(async () => {
                    if (file.size > 256_000) throw Error('El archivo supera el tamaño permitido.');
                    const structure = evaluationStructure.safeParse(JSON.parse(await file.text()));
                    if (!structure.success)
                      throw Error('El archivo no contiene una estructura de plantilla válida.');
                    start(structure.data);
                  });
              }}
            />
          </div>
          {!busy && !items.length && <p>No hay plantillas guardadas.</p>}
          <ul className="evaluation-template-list">
            {items.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.title}
                  {item.archived ? ' · Archivada' : ''}
                </strong>
                <Actions
                  label={'Acciones de ' + item.title}
                  caption="Acciones"
                  disabled={busy}
                  onAction={(action) => void run(() => rowAction(item, action))}
                >
                  <option value="open">{item.archived ? 'Consultar' : 'Editar'}</option>
                  {canPublish && !item.archived && (
                    <option value="publishEvaluation">Asignar evaluación</option>
                  )}
                  <option value="duplicate">Duplicar</option>
                  <option value="archive">{item.archived ? 'Restaurar' : 'Archivar'}</option>
                  <option value="export">Exportar estructura</option>
                </Actions>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || selected?.archived) return;
            void run(async () => {
              const template = await save();
              await api(root + '/' + template.id, 'PATCH', {
                action: 'publish',
                revision: template.revision,
              });
              setStatus('Versión publicada.');
              await loadVersions(template.id);
            });
          }}
        >
          <h1>{selected ? 'Editar plantilla' : 'Nueva plantilla'}</h1>
          <div className="evaluation-controls">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-label="Volver a plantillas"
              onClick={() => {
                if (dirty && !window.confirm('¿Salir sin guardar los cambios?')) return;
                setDraft(null);
                void run(() => list());
              }}
            >
              <ArrowLeft size={16} /> Volver
            </button>
            <button type="submit" className="primary" disabled={busy || selected?.archived}>
              Publicar
            </button>
          </div>
          <Actions
            label="Opciones del editor"
            disabled={busy}
            onAction={(action) => {
              if (action === 'add')
                setDraft({ ...draft, sections: [...draft.sections, newSection()] });
              if (action === 'save')
                void run(async () => {
                  await save();
                  setStatus('Plantilla guardada.');
                });
              if (action === 'more' && selected && older)
                void run(() => loadVersions(selected.id, older));
              if (action.startsWith('version:') && selected)
                void run(async () => {
                  const { structure } = await api(
                    root + '/' + selected.id + '/versions/' + action.slice(8),
                  );
                  exportStructure(structure);
                });
            }}
          >
            <option value="save" disabled={!dirty || selected?.archived}>
              Guardar borrador
            </option>
            <option value="add" disabled={draft.sections.length >= 12 || selected?.archived}>
              Añadir sección
            </option>
            {versions.map((version) => (
              <option key={version.revision} value={'version:' + version.revision}>
                Exportar versión {version.revision}
              </option>
            ))}
            {older && <option value="more">Más versiones</option>}
          </Actions>
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
                        <Actions
                          label={'Opciones de pregunta ' + (index + 1)}
                          onAction={(action) => {
                            if (action === 'up') move(-1);
                            if (action === 'down') move(1);
                            if (action === 'remove')
                              updateSection({
                                ...section,
                                questions: section.questions.filter(
                                  (row) => row.id !== question.id,
                                ),
                              });
                          }}
                        >
                          <option value="up" disabled={!index}>
                            Subir pregunta
                          </option>
                          <option value="down" disabled={index === section.questions.length - 1}>
                            Bajar pregunta
                          </option>
                          <option value="remove" disabled={section.questions.length < 2}>
                            Quitar pregunta
                          </option>
                        </Actions>
                      </fieldset>
                    );
                  })}
                  <Actions
                    label={'Opciones de sección ' + (sectionIndex + 1)}
                    onAction={(action) => {
                      if (action === 'add')
                        updateSection({
                          ...section,
                          questions: [...section.questions, questionOf('shortText')],
                        });
                      if (action === 'remove')
                        setDraft({
                          ...draft,
                          sections: draft.sections.filter((row) => row.id !== section.id),
                        });
                    }}
                  >
                    <option value="add" disabled={section.questions.length >= 40}>
                      Añadir pregunta
                    </option>
                    <option value="remove" disabled={draft.sections.length < 2}>
                      Quitar sección
                    </option>
                  </Actions>
                </fieldset>
              );
            })}
          </fieldset>
        </form>
      )}
    </section>
  );
}
