import React, { useState } from 'react';
import type { User } from './types';
import { BananaLoader } from './BananaLoader';
import { api } from './api';
type Props = {
  user: User;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  onSaved: (user: User) => void;
};
async function readPhoto(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error('Elige una foto PNG, JPEG o WebP de hasta 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la foto.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const side = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function ProfileForm({ user, busy, run, onSaved }: Props) {
  const current = JSON.parse(user.preferences || '{}');
  const [photo, setPhoto] = useState<string | null | undefined>(undefined),
    [error, setError] = useState(''),
    [readingPhoto, setReadingPhoto] = useState(false);
  const avatar = photo === undefined ? user.avatarUrl : photo;
  return (
    <form
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
            ...(photo !== undefined ? { avatarUrl: photo } : {}),
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
      <label>
        Foto de perfil
        {avatar && (
          <img className="profile-avatar-preview" src={avatar} alt="Vista previa de tu foto" />
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            if (file) {
              try {
                setPhoto(await readPhoto(file));
                setError('');
              } catch (error) {
                setError((error as Error).message);
              }
            }
          }}
        />
        <small>PNG, JPEG o WebP. Máximo 5 MB.</small>
        {readingPhoto && <BananaLoader compact label="Preparando foto…" />}
      </label>
      {avatar && (
        <button className="text-link" type="button" onClick={() => setPhoto(null)}>
          Quitar foto
        </button>
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
