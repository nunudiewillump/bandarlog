import { useState } from 'react';
import { Check, ChevronRight, ClipboardCheck, Flag, Settings2, Users, UserRoundPlus } from 'lucide-react';
import type { Data } from './types';
import { setupMilestones } from './admin-setup';
import './admin-setup-guide.css';

type Props = {
  data: Data;
  onSettings: () => void;
  onProject: () => void;
  onCommission: () => void;
  onInvite: () => void;
  onTask: () => void;
  onPractice: () => void;
  onFinish: (completed: boolean) => Promise<boolean>;
};
export function AdminSetupGuide({
  data, onSettings, onProject, onCommission, onInvite, onTask, onPractice, onFinish,
}: Props) {
  const milestones = setupMilestones(data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const steps = [
    { id: 'project', icon: Flag, title: 'Crea el primer proyecto',
      detail: 'Organiza la ronda solar, un campamento o una actividad.',
      done: milestones.project, allowed: true, label: 'Crear proyecto', action: onProject },
    { id: 'commission', icon: Users, title: 'Organiza las comisiones',
      detail: 'Divide el proyecto en equipos con responsabilidades claras.',
      done: milestones.commission, allowed: milestones.project,
      label: 'Crear comisión', action: onCommission },
    { id: 'invitation', icon: UserRoundPlus, title: 'Invita al kraal',
      detail: 'Añade personas para que puedan acceder a su propio grupo.',
      done: milestones.invitation, allowed: true, label: 'Invitar personas', action: onInvite },
    { id: 'task', icon: ClipboardCheck, title: 'Reparte una primera tarea',
      detail: 'Asigna responsables, fecha límite y seguimiento.',
      done: milestones.task, allowed: milestones.commission,
      label: 'Crear tarea', action: onTask },
  ] as const;
  const count = steps.filter((step) => step.done).length;
  const complete = count === steps.length;
  const current = steps.find((step) => !step.done && step.allowed)?.id;
  async function finish() {
    setSaving(true);
    setError('');
    try {
      if (!(await onFinish(complete))) setError('No se ha podido guardar. Prueba otra vez.');
    } catch {
      setError('No se ha podido guardar. Prueba otra vez.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className={`panel admin-setup-guide${complete ? ' is-complete' : ''}`}
      aria-label="Puesta en marcha del grupo">
      <div className="admin-guide-heading">
        <div className="admin-guide-heading-copy">
          <span className="admin-guide-kicker">TUS PRIMEROS PASOS</span>
          <h2>{complete ? '¡Tu grupo está listo!' : 'Pon tu grupo en marcha'}</h2>
          <p className="admin-guide-group-name" title={data.group?.name || 'Tu grupo'}>
            {data.group?.name || 'Tu grupo'}
          </p>
          <p className="admin-guide-intro">{complete
            ? 'Ya puedes empezar a trabajar con tu kraal.'
            : 'Unos pasos sencillos para organizaros desde el primer día.'}</p>
        </div>
        <span className="admin-guide-count" aria-label={count + ' de 4 pasos completados'}>
          {count}<span>/4</span>
        </span>
      </div>
      <div className="admin-guide-progress" role="progressbar" aria-label="Progreso de configuración"
        aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}>
        <span style={{ width: count * 25 + '%' }} />
      </div>
      {!complete && <button className="admin-guide-identity" type="button" onClick={onSettings}>
        <Settings2 size={20} aria-hidden="true" />
        <span className="admin-guide-identity-copy">
          <strong>Identidad de tu grupo</strong>
          <span>Revisa el nombre y los colores de la pañoleta</span>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>}
      <div className="admin-guide-steps-intro">
        <strong>{complete ? 'Todo preparado' : 'Tu hoja de ruta'}</strong>
        <span>{count} de 4 completados</span>
      </div>
      <ol className="admin-guide-steps">
        {steps.map((step) => {
          const active = current === step.id;
          return (
            <li key={step.id}
              className={step.done ? 'is-done' : active ? 'is-current' : 'is-upcoming'}
              aria-current={active ? 'step' : undefined}>
              <span className="admin-guide-step-icon">
                {step.done ? <Check size={20} aria-hidden="true" /> : <step.icon size={20} aria-hidden="true" />}
              </span>
              <div className="admin-guide-step-description">
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
              {step.done
                ? <span className="admin-guide-step-state">Hecho</span>
                : <>
                    <span className="admin-guide-step-state">{active ? 'Ahora' : 'Después'}</span>
                    <button type="button" className={active ? 'primary admin-guide-action' : 'secondary admin-guide-action'}
                      disabled={!step.allowed} onClick={step.action}>{step.label}</button>
                  </>}
            </li>
          );
        })}
      </ol>
      <div className="admin-guide-footer">
        <button type="button" className={complete ? 'primary' : 'secondary'}
          disabled={saving} onClick={() => void finish()}>
          {saving ? 'Guardando…' : complete ? 'Finalizar bienvenida' : 'Omitir por ahora'}
        </button>
        <button type="button" className="text-link" onClick={onPractice}>
          Practicar con una tarea ficticia
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
