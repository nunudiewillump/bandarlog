import { offline, requestSync } from './offline';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
let csrf = '';
let latestDataRequest = 0;
export const setCSRF = (value: string) => {
  csrf = value;
};
export async function api(path: string, method = 'GET', body?: unknown) {
  let response: Response;
  const dataRequest = path === '/data' && method === 'GET' ? ++latestDataRequest : 0;
  const mutation = method !== 'GET' ? crypto.randomUUID() : '';
  const canQueue = offline.allowed(path, method);
  if (canQueue && method === 'POST' && ['/tasks', '/commissions'].includes(path))
    body = { ...(body as object), clientId: crypto.randomUUID() };
  async function queued() {
    const result = await offline.enqueue(path, method, body, mutation);
    await requestSync();
    return result;
  }
  // Keep dependent changes behind already queued ones, even just after reconnect.
  if (canQueue && (!navigator.onLine || (await offline.status()).pending)) return queued();
  if (method !== 'GET' && !csrf && navigator.onLine && !path.startsWith('/auth')) {
    const session = await api('/me');
    setCSRF(session.csrf);
  }
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(mutation ? { 'X-Mutation-ID': mutation } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (canQueue) return queued();
    if (method === 'GET') {
      const saved = await offline.cached(path);
      if (saved) return saved;
      if (path === '/health' && (await offline.cached('/me'))) return { ok: true, mail: 'offline' };
    }
    throw new ApiError('Sin conexión. Vuelve a intentarlo cuando recuperes la conexión.');
  }
  const data = await response
    .json()
    .catch(() => ({ error: 'No se ha podido leer la respuesta. Vuelve a intentarlo.' }));
  if (!response.ok)
    throw new ApiError(data.error || 'No se pudo completar la operación.', response.status);
  if (dataRequest && dataRequest !== latestDataRequest) return data;
  if (method === 'GET' && ['/me', '/data'].includes(path)) return offline.remember(path, data);
  return data;
}
