import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from './api';
import { deadlineDay, deadlineISO } from './deadline';
import type { EvaluationStructure } from '../shared/evaluations';
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
  versions: { revision: number; requiresCommission?: boolean; projectOnly?: boolean }[];
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
  const [manualSectionMode, setSectionMode] = useState(false);
  const currentVersion = versions.find((item) => item.revision === revision);
  const requiresCommission = currentVersion?.requiresCommission;
  const sectionMode = manualSectionMode || Boolean(requiresCommission && projectId);
  const [sectionScopes, setSectionScopes] = useState<Record<string, string>>({});
  const [versionStructure, setVersionStructure] = useState<{
    revision: number;
    sections: EvaluationStructure['sections'];
  }>();
  const [versionError, setVersionError] = useState('');
  const [versionRetry, setVersionRetry] = useState(0);
  const projectCommissions = commissions.filter((commission) => commission.projectId === projectId);
  useEffect(() => {
    if (!sectionMode || !revision) return;
    let current = true;
    void api('/evaluation-templates/' + encodeURIComponent(template.id) + '/versions/' + revision)
      .then(({ structure }: { structure: EvaluationStructure }) => {
        if (current) setVersionStructure({ revision, sections: structure.sections });
      })
      .catch((cause: unknown) => {
        if (current)
          setVersionError(cause instanceof Error ? cause.message : 'No se pudo cargar la versión.');
      });
    return () => {
      current = false;
    };
  }, [sectionMode, revision, template.id, versionRetry]);
  const [query, setQuery] = useState('');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const recipients = selections[commissionId] ?? [];
  const scopeIds = Object.keys(selections).filter((scope) => selections[scope].length > 0);
  const setRecipients = (update: (previous: string[]) => string[]) =>
    setSelections((previous) => ({
      ...previous,
      [commissionId]: update(previous[commissionId] ?? []),
    }));
  const sections = versionStructure?.revision === revision ? versionStructure.sections : undefined;
  const scopedSections =
    sections?.flatMap(({ id }) =>
      sectionScopes[id] ? [{ sectionId: id, commissionId: sectionScopes[id] }] : [],
    ) ?? [];
  const canReceiveSection = (userId: string, sectionId: string) =>
    !sectionScopes[sectionId] ||
    memberships.some(
      (membership) =>
        membership.commissionId === sectionScopes[sectionId] && membership.userId === userId,
    );
  const sectionSelectionValid =
    (!requiresCommission || Boolean(projectId)) &&
    (!sectionMode ||
      Boolean(
        sections &&
        sections.every(({ id, audience }) => audience !== 'commission' || sectionScopes[id]) &&
        recipients.every((userId) => sections.some(({ id }) => canReceiveSection(userId, id))) &&
        scopedSections.every(({ sectionId }) =>
          recipients.some((userId) => canReceiveSection(userId, sectionId)),
        ),
      ));
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
      className="evaluation-flow"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || published || !revision || !scopeIds.length || !sectionSelectionValid) return;
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
            ...(sectionMode && scopedSections.length ? { sectionScopes: scopedSections } : {}),
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
            disabled={
              saving ||
              busy ||
              !title.trim() ||
              !revision ||
              !scopeIds.length ||
              !day ||
              !sectionSelectionValid
            }
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
                    else {
                      setRevision(Number(event.target.value));
                      setVersionError('');
                      setSectionScopes({});
                      setCommissionId('');
                      setSelections({});
                    }
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
              {requiresCommission && !projectId && (
                <p role="status">
                  Esta versión tiene secciones de comisión. Úsala al cerrar un proyecto.
                </p>
              )}
              {projectId && projectCommissions.length > 0 && !requiresCommission && (
                <label className="evaluation-checkbox">
                  <input
                    type="checkbox"
                    checked={sectionMode}
                    onChange={(event) => {
                      setCommissionId('');
                      setSelections({});
                      setSectionScopes({});
                      setVersionError('');
                      setSectionMode(event.target.checked);
                    }}
                  />
                  Un cuestionario con secciones por comisión
                </label>
              )}
              {requiresCommission && projectId && !projectCommissions.length && (
                <p role="status">Añade una comisión al proyecto para asignar estas secciones.</p>
              )}
              {sectionMode && (
                <fieldset className="evaluation-section">
                  <legend>Quién responde a cada sección</legend>
                  <p>
                    Las preguntas generales se muestran a todos los participantes seleccionados. Las
                    de comisión, solo a sus miembros.
                  </p>
                  {versionError ? (
                    <>
                      <p role="alert">{versionError}</p>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setVersionError('');
                          setVersionRetry((value) => value + 1);
                        }}
                      >
                        Reintentar carga
                      </button>
                    </>
                  ) : !sections ? (
                    <p role="status">Cargando secciones…</p>
                  ) : (
                    sections.map((section) => (
                      <label key={section.id}>
                        {section.title}
                        <select
                          disabled={section.audience === 'project'}
                          value={sectionScopes[section.id] ?? ''}
                          onChange={(event) => {
                            const scope = event.target.value;
                            setSectionScopes((current) => ({ ...current, [section.id]: scope }));
                          }}
                        >
                          <option value="" disabled={section.audience === 'commission'}>
                            {section.audience === 'commission'
                              ? 'Selecciona una comisión'
                              : 'Proyecto completo'}
                          </option>
                          {section.audience !== 'project' &&
                            projectCommissions.map(({ id, name }) => (
                              <option key={id} value={id}>
                                {name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))
                  )}
                  {sections && recipients.length > 0 && !sectionSelectionValid && (
                    <p role="status">
                      Selecciona al menos un miembro para cada sección de comisión y comprueba que
                      cada participante tenga alguna sección.
                    </p>
                  )}
                </fieldset>
              )}
              {projectId && !sectionMode && (
                <label>
                  Ámbito de evaluación
                  <select
                    value={commissionId}
                    onChange={(event) => setCommissionId(event.target.value)}
                  >
                    <option value="">Proyecto completo ({selections['']?.length ?? 0})</option>
                    {!currentVersion?.projectOnly &&
                      projectCommissions.map((commission) => (
                        <option key={commission.id} value={commission.id}>
                          {commission.name} ({selections[commission.id]?.length ?? 0})
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {projectId && !sectionMode && (
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
