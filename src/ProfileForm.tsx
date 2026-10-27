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
};
export function ProfileForm({ user, busy, run, onSaved }: Props) {
  const current = JSON.parse(user.preferences || '{}');
  const photoId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [editingPhoto, setEditingPhoto] = useState<PhotoSource | null>(null),
    [error, setError] = useState(''),
    [readingPhoto, setReadingPhoto] = useState(false);
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
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const raw = String(f.get('reminderDays') || '').trim();
        const days = raw ? raw.split(/[,;\s]+/).map(Number) : [];
        if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 90) || days.length > 10) {
          setError('Indica hasta 10 días de antelación entre 1 y 90.');
          return;
        }
        setError('');
        await run(async () => {
          await api('/profile', 'PATCH', {
            name: f.get('name'),
            notifications: f.get('notifications') === 'on',
            creation: f.get('creation') === 'on',
            updates: f.get('updates') === 'on',
            reminderDays: [...new Set(days)].sort((a, b) => b - a),
            onDue: f.get('onDue') === 'on',
            overdueWeekly: f.get('overdueWeekly') === 'on',
            weekly:
              user.role === 'admin' || user.role === 'coordination'
                ? f.get('weekly') === 'on'
                : current.weekly !== false,
          });
          const session = await api('/me');
          onSaved(session.user);
        }, 'Perfil guardado');
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Nombre
        <input required name="name" defaultValue={user.name} maxLength={200} autoComplete="name" />
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
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) {
              setReadingPhoto(true);
              try {
                setEditingPhoto(await preparePhoto(file));
                setError('');
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setReadingPhoto(false);
              }
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
          disabled={busy}
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
      <fieldset>
        <legend>Avisos de tareas</legend>
        <label className="checkbox-line">
          <input
            type="checkbox"
            name="notifications"
            defaultChecked={current.notifications !== false}
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
            defaultValue={(current.reminderDays ?? [7, 3]).join(', ')}
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
      </fieldset>
      {(user.role === 'admin' || user.role === 'coordination') && (
        <label className="checkbox-line">
          <input type="checkbox" name="weekly" defaultChecked={current.weekly !== false} />
          Resumen semanal de coordinación
        </label>
      )}
      <button className="primary" disabled={busy || readingPhoto}>
        Guardar perfil y avisos
      </button>
    </form>
  );
}
