/** Progressive enhancement: never required for completing an operation. */
export function taskHaptic(kind: 'start' | 'done' | 'error', enabled = true) {
  try {
    if (
      !enabled ||
      typeof navigator === 'undefined' ||
      typeof navigator.vibrate !== 'function' ||
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return false;
    return navigator.vibrate(kind === 'start' ? 18 : kind === 'done' ? [15, 45, 15] : [25, 30, 10]);
  } catch {
    return false;
  }
}
