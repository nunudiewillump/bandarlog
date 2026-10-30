import { useRef, useState } from 'react';
import { ChevronRight, LogOut, Pencil } from 'lucide-react';
import type { User } from './types';
import { api } from './api';
import { ProfileForm, profilePreferences } from './ProfileForm';
import './profile-panel.css';
import { TutorialStats } from './TutorialStats';
import { DeviceNotifications } from './DeviceNotifications';

type Props = {
  onReplayTutorial?: () => void;
  user: User;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  onSaved: (user: User) => void;
  onLogout: () => void | Promise<void>;
};
function Neckerchief() {
  return (
    <svg className="profile-neckerchief" viewBox="0 0 52 60" aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id="scout-stripes"
          patternUnits="userSpaceOnUse"
          width="12"
          height="12"
          patternTransform="rotate(35)"
        >
          <rect width="12" height="12" fill="#d75a9e" />
          <rect width="6" height="12" fill="#7b3d93" />
        </pattern>
      </defs>
      <path
        d="M4 8Q26-2 48 8L34 34 31 38 38 54 26 49 14 54 21 38 18 34Z M13 9Q26 16 39 9L26 30Z"
        fillRule="evenodd"
        fill="url(#scout-stripes)"
        stroke="#633174"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M21 30 31 30 32 39 20 39Z"
        fill="url(#scout-stripes)"
        stroke="#633174"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m23 32 6 5" stroke="#ed9cc5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
export function ProfilePanel({ user, busy, run, onSaved, onLogout, onReplayTutorial }: Props) {
  const [editing, setEditing] = useState<'profile' | 'notifications' | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const noticeButton = useRef<HTMLButtonElement>(null);
  const current = profilePreferences(user);
  const days = Array.isArray(current.reminderDays) ? current.reminderDays : [7, 3];
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  function finish() {
    const target = editing === 'profile' ? editButton : noticeButton;
    setEditing(null);
    requestAnimationFrame(() => target.current?.focus());
  }
  return (
    <div className="profile-overview">
      <section className="profile-identity" aria-label="Información personal">
        {editing === 'profile' ? (
          <ProfileForm
            key="profile"
            mode="profile"
            user={user}
            busy={busy}
            run={run}
            onSaved={onSaved}
            onDone={finish}
            onCancel={finish}
          />
        ) : (
          <>
            <div className="profile-photo-display">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Tu foto de perfil" />
              ) : (
                <span aria-label="Foto de perfil sin configurar">{initials || '?'}</span>
              )}
            </div>
            <dl className="profile-information">
              <div>
                <dt>Nombre</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Correo electrónico</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Grupo Scout</dt>
                <dd className="profile-group">
                  <Neckerchief />
                  <span>Rosales del Canal 702</span>
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="secondary profile-edit-trigger"
              ref={editButton}
              disabled={busy}
              onClick={() => setEditing('profile')}
            >
              <Pencil size={17} />
              Editar perfil
            </button>
          </>
        )}
      </section>
      <details
        className="profile-preferences"
        onToggle={(event) => {
          if (!event.currentTarget.open && editing === 'notifications') setEditing(null);
        }}
      >
        <summary>
          Preferencias
          <ChevronRight size={18} aria-hidden="true" />
        </summary>
        <div className="profile-preferences-content">
          {editing === 'notifications' ? (
            <ProfileForm
              key="notifications"
              mode="notifications"
              user={user}
              busy={busy}
              run={run}
              onSaved={onSaved}
              onDone={finish}
              onCancel={finish}
            />
          ) : (
            <section className="profile-notice-summary">
              <h2>Avisos de tareas</h2>
              <p>
                {current.notifications === false
                  ? 'Avisos por correo desactivados.'
                  : days.length
                    ? `Recordatorios ${days.join(' y ')} días antes del vencimiento.`
                    : 'Sin recordatorios previos al vencimiento.'}
              </p>
              {current.notifications !== false && (
                <p>
                  {[
                    current.creation !== false && 'Creación',
                    current.updates !== false && 'actualizaciones',
                    current.onDue !== false && 'vencimiento',
                    current.overdueWeekly !== false && 'vencidas cada semana',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sin avisos adicionales.'}
                </p>
              )}
              <button
                type="button"
                className="secondary"
                ref={noticeButton}
                disabled={busy}
                onClick={() => setEditing('notifications')}
              >
                Configurar avisos
              </button>
            </section>
          )}
          <DeviceNotifications userId={user.id} />
          <section className="profile-appearance">
            <h2>Apariencia</h2>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={current.forestEffects !== false}
                disabled={busy}
                onChange={(event) => {
                  const forestEffects = event.currentTarget.checked;
                  void run(
                    async () => {
                      await api('/profile', 'PATCH', { forestEffects });
                      const session = await api('/me');
                      onSaved(session.user);
                    },
                    forestEffects ? 'Copa y hojas activadas' : 'Copa y hojas ocultas',
                  );
                }}
              />
              Mostrar copa y hojas
            </label>
            <p>Incluye el movimiento al pasar el ratón y las hojas que caen.</p>
          </section>
        </div>
      </details>
      {onReplayTutorial && (
        <details className="profile-help">
          <summary>
            Ayuda <ChevronRight size={18} />
          </summary>
          <button type="button" className="secondary" onClick={onReplayTutorial}>
            Repetir tutorial
          </button>
          {user.role === 'admin' && <TutorialStats />}
        </details>
      )}
      <button
        type="button"
        className="text-link profile-logout"
        disabled={busy}
        onClick={() => void onLogout()}
      >
        <LogOut size={17} />
        Cerrar sesión
      </button>
    </div>
  );
}
