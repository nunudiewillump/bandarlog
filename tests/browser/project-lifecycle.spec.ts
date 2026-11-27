import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('coordination closes and reopens a project from its settings', async ({ page }) => {
  const fixture = mobileFixture(1);
  fixture.user.role = 'coordination';
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const project = fixture.data.projects.find((p) => p.id === 'camp-v2')!;
  let last: { kind: string; canReopen: boolean; reopenUntil: string } | null = null;
  const commands: string[] = [];
  let publication: unknown;
  const kitchenSection = 'd9830571-b4dd-4022-a067-c6c9c1923cc3';
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: {
          user: fixture.user,
          csrf: 'fixture',
          groupEvaluationsEnabled: true,
          evaluationTemplatesEnabled: true,
        },
      });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/evaluation-templates')
      return route.fulfill({
        json: {
          items: [{ id: 'template', title: 'Balance', archived: false, revision: 1 }],
          next: null,
        },
      });
    if (path === '/api/evaluation-templates/template/versions')
      return route.fulfill({
        json: { items: [{ revision: 1, requiresCommission: true }], next: null },
      });
    if (path === '/api/evaluation-templates/template/versions/1')
      return route.fulfill({
        json: {
          structure: {
            sections: [
              { id: 'general', title: 'Balance general', audience: 'project' },
              { id: kitchenSection, title: 'Balance de cocina', audience: 'commission' },
            ],
          },
        },
      });
    if (path === '/api/projects/camp-v2/lifecycle') {
      if (route.request().method() === 'POST') {
        const { action, evaluation } = route.request().postDataJSON();
        if (evaluation) publication = evaluation;
        commands.push(action);
        project.archived = String(action !== 'reopen');
        last = {
          kind: action === 'close' ? 'closed' : 'reopened',
          canReopen: action === 'close',
          reopenUntil: '2026-12-10T19:00:00Z',
        };
        return route.fulfill({ json: { archived: project.archived === 'true' } });
      }
      return route.fulfill({ json: { archived: project.archived === 'true', last } });
    }
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=project&project=camp-v2');
  await page.getByRole('button', { name: 'Ajustes del proyecto' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cerrar sin evaluar' }).click();
  await expect(page.getByText(/Se puede reabrir hasta/)).toBeVisible();
  await page.getByRole('button', { name: 'Reabrir proyecto' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sin evaluar' })).toBeVisible();
  expect(commands).toEqual(['close', 'reopen']);
  await page.getByRole('button', { name: 'Cerrar y evaluar', exact: true }).click();
  await page.getByRole('combobox', { name: 'Acciones de Balance' }).click();
  await page.getByRole('option', { name: 'Usar para cerrar y evaluar' }).click();
  await page.getByLabel('Último día para responder').fill('2099-07-15');
  await expect(page.getByLabel('Balance general')).toBeDisabled();
  await expect(page.getByLabel('Balance de cocina')).toHaveValue('');
  await page.getByLabel('Balance de cocina').selectOption('commission-v2-5');
  await page.getByRole('checkbox', { name: new RegExp(fixture.user.name) }).check();
  await page.getByRole('button', { name: 'Cerrar y evaluar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Proyecto cerrado.' })).toBeVisible();
  expect(commands).toEqual(['close', 'reopen', 'close-and-evaluate']);
  expect(publication).toMatchObject({
    templateId: 'template',
    userIds: [fixture.user.id],
    sectionScopes: [{ sectionId: kitchenSection, commissionId: 'commission-v2-5' }],
  });
});
