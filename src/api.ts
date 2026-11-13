import { groupBasePath } from './group-location';
import { offline, requestSync } from './offline';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public readonly recovery: {
      retryAfter?: number;
      challengeId?: string;
      expiresIn?: number;
    } = {},
  ) {
    super(message);
  }
}
const revisions = new WeakMap<object, string>();
export const snapshotRevision = (data: object) => revisions.get(data);
let csrf = '';
let latestDataRequest = 0;
let writeVersion = 0;
const pendingReads = new Map<string, { version: number; promise: Promise<any> }>();
export const setCSRF = (value: string) => {
  csrf = value;
};
export function api(path: string, method = 'GET', body?: unknown): Promise<any> {
  if (method !== 'GET') {
    writeVersion++;
    return request(path, method, body).finally(() => {
      writeVersion++;
    });
  }
  if (!['/data', '/me', '/health', '/auth/config'].includes(path))
    return request(path, method, body);
  const key = groupBasePath() + path;
  const current = pendingReads.get(key);
  if (current?.version === writeVersion) return current.promise;
  const promise = request(path, method, body).finally(() => {
    if (pendingReads.get(key)?.promise === promise) pendingReads.delete(key);
  });
  pendingReads.set(key, { version: writeVersion, promise });
  return promise;
}
async function request(path: string, method: string, body?: unknown) {
  const readVersion = writeVersion;
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
    response = await fetch(`${groupBasePath()}/api${path}`, {
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
    throw new ApiError(data.error || 'No se pudo completar la operación.', response.status, {
      retryAfter: data.retryAfter,
      challengeId: data.challengeId,
      expiresIn: data.expiresIn,
    });
  if (dataRequest && data && typeof data === 'object') {
    const revision = response.headers.get('X-Data-Revision');
    if (revision) revisions.set(data, revision);
  }
  if (dataRequest && dataRequest !== latestDataRequest) return data;
  if (method === 'GET' && readVersion === writeVersion && ['/me', '/data'].includes(path)) {
    const remembered = await offline.remember(path, data);
    const revision = revisions.get(data);
    if (revision && remembered && typeof remembered === 'object')
      revisions.set(remembered, revision);
    return remembered;
  }
  return data;
}
