import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { publicInfo } from '../shared/public-info';
import type { ScoutGroup } from './types';
import { WelcomeTaskDemo } from './WelcomeTaskDemo';
import './welcome-presentation.css';

const titles = [
  '¡Bienvenidxs!',
  'Cómo nos organizamos',
  'Las tareas',
  'Una app viva',
  'Evaluación',
  'Personas, no RRHH',
  '¡Buena caza!',
];
const copy = [
  [
    '¡Hola! ¡Bienvenidxs a Bandarlog! Una herramienta de gestión pensada para grupos como el vuestro.',
    'Disponible tanto en ordenador como en cualquier móvil.',
  ],
  [
    'Para organizarse mejor, Bandarlog trabaja con vuestras herramientas actuales: Proyectos, como puede ser un campamento o una Ronda Solar, y Comisiones, grupos de trabajo más pequeños donde se desarrollan las tareas que pertenecen a cada Proyecto.',
  ],
  [
    '¿No se os ha olvidado nunca pedir toda la comida de campamento? ¡A nosotrxs tampoco! Aunque nunca digas nunca…',
    'Cada Tarea vive en una Comisión, que es parte de un Proyecto.',
    'Hacer el seguimiento de las tareas es fácil. Tienen cuatro estados.',
  ],
  [
    'Bandarlog es una app viva, con sus notificaciones para lxs Scouters más despistadxs y resúmenes semanales para que las Coordinaciones podamos seguir el progreso de nuestro grupo.',
  ],
  [
    '¿Sabéis qué hace el Scouter después de cagar? ¡Evaluar!',
    'Con Bandarlog se hace más sencillo que nunca. Al acabar el proyecto, una evaluación personalizada para juntar tanto las comisiones como los proyectos.',
  ],
  [
    'Y como lxs voluntarixs no somos RRHH, sino Personas, puedes seguir la carga del Kraal desde esta misma sección.',
  ],
  [
    '¡Bandarlog es la herramienta para apoyaros en todas vuestras aventuras!',
    'Seguimos mejorándola día a día gracias al trabajo de los Kraales que ya confían en nosotrxs.',
  ],
];
const states = [
  ['pending', 'Pendiente', 'Cuando se crea.'],
  ['in_progress', 'En curso', 'Cuando el kraal empieza a trabajarla.'],
  ['blocked', 'Bloqueada', 'Cuando falta algo o surge algún problema.'],
  ['done', 'Finalizada', 'Cuando está hecha.'],
];
const poses = {
  wave: ['/monkey-wave-2d.png', 210, 240],
  horn: ['/monkey-trumpeter-2d.webp', 350, 400],
  vine: ['/monkey-vine-2d.webp', 569, 650],
} as const;

function Monkey({ pose, className = '' }: { pose: keyof typeof poses; className?: string }) {
  const [source, width, height] = poses[pose];
  return (
    <span
      className={`welcome-monkey ${className}`}
      style={
        {
          '--welcome-scarf-mask': `url("/welcome/${pose}-scarf.webp")`,
        } as CSSProperties
      }
    >
      <img src={source} alt="" width={width} height={height} />
    </span>
  );
}

function Label({
  label,
  children,
  delay = 0,
}: {
  label: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="welcome-example welcome-reveal"
      style={{ '--welcome-delay': `${delay}ms` } as CSSProperties}
    >
      <small>{label}</small>
      <strong>{children}</strong>
    </div>
  );
}

function Scene({ step }: { step: number }) {
  switch (step) {
    case 0:
      return <Monkey pose="wave" className="welcome-jump" />;
    case 1:
      return (
        <>
          <Label label="Proyecto">Campamento de verano</Label>
          <Label label="Comisión ↓" delay={100}>
            Cocina
          </Label>
          <Label label="Tarea ↓" delay={200}>
            Pedir la comida
          </Label>
          <Monkey pose="vine" className="welcome-side" />
        </>
      );
    case 2:
      return <WelcomeTaskDemo />;
    case 3:
      return (
        <>
          <div className="welcome-example welcome-reminder welcome-reveal">
            <Bell size={21} />
            <div>
              <small>Recordatorio</small>
              <strong>Pedir la comida · vence mañana</strong>
            </div>
          </div>
          <div className="welcome-mail">
            <div className="welcome-envelope-back" />
            <div className="welcome-envelope-flap" />
            <div className="welcome-letter">
              <small>Bandarlog · Correo de seguimiento</small>
              <strong>Resumen semanal de comisiones</strong>
              <span>Cocina · 2 tareas finalizadas</span>
              <span>Material · 1 tarea pendiente</span>
            </div>
            <div className="welcome-envelope-front" />
          </div>
          <Monkey pose="horn" className="welcome-side" />
        </>
      );
    case 4:
      return (
        <>
          <Label label="Evaluaciones de comisión">Cocina · Material · Logística</Label>
          <Label label="Evaluación de proyecto ↓" delay={100}>
            Campamento de verano
          </Label>
          <div className="welcome-pdf">
            <strong>PDF</strong>
            <span>Evaluación de proyecto</span>
            <i />
            <i />
          </div>
          <Monkey pose="wave" className="welcome-side welcome-side-left" />
        </>
      );
    case 5:
      return (
        <>
          <div className="welcome-team">
            <Monkey pose="wave" />
            <Monkey pose="vine" />
            <Monkey pose="wave" />
          </div>
          <div className="welcome-example welcome-workload">
            <strong>Carga y evolución del equipo</strong>
            <small>Comisión del análisis</small>
            <div>
              Todas las comisiones <span>⌄</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Scouter</th>
                  <th>Carga abierta</th>
                  <th>Progreso</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Alex</th>
                  <td>2 pendientes</td>
                  <td>
                    3/5 terminadas
                    <progress value={3} max={5} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Noa</th>
                  <td>1 pendiente</td>
                  <td>
                    2/3 terminadas
                    <progress value={2} max={3} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      );
    default:
      return <Monkey pose="horn" className="welcome-jump" />;
  }
}

export default function WelcomePresentation({
  origin,
  group,
  evaluationsEnabled,
  pending,
  error,
  onClose,
  onComplete,
}: {
  origin: 'home' | 'profile';
  group?: ScoutGroup;
  evaluationsEnabled: boolean;
  pending: boolean;
  error: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, []);
  useEffect(() => {
    if (dialog.current) dialog.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  const color = (value: string | undefined, fallback: string) =>
    value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

  return (
    <dialog
      ref={dialog}
      className="welcome-dialog"
      aria-labelledby="welcome-heading"
      aria-describedby="welcome-step"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      style={
        {
          '--welcome-primary': color(group?.colorPrimary, '#d75a9e'),
          '--welcome-secondary': color(group?.colorSecondary, '#7b3d93'),
        } as CSSProperties
      }
    >
      <header className="welcome-header">
        <span>
          <img src="/brand-mark.webp" alt="" width="36" height="36" /> Bandarlog
        </span>
        {group?.name && <span>{group.name}</span>}
      </header>
      <div className="welcome-close">
        <button type="button" className="text-link" disabled={pending} onClick={onClose}>
          {origin === 'profile' ? 'Cerrar' : 'Omitir'}
        </button>
      </div>
      <div className="welcome-spread">
        <section className="welcome-copy" key={step}>
          <h1 id="welcome-heading" ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          {copy[step].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {step === 2 && (
            <ul className="welcome-states">
              {states.map(([id, label, detail]) => (
                <li key={id}>
                  <span className={`badge ${id}`}>{label}</span> {detail}
                </li>
              ))}
            </ul>
          )}
          {step === 4 && !evaluationsEnabled && (
            <p>La evaluación está disponible cuando la función está habilitada para el grupo.</p>
          )}
          {step === 6 && (
            <p>
              Cualquier cuestión, no dudéis en escribirnos a{' '}
              <a href={`mailto:${publicInfo.contact}`}>{publicInfo.contact}</a>.
            </p>
          )}
        </section>
        <div
          className={`welcome-scene welcome-scene-${step + 1}`}
          key={`scene-${step}`}
          aria-hidden={step !== 2 || undefined}
        >
          <Scene step={step} />
        </div>
      </div>
      <footer className="welcome-actions">
        <p id="welcome-step">
          Paso {step + 1} de {titles.length}
        </p>
        {error && (
          <p role="alert" className="welcome-error">
            {error}
          </p>
        )}
        <div>
          {step > 0 && (
            <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
              Anterior
            </button>
          )}
          {step === 6 && origin === 'profile' && (
            <button type="button" className="secondary" disabled={pending} onClick={onClose}>
              Volver a Perfil
            </button>
          )}
        </div>
        <button
          type="button"
          className="primary"
          disabled={step === 6 && pending}
          onClick={step === 6 ? onComplete : () => setStep(step + 1)}
        >
          {step === 6 ? '¡Vamos allá!' : 'Siguiente'}
        </button>
      </footer>
    </dialog>
  );
}
