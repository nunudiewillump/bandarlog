import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const csrf = 'a'.repeat(64),
  requestId = 'b'.repeat(64);
const coverage = {
  since: '2026-09-01T00:00:00Z',
  current: true,
  previous: true,
  daily: true,
  weekly: true,
  monthly: true,
};
const usage = {
  coverage,
  members: 42,
  daily: 9,
  weekly: 24,
  monthly: 34,
  active: 24,
  previous: 21,
  returning: 19,
  recurring: 15,
  days: 73,
  contributors: 15,
  projects: 3,
  activeProjects: 2,
  created: 9,
  createdUsers: 4,
  updated: 34,
  updatedUsers: 13,
  done: 6,
  doneUsers: 4,
  comments: 14,
  commentUsers: 5,
  checklist: 20,
  checklistUsers: 4,
};
const group = {
  id: 'group-a',
  name: 'Grupo de prueba A',
  members: 42,
  active: 24,
  contributors: 15,
  projects: 3,
  createdAt: '2026-09-01T00:00:00Z',
};
const snapshot = {
  usage,
  stock: { groups: 1, pendingRequests: 1, mailPending: 1, mailFailed: 0 },
  groups: [group],
  series: [
    { day: '2026-11-10', end: '2026-11-14', active: 9 },
    { day: '2026-11-15', end: '2026-11-19', partial: true, active: 10 },
  ],
};
const directory = 'docs/platform-administration/implementation-captures';
async function fixtures(page: any, authenticated = true) {
  let loggedIn = authenticated,
    approved = false;
  const calls: string[] = [];
  await page.route('**/api/platform/**', async (route: any) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/platform/', '');
    calls.push(path);
    const json = (body: any, status = 200) =>
      route.fulfill({ status, json: body, headers: { 'Cache-Control': 'no-store' } });
    if (path === 'auth/config') return json({ googleEnabled: true });
    if (path === 'auth/code/request')
      return json(
        {
          challengeId: 'c'.repeat(64),
          retryAfter: 60,
          expiresIn: 600,
          message: 'Código solicitado.',
        },
        202,
      );
    if (path === 'auth/code/verify') {
      expect(request.postDataJSON().code).toBe('123456');
      loggedIn = true;
      return json({ ok: true });
    }
    if (!loggedIn) return json({ error: 'Inicia sesión en administración.' }, 401);
    if (path === 'me')
      return json({ name: 'Administración de prueba', email: 'admin@example.test', csrf });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe(csrf);
    if (path === 'logout') {
      loggedIn = false;
      return json({ ok: true });
    }
    if (path === 'overview' || path === 'metrics')
      return json({
        ...snapshot,
        usage: { ...usage, active: url.searchParams.get('period') === '30' ? 34 : 24 },
      });
    if (path === 'groups') return json({ items: [group], nextCursor: null, coverage: true });
    if (path === 'groups/group-a') return json({ ...group, plan: 'free', usage });
    if (path === 'requests')
      return json({
        items: [
          {
            id: requestId,
            groupName: 'Solicitud de prueba',
            createdAt: '2026-11-18',
            status: approved ? 'approved' : 'pending',
          },
        ],
        nextCursor: null,
      });
    if (path === 'requests/' + requestId)
      return json({
        id: requestId,
        groupName: 'Solicitud de prueba',
        name: 'Responsable de prueba',
        email: 'request@example.test',
        createdAt: '2026-11-18',
        expires: '2099-01-01',
        approvedAt: approved ? '2026-11-19' : null,
      });
    if (path === 'requests/' + requestId + '/review') {
      expect(request.postDataJSON().confirmed).toBe(true);
      approved = true;
      return json({ ok: true });
    }
    if (path === 'access')
      return json({
        methods: [{ method: 'google', count: 4 }],
        rejected: [{ method: 'email', count: 2 }],
        items: [],
      });
    if (path === 'mail')
      return json({
        items: [{ status: 'sent', count: 4 }],
        preview: { html: '<html lang="es"><body><h1>Resumen semanal de prueba</h1></body></html>' },
      });
    if (path === 'test-mail') return json({ ok: true }, 202);
    if (path === 'audit')
      return json({
        items: [
          {
            at: '2026-11-19',
            actor: 'Administración de prueba',
            action: 'request.approve',
            target: 'Solicitud de prueba',
            reason: 'Revisada',
          },
        ],
        nextCursor: null,
      });
    throw Error('Unexpected API path ' + path);
  });
  return calls;
}
test('independent login keeps the typed code while the resend countdown runs', async ({ page }) => {
  await fixtures(page, false);
  await page.goto('/plataforma');
  await page.getByLabel('Correo', { exact: true }).fill('admin@example.test');
  await page.getByRole('button', { name: 'Recibir código', exact: true }).click();
  await page.getByLabel('Código de correo', { exact: true }).fill('123456');
  await page.waitForTimeout(1200);
  await expect(page.getByLabel('Código de correo', { exact: true })).toHaveValue('123456');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('live panel renders only authorized aggregates and an ordinary group is not required for navigation', async ({
  page,
}) => {
  const calls = await fixtures(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/plataforma');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: directory + '/resumen-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Ver Grupo de prueba A', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grupo de prueba A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a grupos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Métricas', exact: true }).click();
  await page.getByLabel('Periodo', { exact: true }).selectOption('30');
  await expect(page.getByRole('table', { name: 'Recurrencia', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(
    page.getByRole('button', { name: 'Cerrar administración', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: /10 nov.*14 nov.*9.*15 nov.*19 nov.*parcial.*10/ }),
  ).toBeVisible();
  await page.screenshot({ path: directory + '/metricas-390.png', fullPage: true });
  for (const nav of ['Accesos', 'Comunicaciones', 'Auditoría']) {
    await page.getByRole('navigation').getByRole('button', { name: nav, exact: true }).click();
    await expect(page.getByRole('heading', { name: nav, exact: true })).toBeVisible();
  }
  const before = calls.length;
  await page.waitForTimeout(1200);
  expect(calls.length).toBe(before);
  expect(errors).toEqual([]);
});
test('request decisions require confirmation and mail tests use no arbitrary recipient', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/plataforma#requests');
  await page.getByRole('button', { name: 'Revisar Solicitud de prueba', exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar solicitud', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Indica el motivo');
  await page.getByLabel('Motivo', { exact: true }).fill('Revisada');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aprobar solicitud', exact: true }).click();
  await expect(
    page.getByText('Solicitud aprobada. Activación en cola.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Comunicaciones', exact: true })
    .click();
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Resumen semanal de prueba' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Enviar prueba a admin@example.test', exact: true })
    .click();
  await expect(page.getByText('Prueba en cola.', { exact: true })).toBeVisible();
});
test('logout clears private content in both tabs without group logout or storage', async ({
  page,
  context,
}) => {
  await fixtures(page);
  await page.goto('/plataforma');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const second = await context.newPage();
  await fixtures(second);
  await second.goto('/plataforma');
  await expect(second.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar administración', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
  await expect(second.getByText('Grupo de prueba A', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
