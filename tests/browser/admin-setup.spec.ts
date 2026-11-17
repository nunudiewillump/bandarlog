import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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
  await mkdir('artifacts/admin-setup', { recursive: true });
  async function capture(stage: string, progress: string) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      await expect(guide).toBeVisible();
      await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', progress);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: 'artifacts/admin-setup/' + stage + '-' + viewport.width + '.png',
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await expect(guide).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notificaciones en este dispositivo' })).toHaveCount(0);
  await expect(page.getByText('Sin tareas asignadas')).toHaveCount(0);
  await expect(guide.locator('.admin-guide-steps li.is-current')).toHaveCount(1);
  await expect(guide.locator('.admin-guide-steps li.is-upcoming')).toHaveCount(3);
  await capture('01-bienvenida', '0');
  await expect(guide.locator('.admin-guide-steps li.is-upcoming').filter({ hasText: 'Organiza las comisiones' }).locator('button')).toBeDisabled();
  await expect(guide.locator('.admin-guide-steps li.is-upcoming').filter({ hasText: 'Reparte una primera tarea' }).locator('button')).toBeDisabled();
  const session = await (await page.request.get(base + '/api/me')).json();
  const authorized = { ...headers, 'X-CSRF-Token': session.csrf };
  const projectResponse = await page.request.post(base + '/api/projects', {
    headers: authorized,
    data: { name: 'Primera ronda', starts: '2027-01-01', ends: '2027-12-31' },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  await page.reload();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(guide.getByRole('button', { name: 'Crear comisión', exact: true })).toBeEnabled();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await expect(guide).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await guide.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await expect(guide.locator('.admin-guide-steps li.is-current')).toContainText('Organiza las comisiones');
  await capture('02-primer-proyecto', '1');
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

  // Complete the real milestones in the isolated test database for visual evidence.
  const commissionResponse = await page.request.post(base + '/api/commissions', {
    headers: authorized,
    data: {
      name: 'Logística', projectId: project.id,
      members: [{ userId: session.user.id, role: 'responsible' }],
    },
  });
  expect(commissionResponse.status()).toBe(201);
  const commission = await commissionResponse.json();
  const invitationResponse = await page.request.post(base + '/api/invitations', {
    headers: authorized,
    data: { emails: ['companerovista-' + Date.now() + '@example.test'] },
  });
  expect(invitationResponse.status()).toBe(201);
  const taskResponse = await page.request.post(base + '/api/tasks', {
    headers: authorized,
    data: {
      title: 'Preparar los materiales',
      description: 'Primera tarea del grupo de prueba',
      commissionId: commission.id,
      due: '2027-07-01T10:00:00Z',
      responsibleIds: [session.user.id],
    },
  });
  expect(taskResponse.status()).toBe(201);
  await page.goto(base + '/?view=home');
  await expect(guide).toBeVisible();
  await expect(guide.locator('.admin-guide-steps li.is-done')).toHaveCount(4);
  await capture('03-grupo-listo', '4');
  await guide.getByRole('button', { name: 'Finalizar bienvenida' }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Notificaciones en este dispositivo' })).toBeVisible();
});
