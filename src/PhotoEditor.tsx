import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, RotateCcw } from 'lucide-react';
import { BananaLoader } from './BananaLoader';

export type PhotoSource = { image: HTMLImageElement; src: string; width: number; height: number };
export async function preparePhoto(file: File): Promise<PhotoSource> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Elige una foto de hasta 30 MB.');
  if (
    (file.type && !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) ||
    (!file.type && !/\.(jpe?g|png|webp|avif)$/i.test(file.name))
  )
    throw new Error('Elige una foto JPG, PNG, WebP o AVIF.');
  // Data URLs are permitted by the production image policy; blob URLs are not.
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo abrir el archivo. Inténtalo otra vez.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    throw new Error('No se pudo leer esta foto. Prueba otra imagen JPG o PNG.');
  }
  return { image, src, width: image.naturalWidth, height: image.naturalHeight };
}

export function PhotoEditor({
  source,
  busy,
  onCancel,
  onSave,
}: {
  source: PhotoSource;
  busy: boolean;
  onCancel: () => void;
  onSave: (photo: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const base = Math.max(256 / source.width, 256 / source.height);
  const scale = base * zoom;
  const clamp = (position: typeof pan, nextZoom = zoom) => {
    const x = Math.max(0, (source.width * base * nextZoom - 256) / 2);
    const y = Math.max(0, (source.height * base * nextZoom - 256) / 2);
    return { x: Math.max(-x, Math.min(x, position.x)), y: Math.max(-y, Math.min(y, position.y)) };
  };
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const changeZoom = (value: number) => {
    const next = Math.max(1, Math.min(4, value));
    setZoom(next);
    setPan((current) => clamp(current, next));
  };
  async function save() {
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d')!;
      const side = 256 / scale;
      context.drawImage(
        source.image,
        (source.width - side) / 2 - pan.x / scale,
        (source.height - side) / 2 - pan.y / scale,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      let photo = canvas.toDataURL('image/webp', 0.82);
      if (photo.length > 200000) photo = canvas.toDataURL('image/jpeg', 0.8);
      if (!(await onSave(photo))) setError('No se pudo guardar la foto. Vuelve a intentarlo.');
    } catch {
      setError('No se pudo preparar la foto. Prueba otra imagen.');
    }
  }
  return createPortal(
    <dialog
      className="photo-editor"
      ref={dialog}
      aria-labelledby="photo-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <header>
        <h2 id="photo-editor-title">Ajustar foto</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancelar recorte"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={20} />
        </button>
      </header>
      <p>Arrastra la foto y ajusta el zoom. Se guardará lo que ves en el círculo.</p>
      <div
        className="photo-crop-stage"
        tabIndex={0}
        role="group"
        aria-label="Posición de la foto. Arrastra o usa las flechas para moverla."
        onKeyDown={(event) => {
          const move = {
            ArrowLeft: [-8, 0],
            ArrowRight: [8, 0],
            ArrowUp: [0, -8],
            ArrowDown: [0, 8],
          }[event.key];
          if (move && !busy) {
            event.preventDefault();
            setPan((current) => clamp({ x: current.x + move[0], y: current.y + move[1] }));
          }
        }}
        onPointerDown={(event) => {
          if (busy) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current || busy) return;
          const ratio = 256 / event.currentTarget.getBoundingClientRect().width;
          setPan(
            clamp({
              x: drag.current.panX + (event.clientX - drag.current.x) * ratio,
              y: drag.current.panY + (event.clientY - drag.current.y) * ratio,
            }),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          src={source.src}
          alt="Vista previa del recorte"
          draggable={false}
          style={{
            width: source.width * scale,
            height: source.height * scale,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        />
      </div>
      <label className="photo-zoom">
        Zoom
        <input
          type="range"
          min="1"
          max="4"
          step="0.01"
          value={zoom}
          disabled={busy}
          onChange={(event) => changeZoom(Number(event.target.value))}
        />
      </label>
      <div className="photo-crop-tools">
        <button
          type="button"
          className="secondary"
          aria-label="Alejar foto"
          disabled={busy || zoom <= 1}
          onClick={() => changeZoom(zoom - 0.25)}
        >
          <Minus size={18} />
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={16} /> Centrar
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Acercar foto"
          disabled={busy || zoom >= 4}
          onClick={() => changeZoom(zoom + 0.25)}
        >
          <Plus size={18} />
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small>Se comprime automáticamente antes de guardarse.</small>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
        {busy ? <BananaLoader compact label="Guardando foto…" /> : 'Guardar foto'}
      </button>
    </dialog>,
    document.body,
  );
}
