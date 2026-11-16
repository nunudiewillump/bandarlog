import { test, expect } from '@playwright/test';

test('founding administrator guide persists dismissal and reopening in the Forest interface', async ({ page }) => {
  const origin = 'http://127.0.0.1:5174';
  const name = 'Grupo de prueba ' + Date.now();
  const email = 'founder-' + Date.now() + '@example.test';
  const headers = { Origin: origin };
  expect((await page.request.post('/crear-grupo', {
    headers, form: { groupName: name, name: 'Persona fundadora', email, terms: 'accepted' },
  })).status()).toBe(202);
  const requests = await (await page.request.get('/api/dev/platform-mail')).json();
  const review = requests.find((m: any) => m.email === 'join@bandarlog.app' && m.body.includes(email));
  expect(review).toBeTruthy();
  const token = new URL(review.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token')!;
  expect((await page.request.post('/aprobar-grupo', { headers, form: { token, decision: 'approve' } })).status()).toBe(200);
  const mails = await (await page.request.get('/api/dev/platform-mail')).json();
  const activation = mails.find((m: any) => m.email === email && m.body.includes('/confirmar-grupo'));
  const activationToken = new URL(activation.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token')!;
  const response = await page.request.post('/confirmar-grupo', { headers, form: { token: activationToken }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const base = response.headers().location.replace(/\/$/, '');
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const guide = page.getByRole('region', { name: 'Puesta en marcha del grupo' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Crear comisión', exact: true })).toBeDisabled();
  await expect(guide.getByRole('button', { name: 'Crear tarea', exact: true })).toBeDisabled();
  const session = await (await page.request.get(base + '/api/me')).json();
  expect((await page.request.post(base + '/api/projects', {
    headers: { ...headers, 'X-CSRF-Token': session.csrf },
    data: { name: 'Primera ronda', starts: '2027-01-01', ends: '2027-12-31' },
  })).status()).toBe(201);
  await page.reload();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(guide.getByRole('button', { name: 'Crear comisión', exact: true })).toBeEnabled();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(guide).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await guide.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    if (process.env.ADMIN_GUIDE_CAPTURE)
      await page.screenshot({ path: process.env.ADMIN_GUIDE_CAPTURE + '-' + viewport.width + '.png', fullPage: true });
  }
  await guide.getByRole('button', { name: 'Omitir guía por ahora' }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.goto(base + '/?view=profile');
  await page.locator('summary').filter({ hasText: 'Ayuda' }).click();
  await page.getByRole('button', { name: 'Repetir guía de administración', exact: true }).click();
  await expect(guide).toBeVisible();
  await page.reload();
  await expect(guide).toBeVisible();
});
