import { createHash } from 'node:crypto';
import type { GlobalOperations } from './global-operations.js';
import type { Response } from 'express';
import type { Group } from './group-context.js';

export const ENTRY_COOKIE = 'bandarlog_entry';
export const entryCookieName = (secure: boolean) =>
  secure ? '__Host-' + ENTRY_COOKIE : ENTRY_COOKIE;
export const entryMarker = (header: string | undefined) =>
  requestCookie(header, entryCookieName(true)) || requestCookie(header, ENTRY_COOKIE);
export function clearEntry(r: Response, secure: boolean) {
  r.clearCookie(entryCookieName(secure), { path: '/', secure, httpOnly: true, sameSite: 'lax' });
  if (secure) r.clearCookie(ENTRY_COOKIE, { path: '/', secure: true });
}
export function requestCookie(header: string | undefined, name: string) {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1);
}
/** An opaque navigation hint, never a bearer credential accepted by the API. */
export function rememberEntry(
  r: Response,
  group: Group,
  sessionId: string,
  expires: number,
  secure: boolean,
) {
  r.cookie(entryCookieName(secure), group.privateId + '.' + sessionId, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: Math.max(0, expires - Date.now()),
  });
}
export async function rememberedEntry(
  platform: GlobalOperations,
  header: string | undefined,
  legacyGroupId: string,
) {
  const marker = entryMarker(header);
  const legacy = requestCookie(header, 'bandarlog');
  const candidates: { sessionId: string; privateId?: string; legacy?: boolean }[] = [];
  if (marker && /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(marker)) {
    const [privateId, sessionId] = marker.split('.');
    candidates.push({ privateId, sessionId });
  }
  for (const part of (header || '').split(';')) {
    const match = part.trim().match(/^__Host-bandarlog-([a-f0-9]{32})=([a-f0-9]{64})$/);
    if (match)
      candidates.push({
        privateId: match[1],
        sessionId: createHash('sha256').update(match[2]).digest('hex'),
      });
  }
  if (legacy && legacy.length <= 512)
    candidates.push({ sessionId: createHash('sha256').update(legacy).digest('hex'), legacy: true });
  for (const candidate of candidates) {
    // Global lookup is narrowly bound to an unguessable session hash and its group.
    // The destination still requires the existing scoped HttpOnly session cookie.
    const entry = await platform.entryGroup(
      candidate.sessionId,
      candidate.privateId || '',
      Boolean(candidate.legacy),
    );
    if (entry) return '/g/' + entry + '/';
  }
  return null;
}
