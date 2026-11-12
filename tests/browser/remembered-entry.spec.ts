import { test, expect } from '@playwright/test';

test('an installed legacy PWA resumes its old cookie and retains its offline account at the original origin', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  const origin = 'http://127.0.0.1:4174';
  await page.goto('http://127.0.0.1:5174/acceso');
  await page.getByLabel('Tu correo electrónico').fill('miguel@example.test');
  await page.getByRole('button', { name: 'Recibir código', exact: true }).click();
  await expect(page.getByLabel('Código de acceso')).toBeVisible();
  const mail = (await page.request.get(origin + '/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === 'miguel@example.test' && /\b\d{6}\b/.test(m.body))
    .at(-1);
  await page.getByLabel('Código de acceso').fill(mail.body.match(/\b(\d{6})\b/)[1]);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  // Login uses the configured test APP_URL; cookies remain valid on the preview port.
  await page.goto(origin + '/acceso');
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const offlineBefore = await page.evaluate(async () => ({
    names: (await indexedDB.databases()).map((d) => d.name),
    account: (await (window as any).BandarlogOffline.cached('/me'))?.user.id,
  }));
  expect(offlineBefore.account).toBeTruthy();
  const group = (await page.request.get(origin + '/api/me').then((r) => r.json())).group;
  const canonical = origin + '/g/' + group.privateId + '/';
  // The previous release never set this hint: the old root-path session is enough.
  await context.clearCookies({ name: 'bandarlog_entry' });
  await page.goto(origin + '/');
  await expect(page).toHaveURL(canonical);
  await expect(page.locator('.mobile-focus')).toBeVisible();
  expect((await page.request.get(origin + '/api/me').then((r) => r.json())).user.email).toBe(
    'miguel@example.test',
  );
  expect(
    await page.evaluate(
      async () => (await (window as any).BandarlogOffline.cached('/me'))?.user.id,
    ),
  ).toBe(offlineBefore.account);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
  ).toContain('bandarlog-offline');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
    .toContain('/g/' + group.privateId + '/sw.js');
  await context.setOffline(true);
  await page.goto(canonical);
  await expect(page.locator('.mobile-focus')).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await (window as any).BandarlogOffline.cached('/me'))?.user.id,
    ),
  ).toBe(offlineBefore.account);
  await context.setOffline(false);
});
