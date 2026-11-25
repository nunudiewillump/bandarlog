import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('coordination consults closed results and saves a conclusion', async ({ page }) => {
  const fixture = mobileFixture(1);
  fixture.user.role = 'coordination';
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const item = {
    id: 'example',
    title: 'Balance del campamento',
    templateRevision: 2,
    dueAt: '2026-11-20T18:00:00Z',
    open: false,
  };
  let conclusion: unknown;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: {
          user: fixture.user,
          csrf: 'fixture',
          evaluationTemplatesEnabled: true,
          groupEvaluationsEnabled: true,
        },
      });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path.endsWith('/manage')) return route.fulfill({ json: { items: [item], next: null } });
    if (path.endsWith('/conclusion')) {
      conclusion = route.request().postDataJSON();
      return route.fulfill({
        json: { body: 'Confirmar el material antes de salir.', revision: 1 },
      });
    }
    if (path.endsWith('/manage/example'))
      return route.fulfill({
        json: {
          ...item,
          body: null,
          conclusionRevision: null,
          structure: {
            sections: [
              {
                id: 'section',
                title: 'Equipo',
                questions: [{ id: 'score', type: 'numberScale', label: 'Coordinación' }],
              },
            ],
          },
          summary: {
            assigned: 4,
            submitted: 3,
            questions: {
              score: {
                answered: 2,
                distribution: [
                  { value: 3, count: 1 },
                  { value: 5, count: 1 },
                ],
              },
            },
          },
        },
      });
    return route.fulfill({ json: { items: [], next: null } });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=projects');
  await page.getByRole('button', { name: 'Plantillas de evaluación' }).click();
  await page.getByRole('combobox', { name: 'Opciones de plantillas' }).click();
  await page.getByRole('option', { name: 'Histórico y resultados' }).click();
  await page.getByRole('combobox', { name: 'Opciones de Balance del campamento' }).click();
  await page.getByRole('option', { name: 'Ver resultados' }).click();
  const panel = page.locator('.evaluation-templates');
  await expect(panel.getByText('3 de 4 participantes han enviado su evaluación.')).toBeVisible();
  await expect(panel.getByText('2 respuestas · 1 omitidas · Media 4')).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(2);
  await panel
    .getByLabel('Conclusiones de Coordinación')
    .fill('Confirmar el material antes de salir.');
  await panel.getByRole('button', { name: 'Guardar conclusiones' }).click();
  await expect(panel.getByRole('status')).toHaveText('Conclusiones guardadas.');
  expect(conclusion).toEqual({ body: 'Confirmar el material antes de salir.', revision: 0 });
});
