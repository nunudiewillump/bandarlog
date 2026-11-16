import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { component } from './components.js';
type SecurityEvent = {
  at: string;
  event: 'security.authentication' | 'security.authorization';
  component: string;
  operation: 'primary' | 'passkey' | 'recovery' | 'logout' | 'registration' | 'private';
  result: 'accepted' | 'rejected';
  status: number;
  group?: string;
  actor?: string;
};
const tag = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);
/** Fixed fields only. Never serialize request/error objects, URLs, IPs, bodies or headers. */
export function securityEvents(
  emit: (event: SecurityEvent) => void = (event) => console.info(event),
): RequestHandler {
  return (q, r, next) => {
    const path = q.path.replace(/^\/g\/[a-f0-9]{32}/, '');
    const operation: SecurityEvent['operation'] = /\/recovery\//.test(path)
      ? 'recovery'
      : /\/passkeys\/(?:register|authenticate)\/(?:options|verify)$|\/passkeys\/remove$/.test(path)
        ? 'passkey'
        : /\/auth\/(?:request|verify|code\/(?:request|verify)|google\/return|google\/callback)$/.test(
              path,
            )
          ? 'primary'
          : /\/logout$/.test(path)
            ? 'logout'
            : /^\/(?:crear-grupo|aprobar-grupo|confirmar-grupo)$/.test(path)
              ? 'registration'
              : 'private';
    const sensitive = operation !== 'private';
    const privateApi = /^\/api(?:\/|$)/.test(path);
    const group = q.path.match(/^\/g\/([a-f0-9]{32})\//)?.[1];
    r.once('finish', () => {
      const status = r.statusCode;
      if (!sensitive && !(privateApi && [400, 401, 403, 428, 429].includes(status))) return;
      emit({
        at: new Date().toISOString(),
        event: sensitive ? 'security.authentication' : 'security.authorization',
        component: component(),
        operation,
        result: status < 400 && !r.locals.securityRejected ? 'accepted' : 'rejected',
        status,
        ...(group ? { group: tag(group) } : {}),
        ...(typeof r.locals.user?.id === 'string' ? { actor: tag(r.locals.user.id) } : {}),
      });
    });
    next();
  };
}
