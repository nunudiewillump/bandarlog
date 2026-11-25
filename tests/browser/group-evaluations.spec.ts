import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('participant opens an evaluation from Inicio, resumes a draft and sends it once', async ({
  page,
}) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
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
    if (path === '/api/group-evaluations') {
      listRequests++;
      return route.fulfill({ json: { items: [record], next: null } });
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
  await entry.click();
  const panel = page.locator('.evaluation-templates');
  const open = async () => {
    await panel.getByRole('combobox', { name: 'Acciones de Balance del campamento' }).click();
    await page.getByRole('option', { name: 'Abrir evaluación' }).click();
  };
  await open();
  await expect(panel.getByRole('button')).toHaveCount(2);
  await panel.getByLabel('¿Repetimos? (obligatoria)').selectOption('No');
  await panel.getByRole('combobox', { name: 'Opciones de respuesta' }).click();
  await page.getByRole('option', { name: 'Guardar borrador' }).click();
  await expect(panel.getByRole('status')).toHaveText('Borrador guardado.');
  await panel.getByRole('button', { name: 'Volver' }).click();
  await open();
  await expect(panel.getByLabel('¿Repetimos? (obligatoria)')).toHaveValue('No');
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect(panel.getByRole('alert')).toContainText('obligatorias');
  await panel.getByLabel('Puntuación (obligatoria)').fill('0');
  page.once('dialog', (dialog) => dialog.accept());
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect(panel.getByRole('status')).toHaveText('Evaluación enviada.');
  await expect(panel.getByRole('button', { name: 'Enviar' })).toHaveCount(0);
  expect(answers).toEqual({ a1: false, b1: 0 });
  expect(sends).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
