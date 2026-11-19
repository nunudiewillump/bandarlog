import { createHash } from 'node:crypto';
import { groupContext } from './group-context.js';
const secure = () => process.env.NODE_ENV === 'production';
export function readCookie(header: string | undefined, name: string) {
  return header
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}
export function sessionCookieName() {
  const group = groupContext.getStore();
  if (secure() && group) return '__Host-bandarlog-' + group.privateId;
  return 'bandarlog';
}
export function modernSession(header: string | undefined) {
  return (
    Boolean(readCookie(header, sessionCookieName())) && sessionCookieName().startsWith('__Host-')
  );
}
export function sessionBearer(header: string | undefined) {
  return readCookie(header, sessionCookieName()) || readCookie(header, 'bandarlog');
}
export function googleLinkCookieName() {
  return secure()
    ? '__Host-bandarlog-google-link-' + groupContext.getStore()!.privateId
    : 'bandarlog_google_link';
}
export function googleBrowserCookieName(state?: string) {
  return secure() && state && /^[a-f0-9]{64}$/.test(state)
    ? '__Host-bandarlog-google-' + createHash('sha256').update(state).digest('hex')
    : 'bandarlog_google';
}

// One-use OAuth return cookie, never a login session. The second secret prevents
// a chosen challenge in somebody else's OAuth URL from authorizing its creator.
export function googleResumeCookieName(challenge: string) {
  return (
    (secure() ? '__Host-' : '') +
    'bandarlog-google-resume-' +
    (groupContext.getStore()?.privateId || 'legacy') +
    '-' +
    challenge
  );
}
