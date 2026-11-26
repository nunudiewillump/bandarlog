import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from './api';
import { deadlineDay, deadlineISO } from './deadline';
import type { Commission, Data, User } from './types';

export default function PublishEvaluation({
  projectId,
  onClosed,
  commissions = [],
  memberships = [],
  template,
  versions,
  more,
  loadMore,
  busy,
  people,
  onBack,
}: {
  projectId?: string | null;
  onClosed?: () => void;
  commissions?: Commission[];
  memberships?: Data['members'];
  template: { id: string; title: string };
  versions: { revision: number }[];
  more: boolean;
  loadMore: () => void;
  busy: boolean;
  people: User[];
  onBack: () => void;
}) {
  const [responseMode, setResponseMode] = useState('identified');
  const [commissionId, setCommissionId] = useState('');
  const limit = responseMode === 'collective' ? 1 : 100;
  const [title, setTitle] = useState(template.title);
  const [revision, setRevision] = useState(versions[0]?.revision ?? 0);
  const [day, setDay] = useState(() => {
    if (!projectId) return '';
    const today = deadlineDay(new Date().toISOString());
    return new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86_400_000).toISOString().slice(0, 10);
  });
  const [query, setQuery] = useState('');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const recipients = selections[commissionId] ?? [];
  const scopeIds = Object.keys(selections).filter((scope) => selections[scope].length > 0);
  const setRecipients = (update: (previous: string[]) => string[]) =>
    setSelections((previous) => ({
      ...previous,
      [commissionId]: update(previous[commissionId] ?? []),
    }));
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const scoped = new Set(
    memberships
      .filter((member) => member.commissionId === commissionId)
      .map((member) => member.userId),
  );
  const active = people.filter(
    (person) => !person.disabledAt && (!commissionId || scoped.has(person.id)),
  );
  const search = query.trim().toLocaleLowerCase('es');
  const filtered = active.filter((person) =>
    (person.name + ' ' + person.email).toLocaleLowerCase('es').includes(search),
  );

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || published || !revision || !scopeIds.length) return;
        setSaving(true);
        setError('');
        try {
          const evaluation = {
            title: title.trim(),
            templateId: template.id,
            templateRevision: revision,
            userIds: recipients,
            dueAt: deadlineISO(day),
            ...(responseMode !== 'identified' ? { responseMode } : {}),
            ...(commissionId ? { commissionId } : {}),
          };
          if (projectId) {
            const evaluations = scopeIds.map((scope) => ({
              ...evaluation,
              commissionId: scope || undefined,
              userIds: selections[scope],
              title:
                scopeIds.length > 1
                  ? (
                      title.trim().slice(0, 110) +
                      ' · ' +
                      (commissions.find(({ id }) => id === scope)?.name ?? 'Proyecto completo')
                    ).slice(0, 160)
                  : title.trim(),
            }));
            await api(
              '/projects/' + encodeURIComponent(projectId) + '/lifecycle',
              'POST',
              evaluations.length === 1
                ? { action: 'close-and-evaluate', evaluation: evaluations[0] }
                : { action: 'close-and-evaluate-many', evaluations },
            );
            onClosed?.();
          } else await api('/group-evaluations', 'POST', evaluation);
          setPublished(true);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <h1>{projectId ? 'Cerrar y evaluar' : 'Publicar evaluación'}</h1>
      {error && <p role="alert">{error}</p>}
      {published && (
        <p role="status">
          {projectId ? 'Proyecto cerrado. ' : ''}Evaluación publicada. Las personas asignadas pueden
          abrirla en Inicio.
        </p>
      )}
      <div className="evaluation-controls">
        <button type="button" className="secondary" disabled={saving || busy} onClick={onBack}>
          <ArrowLeft size={16} /> Volver
        </button>
        {!published && (
          <button
            type="submit"
            className="primary"
            disabled={saving || busy || !title.trim() || !revision || !scopeIds.length || !day}
          >
            {saving ? 'Publicando…' : projectId ? 'Cerrar y evaluar' : 'Publicar'}
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
              <label>
                Modalidad de respuesta
                <select
                  value={responseMode}
                  onChange={(event) => {
                    setResponseMode(event.target.value);
                    setSelections({});
                  }}
                >
                  <option value="identified">Individual identificada</option>
                  <option value="anonymous">Individual anónima</option>
                  <option value="collective">Colectiva</option>
                </select>
              </label>
              {projectId && (
                <label>
                  Ámbito de evaluación
                  <select
                    value={commissionId}
                    onChange={(event) => setCommissionId(event.target.value)}
                  >
                    <option value="">Proyecto completo ({selections['']?.length ?? 0})</option>
                    {commissions
                      .filter((commission) => commission.projectId === projectId)
                      .map((commission) => (
                        <option key={commission.id} value={commission.id}>
                          {commission.name} ({selections[commission.id]?.length ?? 0})
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {projectId && (
                <p>
                  Selecciona participantes en cada ámbito que quieras incluir. Se conservan al
                  cambiar de ámbito.
                </p>
              )}
              <fieldset className="evaluation-section">
                <legend>
                  {responseMode === 'collective' ? 'Representante' : 'Participantes'} ·{' '}
                  {recipients.length} de {limit}
                </legend>
                <p>
                  {responseMode === 'anonymous'
                    ? 'El envío se separa de la cuenta. Los resultados se ocultan si hay menos de cinco respuestas.'
                    : responseMode === 'collective'
                      ? 'Una persona enviará la respuesta consensuada por el equipo.'
                      : 'Las respuestas serán identificadas.'}
                </p>
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
                        disabled={recipients.length === limit && !recipients.includes(person.id)}
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
