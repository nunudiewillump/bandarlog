import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page, origin = 'http://127.0.0.1:5174') {
  const cached = sessions.get('alex');
  if (cached) await page.context().addCookies(cached);
  if (!cached) {
    const requested = await page.request.post('/api/auth/request', {
      data: { email: 'alex@example.test' },
    });
    expect(requested.ok()).toBeTruthy();
    const mail = (await (await page.request.get('/api/dev/mail')).json())
      .filter((m: any) => m.email === 'alex@example.test' && m.body.includes('token='))
      .at(-1);
    const verified = await page.request.post('/api/auth/verify', {
      data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
    });
    expect(verified.ok()).toBeTruthy();
    sessions.set('alex', await page.context().cookies());
  }
  await page.goto(origin + '/?view=tasks');
  await expect(
    page.getByRole('heading', { name: /^(Todas las tareas|Mis tareas)$/ }),
  ).toBeVisible();
  const prompt = page.getByRole('button', { name: 'Ahora no', exact: true });
  await prompt.click();
  await expect(
    page.getByRole('heading', { name: /^(Todas las tareas|Mis tareas)$/ }),
  ).toBeVisible();
}
async function choose(page: Page, label: string, option: RegExp) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}
test('task creation chooses project then commission and updates another open view without reopening', async ({
  page,
  browser,
}) => {
  await login(page);
  const separate = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  await separate.addCookies(await page.context().cookies());
  const other = await separate.newPage();
  await other.goto('/?view=tasks');
  const name = `Tarea sincronizada ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Comisión', { exact: true })).toBeDisabled();
  await choose(page, 'Proyecto', /Campamento de verano/);
  await choose(page, 'Comisión', /^Cocina$/);
  await dialog.getByLabel('Título', { exact: true }).fill(name);
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-14');
  await dialog.getByText('Álex Martín', { exact: true }).click();
  const bounds = await dialog
    .getByRole('button', { name: 'Crear tarea', exact: true })
    .evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const button = el.getBoundingClientRect(),
        body = el.closest('.dialog-body')!.getBoundingClientRect();
      return { gap: body.bottom - button.bottom, right: body.right - button.right };
    });
  expect(bounds.gap).toBeGreaterThanOrEqual(16);
  expect(bounds.right).toBeGreaterThanOrEqual(16);
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(dialog.getByRole('heading', { name })).toBeVisible();
  await expect(other.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 5000 });
  await separate.close();
  const state = await page.request.get('/api/me').then((r) => r.json());
  const task = (await page.request.get('/api/data').then((r) => r.json())).tasks.find(
    (t: any) => t.title === name,
  );
  await page.request.delete(`/api/tasks/${task.id}`, { headers: { 'X-CSRF-Token': state.csrf } });
});

test('mobile save indicator stays compact and task controls remain below activity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.task-destination')).toContainText('Cocina');
  await expect(dialog.getByLabel('Proyecto', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Título', { exact: true }).fill(`Carga móvil ${Date.now()}`);
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-07-01');
  await dialog.getByText('Álex Martín', { exact: true }).click();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  const loader = page.locator('.operation-loading');
  await expect(loader).toBeVisible();
  const box = await loader.boundingBox();
  expect(box!.height).toBeLessThan(70);
  expect(box!.width).toBeLessThan(220);
  finish();
  await expect(page.getByRole('dialog', { name: 'Nueva tarea', exact: true })).not.toBeVisible();
  await expect(dialog.locator('.detail-heading')).toBeVisible();
  const positions = await dialog.evaluate((el) => ({
    activity: el.querySelector('.activity-list')!.getBoundingClientRect().top,
    actions: el.querySelector('.detail-actions')!.getBoundingClientRect().top,
    settings: el.querySelector('.entity-settings-trigger')!.getBoundingClientRect().top,
    heading: el.querySelector('.detail-heading')!.getBoundingClientRect().top,
  }));
  expect(positions.actions).toBeGreaterThan(positions.activity);
  expect(positions.settings).toBeGreaterThanOrEqual(positions.heading);
  await mkdir('artifacts/workflow-fixes', { recursive: true });
  await dialog.locator('.detail-actions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/workflow-fixes/mobile-task.png' });
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.locator('.undo-toast')).toBeVisible();
  await expect(page.locator('.task-celebration > strong')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Ajustes de la tarea', exact: true }).click();
  await dialog.locator('.delete-task > summary').click();
  await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();
});

test('installed build reads offline, queues a task and syncs exactly once after reconnect', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await login(page, 'http://127.0.0.1:4174');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /^(Todas las tareas|Mis tareas)$/ }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /^(Todas las tareas|Mis tareas)$/ }),
  ).toBeVisible();
  const title = `Offline ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await choose(page, 'Proyecto', /Campamento de verano/);
  await choose(page, 'Comisión', /^Cocina$/);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-14');
  await dialog.getByText('Álex Martín', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(page.locator('.sync-status')).toContainText('1 cambio pendiente');
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.locator('.sync-status')).toContainText('2 cambios pendientes');
  await expect(page.locator('.task-celebration')).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator('.sync-status')).toHaveCount(0, { timeout: 20000 });
  const data = await page.request.get('/api/data').then((r) => r.json());
  expect(data.tasks.filter((t: any) => t.title === title)).toHaveLength(1);
  expect(data.tasks.find((t: any) => t.title === title).status).toBe('done');
  const session = await page.request.get('/api/me').then((r) => r.json());
  await page.request.delete(`/api/tasks/${data.tasks.find((t: any) => t.title === title).id}`, {
    headers: { 'X-CSRF-Token': session.csrf },
  });
});

test('desktop surfaces and profile use readable cream containers and striped scout colours', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await mkdir('artifacts/workflow-fixes', { recursive: true });
  for (const view of ['tasks', 'commissions', 'projects', 'people', 'profile']) {
    await page.goto(`/?view=${view}`);
    await expect(page.locator('.main')).toBeVisible();
    const colours = await page.locator('.main').evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colours.background).toBe('rgb(16, 59, 45)');
    expect(colours.body).toBe('rgb(16, 59, 45)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/workflow-fixes/desktop-${view}.png`, fullPage: true });
  }
  await expect(page.locator('.profile-neckerchief pattern rect')).toHaveCount(2);
  await page.getByText('Preferencias', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeVisible();
});

test('native notification permission follows a click and a device can be enabled and disabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let subscription: any = null;
    let permission: NotificationPermission = 'default';
    (window as any).permissionRequests = 0;
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => {
      (window as any).permissionRequests++;
      permission = 'granted';
      return permission;
    };
    const registration = {
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () =>
          (subscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/browser-fixture',
            toJSON: () => ({
              endpoint: 'https://fcm.googleapis.com/fcm/send/browser-fixture',
              keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
            }),
            unsubscribe: async () => {
              subscription = null;
              return true;
            },
          }),
      },
    };
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      get: () => Promise.resolve(registration),
    });
    navigator.serviceWorker.getRegistration = async () =>
      registration as unknown as ServiceWorkerRegistration;
  });
  await login(page);
  expect(await page.evaluate(() => (window as any).permissionRequests)).toBe(0);
  await page.goto('/?view=profile');
  await page.getByText('Preferencias', { exact: true }).click();
  await page.getByRole('button', { name: 'Activar notificaciones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Desactivar en este dispositivo' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).permissionRequests)).toBe(1);
  await page.getByRole('button', { name: 'Desactivar en este dispositivo' }).click();
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeVisible();
});

test('pending work survives an expired session and signing into the same account', async ({
  page,
  context,
}) => {
  await login(page);
  const session = await page.request.get('/api/me').then((r) => r.json());
  const data = await page.request.get('/api/data').then((r) => r.json());
  const task = data.tasks.find((t: any) => t.commissionId === 'cocina' && t.status === 'pending');
  await context.setOffline(true);
  await page.evaluate(
    async ({ task }) => {
      await (globalThis as any).BandarlogOffline.enqueue(
        `/tasks/${task.id}`,
        'PATCH',
        { status: 'in_progress', expectedUpdatedAt: task.updatedAt },
        crypto.randomUUID(),
      );
    },
    { task },
  );
  await context.clearCookies();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByLabel('Tu correo electrónico')).toBeVisible();
  expect(await page.evaluate(() => (globalThis as any).BandarlogOffline.status())).toMatchObject({
    pending: 1,
  });
  // Use a fresh, legitimate access token for the same account, without logging out.
  await page.request.post('/api/auth/request', { data: { email: session.user.email } });
  const mail = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === session.user.email && m.body.includes('token='))
    .at(-1);
  await page.goto('/?token=' + mail.body.match(/token=([a-f0-9]+)/)[1]);
  await page.getByRole('button', { name: 'Confirmar inicio de sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).BandarlogOffline.status()))
    .toMatchObject({ pending: 0 });
  const current = await page.request.get('/api/data').then((r) => r.json());
  expect(current.tasks.find((t: any) => t.id === task.id).status).toBe('in_progress');
  await page.request.patch(`/api/tasks/${task.id}`, {
    headers: { 'X-CSRF-Token': (await page.request.get('/api/me').then((r) => r.json())).csrf },
    data: { status: 'pending' },
  });
});

test('a stale offline version is kept for review instead of overwriting newer server work', async ({
  page,
}) => {
  await login(page);
  const data = await page.request.get('/api/data').then((r) => r.json());
  const task = data.tasks.find((t: any) => t.commissionId === 'cocina');
  await page.evaluate(
    async ({ task }) => {
      await (globalThis as any).BandarlogOffline.enqueue(
        `/tasks/${task.id}`,
        'PATCH',
        { status: 'done', expectedUpdatedAt: '2000-01-01T00:00:00Z' },
        crypto.randomUUID(),
      );
      await (globalThis as any).BandarlogOffline.flush();
      window.dispatchEvent(new Event('bandarlog:queue'));
    },
    { task },
  );
  await expect(page.locator('.sync-status')).toContainText('La tarea ha cambiado');
  const current = await page.request.get('/api/data').then((r) => r.json());
  expect(current.tasks.find((t: any) => t.id === task.id).status).toBe(task.status);
  await page.getByText('Resolver cambios pendientes', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Descartar cambios de este dispositivo', exact: true })
    .click();
  await expect(page.locator('.sync-status')).toHaveCount(0);
});

for (const width of [390, 1440])
  test(`task creation restores page scrolling after overlapping dialogs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 620 });
    await login(page);
    const name = `Recuperar scroll ${width} ${Date.now()}`;
    await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nueva tarea', exact: true });
    await choose(page, 'Proyecto', /Campamento de verano/);
    await choose(page, 'Comisión', /^Cocina$/);
    await form.getByLabel('Título', { exact: true }).fill(name);
    await form.getByLabel('Fecha límite', { exact: true }).fill('2027-06-14');
    await form.getByText('Álex Martín', { exact: true }).click();
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => (resume = resolve));
    // Keep the create form open while the new detail opens, as on a slow refresh.
    await page.route('**/api/data', async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await form.getByRole('button', { name: 'Crear tarea', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(2);
    } finally {
      resume();
    }
    await expect(form).toHaveCount(0);
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await detail.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.move(width > 1000 ? 900 : 190, 450);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // A subsequent cancelled form must not leave a stale scroll lock either.
    await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });
