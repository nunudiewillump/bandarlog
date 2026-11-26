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
    if (path === '/api/activity') return route.fulfill({ json: { items: [], nextCursor: null } });
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
  const rowSymbol = map.locator('.pm-task .pm-symbol').first();
  expect((await rowSymbol.boundingBox())?.width).toBe(14);
  await map.screenshot({ path: capture + '/bloqueos.png' });
  await map.getByRole('button', { name: 'Acercar' }).click();
  await map.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(map.getByRole('button', { name: 'Alejar' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(map).toHaveCount(0);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
});

test('36 commissions and 720 tasks remain explorable, including an empty project', async ({
  page,
}, testInfo) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const data = fixture.summary();
  const project = data.projects[0];
  const empty = data.projects[1];
  data.commissions = Array.from({ length: 36 }, (_, i) => ({
    ...data.commissions[0],
    id: 'synthetic-' + i,
    name: 'Comisión ' + (i + 1),
    projectId: project.id,
    iconUrl: undefined,
  }));
  const base = data.tasks[0];
  data.tasks = Array.from({ length: 720 }, (_, i) => ({
    ...base,
    id: 'synthetic-task-' + i,
    title: 'Tarea ' + (i + 1),
    commissionId: data.commissions[i % 36].id,
    due: new Date(Date.UTC(2026, 10, 1 + (i % 196))).toISOString(),
    completedAt: i % 4 === 0 ? '2026-11-05T10:00:00Z' : null,
    status: ['done', 'blocked', 'in_progress', 'pending'][i % 4],
  }));
  const removedRequests: string[] = [];
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: { user: fixture.user, csrf: 'stress' } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/data') return route.fulfill({ json: data });
    if (path.endsWith('/planning') || path.endsWith('/meetings')) {
      removedRequests.push(path);
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/?view=project&project=' + project.id);
  const map = page.getByRole('region', { name: 'Mapa temporal del proyecto' });
  await expect(map.locator('.pm-commission')).toHaveCount(36);
  await expect(map.locator('.pm-task')).toHaveCount(0);
  await expect(map.getByRole('button', { name: 'Modo reunión' })).toHaveCount(0);
  await expect(
    map.getByText(/Gestionar planificación|Agenda del kraal|próximos hitos|decisiones pendientes/),
  ).toHaveCount(0);
  for (const status of ['pending', 'in_progress', 'blocked', 'done']) {
    await expect(map.locator(`.pm-metrics .pm-symbol[data-status="${status}"]`)).toBeVisible();
    await expect(
      map.locator(`.pm-summary-dot .pm-symbol[data-status="${status}"]`).first(),
    ).toBeVisible();
  }
  expect(removedRequests).toEqual([]);
  const elapsed = Date.now();
  await map.getByRole('button', { name: /^Comisión 1 / }).click();
  await expect(map.locator('.pm-task')).toHaveCount(20);
  await map.getByRole('button', { name: 'Acercar' }).click();
  await expect(map.getByRole('button', { name: 'Alejar' })).toBeEnabled();
  testInfo.annotations.push({
    type: 'measurement',
    description: `Expandir 20 tareas y activar zoom, con esperas Playwright: ${Date.now() - elapsed} ms`,
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
  await page.goto('/?view=project&project=' + empty.id);
  await expect(map).toContainText('Todavía no hay comisiones disponibles');
});
