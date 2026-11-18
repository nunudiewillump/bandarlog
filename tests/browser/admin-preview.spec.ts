import { test, expect } from '@playwright/test';

test('coordinator can preview the four-step founder welcome without mutating group data', async ({ page }) => {
  const origin = 'http://127.0.0.1:5174';
  const email = 'preview-' + Date.now() + '@example.test';
  const headers = { Origin: origin };
  expect((await page.request.post('/crear-grupo', {
    headers, form: { groupName: 'Grupo de prueba para vista previa', name: 'Demo',
      email, terms: 'accepted' },
  })).status()).toBe(202);
  const mail = await (await page.request.get('/api/dev/platform-mail')).json();
  const review = mail.find((m: any) => m.email === 'join@bandarlog.app' && m.body.includes(email));
  expect(review).toBeTruthy();
  const token = new URL(review.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token')!;
  expect((await page.request.post('/aprobar-grupo', {
    headers, form: { token, decision: 'approve' },
  })).status()).toBe(200);
  const approvals = await (await page.request.get('/api/dev/platform-mail')).json();
  const activation = approvals.find((m: any) => m.email === email && m.body.includes('/confirmar-grupo'));
  const activationToken = new URL(activation.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token')!;
  const activated = await page.request.post('/confirmar-grupo', {
    headers, form: { token: activationToken }, maxRedirects: 0,
  });
  expect(activated.status()).toBe(303);
  const base = activated.headers().location.replace(/\/$/, '');
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const session = await (await page.request.get(base + '/api/me')).json();
  expect((await page.request.patch(base + '/api/profile', {
    headers: { ...headers, 'X-CSRF-Token': session.csrf },
    data: { adminGuideCompleted: true },
  })).status()).toBe(200);
  const before = await (await page.request.get(base + '/api/data')).json();

  // Simulate an operator-provisioned coordinator without changing real privileges.
  await page.route('**/api/me', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.user = {
      ...body.user,
      role: 'coordination',
      preferences: JSON.stringify({
        ...JSON.parse(body.user.preferences || '{}'),
        foundingAdmin: false, adminGuideCompleted: true, adminGuidePreview: true,
      }),
    };
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/?view=home');
  const guide = page.getByRole('region', { name: 'Puesta en marcha del grupo' });
  await expect(page.getByText('Vista de prueba · solo para tu cuenta')).toBeVisible();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('region', { name: 'Notificaciones en este dispositivo' })).toHaveCount(0);
  await guide.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await guide.getByRole('button', { name: 'Crear comisión', exact: true }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await guide.getByRole('button', { name: 'Invitar personas', exact: true }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  await guide.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(guide).toBeVisible();
  }
  await guide.getByRole('button', { name: 'Finalizar bienvenida' }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.locator('.task-celebration .vine-swing img')).toBeVisible();
  await expect(page.locator('.task-celebration .vine-swing img')).toHaveAttribute('src', '/monkey-vine-2d.webp');
  const after = await (await page.request.get(base + '/api/data')).json();
  for (const name of ['projects', 'commissions', 'invitations', 'tasks', 'users'])
    expect(after[name]).toEqual(before[name]);
  expect((await page.request.get(base + '/api/me').then((r) => r.json())).user.role).toBe('admin');

  await page.goto(base + '/?view=profile');
  await page.locator('summary').filter({ hasText: 'Ayuda' }).click();
  await page.getByRole('button', { name: 'Probar bienvenida del administrador' }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Salir de la prueba' }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.locator('.task-celebration')).toHaveCount(0);
});
