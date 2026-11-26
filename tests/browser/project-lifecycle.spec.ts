import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('coordination closes and reopens a project from its settings', async ({ page }) => {
  const fixture = mobileFixture(1);
  fixture.user.role = 'coordination';
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const project = fixture.data.projects.find((p) => p.id === 'camp-v2')!;
  let last: { kind: string; canReopen: boolean; reopenUntil: string } | null = null;
  const commands: string[] = [];
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
    if (path === '/api/projects/camp-v2/lifecycle') {
      if (route.request().method() === 'POST') {
        const { action } = route.request().postDataJSON();
        commands.push(action);
        project.archived = String(action === 'close');
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
});
