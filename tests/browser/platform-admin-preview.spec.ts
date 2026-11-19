import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const preview = 'http://127.0.0.1:3199/review';
test.beforeEach(async ({ page }) => {
  const html = await readFile('docs/platform-administration/preview.html', 'utf8');
  await page.route(preview, (route) => route.fulfill({ contentType: 'text/html', body: html }));
});
const captures = 'docs/platform-administration/captures';

test('review artifact works offline, exposes all seven destinations, and fits desktop and mobile', async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && request.url() !== preview) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(preview);
  await expect(page.getByRole('heading', { name: 'Una vista del conjunto' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Administración' }).getByRole('button'),
  ).toHaveCount(7);
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: `${captures}/inicio-1440.png`, fullPage: true });
  for (const [nav, heading] of [
    ['Métricas', 'Métricas'],
    ['Grupos', 'Grupos'],
    ['Solicitudes', 'Solicitudes'],
    ['Accesos', 'Accesos'],
    ['Comunicaciones', 'Comunicaciones'],
    ['Auditoría', 'Auditoría'],
  ]) {
    await page
      .getByRole('navigation')
      .getByRole('button', { name: new RegExp('^' + nav) })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Una vista del conjunto' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${captures}/inicio-390.png`, fullPage: true });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('group search, empty state, activity filter and aggregate detail are functional', async ({
  page,
}) => {
  await page.goto(preview + '#groups');
  await page.getByLabel('Buscar grupo').fill('No existe');
  await expect(page.getByRole('heading', { name: 'No hay grupos con este filtro' })).toBeVisible();
  await page.getByLabel('Buscar grupo').fill('Alameda');
  await expect(page.getByRole('button', { name: 'Ver Grupo Alameda' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver Grupo Alameda' }).click();
  await expect(page.getByRole('heading', { name: 'Grupo Alameda' })).toBeVisible();
  await expect(page.getByText('12 sep 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a grupos' }).click();
  await page.getByLabel('Buscar grupo').fill('');
  await page.getByRole('combobox', { name: 'Actividad', exact: true }).selectOption('idle');
  await expect(page.getByRole('button', { name: 'Ver Grupo Mirador' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver Grupo Alameda' })).toHaveCount(0);
});

test('review requires a reason and confirmation, preserves escaping and records only a simulated decision', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(preview + '#requests');
  await page.getByRole('button', { name: 'Revisar Grupo Albor' }).click();
  await page.getByRole('button', { name: 'Rechazar solicitud de ejemplo' }).click();
  await expect(page.getByRole('status')).toContainText('Escribe un motivo');
  const reason = '<img src=x onerror=alert(1)> Solicitud de demostración.';
  await page
    .getByLabel('Motivo de la decisión (obligatorio)')
    .fill('Solicitud duplicada del mismo grupo.');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('status')).toBeEmpty();
  await page.screenshot({ path: `${captures}/solicitud-1440.png`, fullPage: true });
  await page.getByLabel('Motivo de la decisión (obligatorio)').fill(reason);
  await page.getByRole('button', { name: 'Rechazar solicitud de ejemplo' }).click();
  await expect(page.getByRole('status')).toContainText('No se ha enviado correo');
  await expect(page.getByText('Motivo: ' + reason)).toBeVisible();
  await expect(page.locator('img[src=x]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rechazar solicitud de ejemplo' })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Auditoría' }).click();
  await expect(page.getByRole('cell', { name: 'Solicitud rechazada', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Simulada', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Solicitud rechazada', exact: true })).toHaveCount(0);
});

test('period changes are labelled and the proposed mail is readable at both widths without external resources', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && request.url() !== preview) external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(preview + '#metrics');
  await page.getByLabel('Periodo de consulta').selectOption('30');
  await expect(page.getByText('Durante los últimos 30 días', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${captures}/metricas-1440.png`, fullPage: true });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Comunicaciones', exact: true })
    .click();
  const frame = page.frameLocator('#mail-preview');
  await expect(
    frame.getByRole('heading', { name: 'Tu semana en Campamento de verano' }),
  ).toBeVisible();
  await expect(frame.getByText('4 tareas terminadas esta semana.', { exact: false })).toBeVisible();
  await expect(frame.getByText('Grupo Alameda · ejemplo')).toBeVisible();
  const mailSource = await page
    .frames()
    .find((f) => f.parentFrame())!
    .content();
  const mailPage = await page.context().newPage();
  await mailPage.route('http://127.0.0.1:3199/mail-review', (route) =>
    route.fulfill({ contentType: 'text/html', body: mailSource }),
  );
  await mailPage.setViewportSize({ width: 720, height: 1000 });
  await mailPage.goto('http://127.0.0.1:3199/mail-review');
  await mailPage.screenshot({ path: `${captures}/correo-amplio.png`, fullPage: true });
  await page.getByRole('button', { name: 'Vista móvil', exact: true }).click();
  await expect(page.locator('#mail-preview')).toHaveClass(/mobile/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    frame.getByRole('heading', { name: 'Tu semana en Campamento de verano' }),
  ).toBeVisible();
  const mail = page.frames().find((f) => f.parentFrame());
  expect(
    await mail!.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await mailPage.setViewportSize({ width: 390, height: 844 });
  await mailPage.screenshot({ path: `${captures}/correo-390.png`, fullPage: true });
  await mailPage.close();
  await expect(page.getByRole('button', { name: /Enviar prueba/ })).toBeDisabled();
  expect(external).toEqual([]);
});
