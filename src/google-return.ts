export function installedApp() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}
export function validGoogleReturn(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  popup: Window,
  origin: string,
): string | null {
  if (
    event.origin !== origin ||
    event.source !== popup ||
    event.data?.type !== 'bandarlog.google.return'
  )
    return null;
  return typeof event.data.ticket === 'string' && /^[a-f0-9]{64}$/.test(event.data.ticket)
    ? event.data.ticket
    : null;
}
export async function proofChallenge(proof: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
