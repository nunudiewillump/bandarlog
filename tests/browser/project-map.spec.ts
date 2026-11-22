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
  await map.screenshot({ path: capture + '/bloqueos.png' });
  await map.getByRole('button', { name: 'Acercar' }).click();
  await map.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(map.getByRole('button', { name: 'Alejar' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(map).toHaveCount(0);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
});

test('coordination uses planning and meeting mode in a persisted project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const origin = 'http://127.0.0.1:5174';
  const baseHeaders = { Origin: origin };
  await page.request.post('/api/auth/request', {
    data: { email: 'alex@example.test' },
    headers: baseHeaders,
  });
  const [mail] = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter(
      (m: { email: string; body: string }) =>
        m.email === 'alex@example.test' && m.body.includes('token='),
    )
    .slice(-1);
  expect(
    (
      await page.request.post('/api/auth/verify', {
        data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
        headers: baseHeaders,
      })
    ).ok(),
  ).toBeTruthy();
  const me = await page.request.get('/api/me').then((r) => r.json());
  const headers = { ...baseHeaders, 'X-CSRF-Token': me.csrf };
  const make = async (path: string, data: object) => {
    const response = await page.request.post('/api/' + path, { data, headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const project = await make('projects', {
    name: 'Campamento del kraal',
    starts: '2026-10-01',
    ends: '2027-02-01',
  });
  const kitchen = await make('commissions', {
    name: 'Cocina',
    projectId: project.id,
    members: [{ userId: me.user.id, role: 'responsible' }],
  });
  await make('commissions', {
    name: 'Material',
    projectId: project.id,
    members: [{ userId: me.user.id, role: 'responsible' }],
  });
  const task = await make('tasks', {
    title: 'Revisar alergias',
    commissionId: kitchen.id,
    due: '2026-12-02T10:00:00Z',
    responsibleIds: [me.user.id],
  });
  const planning = 'projects/' + project.id + '/planning';
  await make(planning, {
    kind: 'phase',
    name: 'Preparación',
    starts: '2026-10-01',
    ends: '2026-12-20',
    position: 0,
  });
  await page.goto('/?view=project&project=' + project.id);
  const map = page.getByRole('region', { name: 'Mapa temporal del proyecto' });
  await expect(map).toBeVisible();
  await map.getByText('Gestionar planificación', { exact: true }).click();
  await map.getByRole('button', { name: 'Nuevo hito' }).click();
  await map.getByLabel('Nombre', { exact: true }).fill('Reserva de alojamiento');
  await map.getByLabel('Fecha prevista').fill('2026-12-05');
  await map.getByLabel('Fecha real de cumplimiento').fill('2026-11-18');
  await map.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(map.getByText('Hito · Cumplido')).toBeVisible();
  await expect(map.locator('.pm-diamond')).toHaveCount(2);
  await map.getByText('Gestionar planificación', { exact: true }).click();
  const capture = 'artifacts/project-map';
  await mkdir(capture, { recursive: true });
  await map.screenshot({ path: capture + '/fases-e-hitos.png' });
  await map.getByRole('button', { name: 'Modo reunión', exact: true }).click();
  await expect(map.getByRole('button', { name: 'Salir del modo reunión' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toBe('project-map');
  await map.getByRole('button', { name: 'Siguiente' }).click();
  await expect(map.locator('.pm-commission[data-active="true"]')).toContainText('Cocina');
  await map.getByRole('button', { name: 'Siguiente' }).click();
  await expect(map.locator('.pm-commission[data-active="true"]')).toContainText('Material');
  await map.getByRole('button', { name: 'Todas las comisiones' }).click();
  await page.screenshot({ path: capture + '/modo-reunion.png' });
  const agenda = map.getByRole('region', { name: 'Agenda y actas' });
  await agenda.getByRole('button', { name: 'Registrar decisión' }).click();
  await agenda.getByLabel('Cuestión').fill('Elegir menú del campamento');
  await agenda.getByLabel('Comisión', { exact: true }).selectOption(kitchen.id);
  await agenda.getByLabel('Fecha objetivo').fill('2026-12-08');
  await agenda.screenshot({ path: capture + '/registro-decision.png' });
  await agenda.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(
    map.getByRole('button', { name: 'Elegir menú del campamento, decisión pendiente' }),
  ).toBeVisible();
  await agenda.screenshot({ path: capture + '/agenda.png' });
  await agenda.getByText(/Historial de decisiones/).click();
  await agenda.getByRole('button', { name: 'Crear tarea de seguimiento' }).click();
  await agenda.getByLabel('Título', { exact: true }).fill('Cerrar pedido de cocina');
  await agenda.getByLabel('Fecha límite').fill('2026-12-10');
  await agenda.getByLabel('Responsables', { exact: true }).selectOption(me.user.id);
  await agenda.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(agenda.getByText('Compromisos pendientes (1)')).toBeVisible();
  const model = await page.request
    .get('/api/projects/' + project.id + '/meetings')
    .then((r) => r.json());
  expect(model.followups).toHaveLength(1);
  await make(planning, {
    kind: 'dependency',
    sourceId: task.id,
    targetId: model.followups[0].taskId,
  });
  await agenda.getByRole('button', { name: 'Nueva acta' }).click();
  await agenda.getByLabel('Título', { exact: true }).fill('Acta de preparación');
  await agenda.getByLabel('Fecha de reunión').fill('2026-11-22');
  await agenda.getByLabel('Orden del día').fill('Menú y reserva');
  await agenda.getByLabel('Notas').fill('Revisar el pedido en la próxima reunión.');
  await agenda.getByLabel('Decisiones relacionadas').selectOption(model.decisions[0].id);
  await agenda.getByLabel('Tareas de seguimiento').selectOption(model.followups[0].taskId);
  await agenda.getByRole('button', { name: 'Guardar borrador' }).click();
  await agenda.getByText('Actas (1)', { exact: true }).click();
  await agenda.getByRole('button', { name: 'Editar borrador' }).click();
  await agenda.getByRole('button', { name: 'Cerrar acta' }).click();
  await expect(agenda.getByRole('button', { name: 'Editar borrador' })).toHaveCount(0);
  await agenda.getByRole('button', { name: 'Acta de preparación', exact: true }).click();
  const minutes = agenda.getByRole('article', { name: 'Acta de reunión' });
  await expect(minutes).toContainText('Cerrar pedido de cocina');
  await minutes.screenshot({ path: capture + '/acta.png' });
  await map.getByRole('button', { name: 'Salir del modo reunión' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(agenda.getByRole('article', { name: 'Acta de reunión' })).toBeVisible();
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
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: { user: fixture.user, csrf: 'stress' } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/data') return route.fulfill({ json: data });
    if (path.endsWith('/planning'))
      return route.fulfill({
        json: { phases: [], milestones: [], dependencies: [], canManage: false },
      });
    return route.fulfill({ json: { decisions: [], minutes: [], followups: [], canManage: false } });
  });
  await page.goto('/?view=project&project=' + project.id);
  const map = page.getByRole('region', { name: 'Mapa temporal del proyecto' });
  await expect(map.locator('.pm-commission')).toHaveCount(36);
  await expect(map.locator('.pm-task')).toHaveCount(0);
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
