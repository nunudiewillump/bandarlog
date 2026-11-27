import { useEffect, useState } from 'react';
import { MobileTasks } from './MobileUX';
import type { Data, Task, User } from './types';

const title = 'Pedir la comida';
const reason = 'Falta confirmar el menú.';
const person: User = { id: 'demo-person', name: 'Lúa', email: '', role: 'member' };
const commissionId = 'demo-kitchen';
const taskId = 'demo-order';
const data: Data = {
  artworkEnabled: false,
  users: [person],
  projects: [
    {
      id: 'demo-camp',
      name: 'Campamento de verano',
      type: 'camp',
      parentId: null,
      starts: '',
      ends: '',
      archived: 'false',
    },
  ],
  commissions: [
    { id: commissionId, projectId: 'demo-camp', name: 'Cocina', icon: '', description: '' },
  ],
  members: [{ id: 'demo-member', commissionId, userId: person.id, role: 'member' }],
  assignments: [{ id: 'demo-assignment', taskId, userId: person.id }],
  tasks: [],
  activity: [],
  invitations: [],
  projectMembers: [],
};
const frames = [
  { status: 'pending', duration: 2700 },
  { status: 'in_progress', duration: 1600 },
  { status: 'in_progress', duration: 2500 },
  { status: 'blocked', duration: 2200 },
  { status: 'done', duration: 0 },
] as const;

export function WelcomeTaskDemo() {
  const [step, setStep] = useState(0);
  const [automatic, setAutomatic] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [blockedReason, setBlockedReason] = useState(reason);
  const [due] = useState(() => new Date(Date.now() + 86_400_000).toISOString());
  const { status, duration } = frames[step];
  const task: Task = {
    id: taskId,
    title,
    due,
    description: '',
    commissionId,
    status,
    blockedReason: status === 'blocked' ? blockedReason : null,
    updatedAt: String(step),
    completedAt: null,
    completedBy: null,
  };
  const goTo = (next: number) => {
    setAutomatic(false);
    setStep(next);
  };
  useEffect(() => {
    if (!automatic || !duration) return;
    const timer = setTimeout(() => setStep(step + 1), duration);
    return () => clearTimeout(timer);
  }, [automatic, duration, step]);
  return (
    <div className={automatic && step === 0 ? 'welcome-task welcome-swipe-cue' : 'welcome-task'}>
      <MobileTasks
        data={{ ...data, tasks: [task] }}
        tasks={[task]}
        me={person}
        pending={new Set()}
        canManage={() => false}
        onOpen={() => {
          if (step === 1) goTo(2);
        }}
        onComplete={() => goTo(4)}
        homeActions={{ start: () => goTo(1), finish: () => goTo(4) }}
      />
      {step === 1 && (
        <button type="button" className="warning" onClick={() => goTo(2)}>
          Bloquear tarea
        </button>
      )}
      {step === 2 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const answer = String(new FormData(event.currentTarget).get('reason')).trim();
            if (!answer) return;
            setBlockedReason(answer);
            goTo(3);
          }}
        >
          <label htmlFor="welcome-block-reason">¿Qué impide avanzar?</label>
          <textarea
            id="welcome-block-reason"
            name="reason"
            required
            maxLength={1000}
            defaultValue={reason}
          />
          <button className="warning">Confirmar bloqueo</button>
        </form>
      )}
      {step === 3 && (
        <button type="button" className="primary" onClick={() => goTo(4)}>
          Completar
        </button>
      )}
      {step === 4 && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setBlockedReason(reason);
            setStep(0);
            setAutomatic(!matchMedia('(prefers-reduced-motion: reduce)').matches);
          }}
        >
          Repetir demostración
        </button>
      )}
    </div>
  );
}
