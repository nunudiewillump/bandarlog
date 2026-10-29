type Store = {
  remember(path: string, value: any): Promise<any>;
  cached(path: string): Promise<any>;
  enqueue(path: string, method: string, body: any, id: string): Promise<any>;
  allowed(path: string, method: string): boolean;
  flush(): Promise<void>;
  clear(): Promise<void>;
  discard(): Promise<void>;
  retry(): Promise<void>;
  status(): Promise<{ pending: number; error: string }>;
};
const backend = (globalThis as typeof globalThis & { BandarlogOffline: Store }).BandarlogOffline;
// Storage restrictions must not prevent normal online use. Queued writes still
// fail explicitly rather than pretending they were saved without local storage.
export const offline: Store = {
  ...backend,
  remember: (path, value) => backend.remember(path, value).catch(() => value),
  cached: (path) => backend.cached(path).catch(() => null),
  status: () => backend.status().catch(() => ({ pending: 0, error: '' })),
  clear: () => backend.clear().catch(() => {}),
};
export async function clearOffline() {
  await offline.clear();
}
export function notifyDataChanged() {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('bandarlog-data');
    channel.postMessage('changed');
    channel.close();
  }
}
export async function requestSync() {
  window.dispatchEvent(new Event('bandarlog:queue'));
  const registration = await navigator.serviceWorker?.getRegistration();
  const sync = (
    registration as
      (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined
  )?.sync;
  if (sync) await sync.register('bandarlog-mutations').catch(() => {});
}
