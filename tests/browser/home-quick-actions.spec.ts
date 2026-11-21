import { test, expect, type Page } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';
import { mkdir } from 'node:fs/promises';
const captures = 'docs/home-p0/captures';
async function setup(
  page: Page,
  width = 390,
  options: {
    delay?: number;
    failure?: number;
    archived?: boolean;
    team?: boolean;
    blockedOverdue?: boolean;
    sharedFixture?: ReturnType<typeof mobileFixture>;
  } = {},
) {
  const fixture = options.sharedFixture || mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-11-01T00:00:00Z';
  fixture.allTasks[2].blockedReason = 'Esperando material';
  if (options.blockedOverdue) fixture.allTasks[2].due = '2020-01-01';
  fixture.allTasks.forEach((t, i) => {
    t.status = i === 0 ? 'pending' : i === 1 ? 'in_progress' : i === 2 ? 'blocked' : 'done';
  });
  if (options.archived) fixture.data.projects.forEach((p) => (p.archived = 'true'));
  if (options.team)
    fixture.data.assignments = fixture.data.assignments.filter((a) => a.userId !== fixture.user.id);
  const calls: { id: string; body: any; mutation: string }[] = [];
  let network = true;
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({ json: { user: fixture.user, csrf: 'synthetic-csrf' } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-11-01T00:00:00Z' } } });
    if (path === '/api/data')
      return network
        ? route.fulfill({ json: structuredClone(fixture.summary()) })
        : route.abort('internetdisconnected');
    if (path.startsWith('/api/tasks/') && route.request().method() === 'PATCH') {
      if (!network) return route.abort('internetdisconnected');
      const id = path.split('/').at(-1)!,
        body = route.request().postDataJSON();
      calls.push({ id, body, mutation: route.request().headers()['x-mutation-id'] });
      if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
      const task = fixture.data.tasks.find((t) => t.id === id)!;
      if (options.failure) {
        if (options.failure === 409) {
          task.status = 'blocked';
          task.blockedReason = 'Otra sesión actualizó esta tarea';
          task.updatedAt = new Date(Date.now() + 1000).toISOString();
        }
        return route.fulfill({
          status: options.failure,
          json: { error: 'No se pudo guardar el cambio' },
        });
      }
      if (body.expectedUpdatedAt !== task.updatedAt)
        return route.fulfill({ status: 409, json: { error: 'Otra sesión cambió esta tarea' } });
      Object.assign(task, {
        status: body.status,
        updatedAt: new Date(Date.now() + calls.length).toISOString(),
        completedAt: body.status === 'done' ? new Date().toISOString() : null,
      });
      return route.fulfill({ json: { ok: true, task: structuredClone(task) } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/acceso');
  await expect(page.locator(width >= 768 ? '.desktop-focus' : '.mobile-focus')).toBeVisible();
  const notification = page.getByRole('button', { name: 'Ahora no', exact: true });
  if (await notification.count()) await notification.click();
  return {
    fixture,
    calls,
    setNetwork: async (value: boolean) => {
      network = value;
      await page.evaluate((v) => {
        Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
        window.dispatchEvent(new Event(v ? 'online' : 'offline'));
      }, value);
    },
  };
}
async function slide(page: Page, id = 'v2-task-0', fraction = 0.95, release = true) {
  const row = page.locator(`.mobile-focus [data-task-id="${id}"]`);
  const handle = row.locator('.home-slide-handle'),
    track = row.locator('.home-slide');
  await handle.scrollIntoViewIfNeeded();
  const h = (await handle.boundingBox())!,
    r = (await track.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    h.x + h.width / 2 + (r.width - h.width - 10) * fraction,
    h.y + h.height / 2,
    { steps: 8 },
  );
  if (release) await page.mouse.up();
}
test.describe('touch Home', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('tap, partial, cancellation and lost capture never start; release at the threshold starts once, with Undo', async ({
    page,
  }) => {
    const { calls } = await setup(page);
    const row = page.locator('.mobile-focus [data-task-id="v2-task-0"]');
    await row.locator('.home-slide-handle').tap();
    expect(calls).toHaveLength(0);
    await slide(page, undefined, 0.5);
    expect(calls).toHaveLength(0);
    await slide(page, undefined, 0.95, false);
    await expect(row).toContainText('Suelta para empezar');
    expect(calls).toHaveLength(0);
    await row.locator('.home-slide-handle').dispatchEvent('pointercancel');
    await page.mouse.up();
    expect(calls).toHaveLength(0);
    await slide(page, undefined, 0.8);
    expect(calls).toHaveLength(0);
    await slide(page);
    await expect.poll(() => calls.length).toBe(1);
    await expect(
      row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
    ).toBeEnabled();
    expect(calls[0].body.status).toBe('in_progress');
    expect(calls[0].mutation).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.locator('.undo-toast')).toContainText('Tarea en curso');
    await page
      .locator('.undo-toast')
      .getByRole('button', { name: 'Deshacer', exact: true })
      .click();
    await expect(row.locator('.home-slide')).toBeVisible();
    expect(calls[1].body.status).toBe('pending');
  });
  test('native vertical touch scroll and orientation interruption never submit the horizontal action', async ({
    page,
  }) => {
    const { calls } = await setup(page);
    await page.setViewportSize({ width: 390, height: 600 });
    const handle = page.locator('.mobile-focus [data-task-id="v2-task-0"] .home-slide-handle');
    await handle.scrollIntoViewIfNeeded();
    const b = (await handle.boundingBox())!;
    const before = await page.evaluate(() => scrollY),
      cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: b.x + 20, y: b.y + 20 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: b.x + 21, y: b.y + 20 - i * 15 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    expect(calls).toHaveLength(0);
    await slide(page, undefined, 0.95, false);
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.mouse.up();
    expect(calls).toHaveLength(0);
    await slide(page, undefined, 0.95, false);
    await handle.dispatchEvent('lostpointercapture');
    await page.mouse.up();
    expect(calls).toHaveLength(0);
  });
  test('enlarged text and keyboard alternative remain usable on a narrow touch screen', async ({
    page,
  }) => {
    const { calls } = await setup(page, 320);
    await page.addStyleTag({
      content:
        'html {font-size: 200% !important} .home-slide-label {font-size:26px !important} .home-finish,.home-start-accessible {font-size:28px !important}',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    expect(
      await page
        .locator('.mobile-focus .home-slide')
        .first()
        .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
    ).toBe(true);
    const start = page
      .locator('.mobile-focus')
      .getByRole('button', { name: 'Empezar tarea: Mi tarea 1', exact: true });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(
      page
        .locator('.mobile-focus')
        .getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
    ).toBeEnabled();
    expect(calls).toHaveLength(1);
  });
  test('one tap finishes only after acknowledgement, disables duplicates and celebrates; Undo restores the confirmed version', async ({
    page,
  }) => {
    const { calls } = await setup(page, 390, { delay: 1500 });
    const row = page.locator('.mobile-focus [data-task-id="v2-task-1"]');
    const finish = row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 2', exact: true });
    await finish.click();
    await expect(finish).toBeDisabled();
    await finish.dispatchEvent('click');
    await expect(page.locator('.task-celebration')).toHaveCount(0);
    await expect(finish).toContainText('Guardando');
    await expect(page.locator('.task-celebration')).toBeVisible();
    expect(calls).toHaveLength(1);
    await page
      .locator('.undo-toast')
      .getByRole('button', { name: 'Deshacer', exact: true })
      .click();
    await expect(
      row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 2', exact: true }),
    ).toBeEnabled();
    expect(calls[1].body.expectedUpdatedAt).not.toBe(calls[0].body.expectedUpdatedAt);
  });
  for (const failure of [403, 409, 401])
    test(`failed ${failure} never celebrates or reports completion`, async ({ page }) => {
      const { calls } = await setup(page, 390, { failure });
      await page
        .locator('.mobile-focus [data-task-id="v2-task-1"]')
        .getByRole('button', { name: 'Finalizar tarea: Mi tarea 2', exact: true })
        .click();
      await expect(page.locator('.task-celebration')).toHaveCount(0);
      if (failure === 401)
        await expect(
          page.getByRole('button', { name: 'Recibir código', exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole('alert').filter({ hasText: 'No se pudo guardar' }),
        ).toBeVisible();
      expect(calls).toHaveLength(1);
    });
  test('two independent sessions reject stale quick actions and reload the confirmed state', async ({
    page,
    browser,
  }) => {
    const first = await setup(page);
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 900 },
    });
    try {
      const secondPage = await context.newPage();
      const second = await setup(secondPage, 390, { sharedFixture: first.fixture });
      const row = (p: Page) => p.locator('.mobile-focus [data-task-id="v2-task-0"]');
      await row(page)
        .getByRole('button', { name: 'Empezar tarea: Mi tarea 1', exact: true })
        .press('Enter');
      await expect(
        row(page).getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
      ).toBeEnabled();
      await row(secondPage)
        .getByRole('button', { name: 'Empezar tarea: Mi tarea 1', exact: true })
        .press('Enter');
      await expect(secondPage.getByRole('alert')).toContainText('Otra sesión cambió esta tarea');
      await expect(
        row(secondPage).getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
      ).toBeEnabled();
      expect(second.calls[0].body.expectedUpdatedAt).toBe(first.calls[0].body.expectedUpdatedAt);
      await row(page)
        .getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true })
        .click();
      await expect(page.locator('.undo-toast')).toContainText('Tarea completada');
      await row(secondPage)
        .getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true })
        .click();
      await expect(secondPage.getByRole('alert')).toContainText('Otra sesión cambió esta tarea');
      await expect(row(secondPage)).toHaveCount(0);
      await expect(secondPage.locator('.task-celebration')).toHaveCount(0);
      expect(first.fixture.allTasks[0].status).toBe('done');
      expect(first.calls).toHaveLength(2);
      expect(second.calls).toHaveLength(2);
    } finally {
      await context.close();
    }
  });
  test('queued start cannot finish early, confirmed sync unlocks completion and survives reopening', async ({
    page,
  }) => {
    const state = await setup(page);
    await state.setNetwork(false);
    await slide(page);
    const row = page.locator('.mobile-focus [data-task-id="v2-task-0"]');
    await expect(row).toContainText('Pendiente de sincronizar');
    await expect(
      row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
    ).toBeDisabled();
    expect(state.calls).toHaveLength(0);
    await state.setNetwork(true);
    await expect(
      row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
    ).toBeEnabled();
    expect(state.calls).toHaveLength(1);
    await page.reload();
    await expect(
      row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
    ).toBeEnabled();
  });
  test('queued completion stays visibly pending and celebrates only after its own receipt', async ({
    page,
  }) => {
    const state = await setup(page);
    await state.setNetwork(false);
    const row = page.locator('.mobile-focus [data-task-id="v2-task-1"]');
    await row.getByRole('button', { name: 'Finalizar tarea: Mi tarea 2', exact: true }).click();
    await expect(row).toContainText('Pendiente de sincronizar');
    await expect(page.locator('.task-celebration')).toHaveCount(0);
    await state.setNetwork(true);
    await expect(page.locator('.task-celebration')).toBeVisible();
    await expect(page.locator('.undo-toast')).toContainText('Tarea completada');
    expect(state.calls).toHaveLength(1);
  });
  test('overdue blocked work has no misleading action, profile is always available and mobile navigation has four destinations', async ({
    page,
  }) => {
    await setup(page, 390, { blockedOverdue: true });
    const blocked = page.locator('.mobile-focus [data-task-id="v2-task-2"]');
    await expect(blocked).toContainText('Esperando material');
    await expect(blocked.locator('.badge')).toHaveText('Bloqueada');
    await expect(blocked.locator('.home-task-actions')).toHaveCount(0);
    const nav = page.locator('.bottom-nav');
    await expect(nav.getByRole('button')).toHaveCount(4);
    for (const name of ['Inicio', 'Mis tareas', 'Proyectos', 'Comisiones']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mi perfil', exact: true })).toBeVisible();
      await page.goBack();
    }
  });
  test('a scouter sees team work without unauthorized quick actions', async ({ page }) => {
    await setup(page, 390, { team: true });
    await expect(page.locator('.mobile-focus [data-task-id]').first()).toBeVisible();
    await expect(page.locator('.mobile-focus .home-task-actions')).toHaveCount(0);
  });
  test('archived project has no write actions', async ({ page }) => {
    await setup(page, 390, { archived: true });
    await expect(page.locator('.mobile-focus .home-task-actions')).toHaveCount(0);
  });
  for (const width of [320, 375, 390, 430, 768])
    test(`Forest actions fit ${width}px and preserve vertical scrolling`, async ({ page }) => {
      await setup(page, width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const profile = page.getByRole('button', { name: 'Mi perfil', exact: true });
      const p = (await profile.boundingBox())!;
      expect(p.width).toBeGreaterThanOrEqual(44);
      expect(p.height).toBeGreaterThanOrEqual(44);
      if (width < 768) {
        const h = page.locator('.mobile-focus .home-slide-handle').first();
        await h.scrollIntoViewIfNeeded();
        const b = (await h.boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        await page.mouse.move(b.x + 20, b.y + 20);
        await page.mouse.down();
        await page.mouse.move(b.x + 22, b.y + 90, { steps: 5 });
        await page.mouse.up();
        await expect(page.locator('.mobile-focus .home-slide-handle').first()).toHaveCSS(
          'transform',
          'matrix(1, 0, 0, 1, 0, 0)',
        );
      }
    });
  test('visual evidence pending, dragging, in progress and completion at 390px', async ({
    page,
  }) => {
    const state = await setup(page);
    await mkdir(captures, { recursive: true });
    await page.screenshot({ path: captures + '/home-390.png' });
    await slide(page, undefined, 0.9, false);
    await expect(page.locator('.mobile-focus [data-task-id="v2-task-0"]')).toContainText(
      'Suelta para empezar',
    );
    await page.screenshot({ path: captures + '/drag-390.png' });
    await page
      .locator('.mobile-focus [data-task-id="v2-task-0"] .home-slide-handle')
      .dispatchEvent('pointercancel');
    await page.mouse.up();
    await slide(page);
    await expect(page.locator('.undo-toast')).toContainText('Tarea en curso');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: captures + '/started-390.png' });
    await page
      .locator('.mobile-focus [data-task-id="v2-task-0"]')
      .getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true })
      .click();
    await expect(page.locator('.task-celebration')).toBeVisible();
    await page.screenshot({ path: captures + '/completed-390.png' });
    expect(state.calls).toHaveLength(2);
  });
});
test('desktop uses a direct start button; keyboard and reduced-motion work without haptic support', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { calls } = await setup(page, 1440);
  const desktop = page.locator('.desktop-home');
  await expect(desktop).toContainText('Esperando material');
  await desktop.getByRole('button', { name: 'Empezar tarea: Mi tarea 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    desktop.getByRole('button', { name: 'Finalizar tarea: Mi tarea 1', exact: true }),
  ).toBeEnabled();
  expect(calls).toHaveLength(1);
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: captures + '/home-1440.png', fullPage: true });
});
