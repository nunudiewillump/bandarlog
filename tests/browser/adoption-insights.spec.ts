import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('Product Insights loads adoption on demand, shows denominators and supports narrow screens', async ({ page }, info) => {
  const requests: URL[] = [];
  await page.route('**/api/platform/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/me'))
      return route.fulfill({ json: { name: 'Administración de prueba', productFeedbackEnabled: true, adoptionInsightsEnabled: true } });
    if (url.pathname.endsWith('/feedback'))
      return route.fulfill({ json: { insights: [], items: [], campaigns: [] } });
    if (url.pathname.endsWith('/insights/adoption')) {
      requests.push(url);
      return route.fulfill({ json: {
        summary: { groups: 4, welcomeCompleted: 2, prepared: 1, explored: 2, replayed: 1,
          guideStarted: 1, activated: 2, historicalActivated: 0, medianDays: 12.5 },
        funnel: [4,2,1,1,1,1,1],
        intent: { prepare: 1, explore: 2, replay: 0, unknown: 1, later: 1, explorersPrepared: 1, explorersActivated: 1 },
        cohorts: [{ days: 7, eligible: 3, activated: 1 }, { days: 14, eligible: 2, activated: 1 }, { days: 30, eligible: 0, activated: 0 }],
        experiences: { welcome: { eligible: 4, shown: 3, started: 2, completed: 2, skipped: 1,
          abandoned: 0, reopened: 1, startedAmongShown: 2, completedAmongStarted: 2, medianMinutes: 2, historical: 0 } },
        eligibilitySources: { founder: 3, coordination: 2, admin: 1 },
        milestones: { project: 3, commission: 2, member_added: 2, task_completed: 2 },
      } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/plataforma#feedback');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Incorporación y adopción' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Incorporación y adopción' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Embudo guiado · grupos únicos' })).toBeVisible();
  await expect(page.getByRole('row', { name: /30 días.*0.*0.*—/ })).toBeVisible();
  await page.getByLabel('Alta del grupo').selectOption('90');
  await page.getByLabel('Rol actual en rendimiento de tutoriales').selectOption('coordination');
  await expect.poll(() => requests.at(-1)?.searchParams.get('days')).toBe('90');
  await expect.poll(() => requests.at(-1)?.searchParams.get('role')).toBe('coordination');
  const captures = process.env.ADOPTION_SCREENSHOTS || info.outputPath('adoption');
  await mkdir(captures, { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('region', { name: 'Cohortes de activación' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: join(captures, `adopcion-${width}.png`), fullPage: true });
  }
});
