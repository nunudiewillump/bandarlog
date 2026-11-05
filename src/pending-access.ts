import { groupBasePath } from './group-location';
type PendingAccess = { email: string; challengeId: string; expiresAt: number; resendAt: number };
const key = () => 'bandarlog:pending-access:' + groupBasePath();
export function pendingAccess(): PendingAccess | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key()) || 'null');
    if (
      value &&
      typeof value.email === 'string' &&
      /^[a-f0-9]{64}$/.test(value.challengeId) &&
      Number.isFinite(value.expiresAt) &&
      Number.isFinite(value.resendAt) &&
      value.expiresAt > Date.now()
    )
      return value;
    forgetAccess();
  } catch {
    /* Storage restrictions must not block online sign-in. */
  }
  return null;
}
export function rememberAccess(
  email: string,
  challengeId: string,
  expiresIn: number,
  resendAfter: number,
) {
  const value: PendingAccess = {
    email,
    challengeId,
    expiresAt: Date.now() + expiresIn * 1000,
    resendAt: Date.now() + resendAfter * 1000,
  };
  try {
    sessionStorage.setItem(key(), JSON.stringify(value));
  } catch {
    /* In-memory form still works. */
  }
}
export function forgetAccess() {
  try {
    sessionStorage.removeItem(key());
  } catch {
    /* Optional recovery cache. */
  }
}
