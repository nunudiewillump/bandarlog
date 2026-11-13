import { test, expect } from '@playwright/test';
test('single-replica SSE avoids idle polling and preserves event refresh, error fallback and hidden pause', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.EventSource;
    window.EventSource = class extends Original {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        (window as any).costEvents = this;
      }
      override addEventListener(type: any, listener: any, options?: any) {
        super.addEventListener(
          type,
          type === 'ready'
            ? (event: any) =>
                listener.call(
                  this,
                  new MessageEvent('ready', {
                    data: JSON.stringify({ ...JSON.parse(event.data), reconcileAfterMs: 0 }),
                  }),
                )
            : listener,
          options,
        );
      }
    };
  });
  await page.request.post('/api/auth/request', { data: { email: 'alex@example.test' } });
  const mails = await (await page.request.get('/api/dev/mail')).json();
  const mail = mails
    .filter((m: any) => m.email === 'alex@example.test' && m.subject.includes('enlace'))
    .at(-1);
  await page.request.post('/api/auth/verify', {
    data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
  });
  let initialReads = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.endsWith('/api/data')) initialReads++;
  });
  await page.clock.install();
  await page.goto('/acceso');
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).costEvents?.readyState)).toBe(1);
  await page.clock.runFor(500);
  await new Promise((r) => setTimeout(r, 300));
  expect(initialReads).toBe(1);
  let reads = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.endsWith('/api/data')) reads++;
  });
  await page.clock.fastForward(10 * 60000);
  await page.clock.runFor(300);
  expect(reads).toBe(0);
  const me = await (await page.request.get('/api/me')).json();
  const changed = page.waitForResponse((r) => r.url().endsWith('/api/data'));
  await page.request.patch('/api/profile', {
    headers: { 'X-CSRF-Token': me.csrf, Origin: 'http://127.0.0.1:5174' },
    data: { name: 'Alex cost test' },
  });
  await page.clock.runFor(300);
  await changed;
  await new Promise((r) => setTimeout(r, 150));
  expect(reads).toBe(1);
  const fallback = page.waitForResponse((r) => r.url().endsWith('/api/data'));
  await page.evaluate(() => (window as any).costEvents.dispatchEvent(new Event('error')));
  await page.clock.fastForward(15000);
  await page.clock.runFor(300);
  await fallback;
  expect(reads).toBe(2);
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }),
  );
  await page.clock.fastForward(90000);
  await page.clock.runFor(300);
  expect(reads).toBe(2);
  await page.request.patch('/api/profile', {
    headers: { 'X-CSRF-Token': me.csrf, Origin: 'http://127.0.0.1:5174' },
    data: { name: me.user.name },
  });
});

test('a mutation between the initial snapshot and SSE subscription is visible without losing the event', async ({
  page,
}) => {
  await page.request.post('/api/auth/request', { data: { email: 'alex@example.test' } });
  const mails = await (await page.request.get('/api/dev/mail')).json();
  const mail = mails
    .filter((m: any) => m.email === 'alex@example.test' && m.body.includes('token='))
    .at(-1);
  await page.request.post('/api/auth/verify', {
    data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
  });
  const me = await (await page.request.get('/api/me')).json();
  let reads = 0;
  await page.route('**/api/data', async (route) => {
    reads++;
    const response = await route.fetch();
    if (reads === 1) {
      const changed = await page.request.patch('/api/profile', {
        headers: { 'X-CSRF-Token': me.csrf, Origin: 'http://127.0.0.1:5174' },
        data: { name: 'Álex durante arranque' },
      });
      expect(changed.ok()).toBeTruthy();
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto('/acceso');
    await expect(
      page.locator('.sidebar').getByText('Álex durante arranque', { exact: true }),
    ).toBeVisible();
    await expect.poll(() => reads).toBe(2);
  } finally {
    await page.request.patch('/api/profile', {
      headers: { 'X-CSRF-Token': me.csrf, Origin: 'http://127.0.0.1:5174' },
      data: { name: me.user.name },
    });
  }
});
