import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('coordination assigns a published version from the template menu', async ({ page }) => {
  const fixture = mobileFixture(1);
  fixture.user.role = 'coordination';
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const data = fixture.summary();
  data.users.push(
    { id: 'active', name: 'Ana Pérez', email: 'ana@example.test', role: 'member' },
    {
      id: 'disabled',
      name: 'Ana Baja',
      email: 'baja@example.test',
      role: 'member',
      disabledAt: '2026-11-01',
    },
  );
  const template = {
    id: 'template-fixture',
    title: 'Balance del campamento',
    revision: 3,
    archived: false,
  };
  const day = '2099-07-15';
  const commands: unknown[] = [];
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
    if (path === '/api/data') return route.fulfill({ json: data });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/evaluation-templates')
      return route.fulfill({ json: { items: [template], next: null } });
    if (path.endsWith('/versions'))
      return route.fulfill({ json: { items: [{ revision: 2 }, { revision: 1 }], next: null } });
    if (path === '/api/group-evaluations' && route.request().method() === 'POST') {
      commands.push(route.request().postDataJSON());
      if (commands.length === 1)
        return route.fulfill({ status: 409, json: { error: 'Vuelve a intentarlo.' } });
      return route.fulfill({ status: 201, json: { id: 'published-evaluation' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=projects');
  await page.getByRole('button', { name: 'Plantillas de evaluación' }).click();
  await page.getByRole('combobox', { name: 'Acciones de Balance del campamento' }).click();
  await page.getByRole('option', { name: 'Asignar evaluación' }).click();
  const panel = page.locator('.evaluation-templates');
  await expect(panel.getByRole('button')).toHaveCount(2);
  await expect(panel.getByLabel('Versión de plantilla')).toHaveValue('2');
  await panel.getByLabel('Versión de plantilla').selectOption('1');
  await panel.getByLabel('Último día para responder').fill(day);
  await panel.getByLabel('Buscar participantes').fill('ana');
  await expect(panel.getByText('Ana Baja')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: /Ana Pérez/ }).check();
  const publish = panel.getByRole('button', { name: 'Publicar', exact: true });
  await publish.click();
  await expect(panel.getByRole('alert')).toHaveText('Vuelve a intentarlo.');
  await expect(panel.getByRole('checkbox', { name: /Ana Pérez/ })).toBeChecked();
  await publish.click();
  await expect(
    panel.getByRole('status').filter({ hasText: 'Evaluación publicada.' }),
  ).toBeVisible();
  expect(commands).toEqual(
    Array.from({ length: 2 }, () => ({
      title: template.title,
      templateId: template.id,
      templateRevision: 1,
      userIds: ['active'],
      dueAt: day + 'T21:59:59.999Z',
    })),
  );
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
