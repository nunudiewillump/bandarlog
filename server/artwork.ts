import { eq, and, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { setTimeout as pause } from 'node:timers/promises';
import type { Database } from './db.js';
import { commissions } from './schema.js';
export async function artworkImage(value: unknown, kind: 'icon' | 'mascot') {
  if (
    typeof value !== 'string' ||
    !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ||
    value.length > 2000000
  )
    throw new Error('La imagen generada no es válida.');
  const buffer = await sharp(Buffer.from(value.split(',')[1], 'base64'), {
    limitInputPixels: 2000000,
  })
    .resize(kind === 'icon' ? 192 : 512, kind === 'icon' ? 192 : 640, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toBuffer();
  return 'data:image/webp;base64,' + buffer.toString('base64');
}
export async function generateCommissionArtwork(
  db: Database,
  cid: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
) {
  const [commission] = await db.select().from(commissions).where(eq(commissions.id, cid));
  if (!commission) return;
  if (!env.ARTWORK_WORKER_URL) {
    await db
      .update(commissions)
      .set({ artworkStatus: 'unavailable' })
      .where(eq(commissions.id, cid));
    return;
  }
  const claimed = await db
    .update(commissions)
    .set({ artworkStatus: 'running' })
    .where(
      and(
        eq(commissions.id, cid),
        inArray(commissions.artworkStatus, ['pending', 'failed', 'unavailable']),
      ),
    )
    .returning();
  if (!claimed.length) return;
  try {
    const data = await requestArtwork(
      env.ARTWORK_WORKER_URL,
      env.ARTWORK_WORKER_TOKEN,
      { name: commission.name, description: commission.description },
      request,
    );
    const iconUrl = await artworkImage(data.iconUrl, 'icon'),
      mascotUrl = await artworkImage(data.mascotUrl, 'mascot');
    await db
      .update(commissions)
      .set({ iconUrl, mascotUrl, artworkStatus: 'ready' })
      .where(eq(commissions.id, cid));
  } catch {
    await db.update(commissions).set({ artworkStatus: 'failed' }).where(eq(commissions.id, cid));
  }
}

// Each HTTP request finishes quickly; CPU inference runs independently of the tunnel.
export async function requestArtwork(
  baseUrl: string,
  token: string | undefined,
  commission: { name: string; description: string },
  request: typeof fetch = fetch,
  options = { pollIntervalMs: 3000, timeoutMs: 1200000 },
) {
  const url = new URL('/jobs', baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de imágenes no válida.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('El servicio remoto de imágenes requiere HTTPS.');
  const lifetime = AbortSignal.timeout(options.timeoutMs);
  async function call(endpoint: URL, body?: unknown) {
    const response = await request(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([lifetime, AbortSignal.timeout(30000)]),
    });
    if (!response.ok) throw new Error('El servicio de imágenes no respondió correctamente.');
    if (Number(response.headers.get('content-length') || 0) > 4500000)
      throw new Error('Respuesta de imágenes demasiado grande.');
    const text = await response.text();
    if (text.length > 4500000) throw new Error('Respuesta de imágenes demasiado grande.');
    return JSON.parse(text);
  }
  const job = await call(url, commission);
  if (typeof job.id !== 'string' || !/^[a-f0-9]{32}$/.test(job.id))
    throw new Error('Identificador de generación no válido.');
  const statusUrl = new URL('/jobs/' + job.id, url);
  while (true) {
    lifetime.throwIfAborted();
    const result = await call(statusUrl);
    if (result.status === 'ready' && result.result) return result.result;
    if (!['queued', 'running'].includes(result.status))
      throw new Error('No se pudieron generar las ilustraciones.');
    await pause(options.pollIntervalMs, undefined, { signal: lifetime });
  }
}
