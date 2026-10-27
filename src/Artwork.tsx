import { useState, useEffect } from 'react';
import { api } from './api';
import { Select } from './Select';
import { BananaLoader } from './BananaLoader';
import {
  artworkCatalog,
  artworkThemes,
  normalizeArtworkText,
  type ArtworkTheme,
  type ArtworkEntry,
} from '../shared/scout-catalog';

export function MascotArt({ src, className = '' }: { src: string; className?: string }) {
  const match = src.match(/^(\/artwork\/mascots\/\d+\.webp)#tile=([0-5])$/);
  if (!match) return <img src={src} className={className} alt="" />;
  const tile = Number(match[2]);
  return (
    <svg
      className={className}
      viewBox={`${(tile % 3) * 512} ${Math.floor(tile / 3) * 512} 512 512`}
      aria-hidden="true"
      focusable="false"
    >
      <image href={match[1]} width="1536" height="1024" />
    </svg>
  );
}

export function ArtworkPicker({
  theme,
  selected,
  automatic,
  busy,
  onChoose,
  canAdd,
}: {
  theme: ArtworkTheme;
  selected?: string;
  automatic: boolean;
  busy: boolean;
  canAdd: boolean;
  onChoose: (key: string | null) => void;
}) {
  const [catalogue, setCatalogue] = useState<ArtworkEntry[]>(artworkCatalog);
  const [adding, setAdding] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false);
  useEffect(() => {
    void api('/artwork/catalog')
      .then(setCatalogue)
      .catch(() => setCatalogueError(true));
  }, []);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(24);
  const entries = catalogue.filter(
    (entry) =>
      entry.collection === theme &&
      normalizeArtworkText(`${entry.name} ${entry.familyName}`).includes(
        normalizeArtworkText(query),
      ),
  );
  return (
    <div className="artwork-picker">
      {catalogueError && (
        <p className="error" role="alert">
          No se han podido cargar las parejas añadidas. Cierra y vuelve a abrir el catálogo para
          reintentar.
        </p>
      )}
      {canAdd && (
        <button className="secondary" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancelar ampliación' : 'Añadir pareja al catálogo'}
        </button>
      )}
      {adding && <ArtworkUpload theme={theme} onAdded={(id) => onChoose(id)} />}
      <p>
        Colección: <strong>{artworkThemes.find((item) => item.id === theme)?.name}</strong>
      </p>
      <button
        className={automatic ? 'primary' : 'secondary'}
        disabled={busy}
        onClick={() => onChoose(null)}
      >
        Elegir automáticamente
      </button>
      <label>
        Buscar ilustración
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(24);
          }}
          placeholder="Cocina, orientación, campanas…"
        />
      </label>
      <div className="artwork-grid">
        {entries.slice(0, limit).map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={`artwork-choice ${selected === entry.id ? 'selected' : ''}`}
            aria-pressed={selected === entry.id}
            disabled={busy}
            onClick={() => onChoose(entry.id)}
          >
            <MascotArt src={entry.mascotUrl} />
            <span>
              <img src={entry.iconUrl} alt="" loading="lazy" />
              {entry.name}
            </span>
          </button>
        ))}
      </div>
      {!entries.length && <p role="status">No hay ilustraciones con esa búsqueda.</p>}
      {entries.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 24)}>
          Mostrar más ilustraciones
        </button>
      )}
    </div>
  );
}

async function prepareAsset(file: File, icon: boolean) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10000000)
    throw new Error('Selecciona PNG, JPEG o WebP de hasta 10 MB.');
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 16000000)
      throw new Error('La imagen supera los 16 megapíxeles.');
    const scale = Math.min(1, (icon ? 192 : 512) / image.width, (icon ? 192 : 640) / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', 0.82);
    if (data.length > 190000)
      throw new Error('La imagen es demasiado grande. Usa una versión más pequeña.');
    return data;
  } finally {
    image.close();
  }
}
function ArtworkUpload({ theme, onAdded }: { theme: ArtworkTheme; onAdded: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const families = [
    ...new Map(
      artworkCatalog.filter((a) => a.collection === 'scout').map((a) => [a.family, a.familyName]),
    ).entries(),
  ];
  return (
    <form
      className="artwork-upload panel"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          const icon = await prepareAsset(form.get('icon') as File, true);
          const mascot = await prepareAsset(form.get('mascot') as File, false);
          if (icon.length + mascot.length > 230000)
            throw new Error('Reduce el tamaño de las imágenes antes de subirlas.');
          const result = await api('/artwork/catalog', 'POST', {
            name: form.get('name'),
            family: form.get('family'),
            collection: theme,
            icon,
            mascot,
          });
          onAdded(result.id);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : 'No se ha podido añadir la ilustración.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Nombre de la ilustración
        <input name="name" maxLength={200} required />
      </label>
      <label>
        Tipo de comisión
        <Select name="family" required defaultValue="gestion">
          {families.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Icono
        <input name="icon" type="file" accept="image/png,image/jpeg,image/webp" required />
      </label>
      <label>
        Mono
        <input name="mascot" type="file" accept="image/png,image/jpeg,image/webp" required />
      </label>
      <p className="hint">
        La pareja se añade a esta colección para reutilizarla en otras comisiones. Usa imágenes con
        fondo transparente.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && <BananaLoader compact label="Guardando ilustraciones…" />}
      <button className="primary" disabled={busy}>
        Guardar y utilizar
      </button>
    </form>
  );
}
