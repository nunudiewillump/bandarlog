import React, { useState, useId, useRef } from 'react';
import { Camera } from 'lucide-react';
import type { User } from './types';
import { BananaLoader } from './BananaLoader';
import { api } from './api';
import { PhotoEditor, preparePhoto, type PhotoSource } from './PhotoEditor';

type Props = {
  user: User;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  onSaved: (user: User) => void;
  mode?: 'profile' | 'notifications';
  onDone?: () => void;
  onCancel?: () => void;
};
export function profilePreferences(user: User): Record<string, any> {
  try {
    const value = JSON.parse(user.preferences || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
export function ProfileForm({
  user,
  busy,
  run,
  onSaved,
  mode = 'profile',
  onDone,
  onCancel,
}: Props) {
  const current = profilePreferences(user);
  const photoId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [editingPhoto, setEditingPhoto] = useState<PhotoSource | null>(null);
  const [error, setError] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const avatar = user.avatarUrl;
  async function savePhoto(avatarUrl: string | null) {
    setError('');
    const ok = await run(
      async () => {
        await api('/profile', 'PATCH', { avatarUrl });
        const session = await api('/me');
        onSaved(session.user);
      },
      avatarUrl ? 'Foto guardada' : 'Foto eliminada',
    );
    if (ok) setEditingPhoto(null);
    return ok;
  }
  return (
    <form
      className="profile-form"
      aria-label={mode === 'profile' ? 'Editar perfil' : 'Configurar avisos'}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        let changes: Record<string, unknown>;
        if (mode === 'profile') {
          const name = String(form.get('name') || '').trim();
          if (!name) {
            setError('Escribe tu nombre.');
            return;
          }
          changes = { name };
        } else {
          const raw = String(form.get('reminderDays') || '').trim();
          const days = raw ? raw.split(/[,;\s]+/).map(Number) : [];
          if (
            days.some((day) => !Number.isInteger(day) || day < 1 || day > 90) ||
            days.length > 10
          ) {
            setError('Indica hasta 10 días de antelación entre 1 y 90.');
            return;
          }
          changes = {
            notifications: form.get('notifications') === 'on',
            creation: form.get('creation') === 'on',
            updates: form.get('updates') === 'on',
            reminderDays: [...new Set(days)].sort((a, b) => b - a),
            onDue: form.get('onDue') === 'on',
            overdueWeekly: form.get('overdueWeekly') === 'on',
            ...(['admin', 'coordination'].includes(user.role)
              ? { weekly: form.get('weekly') === 'on' }
              : {}),
          };
        }
        setError('');
        const ok = await run(
          async () => {
            await api('/profile', 'PATCH', changes);
            const session = await api('/me');
            onSaved(session.user);
          },
          mode === 'profile' ? 'Perfil guardado' : 'Avisos guardados',
        );
        if (ok) onDone?.();
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === 'profile' ? (
        <>
          <label>
            Nombre
            <input
              required
              name="name"
              defaultValue={user.name}
              maxLength={200}
              autoComplete="name"
              autoFocus
              disabled={busy}
            />
          </label>
          <div className="profile-photo-field">
            <label htmlFor={photoId}>Foto de perfil</label>
            {avatar && (
              <img className="profile-avatar-preview" src={avatar} alt="Vista previa de tu foto" />
            )}
            <input
              type="file"
              id={photoId}
              ref={photoInput}
              className="sr-only"
              tabIndex={-1}
              accept="image/png,image/jpeg,image/webp,image/avif"
              disabled={busy || readingPhoto}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                setReadingPhoto(true);
                try {
                  setEditingPhoto(await preparePhoto(file));
                  setError('');
                } catch (failure) {
                  setError((failure as Error).message);
                } finally {
                  setReadingPhoto(false);
                }
              }}
            />
            <button
              type="button"
              className="secondary photo-picker-button"
              disabled={busy || readingPhoto}
              onClick={() => photoInput.current?.click()}
            >
              <Camera size={18} />
              {avatar ? 'Cambiar foto' : 'Elegir foto'}
            </button>
            <small>JPG, PNG, WebP o AVIF, hasta 30 MB. Se recorta y comprime al guardar.</small>
            {readingPhoto && <BananaLoader compact label="Preparando foto…" />}
          </div>
          {avatar && (
            <button
              className="text-link"
              type="button"
              disabled={busy || readingPhoto}
              onClick={() => void savePhoto(null)}
            >
              Quitar foto
            </button>
          )}
          {editingPhoto && (
            <PhotoEditor
              source={editingPhoto}
              busy={busy}
              onCancel={() => setEditingPhoto(null)}
              onSave={savePhoto}
            />
          )}
        </>
      ) : (
        <fieldset disabled={busy}>
          <legend>Avisos de tareas</legend>
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="notifications"
              defaultChecked={current.notifications !== false}
              autoFocus
            />
            Recibir avisos por correo
          </label>
          <label className="checkbox-line">
            <input type="checkbox" name="creation" defaultChecked={current.creation !== false} />
            Al crear y asignarme una tarea
          </label>
          <label className="checkbox-line">
            <input type="checkbox" name="updates" defaultChecked={current.updates !== false} />
            Cuando se actualice una tarea asignada
          </label>
          <label>
            Días antes del vencimiento
            <input
              name="reminderDays"
              defaultValue={(Array.isArray(current.reminderDays)
                ? current.reminderDays
                : [7, 3]
              ).join(', ')}
              placeholder="7, 3"
            />
            <small>Separados por comas. Deja vacío para no recibir avisos previos.</small>
          </label>
          <label className="checkbox-line">
            <input type="checkbox" name="onDue" defaultChecked={current.onDue !== false} />
            Al vencer la tarea
          </label>
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="overdueWeekly"
              defaultChecked={current.overdueWeekly !== false}
            />
            Un recordatorio semanal mientras siga vencida
          </label>
          {['admin', 'coordination'].includes(user.role) && (
            <label className="checkbox-line">
              <input type="checkbox" name="weekly" defaultChecked={current.weekly !== false} />
              Resumen semanal de coordinación
            </label>
          )}
        </fieldset>
      )}
      <div className="profile-edit-actions">
        {onCancel && (
          <button
            className="secondary"
            type="button"
            disabled={busy || readingPhoto}
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
        <button className="primary" disabled={busy || readingPhoto}>
          {mode === 'profile' ? 'Guardar perfil' : 'Guardar avisos'}
        </button>
      </div>
    </form>
  );
}
