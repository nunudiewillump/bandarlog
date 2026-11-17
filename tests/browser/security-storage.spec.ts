import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const source = await readFile('public/offline-store.js', 'utf8');
const data = {
  tasks: [{ id: 'synthetic-task', title: 'Private synthetic task', status: 'pending' }],
  commissions: [],
  members: [],
  assignments: [],
  activity: [],
};
async function prepare(page: Page) {
  await page.route('**/storage-check', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>Storage fixture</body>' }),
  );
  await page.goto('/storage-check');
  await page.addScriptTag({ content: source });
}
async function seed(page: Page, user = 'A') {
  await page.evaluate(
    async ({ user, data }) => {
      const b = (window as any).BandarlogOffline;
      await b.remember('/me', { user: { id: user }, csrf: 'never-persist-this-csrf' });
      await b.remember('/data', data);
      await b.enqueue('/tasks/synthetic-task', 'PATCH', { status: 'done' }, 'synthetic-operation');
    },
    { user, data },
  );
}
test('account changes quarantine pending work and restore only after the original identity returns', async ({
  page,
}) => {
  await prepare(page);
  await seed(page);
  const result = await page.evaluate(async () => {
    const b = (window as any).BandarlogOffline;
    await b.remember('/me', { user: { id: 'B' }, csrf: 'b-csrf' });
    if (await b.cached('/activity?taskId=synthetic'))
      throw Error('A private snapshot must never masquerade as another endpoint response.');
    const other = { state: await b.status(), data: await b.cached('/data') };
    await b.remember('/me', { user: { id: 'A' }, csrf: 'a-csrf' });
    return { other, original: await b.status(), me: await b.cached('/me') };
  });
  expect(result.other.state.pending).toBe(0);
  expect(result.other.data).toBeNull();
  expect(result.original.pending).toBe(1);
  expect(result.me.csrf).toBe('');
});
test('a cookie belonging to another account cannot flush the previous queue', async ({ page }) => {
  await prepare(page);
  await seed(page);
  let writes = 0;
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { user: { id: 'B' }, csrf: 'b-memory-only' } }),
  );
  await page.route('**/api/tasks/**', (r) => {
    writes++;
    return r.fulfill({ json: { ok: true } });
  });
  const result = await page.evaluate(async () => {
    const b = (window as any).BandarlogOffline;
    await b.flush();
    return { me: await b.cached('/me'), data: await b.cached('/data'), state: await b.status() };
  });
  expect(writes).toBe(0);
  expect(result.me).toBeNull();
  expect(result.data).toBeNull();
  await page.evaluate(async () => {
    await (window as any).BandarlogOffline.remember('/me', { user: { id: 'A' }, csrf: 'new-csrf' });
  });
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 1 });
});
test('sync binds each mutation to its original user, including a cookie change after /me', async ({
  page,
}) => {
  await prepare(page);
  await seed(page);
  let bound = '';
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { user: { id: 'A' }, csrf: 'a-memory-only' } }),
  );
  await page.route('**/api/tasks/**', (r) => {
    bound = r.request().headers()['x-offline-user'];
    return r.fulfill({ status: 403, json: { error: 'El cambio pertenece a otra cuenta.' } });
  });
  await page.route('**/api/data', (r) => r.fulfill({ json: data }));
  await page.evaluate(async () => await (window as any).BandarlogOffline.flush());
  expect(bound).toBe('A');
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 1, error: 'El cambio pertenece a otra cuenta.' });
});
test('expired snapshots stop being readable and preserve pending work for authenticated recovery', async ({
  page,
}) => {
  await prepare(page);
  await seed(page);
  await page.clock.setFixedTime(new Date(Date.now() + 8 * 86400000));
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.cached('/me')),
  ).toBeNull();
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.cached('/data')),
  ).toBeNull();
  await page.evaluate(
    async () =>
      await (window as any).BandarlogOffline.remember('/me', {
        user: { id: 'A' },
        csrf: 'new-memory-only',
      }),
  );
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 1 });
});
test('logout clears persistent data and informs another open tab', async ({ page, context }) => {
  await prepare(page);
  await seed(page);
  const second = await context.newPage();
  await prepare(second);
  await second.evaluate(() => {
    (window as any).ended = 0;
    window.addEventListener('bandarlog:session-ended', () => {
      (window as any).ended++;
    });
  });
  await page.evaluate(async () => await (window as any).BandarlogOffline.clear());
  await expect.poll(() => second.evaluate(() => (window as any).ended)).toBe(1);
  expect(
    await second.evaluate(async () => await (window as any).BandarlogOffline.cached('/me')),
  ).toBeNull();
  expect(
    await second.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 0 });
});

test('switching identity in another tab invalidates the previous visible session without deleting its queue', async ({
  page,
  context,
}) => {
  await prepare(page);
  await seed(page);
  const second = await context.newPage();
  await prepare(second);
  await second.evaluate(() => {
    document.body.textContent = 'Private A';
    window.addEventListener('bandarlog:session-ended', () => {
      document.body.textContent = 'Reauthenticate';
    });
  });
  await page.evaluate(
    async () =>
      await (window as any).BandarlogOffline.remember('/me', { user: { id: 'B' }, csrf: 'b' }),
  );
  await expect(second.getByText('Reauthenticate', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 0 });
  await page.evaluate(
    async () =>
      await (window as any).BandarlogOffline.remember('/me', { user: { id: 'A' }, csrf: 'a' }),
  );
  expect(
    await page.evaluate(async () => await (window as any).BandarlogOffline.status()),
  ).toMatchObject({ pending: 1 });
});
