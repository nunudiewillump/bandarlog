import { test, expect, type Page } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

async function preparedUser(page: Page, role = 'member') {
  const fixture = mobileFixture(10);
  fixture.user.role = role;
  fixture.user.onboardingCompletedAt = '2026-10-28T00:00:00Z';
  fixture.user.preferences = JSON.stringify({
    forestEffects: true,
    notifications: true,
    creation: false,
    updates: false,
    reminderDays: [10, 2],
    onDue: false,
    overdueWeekly: true,
    weekly: false,
  });
  const profileChanges: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, mail: 'development' } });
    if (path === '/api/auth/config')
      return route.fulfill({ json: { googleEnabled: false, codeEnabled: true } });
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'desktop-only-fixture', development: false },
      });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/profile' && route.request().method() === 'PATCH') {
      const change = route.request().postDataJSON();
      profileChanges.push(change);
      const { name, avatarUrl, ...preferences } = change;
      if (name !== undefined) fixture.user.name = name;
      if (avatarUrl !== undefined) fixture.user.avatarUrl = avatarUrl;
      if (Object.keys(preferences).length)
        fixture.user.preferences = JSON.stringify({
          ...JSON.parse(fixture.user.preferences!),
          ...preferences,
        });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'Fuera de este escenario aislado.' } });
  });
  return { fixture, profileChanges };
}

for (const width of [320, 390])
  test(`mobile profile at ${width}px starts as information and edits only on request`, async ({
    page,
  }) => {
    const state = await preparedUser(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?view=profile');
    const information = page.getByRole('region', { name: 'Información personal' });
    await expect(information).toContainText('Scouter Prueba');
    await expect(information).toContainText('mobile@example.test');
    await expect(information).toContainText('Rosales del Canal 702');
    await expect(information.locator('.profile-neckerchief')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar perfil', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Cambio no guardado');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(information).toContainText('Scouter Prueba');
    expect(state.profileChanges).toEqual([]);
    await expect(page.getByRole('button', { name: 'Editar perfil', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Nombre elegido');
    await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
    await expect(information).toContainText('Nombre elegido');
    await page.reload();
    await expect(information).toContainText('Nombre elegido');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    expect(state.profileChanges).toEqual([{ name: 'Nombre elegido' }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('appearance preference persists across desktop and mobile without resetting reminder choices', async ({
  page,
}) => {
  const { fixture, profileChanges } = await preparedUser(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=profile');
  await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
  await page.locator('.profile-preferences > summary').click();
  await page.getByLabel('Mostrar copa y hojas', { exact: true }).click();
  await expect(page.getByLabel('Mostrar copa y hojas', { exact: true })).not.toBeChecked();
  await expect(page.locator('.botanical-decoration')).toHaveCount(0);
  expect(profileChanges).toEqual([{ forestEffects: false }]);
  const saved = JSON.parse(fixture.user.preferences!);
  expect(saved).toMatchObject({
    forestEffects: false,
    creation: false,
    updates: false,
    reminderDays: [10, 2],
    onDue: false,
    weekly: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.forest-canopy:visible')).toHaveCount(1);
  await expect(page.locator('.botanical-decoration')).toHaveCount(0);
  await page.locator('.profile-preferences > summary').click();
  await expect(page.getByLabel('Mostrar copa y hojas', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Configurar avisos', exact: true }).click();
  await expect(page.getByLabel('Días antes del vencimiento')).toHaveValue('10, 2');
  await expect(
    page.getByLabel('Al crear y asignarme una tarea', { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel('Cuando se actualice una tarea asignada', { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel('Días antes del vencimiento').fill('8, 1');
  await page.getByRole('button', { name: 'Guardar avisos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Configurar avisos', exact: true })).toBeVisible();
  expect(JSON.parse(fixture.user.preferences!)).toMatchObject({
    forestEffects: false,
    reminderDays: [8, 1],
    weekly: false,
  });
  await page.getByLabel('Mostrar copa y hojas', { exact: true }).click();
  await expect(page.getByLabel('Mostrar copa y hojas', { exact: true })).toBeChecked();
  await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a loose leaf uses the canopy artwork, can fall centrally and never intercepts the interface', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.clock.install();
  await preparedUser(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(100);
  await page.clock.runFor(33_600);
  const leaf = page.locator('.ambient-leaf');
  await expect(leaf).toHaveCount(1);
  const shape = await leaf.getAttribute('data-leaf-shape');
  const fallenPath = await leaf.locator('.botanical-leaf-silhouette').getAttribute('d');
  const attachedPath = await page
    .locator(
      `.botanical-art .botanical-leaf[data-leaf-shape="${shape}"] .botanical-leaf-silhouette`,
    )
    .first()
    .getAttribute('d');
  expect(fallenPath).toBe(attachedPath);
  const box = await leaf.boundingBox();
  expect(box!.x).toBeGreaterThan(1440 * 0.2);
  expect(box!.x).toBeLessThan(1440 * 0.8);
  expect(
    await leaf.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && !hit.closest('.ambient-leaf-layer');
    }),
  ).toBe(true);
  await page
    .getByRole('navigation')
    .first()
    .getByRole('button', { name: 'Comisiones', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Comisiones', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ambient-leaf')).toHaveCount(0);
  await page.clock.runFor(45_000);
  await expect(page.locator('.ambient-leaf')).toHaveCount(0);
  await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
  expect(
    await page
      .locator('.botanical-decoration:visible .botanical-bough')
      .evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).transform === 'none'),
      ),
  ).toBe(true);
});

test('installed PWA declares a dark forest status area and preserves safe-area layout', async ({
  page,
}) => {
  await preparedUser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#103b2d');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
    'content',
    'black-translucent',
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.theme_color).toBe('#103b2d');
  expect(manifest.background_color).toBe('#103b2d');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(16, 59, 45)');
  const headerPaint = await page.locator('.forest-canopy:visible').evaluate((element) => ({
    fill: getComputedStyle(element).backgroundImage,
    statusArea: getComputedStyle(document.documentElement, '::before').backgroundColor,
  }));
  expect(headerPaint.fill).toContain('rgb(16, 59, 45)');
  expect(headerPaint.statusArea).toBe('rgb(16, 59, 45)');
  const offline = await (await page.request.get('/offline.html')).text();
  expect(offline).toContain('name="theme-color" content="#103b2d"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [chance, count, kind] of [
  [0.2, 2, 'leaf'],
  [0.05, 1, 'banana'],
] as const)
  test(`canopy fall selects ${count} ${kind} and respects appearance preferences`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      Math.random = () => value;
    }, chance);
    await page.clock.install();
    await preparedUser(page);
    await page.setViewportSize({ width: 390, height: 950 });
    await page.goto('/');
    await expect(page.locator('.botanical-decoration:visible')).toHaveCount(1);
    await page.clock.runFor(100);
    await page.clock.runFor(17000 + chance * 33000 + 100);
    const particles = page.locator('.ambient-leaf');
    await expect(particles).toHaveCount(count);
    await expect(page.locator(`[data-falling-kind="${kind}"]`)).toHaveCount(count);
    if (kind === 'banana') {
      await expect(particles.locator('svg')).toHaveCount(1);
      await expect(particles.locator('.banana-fill-progress')).toHaveCount(0);
      await expect(particles.locator('ellipse')).toHaveCount(3);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(particles).toHaveCount(0);
    await page.clock.runFor(35000);
    await expect(particles).toHaveCount(0);
  });
