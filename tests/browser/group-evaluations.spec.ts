import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';

test('participant opens an evaluation from Inicio, resumes a draft and sends it once', async ({
  page,
}) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  fixture.data.group = {
    id: 'mascot-group',
    privateId: 'mascot-group',
    name: 'Pañoleta de prueba',
    colorPrimary: '#276cae',
    colorSecondary: '#f7c948',
    plan: 'free',
  };
  const dueAt = '2027-01-01T12:00:00.000Z';
  const record = {
    id: 'evaluation-id',
    title: 'Balance del campamento',
    open: true,
    dueAt,
    submittedAt: null as string | null,
  };
  const structure = {
    title: 'Balance',
    description: '',
    sections: [
      {
        id: 'a',
        title: 'Equipo',
        description: '',
        questions: [
          { id: 'a1', label: '¿Repetimos?', description: '', required: true, type: 'yesNo' },
        ],
      },
      {
        id: 'b',
        title: 'Cierre',
        description: '',
        questions: [
          { id: 'b1', label: 'Puntuación', description: '', required: true, type: 'nps' },
        ],
      },
    ],
  };
  let revision = 0;
  let answers: Record<string, unknown> = {};
  let listRequests = 0;
  let sends = 0;
  let remaining = true;
  let noAssignments = false;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'fixture', groupEvaluationsEnabled: true },
      });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/group-evaluations/pending')
      return route.fulfill({
        json: { id: !record.submittedAt ? record.id : remaining ? 'next-evaluation' : null },
      });
    if (path.endsWith('/next-evaluation'))
      return route.fulfill({
        json: {
          ...record,
          title: 'Balance siguiente',
          submittedAt: null,
          structure,
          revision: 0,
          answers: {},
        },
      });
    if (path === '/api/group-evaluations') {
      listRequests++;
      return route.fulfill({ json: { items: noAssignments ? [] : [record], next: null } });
    }
    if (path.endsWith('/response')) {
      const command = route.request().postDataJSON();
      expect(command.revision).toBe(revision++);
      answers = command.answers;
      if (command.action === 'submission') {
        sends++;
        record.submittedAt = '2026-11-25T17:00:00.000Z';
      }
      return route.fulfill({ json: { revision, submittedAt: record.submittedAt } });
    }
    if (path.endsWith('/evaluation-id'))
      return route.fulfill({ json: { ...record, structure, revision, answers } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/acceso');
  const entry = page.getByRole('button', { name: 'Mis evaluaciones' });
  await expect(entry).toBeVisible();
  expect(listRequests).toBe(0);
  const pending = page.getByRole('button', { name: 'Evaluación pendiente' });
  await expect(pending).toBeVisible();
  const scarf = pending.locator('.neckerchief-mascot');
  expect(
    await scarf.evaluate((node) =>
      ['::before', '::after'].map((pseudo) => getComputedStyle(node, pseudo).backgroundColor),
    ),
  ).toEqual(['rgb(39, 108, 174)', 'rgb(247, 201, 72)']);

  await expect
    .poll(() => pending.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  if (process.env.EVALUATION_SCREENSHOT_DIR) {
    await pending.scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.EVALUATION_SCREENSHOT_DIR + '/pendiente-movil.png' });
  }
  await page.setViewportSize({ width: 1440, height: 940 });
  const header = page.locator('.topbar');
  await expect(header.getByRole('button', { name: 'Evaluación pendiente' })).toBeVisible();
  await expect(header.locator('.botanical-decoration')).toHaveCSS('z-index', '2');
  await expect(header.locator('.desktop-evaluation-sign')).toHaveCSS('z-index', '1');
  if (process.env.EVALUATION_SCREENSHOT_DIR) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: process.env.EVALUATION_SCREENSHOT_DIR + '/pendiente-escritorio.png',
    });
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await pending.click();
  const panel = page.locator('.evaluation-templates');
  const open = async () => {
    await panel.getByRole('combobox', { name: 'Acciones de Balance del campamento' }).click();
    await page.getByRole('option', { name: 'Abrir evaluación' }).click();
  };
  await expect(panel.getByRole('heading', { name: record.title })).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(2);
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '0');
  await panel.getByLabel('¿Repetimos? (obligatoria)').selectOption('No');
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '1');
  const responseMenu = panel.getByRole('combobox', { name: 'Opciones de respuesta' });
  await responseMenu.focus();
  await responseMenu.press('Enter');
  await page.getByRole('option', { name: 'Guardar borrador' }).click();
  await expect(panel.getByRole('status')).toHaveText('Borrador guardado.');
  await panel.getByRole('button', { name: 'Volver' }).click();
  await open();
  await expect(panel.getByLabel('¿Repetimos? (obligatoria)')).toHaveValue('No');
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect(panel.getByRole('alert')).toContainText('obligatorias');
  await expect(panel.getByLabel('Puntuación (obligatoria)')).toBeFocused();
  await expect(panel.getByLabel('Puntuación (obligatoria)')).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  await panel.getByLabel('Puntuación (obligatoria)').fill('0');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const output = process.env.EVALUATION_SCREENSHOT_DIR;
  if (output) {
    await mkdir(output, { recursive: true });
    await panel.getByRole('heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/respuesta-movil.png' });
    await page.setViewportSize({ width: 1440, height: 940 });
    await panel.screenshot({ path: output + '/respuesta-escritorio.png' });
    await page.setViewportSize({ width: 390, height: 850 });
  }

  page.once('dialog', (dialog) => dialog.accept());
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect(panel.getByRole('status')).toHaveText('Evaluación enviada.');
  await expect(panel.getByRole('button', { name: 'Enviar' })).toHaveCount(0);
  expect(answers).toEqual({ a1: false, b1: 0 });
  expect(sends).toBe(1);
  await panel.getByRole('button', { name: 'Volver', exact: true }).click();
  await panel.getByRole('button', { name: 'Volver a Inicio' }).click();
  await expect(pending).toBeVisible();
  await pending.click();
  await expect(panel.getByRole('heading', { name: 'Balance siguiente' })).toBeVisible();
  remaining = false;
  await panel.getByRole('button', { name: 'Volver', exact: true }).click();
  await panel.getByRole('button', { name: 'Volver a Inicio' }).click();
  await expect(entry).toBeVisible();
  await expect(pending).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 940 });
  const desktop = page.locator('.desktop-priority + .desktop-priority');
  await expect(desktop.getByRole('button', { name: 'Mis evaluaciones' })).toBeVisible();
  noAssignments = true;
  await desktop.getByRole('button', { name: 'Mis evaluaciones' }).click();
  const empty = panel.getByText('No tienes evaluaciones asignadas.');
  const back = panel.getByRole('button', { name: 'Volver a Inicio' });
  const title = panel.getByRole('heading', { name: 'Mis evaluaciones' });
  await expect(empty).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 940 });
    const headingBox = (await title.boundingBox())!;
    const buttonBox = (await back.boundingBox())!;
    const emptyBox = (await empty.boundingBox())!;
    expect(buttonBox.y - headingBox.y - headingBox.height).toBeGreaterThanOrEqual(20);
    expect(emptyBox.y - buttonBox.y - buttonBox.height).toBeGreaterThanOrEqual(20);
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
