import { useState } from 'react';
import { Check, ClipboardCheck, Flag, Settings2, Users, UserRoundPlus } from 'lucide-react';
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
  onFinish: () => Promise<boolean>;
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
  async function finish() {
    setSaving(true);
    setError('');
    try {
      if (!(await onFinish())) setError('No se ha podido guardar. Prueba otra vez.');
    } catch {
      setError('No se ha podido guardar. Prueba otra vez.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel admin-setup-guide" aria-label="Puesta en marcha del grupo">
      <div className="admin-guide-heading">
        <div>
          <h2>Prepara {data.group?.name || 'tu nuevo grupo'} en Bandarlog</h2>
          <p>Eres la primera persona administradora. Esta guía te ayudará a poner en marcha el espacio sin afectar a otros grupos.</p>
        </div>
        <span className="admin-guide-count" aria-label={count + ' de 4 pasos completados'}>{count}/4</span>
      </div>
      <div className="admin-guide-progress" role="progressbar" aria-label="Progreso de configuración"
        aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}>
        <span style={{ width: count * 25 + '%' }} />
      </div>
      <div className="admin-guide-identity">
        <Settings2 size={19} aria-hidden="true" />
        <div>
          <strong>Empieza por la identidad del grupo</strong>
          <p>En tu perfil puedes revisar el nombre y los colores de la pañoleta.</p>
        </div>
        <button className="secondary" type="button" onClick={onSettings}>Configurar</button>
      </div>
      <ol className="admin-guide-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'is-done' : ''}>
            <span className="admin-guide-step-icon">
              {step.done ? <Check size={19} aria-hidden="true" /> : <step.icon size={19} aria-hidden="true" />}
            </span>
            <div className="admin-guide-step-description">
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            {step.done
              ? <span className="admin-guide-done">Hecho</span>
              : <button type="button" className="secondary" disabled={!step.allowed}
                  title={!step.allowed ? 'Completa primero el paso anterior' : undefined}
                  onClick={step.action}>{step.label}</button>}
          </li>
        ))}
      </ol>
      <div className="admin-guide-footer">
        <button type="button" className={count === 4 ? 'primary' : 'secondary'}
          disabled={saving} onClick={() => void finish()}>
          {saving ? 'Guardando…' : count === 4 ? 'Finalizar bienvenida' : 'Omitir guía por ahora'}
        </button>
        <button type="button" className="text-link" onClick={onPractice}>
          Practicar con una tarea ficticia
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
