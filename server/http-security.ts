import type { RequestHandler } from 'express';
export const contentSecurityPolicy = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // React/Radix positioning and existing static styles.
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
  },
};
export const sensitiveNavigation: RequestHandler = (q, r, next) => {
  if (
    Object.keys(q.query).some((k) => ['token', 'ticket', 'proof', 'code', 'state'].includes(k)) ||
    /(?:\/api(?:\/|$)|\/(?:aprobar-grupo|confirmar-grupo)$)/.test(q.path)
  ) {
    r.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  next();
};
