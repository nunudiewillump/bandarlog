import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { ForestHeader } from './ForestHeader';
import { PhotoEditor, preparePhoto, type PhotoSource } from './PhotoEditor';
import { BananaLoader } from './BananaLoader';
import { api } from './api';
import type { User } from './types';
export function Onboarding({ user, onComplete }: { user: User; onComplete: () => Promise<void> }) {
  const [name, setName] = useState(user.name),
    [avatar, setAvatar] = useState(user.avatarUrl || ''),
    [source, setSource] = useState<PhotoSource | null>(null),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  async function read(file?: File) {
    if (!file) return;
    setReading(true);
    setError('');
    try {
      setSource(await preparePhoto(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function save(omitPhoto = false) {
    if (!name.trim()) {
      setError('Escribe tu nombre para continuar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/onboarding', 'POST', {
        name: name.trim(),
        ...(!omitPhoto && avatar ? { avatarUrl: avatar } : {}),
      });
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="forest-auth">
      <ForestHeader />
      <main className="forest-auth-main onboarding-main">
        <h1>¿Cómo te llamamos?</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Nombre
            <input
              required
              autoComplete="name"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="onboarding-photo">
            {avatar ? <img src={avatar} alt="Vista previa de tu foto" /> : <Camera size={30} />}
            <strong>Foto de perfil</strong>
            <span>Opcional</span>
          </div>
          <input
            ref={picker}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          <input
            ref={camera}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept="image/*"
            capture="user"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || reading}
            onClick={() => picker.current?.click()}
          >
            Elegir foto
          </button>
          <button
            type="button"
            className="text-link"
            disabled={busy || reading}
            onClick={() => camera.current?.click()}
          >
            <Camera size={18} />
            Hacer foto
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {reading && <BananaLoader compact label="Preparando foto…" />}
          <button className="primary" disabled={busy || reading}>
            Continuar
          </button>
          <button
            type="button"
            className="text-link"
            disabled={busy || reading}
            onClick={() => void save(true)}
          >
            Ahora no, sin foto
          </button>
        </form>
        {source && (
          <PhotoEditor
            source={source}
            busy={busy}
            onCancel={() => setSource(null)}
            onSave={async (photo) => {
              setAvatar(photo);
              setSource(null);
              return true;
            }}
          />
        )}
      </main>
    </div>
  );
}
