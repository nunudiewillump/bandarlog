import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Data } from './types';
type Activity = Data['activity'][number];
export function PagedActivity({
  initial,
  taskId,
  commissionId,
  revision,
  children,
}: {
  initial: Activity[];
  taskId?: string;
  commissionId?: string;
  revision: unknown;
  children: (item: Activity) => ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url =
    '/activity?' +
    new URLSearchParams({
      ...(taskId ? { taskId } : {}),
      ...(commissionId ? { commissionId } : {}),
      limit: '50',
    });
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setItems(initial);
    setCursor(null);
    void api(url)
      .then((page) => {
        if (active) {
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (active)
          setError('No se pudo actualizar la actividad. Se conserva la información disponible.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  async function more() {
    if (busy || !cursor) return;
    setBusy(true);
    setError('');
    try {
      const page = await api(url + '&cursor=' + encodeURIComponent(cursor));
      setItems((previous) => [
        ...new Map([...previous, ...page.items].map((item: Activity) => [item.id, item])).values(),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setError('No se pudo cargar la actividad anterior. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!items.length && !busy && !error && <p>Sin actividad todavía.</p>}
      {items.map(children)}
      {error && <p role="status">{error}</p>}
      {cursor && (
        <button className="secondary" disabled={busy} onClick={() => void more()}>
          {busy ? 'Cargando…' : 'Cargar actividad anterior'}
        </button>
      )}
    </>
  );
}
