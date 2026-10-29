import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page) {
  const cached = sessions.get('admin');
  if (cached) {
    await page.context().addCookies(cached);
    return;
  }
  await page.request.post('/api/auth/request', { data: { email: 'alex@example.test' } });
  const mail = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === 'alex@example.test' && m.body.includes('token='))
    .at(-1);
  expect(
    (
      await page.request.post('/api/auth/verify', {
        data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
      })
    ).ok(),
  ).toBeTruthy();
  sessions.set('admin', await page.context().cookies());
}
for (const width of [390, 1440])
  test(`unified project creation is independent and shares navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await login(page);
    await page.goto('/');
    await page
      .locator(width === 390 ? '.bottom-nav' : '.sidebar nav')
      .getByRole('button', { name: 'Proyectos', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Proyectos', exact: true })).toBeVisible();
    await expect(
      page.locator('nav:visible').getByRole('button', { name: 'Campamentos', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('combobox', { name: 'Tipo de proyecto', exact: true }),
    ).toHaveText('General');
    await dialog.getByRole('combobox', { name: 'Tipo de proyecto', exact: true }).click();
    await page
      .getByRole('option', { name: width === 390 ? 'Campamento' : 'Evento', exact: true })
      .click();
    await expect(dialog.getByLabel('Proyecto anual', { exact: true })).toHaveCount(0);
    const title = `Proyecto único ${width} ${Date.now()}`;
    await dialog.getByLabel('Nombre', { exact: true }).fill(title);
    await dialog.getByLabel('Inicio', { exact: true }).fill('2028-01-01');
    await dialog.getByLabel('Fin', { exact: true }).fill('2028-01-03');
    const sent = page.waitForRequest(
      (r) => new URL(r.url()).pathname === '/api/projects' && r.method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
    expect((await sent).postDataJSON()).not.toHaveProperty('parentId');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const id = new URL(page.url()).searchParams.get('project');
    const data = await page.request.get('/api/data').then((r) => r.json());
    expect(data.projects.find((p: any) => p.id === id).parentId).toBeNull();
    for (const tab of ['Comisiones', 'Tareas', 'Personas']) {
      await page.locator('.page-tabs').getByRole('button', { name: tab, exact: true }).click();
      await expect(
        page.locator('.page-tabs').getByRole('button', { name: tab, exact: true }),
      ).toHaveClass(/active/);
    }
    await page.getByRole('button', { name: 'Volver a proyectos', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  });

async function fixture(page: Page, clear = false) {
  const state = mobileFixture(10),
    data = state.summary();
  state.user.role = 'admin';
  state.user.onboardingCompletedAt = '2026-10-28T00:00:00Z';
  data.users = data.users.map((u) => (u.id === state.user.id ? state.user : u));
  data.projects.push({
    id: 'event',
    name: 'Encuentro de grupo',
    type: 'event',
    parentId: null,
    starts: '2027-03-01',
    ends: '2027-03-02',
    archived: 'false',
  });
  if (clear) data.tasks.forEach((t) => (t.status = 'done'));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/me')
      return route.fulfill({
        json: { user: state.user, csrf: 'project-fixture', development: false },
      });
    if (path === '/api/data') return route.fulfill({ json: data });
    return route.fulfill({ status: 404, json: { error: 'Fuera de este escenario' } });
  });
}

test('legacy list routes resolve to one section, filters are metadata and deep links survive', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 950 });
  for (const view of ['camps', 'rounds', 'projects']) {
    await page.goto(`/?view=${view}`);
    await expect(page.getByRole('heading', { name: 'Proyectos', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('view')).toBe('projects');
    await expect(page.locator('.project-grid .project-card')).toHaveCount(3);
  }
  await page.getByRole('combobox', { name: 'Filtrar proyectos por tipo' }).click();
  await page.getByRole('option', { name: 'General', exact: true }).click();
  await expect(page.locator('.project-grid .project-card')).toHaveCount(1);
  await expect(page.locator('.project-grid')).toContainText('Ronda Solar');
  await page.goto('/?view=camps&task=v2-task-0&project=round-v2&commission=commission-v2-0');
  await expect(page.getByRole('dialog').locator('.detail-heading')).toContainText('Mi tarea 1');
  const url = new URL(page.url());
  expect(url.searchParams.get('view')).toBe('projects');
  expect(url.searchParams.get('task')).toBe('v2-task-0');
  expect(url.searchParams.get('project')).toBe('round-v2');
  expect(url.searchParams.get('commission')).toBe('commission-v2-0');
});

for (const clear of [false, true])
  test(`dark desktop keeps readable white surfaces across screens (${clear ? 'clear' : 'active'})`, async ({
    page,
  }) => {
    await fixture(page, clear);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mkdir('artifacts/project-experience', { recursive: true });
    for (const query of [
      'view=home',
      'view=tasks',
      'view=projects',
      'view=commissions',
      'view=people',
      'view=profile',
      'view=alerts',
      'view=project&project=camp-v2',
      'view=commission&project=camp-v2&commission=commission-v2-5',
    ]) {
      await page.goto('/?' + query);
      await expect(page.locator('.main')).toBeVisible();
      const sample = await page.evaluate(() => {
        const surface = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.main .page-heading, .main .desktop-priority, .main .project-banner, .main .commission-banner',
          ),
        ).find((el) => el.getBoundingClientRect().width > 0)!;
        return {
          canvas: getComputedStyle(document.querySelector('.main')!).backgroundColor,
          background: getComputedStyle(surface).backgroundColor,
          ink: getComputedStyle(surface).color,
        };
      });
      expect(sample.canvas).toBe('rgb(16, 59, 45)');
      expect(sample.background).toBe('rgb(255, 254, 250)');
      expect(sample.ink).toBe('rgb(36, 53, 43)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (query === 'view=commissions')
        await expect(page.locator('.main .project-tabs')).toHaveCSS(
          'background-color',
          'rgb(255, 254, 250)',
        );
      if (query === 'view=project&project=camp-v2') {
        await page.getByRole('button', { name: 'Ajustes del proyecto', exact: true }).click();
        await expect(page.locator('.entity-settings-panel .archive')).toHaveCSS(
          'color',
          'rgb(18, 77, 56)',
        );
        await page.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click();
      }
      await page.screenshot({
        path: `artifacts/project-experience/${query.replace(/[=&]/g, '-')}-${clear ? 'clear' : 'active'}.png`,
        fullPage: true,
      });
    }
  });

for (const installed of [false, true])
  test(`page zoom stays scoped to installed mobile PWA (installed=${installed})`, async ({
    page,
  }) => {
    if (installed)
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) =>
          query === '(display-mode: standalone)'
            ? ({
                matches: true,
                media: query,
                addEventListener() {},
                removeEventListener() {},
                addListener() {},
                removeListener() {},
                dispatchEvent() {
                  return true;
                },
                onchange: null,
              } as MediaQueryList)
            : original(query);
      });
    await fixture(page);
    await page.setViewportSize({ width: 390, height: 950 });
    await page.goto('/?view=projects');
    await expect(page.locator('.project-grid')).toBeVisible();
    const meta = page.locator('meta[name="viewport"]');
    if (installed) await expect(meta).toHaveAttribute('content', /user-scalable=no/);
    else await expect(meta).not.toHaveAttribute('content', /maximum-scale|user-scalable/);
    const events = await page.evaluate(() => {
      const pinch = new Event('gesturestart', { cancelable: true });
      document.dispatchEvent(pinch);
      const single = new Event('touchmove', { cancelable: true });
      Object.defineProperty(single, 'touches', { value: [{}] });
      document.dispatchEvent(single);
      const multi = new Event('touchmove', { cancelable: true });
      Object.defineProperty(multi, 'touches', { value: [{}, {}] });
      document.dispatchEvent(multi);
      return {
        pinch: pinch.defaultPrevented,
        single: single.defaultPrevented,
        multi: multi.defaultPrevented,
      };
    });
    expect(events).toEqual({ pinch: installed, single: false, multi: installed });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(meta).not.toHaveAttribute('content', /maximum-scale|user-scalable/);
    expect(
      await page.evaluate(() => {
        const event = new Event('gesturestart', { cancelable: true });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(false);
  });
