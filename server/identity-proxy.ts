import express from 'express';
import { internalOrigin } from './components.js';
// A closed set: never proxy arbitrary private paths or accept a caller-supplied origin.
export function identityPath(path: string) {
  return (
    /^\/api\/platform\/(?:auth\/(?:config|code\/(?:request|verify)|google\/start)|me|logout|overview|metrics|groups(?:\/[a-zA-Z0-9-]{1,100})?|requests(?:\/[a-f0-9]{64}(?:\/review)?)?|access|mail|audit|preview|test-mail)$/.test(
      path,
    ) ||
    /^\/api\/platform\/(?:feedback(?:\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})?|campaigns\/(?:F0[1-3]|C-[a-f0-9]{32})|campaign-library(?:\/C-[a-f0-9]{32}\/[1-9]\d*(?:\/results)?)?|insights\/(?:segments|adoption))$/.test(
      path,
    ) ||
    /^(?:\/g\/[a-f0-9]{32})?\/api\/auth\/(?:request|verify|config|code\/(?:request|verify)|google\/(?:start|callback|return|resume))$/.test(
      path,
    ) ||
    [
      '/crear-grupo',
      '/aprobar-grupo',
      '/confirmar-grupo',
      '/aprobar-grupo/revisar',
      '/confirmar-grupo/revisar',
    ].includes(path)
  );
}
export function identityProxy(origin: string) {
  const target = internalOrigin(origin, 'IDENTITY_URL');
  const body = express.raw({ type: () => true, limit: '256kb' });
  return [
    ((q, r, next) => (identityPath(q.path) ? body(q, r, next) : next())) as express.RequestHandler,
    (async (q, r, next) => {
      if (!identityPath(q.path)) return next();
      if (!['GET', 'HEAD', 'POST'].includes(q.method)) return r.sendStatus(405);
      try {
        const headers: Record<string, string> = {
          'X-Forwarded-For': q.ip || q.socket.remoteAddress || '',
          'X-Bandarlog-Public-Host': q.get('host') || '',
        };
        for (const name of ['cookie', 'content-type', 'origin', 'x-csrf-token']) {
          const value = q.get(name);
          if (value) headers[name] = value;
        }
        const response = await fetch(target + q.originalUrl, {
          method: q.method,
          headers,
          body:
            Buffer.isBuffer(q.body) && q.body.length ? new Uint8Array(q.body).buffer : undefined,
          redirect: 'manual',
          signal: AbortSignal.timeout(20000),
        });
        r.status(response.status);
        for (const name of [
          'content-type',
          'location',
          'content-security-policy',
          'cross-origin-opener-policy',
          'referrer-policy',
        ]) {
          const value = response.headers.get(name);
          if (value) r.set(name, value);
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length) r.set('Set-Cookie', cookies);
        r.set('Cache-Control', 'no-store');
        r.send(Buffer.from(await response.arrayBuffer()));
      } catch {
        r.status(503)
          .set('Cache-Control', 'no-store')
          .json({ error: 'El acceso no está disponible. Inténtalo de nuevo.' });
      }
    }) as express.RequestHandler,
  ];
}
