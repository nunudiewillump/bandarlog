import { groupBasePath } from './group-location';
type PendingAccess = { email: string; challengeId: string; expiresAt: number; resendAt: number };
const key = () => 'bandarlog:pending-access:' + groupBasePath();
export function pendingAccess(): PendingAccess | null {
  try {
    const legacyKey = 'bandarlog:pending-access:';
    const migrate =
      Boolean(groupBasePath()) &&
      (globalThis as typeof globalThis & { BANDARLOG_LEGACY_STORAGE?: boolean })
        .BANDARLOG_LEGACY_STORAGE === true &&
      !sessionStorage.getItem(key());
    const value = JSON.parse(sessionStorage.getItem(migrate ? legacyKey : key()) || 'null');
    if (
      value &&
      typeof value.email === 'string' &&
      /^[a-f0-9]{64}$/.test(value.challengeId) &&
      Number.isFinite(value.expiresAt) &&
      Number.isFinite(value.resendAt) &&
      value.expiresAt > Date.now()
    ) {
      if (migrate) {
        sessionStorage.setItem(key(), JSON.stringify(value));
        sessionStorage.removeItem(legacyKey);
      }
      return value;
    }
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
