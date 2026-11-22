import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';

test('desktop project timeline keeps history, opens the task and responds to resizing', async ({
  page,
}) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const data = fixture.summary();
  const [done, blocked] = data.tasks;
  done.status = 'done';
  done.due = '2026-11-05T10:00:00Z';
  done.completedAt = '2026-11-06T10:00:00Z';
  blocked.status = 'blocked';
  blocked.blockedReason = 'Falta confirmar el material';
  const commission = data.commissions.find((c) => c.id === done.commissionId)!;
  const project = data.projects.find((p) => p.id === commission.projectId)!;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: { user: fixture.user, csrf: 'fixture' } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/data') return route.fulfill({ json: data });
    return route.fulfill({ json: [] });
  });
  const chunks: string[] = [];
  page.on('request', (request) => {
    if (/ProjectMap[.-]/.test(request.url())) chunks.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=project&project=' + project.id);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  const map = page.getByRole('region', { name: 'Mapa temporal del proyecto' });
  await expect(map).toHaveCount(0);
  expect(chunks).toHaveLength(0);
  await page.setViewportSize({ width: 1024, height: 850 });
  await expect(map).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
  const capture = 'artifacts/project-map';
  await mkdir(capture, { recursive: true });
  await map.screenshot({ path: capture + '/portatil.png' });
  await page.setViewportSize({ width: 1440, height: 950 });
  await map.screenshot({ path: capture + '/mapa.png' });
  await map.getByRole('button', { name: new RegExp(commission.name) }).click();
  await map
    .getByRole('button', { name: new RegExp(done.title + ', Terminada, Finalización') })
    .click();
  await expect(map.getByRole('complementary')).toContainText(done.title);
  await map.screenshot({ path: capture + '/comision-y-detalle.png' });
  await map.getByRole('button', { name: 'Abrir ficha' }).click();
  await expect(page.getByRole('dialog')).toContainText(done.title);
  await page.getByRole('dialog').getByRole('button', { name: 'Volver', exact: true }).click();
  await map.getByRole('button', { name: /Bloqueadas/ }).click();
  await map
    .getByRole('button', { name: new RegExp(blocked.title + ', Bloqueada, Vencimiento') })
    .click();
  await expect(map.getByRole('complementary')).toContainText('Falta confirmar el material');
  await map.screenshot({ path: capture + '/bloqueos.png' });
  await map.getByRole('button', { name: 'Acercar' }).click();
  await map.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(map.getByRole('button', { name: 'Alejar' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(map).toHaveCount(0);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
});
