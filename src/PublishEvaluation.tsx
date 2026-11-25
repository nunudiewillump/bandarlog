import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from './api';
import { deadlineDay, deadlineISO } from './deadline';
import type { User } from './types';

export default function PublishEvaluation({
  template,
  versions,
  more,
  loadMore,
  busy,
  people,
  onBack,
}: {
  template: { id: string; title: string };
  versions: { revision: number }[];
  more: boolean;
  loadMore: () => void;
  busy: boolean;
  people: User[];
  onBack: () => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [revision, setRevision] = useState(versions[0]?.revision ?? 0);
  const [day, setDay] = useState('');
  const [query, setQuery] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const active = people.filter((person) => !person.disabledAt);
  const search = query.trim().toLocaleLowerCase('es');
  const filtered = active.filter((person) =>
    (person.name + ' ' + person.email).toLocaleLowerCase('es').includes(search),
  );

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || published || !revision || !recipients.length) return;
        setSaving(true);
        setError('');
        try {
          await api('/group-evaluations', 'POST', {
            title: title.trim(),
            templateId: template.id,
            templateRevision: revision,
            userIds: recipients,
            dueAt: deadlineISO(day),
          });
          setPublished(true);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <h1>Publicar evaluación</h1>
      {error && <p role="alert">{error}</p>}
      {published && (
        <p role="status">Evaluación publicada. Las personas asignadas pueden abrirla en Inicio.</p>
      )}
      <div className="evaluation-controls">
        <button type="button" className="secondary" disabled={saving || busy} onClick={onBack}>
          <ArrowLeft size={16} /> Volver
        </button>
        {!published && (
          <button
            type="submit"
            className="primary"
            disabled={saving || busy || !title.trim() || !revision || !recipients.length || !day}
          >
            {saving ? 'Publicando…' : 'Publicar'}
          </button>
        )}
      </div>
      {!published && (
        <fieldset disabled={saving || busy}>
          {!versions.length ? (
            <p>Publica primero una versión de esta plantilla.</p>
          ) : (
            <>
              <label>
                Título de la evaluación
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Versión de plantilla
                <select
                  required
                  value={revision}
                  onChange={(event) => {
                    if (event.target.value === 'more') loadMore();
                    else setRevision(Number(event.target.value));
                  }}
                >
                  {versions.map((version) => (
                    <option key={version.revision} value={version.revision}>
                      Versión {version.revision}
                    </option>
                  ))}
                  {more && <option value="more">Cargar más versiones</option>}
                </select>
              </label>
              <label>
                Último día para responder (hora de Madrid)
                <input
                  type="date"
                  required
                  min={deadlineDay(new Date().toISOString())}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
              </label>
              <fieldset className="evaluation-section">
                <legend>Participantes · {recipients.length} de 100</legend>
                <p>Las respuestas serán identificadas.</p>
                <label>
                  Buscar participantes
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="evaluation-recipients">
                  {filtered.map((person) => (
                    <label key={person.id} className="evaluation-checkbox">
                      <input
                        type="checkbox"
                        checked={recipients.includes(person.id)}
                        disabled={recipients.length === 100 && !recipients.includes(person.id)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setRecipients((previous) =>
                            checked
                              ? [...previous, person.id]
                              : previous.filter((id) => id !== person.id),
                          );
                        }}
                      />
                      <span>
                        {person.name} <small>{person.email}</small>
                      </span>
                    </label>
                  ))}
                  {!filtered.length && <p>No hay participantes disponibles para esta búsqueda.</p>}
                </div>
              </fieldset>
            </>
          )}
        </fieldset>
      )}
    </form>
  );
}
