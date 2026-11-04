importScripts('/offline-store.js?v=5');
const GROUP_BASE = location.pathname.match(/^\/g\/[a-f0-9]{32}(?=\/|$)/)?.[0] || '';
const CACHE_FAMILY = GROUP_BASE
  ? 'bandarlog-static-' + GROUP_BASE.split('/')[2] + '-'
  : 'bandarlog-static-';
const CACHE = CACHE_FAMILY + 'v5';
const SHELL = GROUP_BASE + '/';
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([
        '/offline.html',
        '/icon-192.png',
        '/offline-store.js',
        '/offline-store.js?v=5',
        GROUP_BASE + '/manifest.webmanifest',
      ]);
      const shell = await fetch(SHELL, { cache: 'reload' });
      if (shell.ok) {
        const snapshot = await shell.clone().text();
        if (snapshot.includes('id="root"')) await cache.put(SHELL, shell.clone());
        const html = await shell.text();
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
          (match) => match[1],
        );
        for (const asset of assets) {
          const response = await fetch(asset);
          if (!response.ok) continue;
          await cache.put(asset, response.clone());
          if (asset.endsWith('.css')) {
            const css = await response.text();
            for (const match of css.matchAll(/url\(["']?(\/assets\/[^"')]+)["']?\)/g)) {
              const font = await fetch(match[1]);
              if (font.ok) await cache.put(match[1], font);
            }
          }
        }
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (GROUP_BASE ? k.startsWith(CACHE_FAMILY) : /^bandarlog-static-v\d+$/.test(k)) &&
                k !== CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (
    url.origin !== location.origin ||
    /^\/(?:g\/[a-f0-9]{32}\/)?api(?:\/|$)/.test(url.pathname) ||
    [
      '/presentacion',
      '/privacidad',
      '/condiciones',
      '/crear-grupo',
      '/confirmar-grupo',
      '/aprobar-grupo',
      '/entrar',
      '/suscripcion-demo',
    ].includes(url.pathname) ||
    e.request.method !== 'GET'
  )
    return;
  if (
    e.request.mode === 'navigate' &&
    (GROUP_BASE ? !url.pathname.startsWith(GROUP_BASE + '/') : url.pathname.startsWith('/g/'))
  )
    return;
  if (url.pathname === GROUP_BASE + '/manifest.webmanifest') {
    e.respondWith(
      fetch(e.request)
        .then(async (response) => {
          if (response.ok) (await caches.open(CACHE)).put(e.request, response.clone());
          return response;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            if ((await response.clone().text()).includes('id="root"'))
              await cache.put(SHELL, response.clone());
          }
          return response;
        })
        .catch(
          async () =>
            ((await BandarlogOffline.cached('/me').catch(() => null)) &&
              (await caches.match(SHELL))) ||
            (await caches.match('/offline.html')),
        ),
    );
    return;
  }
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(png|svg|webp|woff2)$/.test(url.pathname) ||
    url.pathname === '/offline-store.js'
  ) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const response = await fetch(e.request);
        if (response.ok) await cache.put(e.request, response.clone());
        return response;
      }),
    );
  }
});
self.addEventListener('sync', (e) => {
  if (e.tag === 'bandarlog-mutations')
    e.waitUntil(
      (async () => {
        await BandarlogOffline.flush();
        const state = await BandarlogOffline.status();
        if (state.pending && !state.error)
          throw new Error('La conexión aún no permite sincronizar.');
      })(),
    );
});
self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      let payload;
      try {
        payload = e.data?.json();
      } catch {
        return;
      }
      if (!payload) return;
      await self.registration.showNotification(payload.title || 'Bandarlog', {
        body: payload.body || 'Tienes novedades en tus tareas.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.tag || 'bandarlog',
        data: { url: payload.url || '/' },
      });
    })(),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  e.waitUntil(
    (async () => {
      for (const client of await clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        if ('focus' in client && client.url.startsWith(self.registration.scope)) {
          await client.navigate(target.href);
          return client.focus();
        }
      }
      return clients.openWindow(target.href);
    })(),
  );
});
