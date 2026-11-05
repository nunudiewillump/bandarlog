import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import * as s from './schema.js';
import type { Group } from './group-context.js';

export const ENTRY_COOKIE = 'bandarlog_entry';
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
  r.cookie(ENTRY_COOKIE, group.privateId + '.' + sessionId, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: Math.max(0, expires - Date.now()),
  });
}
export async function rememberedEntry(
  ownerDb: any,
  header: string | undefined,
  legacyGroupId: string,
) {
  const marker = requestCookie(header, ENTRY_COOKIE);
  const legacy = requestCookie(header, 'bandarlog');
  const candidates: { sessionId: string; privateId?: string; legacy?: boolean }[] = [];
  if (marker && /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(marker)) {
    const [privateId, sessionId] = marker.split('.');
    candidates.push({ privateId, sessionId });
  }
  if (legacy && legacy.length <= 512)
    candidates.push({ sessionId: createHash('sha256').update(legacy).digest('hex'), legacy: true });
  for (const candidate of candidates) {
    // Global lookup is narrowly bound to an unguessable session hash and its group.
    // The destination still requires the existing scoped HttpOnly session cookie.
    const [entry] = await ownerDb
      .select({ groupId: s.groups.id, privateId: s.groups.privateId })
      .from(s.sessions)
      .innerJoin(
        s.users,
        and(eq(s.users.id, s.sessions.userId), eq(s.users.groupId, s.sessions.groupId)),
      )
      .innerJoin(s.groups, eq(s.groups.id, s.sessions.groupId))
      .where(
        and(
          eq(s.sessions.id, candidate.sessionId),
          candidate.legacy
            ? eq(s.sessions.groupId, legacyGroupId)
            : eq(s.groups.privateId, candidate.privateId!),
          sql`${s.sessions.expires} > now()`,
          sql`${s.sessions.absoluteExpiresAt} > now()`,
          sql`${s.users.disabledAt} is null`,
        ),
      )
      .limit(1);
    if (entry) return entry.groupId === legacyGroupId ? '/acceso' : '/g/' + entry.privateId + '/';
  }
  return null;
}
