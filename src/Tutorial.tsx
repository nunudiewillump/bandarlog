import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  LockKeyhole,
  Music2,
  Send,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from './api';
import { TaskChecklist } from './TaskChecklist';
import { BananaLoader } from './BananaLoader';
import { labels, type Task, type User } from './types';
import { tutorialStepIds, type TutorialProgress, type PracticeStatus } from '../shared/tutorial';
import './tutorial.css';

type Input =
  | { action: 'shown' | 'skip' | 'update' | 'undo' }
  | { action: 'open'; restart?: boolean }
  | { action: 'check'; index: 0 | 1; done: boolean }
  | { action: 'status'; status: PracticeStatus };
export function useTutorial(user: User | null) {
  const [progress, setProgress] = useState<TutorialProgress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = useRef<TutorialProgress | null>(null),
    locked = useRef(false),
    owner = useRef<string | undefined>(undefined);
  const id = user?.id,
    onboarded = !!user && user.onboardingCompletedAt !== null;
  const reload = useCallback(async () => {
    if (!id || !onboarded) return;
    setError('');
    try {
      const next = await api('/tutorial');
      if (owner.current === id) {
        current.current = next;
        setProgress(next);
      }
    } catch (e) {
      if (owner.current === id) setError((e as Error).message);
    }
  }, [id, onboarded]);
  useEffect(() => {
    owner.current = id;
    current.current = null;
    setProgress(null);
    setError('');
    locked.current = false;
    setBusy(false);
    if (id && onboarded) void reload();
    return () => {
      owner.current = undefined;
    };
  }, [id, onboarded, reload]);
  const perform = useCallback(
    async (input: Input) => {
      if (!id || locked.current || owner.current !== id) return null;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        const needsVersion = !['shown', 'open', 'skip'].includes(input.action);
        const result = (await api('/tutorial', 'POST', {
          ...input,
          ...(needsVersion ? { expectedVersion: current.current?.version || 0 } : {}),
        })) as { progress: TutorialProgress; celebrate: boolean };
        if (owner.current !== id) return null;
        current.current = result.progress;
        setProgress(result.progress);
        return result;
      } catch (e) {
        if (owner.current === id) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 409) {
            const next = await api('/tutorial').catch(() => null);
            if (next && owner.current === id) {
              current.current = next;
              setProgress(next);
            }
          }
        }
        return null;
      } finally {
        if (owner.current === id) {
          locked.current = false;
          setBusy(false);
        }
      }
    },
    [id],
  );
  return { progress, busy, error, perform, reload };
}
export type TutorialController = ReturnType<typeof useTutorial>;
export function TutorialInvitation({
  tutorial,
  onStart,
}: {
  tutorial: TutorialController;
  onStart: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  const shown = tutorial.progress?.events.tutorial_shown;
  const eligible =
    !!tutorial.progress &&
    !tutorial.progress.events.tutorial_skipped &&
    !tutorial.progress.events.tutorial_completed;
  useEffect(() => {
    if (!eligible || shown || !element.current) return;
    let intersecting = false,
      attempting = false;
    const report = () => {
      if (intersecting && document.visibilityState === 'visible' && !attempting) {
        attempting = true;
        void tutorial.perform({ action: 'shown' }).then((result) => {
          if (!result) attempting = false;
        });
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        intersecting = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
        );
        report();
      },
      {
        threshold: 0.5,
        rootMargin: `0px 0px -${Math.ceil(document.querySelector('.bottom-nav')?.getBoundingClientRect().height || 0)}px 0px`,
      },
    );
    observer.observe(element.current);
    document.addEventListener('visibilitychange', report);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', report);
    };
  }, [eligible, shown, tutorial.perform]);
  if (!eligible) return null;
  return (
    <section ref={element} className="panel tutorial-invite" aria-label="Tu primera misión">
      <div>
        <h2>Tu primera misión</h2>
        <p>Descubre Bandarlog practicando · 2–3 minutos</p>
      </div>
      <div className="tutorial-invite-actions">
        <button className="primary" disabled={tutorial.busy} onClick={onStart}>
          Empezar
        </button>
        <button
          className="text-link"
          disabled={tutorial.busy}
          onClick={() => void tutorial.perform({ action: 'skip' })}
        >
          Omitir
        </button>
      </div>
      {tutorial.error && (
        <p className="error" role="alert">
          {tutorial.error}
        </p>
      )}
    </section>
  );
}
function TutorialCelebration({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2300);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <aside className="tutorial-celebration" role="status" aria-live="polite" aria-atomic="true">
      <div className="tutorial-trumpeter" aria-hidden="true">
        <img src="/monkey-trumpeter-2d.webp" alt="" width="128" height="144" />
        <Music2 className="tutorial-note note-one" />
        <Music2 className="tutorial-note note-two" />
        <Music2 className="tutorial-note note-three" />
      </div>
      <div>
        <strong>¡Ya estás listo!</strong>
        <p>Tu primera misión está completada</p>
        <button className="text-link" onClick={onContinue}>
          Continuar
        </button>
      </div>
      <button className="icon-button" aria-label="Cerrar celebración" onClick={onClose}>
        <X size={18} />
      </button>
    </aside>
  );
}
export function TutorialMission({
  tutorial,
  restart,
  onBack,
}: {
  tutorial: TutorialController;
  restart: boolean;
  onBack: () => void;
}) {
  const [ready, setReady] = useState(false),
    [celebrate, setCelebrate] = useState(false),
    [draft, setDraft] = useState(''),
    [updates, setUpdates] = useState<string[]>([]);
  const opening = useRef(false);
  const closeCelebration = useCallback(() => setCelebrate(false), []);
  async function open() {
    const result = await tutorial.perform({ action: 'open', restart });
    if (result) setReady(true);
  }
  useEffect(() => {
    const begin = () => {
      if (opening.current || tutorial.busy || document.visibilityState !== 'visible') return;
      opening.current = true;
      void open();
    };
    begin();
    document.addEventListener('visibilitychange', begin);
    return () => document.removeEventListener('visibilitychange', begin);
  }, [tutorial.busy]);
  const p = tutorial.progress;
  if (!p)
    return (
      <section className="panel tutorial-mission">
        <h1>Tu primera misión</h1>
        <p>{tutorial.error || 'Cargando misión…'}</p>
        <button className="secondary" onClick={() => void tutorial.reload()}>
          Reintentar
        </button>
        <button className="text-link" onClick={onBack}>
          Volver a Inicio
        </button>
      </section>
    );
  const task: Task = {
    id: 'first-mission-simulation',
    commissionId: 'practice-only',
    title: 'Preparar la mochila de la patrulla',
    description:
      'La patrulla sale de excursión. Revisa el material y deja un aviso de cómo va la preparación. Puedes explorar lo que quieras y completar la misión en cualquier momento.',
    status: p.taskStatus,
    due: '2099-01-01T00:00:00Z',
    blockedReason: null,
    completedAt: null,
    completedBy: null,
    updatedAt: String(p.version),
    checklist: [
      { id: tutorialStepIds[0], title: 'Comprobar la cantimplora', done: p.steps[0] },
      { id: tutorialStepIds[1], title: 'Revisar la linterna', done: p.steps[1] },
    ],
  };
  const busy = tutorial.busy || !ready;
  async function status(status: PracticeStatus) {
    const result = await tutorial.perform({ action: 'status', status });
    if (result?.celebrate) setCelebrate(true);
  }
  return (
    <section className="panel tutorial-mission" aria-label="Tu primera misión">
      <button className="text-link back" onClick={onBack}>
        <ArrowLeft size={16} /> Volver a Inicio
      </button>
      <p className="tutorial-practice-label">Tu primera misión · Práctica individual</p>
      <div className="detail-heading">
        <h1>{task.title}</h1>
      </div>
      <p className="muted">Patrulla Exploradora · Comisión de práctica</p>
      <dl className="detail-fields">
        <div>
          <dt>
            <Users size={17} />
            Responsable
          </dt>
          <dd>
            <UserRound size={20} aria-hidden="true" /> Lúa · Scouter ficticia
          </dd>
        </div>
        <div>
          <dt>
            <ClipboardCheck size={17} />
            Estado
          </dt>
          <dd>
            <span className={`badge ${p.taskStatus}`}>{labels[p.taskStatus]}</span>
          </dd>
        </div>
      </dl>
      <h3>Descripción</h3>
      <p className="description">{task.description}</p>
      {!ready && (
        <>
          <BananaLoader compact label="Preparando práctica…" />
          {!tutorial.busy && (
            <button className="secondary" onClick={() => void open()}>
              Reintentar apertura
            </button>
          )}
        </>
      )}
      {tutorial.error && (
        <p className="error" role="alert">
          {tutorial.error}
        </p>
      )}
      <TaskChecklist
        task={task}
        canAct={true}
        canManage={false}
        busy={busy}
        run={async (fn) => {
          try {
            await fn();
            return true;
          } catch {
            return false;
          }
        }}
        onChange={async (change) => {
          if (change.action !== 'toggle')
            throw new Error('Solo puedes marcar los pasos de práctica.');
          const index = tutorialStepIds.indexOf(change.id as (typeof tutorialStepIds)[number]);
          if (
            index < 0 ||
            !(await tutorial.perform({ action: 'check', index: index as 0 | 1, done: change.done }))
          )
            throw new Error('No se pudo guardar el paso. Vuelve a intentarlo.');
        }}
      />
      <h3 className="tutorial-activity-title">Actividad reciente</h3>
      <p className="hint">
        Las actualizaciones son de práctica: no se guardan ni se envían a tu equipo.
      </p>
      <div className="activity-list">
        {updates.map((text, index) => (
          <article key={index}>
            <strong>Lúa · Práctica</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <form
        className="tutorial-update"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.trim() || busy) return;
          if (await tutorial.perform({ action: 'update' })) {
            setUpdates((previous) => [...previous, draft.trim()]);
            setDraft('');
          }
        }}
      >
        <label htmlFor="tutorial-update">Publicar una actualización</label>
        <textarea
          id="tutorial-update"
          maxLength={500}
          required
          disabled={busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="¿Cómo va la preparación?"
        />
        <button className="secondary" disabled={busy || !draft.trim()}>
          <Send size={17} /> Publicar actualización
        </button>
      </form>
      <div className="detail-actions tutorial-actions">
        <button
          className="primary"
          disabled={busy || p.taskStatus === 'done'}
          onClick={() => void status('done')}
        >
          <Check size={18} />
          Completar
        </button>
        <button
          className="secondary"
          disabled={busy || p.taskStatus === 'done' || p.taskStatus === 'in_progress'}
          onClick={() => void status('in_progress')}
        >
          Marcar en curso
        </button>
        <button
          className="warning"
          disabled={busy || p.taskStatus === 'done' || p.taskStatus === 'blocked'}
          onClick={() => void status('blocked')}
        >
          <LockKeyhole size={17} />
          Bloquear
        </button>
      </div>
      {p.taskStatus === 'done' && p.previousStatus && (
        <div className="action-confirm tutorial-undo" role="status">
          Misión completada{' '}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void tutorial.perform({ action: 'undo' })}
          >
            Deshacer
          </button>
        </div>
      )}
      {!p.events.tutorial_completed && (
        <button
          className="text-link tutorial-skip"
          disabled={busy}
          onClick={async () => {
            if (await tutorial.perform({ action: 'skip' })) onBack();
          }}
        >
          Omitir tutorial
        </button>
      )}
      {celebrate && <TutorialCelebration onClose={closeCelebration} onContinue={onBack} />}
    </section>
  );
}
