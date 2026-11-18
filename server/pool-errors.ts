import type { EventEmitter } from 'node:events';
type PoolEvent = { at: string; event: 'postgres.pool.idle_error'; code: string };
// pg has already discarded the idle client before it emits this event. An error
// listener prevents an idle disconnect from becoming an uncaught process error.
// Never log the Error/client object: it may include connection credentials.
export function observePoolErrors<T extends EventEmitter>(
  pool: T,
  emit: (event: PoolEvent) => void = (e) => console.error(JSON.stringify(e)),
): T {
  pool.on('error', (error: unknown) => {
    const value =
      error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    const code =
      typeof value === 'string' && /^[A-Z0-9_]{1,32}$/.test(value) ? value : 'CONNECTION_ERROR';
    emit({ at: new Date().toISOString(), event: 'postgres.pool.idle_error', code });
  });
  return pool;
}
