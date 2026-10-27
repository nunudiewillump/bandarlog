import { eq, and, inArray } from 'drizzle-orm';
import sharp from 'sharp';
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
    const url = new URL('/generate', env.ARTWORK_WORKER_URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de imágenes no válida.');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('El servicio remoto de imágenes requiere HTTPS.');
    const response = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ARTWORK_WORKER_TOKEN
          ? { Authorization: `Bearer ${env.ARTWORK_WORKER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ name: commission.name, description: commission.description }),
      signal: AbortSignal.timeout(600000),
    });
    if (!response.ok) throw new Error('El servicio de imágenes no respondió correctamente.');
    if (Number(response.headers.get('content-length') || 0) > 4500000)
      throw new Error('Respuesta de imágenes demasiado grande.');
    const body = await response.text();
    if (body.length > 4500000) throw new Error('Respuesta de imágenes demasiado grande.');
    const data = JSON.parse(body);
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
