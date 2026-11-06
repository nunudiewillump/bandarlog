import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const source = await readFile('public/offline-store.js', 'utf8');
for (const [enabled, legacyUser] of [
  [true, 'user'],
  [true, 'other-user'],
  [false, 'user'],
] as const) {
  test(`canonical storage keeps pending IDs and isolates legacy migration (bridge=${enabled}, source=${legacyUser})`, async ({
    page,
  }) => {
    const privateId = 'd'.repeat(32),
      base = '/g/' + privateId + '/';
    await page.route('**' + base, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body>Isolated storage test</body></html>',
      }),
    );
    await page.goto(base);
    await page.evaluate(
      async ({ privateId, legacyUser, enabled }) => {
        (window as any).BANDARLOG_LEGACY_STORAGE = enabled;
        const seed = async (name: string, userId: string, jobs: any[]) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open(name, 1);
            r.onupgradeneeded = () => r.result.createObjectStore('state');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('state', 'readwrite');
            tx.objectStore('state').put(
              {
                me: { user: { id: userId }, group: { privateId }, csrf: '' },
                data: { tasks: [], commissions: [], members: [], assignments: [], activity: [] },
                queue: jobs,
              },
              'active',
            );
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        };
        const job = (id: string, userId: string, createdAt: string) => ({
          id,
          userId,
          createdAt,
          path: '/tasks/kept-id',
          method: 'PATCH',
          body: { status: 'done' },
        });
        await seed('bandarlog-offline', legacyUser, [
          job('legacy-job', legacyUser, '2026-11-01T00:00:00Z'),
        ]);
        await seed('bandarlog-offline-' + privateId, 'user', [
          job('canonical-job', 'user', '2026-11-02T00:00:00Z'),
        ]);
      },
      { privateId, legacyUser, enabled },
    );
    await page.addScriptTag({ content: source });
    const result = await page.evaluate(async (privateId) => {
      const backend = (window as any).BandarlogOffline;
      await backend.remember('/me', {
        user: { id: 'user' },
        group: { privateId },
        csrf: 'not-persisted',
      });
      await backend.remember('/me', {
        user: { id: 'user' },
        group: { privateId },
        csrf: 'not-persisted',
      });
      const read = async (name: string) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open(name, 1);
          r.onsuccess = () => resolve(r.result);
        });
        const state = await new Promise<any>((resolve) => {
          const tx = db.transaction('state', 'readonly');
          const r = tx.objectStore('state').get('active');
          tx.oncomplete = () => resolve(r.result);
        });
        db.close();
        return state;
      };
      const canonical = await read('bandarlog-offline-' + privateId),
        legacy = await read('bandarlog-offline');
      await backend.clear();
      return {
        canonical,
        legacy,
        afterCanonical: await backend.cached('/me'),
        afterLegacy: (await read('bandarlog-offline')).me || null,
      };
    }, privateId);
    const migrated = enabled && legacyUser === 'user';
    expect(result.canonical.queue.map((job: any) => job.id)).toEqual(
      migrated ? ['legacy-job', 'canonical-job'] : ['canonical-job'],
    );
    expect(result.legacy.queue.map((job: any) => job.id)).toEqual(migrated ? [] : ['legacy-job']);
    expect(result.canonical.me.csrf).toBe('');
    expect(result.afterCanonical).toBeFalsy();
    expect(result.afterLegacy?.user?.id || null).toBe(migrated ? null : legacyUser);
  });
}
