import { publicInfo } from '../../shared/public-info';
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function approveRequest(page: Page, email: string) {
  const ownerMail = (await page.request.get('/api/dev/platform-mail').then((r) => r.json()))
    .filter((m: any) => m.email === publicInfo.contact && m.body.includes(email))
    .at(-1);
  await page.goto(ownerMail.body.match(/^https?:\/\/\S+$/m)[0]);
  await page.getByRole('button', { name: 'Aprobar solicitud', exact: true }).click();
  const mail = (await page.request.get('/api/dev/platform-mail').then((r) => r.json()))
    .filter((m: any) => m.email === email && m.subject.includes('aprobado'))
    .at(-1);
  return mail.body.match(/^https?:\/\/\S+$/m)[0];
}
async function createGroup(page: Page, name: string, email: string) {
  const requested = await page.request.post('/crear-grupo', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    form: {
      groupName: name,
      name: 'Scouter de prueba',
      email,
      colorPrimary: '#276cae',
      colorSecondary: '#f7c948',
      terms: 'accepted',
    },
  });
  expect(requested.status()).toBe(202);
  const link = await approveRequest(page, email);
  await page.goto(link);
  await page.getByRole('button', { name: 'Confirmar y crear mi grupo' }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  const base = new URL(page.url()).pathname.replace(/\/$/, '');
  const session = await page.request.get(base + '/api/me').then((r) => r.json());
  return { base, ...session };
}

test.describe('public website without JavaScript or login', () => {
  test.use({ javaScriptEnabled: false });
  for (const width of [390, 1440])
    test(`public presentation, privacy and demo at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Menos lío/ })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Solicitar un grupo', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await mkdir('artifacts/publication', { recursive: true });
      await page.screenshot({
        path: `artifacts/publication/home-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await expect(page.locator('.public-monkey-wave')).not.toHaveCSS('animation-name', 'none');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('.public-monkey-wave')).toHaveCSS('animation-name', 'none');
      await expect(page.locator('.public-falling-stage')).toBeHidden();
      await page.getByRole('link', { name: 'Sobre Bandarlog', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Qué es Bandarlog', exact: true }),
      ).toBeVisible();
      await expect(page.locator('body')).toContainText('Gmail API');
      await page.getByRole('link', { name: 'Privacidad', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Política de privacidad', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Dabi Arguiñena Giménez', { exact: true })).toBeVisible();
      await expect(page.locator('body')).toContainText('gmail.send');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.goto('/suscripcion-demo');
      await expect(page.getByText('Demostración · No se realizan cobros')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'No disponible para contratar' }),
      ).toBeDisabled();
      await expect(page.locator('input')).toHaveCount(0);
      await page.screenshot({ path: `artifacts/publication/billing-${width}.png`, fullPage: true });
    });
});

test('group signup, path-scoped sessions, profile colors and offline storage stay independent', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/crear-grupo');
  await page.getByLabel('Nombre del grupo', { exact: true }).fill('Grupo del bosque');
  await page.getByLabel('Tu nombre', { exact: true }).fill('Scouter de prueba');
  await page.getByLabel('Tu correo', { exact: true }).fill('public-groups@example.test');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('responsable lo aprueba');
  const activation = await approveRequest(page, 'public-groups@example.test');
  await page.goto(activation);
  await page.getByRole('button', { name: 'Confirmar y crear mi grupo' }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  const baseA = new URL(page.url()).pathname.replace(/\/$/, '');
  const a = await page.request.get(baseA + '/api/me').then((r) => r.json());
  const project = await page.request.post(baseA + '/api/projects', {
    headers: { 'X-CSRF-Token': a.csrf },
    data: { name: 'Proyecto solo del bosque', starts: '2027-01-01', ends: '2027-12-31' },
  });
  expect(project.ok()).toBeTruthy();
  await page.goto(baseA + '/?view=profile');
  await expect(page.locator('.profile-identity')).toContainText('Grupo del bosque');
  await page.getByText('Configurar grupo', { exact: true }).click();
  await page.getByLabel('Primer color de la pañoleta').fill('#276cae');
  await page.getByLabel('Segundo color de la pañoleta').fill('#f7c948');
  await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.locator('.profile-neckerchief pattern rect').first()).toHaveAttribute(
    'fill',
    '#276cae',
  );
  await page.screenshot({ path: 'artifacts/publication/group-profile-390.png', fullPage: true });
  const b = await createGroup(page, 'Grupo de la montaña', 'public-groups@example.test');
  expect(b.base).not.toBe(baseA);
  expect(
    (await page.request.get(b.base + '/api/data').then((r) => r.json())).projects,
  ).toHaveLength(0);
  expect((await page.request.get(baseA + '/api/data').then((r) => r.json())).projects).toHaveLength(
    1,
  );
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
    .toContain('bandarlog-offline-' + b.group.privateId);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)),
  ).toContain('bandarlog-offline-' + a.group.privateId);
  await page.goto(baseA + '/?view=projects');
  await expect(page.getByRole('heading', { name: 'Proyectos', exact: true })).toBeVisible();
  await expect(page.getByText('Proyecto solo del bosque', { exact: true })).toBeVisible();
});

test('installed group PWA queues and synchronizes a task only inside its group', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  const a = await createGroup(page, 'Grupo offline', 'offline-group@example.test');
  const headers = { 'X-CSRF-Token': a.csrf };
  const project = await page.request
    .post(a.base + '/api/projects', {
      headers,
      data: { name: 'Campamento offline', starts: '2027-01-01', ends: '2027-01-07' },
    })
    .then((r) => r.json());
  const commission = await page.request
    .post(a.base + '/api/commissions', {
      headers,
      data: {
        name: 'Material',
        projectId: project.id,
        members: [{ userId: a.user.id, role: 'responsible' }],
      },
    })
    .then((r) => r.json());
  await page.goto(
    'http://127.0.0.1:4174' +
      a.base +
      '/?view=commission&project=' +
      project.id +
      '&commission=' +
      commission.id,
  );
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nueva tarea', exact: true })).toBeVisible();
  const scope = await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => r?.scope),
  );
  expect(scope).toBe('http://127.0.0.1:4174' + a.base + '/');
  const manifest = await page.request.get(a.base + '/manifest.webmanifest').then((r) => r.json());
  expect(manifest.scope).toBe(a.base + '/');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Nueva tarea', exact: true });
  await form.getByLabel('Título', { exact: true }).fill('Tarea offline del grupo');
  await form.getByLabel('Fecha límite', { exact: true }).fill('2027-01-04');
  await form.getByText('Scouter de prueba', { exact: true }).click();
  await form.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tarea offline del grupo', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(async () => {
    await (window as any).BandarlogOffline.flush();
  });
  await expect
    .poll(
      async () =>
        (
          await page.request
            .get('http://127.0.0.1:4174' + a.base + '/api/data')
            .then((r) => r.json())
        ).tasks.filter((t: any) => t.title === 'Tarea offline del grupo').length,
    )
    .toBe(1);
});
