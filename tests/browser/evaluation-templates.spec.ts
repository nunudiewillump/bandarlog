import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';

test('coordination opens the lazy editor, saves and publishes a template on mobile and desktop', async ({
  page,
}) => {
  const fixture = mobileFixture(1);
  fixture.user.role = 'coordination';
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const user = fixture.user;
  const id = 'd06008a7-fe94-4198-bd85-88769963f342';
  let structure: any;
  let published = false;
  let archived = false;
  let revision = 1;
  let requests = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({ json: { user, csrf: 'fixture', evaluationTemplatesEnabled: true } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    const root = '/api/evaluation-templates';
    const method = route.request().method();
    if (!path.startsWith(root)) return route.fulfill({ json: [] });
    requests++;
    if (path === root && method === 'POST') {
      structure = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id, revision: 1 } });
    }
    if (path === root)
      return route.fulfill({
        json: {
          items: structure ? [{ id, title: structure.title, revision, archived }] : [],
          next: null,
        },
      });
    if (method === 'PATCH') {
      const command = route.request().postDataJSON();
      expect(command.revision).toBe(revision);
      if (command.action === 'publish') published = true;
      if (command.action === 'archive') {
        archived = command.archived;
        revision++;
      }
      return route.fulfill({ json: { revision } });
    }
    if (path.endsWith('/versions'))
      return route.fulfill({
        json: {
          items: published ? [{ revision: 1, publishedAt: '2026-11-25T10:00:00Z' }] : [],
          next: null,
        },
      });
    return route.fulfill({ json: { id, structure, revision, archived } });
  });
  const modules: string[] = [];
  page.on('request', (request) => {
    if (/EvaluationTemplates[.-]/.test(request.url())) modules.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=projects');
  const opener = page.getByRole('button', { name: 'Plantillas de evaluación' });
  await expect(opener).toBeVisible();
  expect(requests).toBe(0);
  expect(modules).toHaveLength(0);
  await opener.focus();
  await opener.press('Enter');
  await page.getByRole('button', { name: 'Nueva plantilla' }).click();
  await page.getByLabel('Nombre de la plantilla').fill('Evaluación del campamento');
  await page.getByLabel('Título de sección').fill('Organización y convivencia');
  await page.getByLabel('Enunciado').fill('¿Qué debemos mantener?');
  await page.getByLabel('Tipo de pregunta').selectOption('longText');
  await page.getByLabel('Obligatoria').check();
  const panel = page.locator('.evaluation-templates');
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(2);
  await panel.getByRole('combobox', { name: 'Opciones del editor' }).click();
  await page.getByRole('option', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plantilla guardada.' })).toBeVisible();
  expect(structure.sections[0].questions[0]).toMatchObject({ type: 'longText', required: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const output = process.env.EVALUATION_SCREENSHOT_DIR;
  if (output) {
    await mkdir(output, { recursive: true });
    await panel.getByRole('heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/plantillas-movil.png' });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Versión publicada.');
  await panel.getByRole('combobox', { name: 'Opciones del editor' }).click();
  await expect(page.getByRole('option', { name: 'Exportar versión 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  if (output) await panel.screenshot({ path: output + '/plantillas-escritorio.png' });

  await panel.getByRole('button', { name: 'Volver a plantillas' }).click();
  await expect(panel.getByRole('button')).toHaveCount(2);
  const actions = panel.getByRole('combobox', { name: 'Acciones de Evaluación del campamento' });
  await actions.focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: 'Archivar', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Plantilla archivada.');
  await expect(panel.getByText('Evaluación del campamento · Archivada')).toBeVisible();
  await actions.click();
  await page.getByRole('option', { name: 'Restaurar', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Plantilla restaurada.');
  await actions.click();
  if (output) await page.screenshot({ path: output + '/menu-plantillas.png' });
  await page.getByRole('option', { name: 'Imprimir plantilla en blanco' }).click();
  await expect(
    panel.getByRole('heading', { name: '¿Qué debemos mantener? (obligatoria)' }),
  ).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(2);
  const printDir = process.env.EVALUATION_PDF_DIR;
  if (printDir) {
    await mkdir(printDir, { recursive: true });
    await page.pdf({
      path: printDir + '/plantilla-en-blanco-ejemplo.pdf',
      preferCSSPageSize: true,
      printBackground: true,
    });
  }
  await panel.getByRole('button', { name: 'Volver', exact: true }).click();
  await actions.click();
  await page.getByRole('option', { name: 'Duplicar', exact: true }).click();
  await expect(panel.getByLabel('Nombre de la plantilla')).toHaveValue(
    'Copia de Evaluación del campamento',
  );
  await expect(panel.getByRole('button')).toHaveCount(2);
});
