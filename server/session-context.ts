import { AsyncLocalStorage } from 'node:async_hooks';
// The preimage is supplied by the HttpOnly cookie, never by an actor/user ID.
// It is only sent as a parameter in SET LOCAL and never included in telemetry.
export const sessionContext = new AsyncLocalStorage<string>();
