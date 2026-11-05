import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';

async function fonts(page: Page) {
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 24px Bungee', 'Bandarlog'),
      document.fonts.load('400 16px Poppins', 'España: áéíóú ü ñ ¿Qué?'),
      document.fonts.load('800 26px Poppins'),
    ]);
    await document.fonts.ready;
  });
  expect(await page.evaluate(() => document.fonts.check('400 24px Bungee'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('400 16px Poppins'))).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily),
  ).toContain('Poppins');
}

for (const width of [320, 1024, 1440]) {
  test(`brand and interface typography remain legible at ${width}px`, async ({ page }) => {
    const fixture = mobileFixture(10);
    fixture.user.role = 'admin';
    let authenticated = false;
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/health') return route.fulfill({ json: { ok: true, mail: 'development' } });
      if (path === '/api/auth/config') return route.fulfill({ json: { googleEnabled: false } });
      if (path === '/api/me')
        return authenticated
          ? route.fulfill({
              json: {
                user: { ...fixture.user, onboardingCompletedAt: '2026-11-05T00:00:00Z' },
                csrf: 'typography-test',
                development: false,
              },
            })
          : route.fulfill({ status: 401, json: { error: 'Inicia sesión.' } });
      if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
      return route.fulfill({ status: 404, json: { error: 'Fuera de este escenario.' } });
    });
    await mkdir('artifacts/typography', { recursive: true });
    await page.goto('/acceso');
    await expect(page.getByLabel('Tu correo electrónico')).toBeVisible();
    await fonts(page);
    await expect(page.locator('.forest-brand')).toHaveCSS('font-family', /Bungee/);
    await expect(page.getByLabel('Tu correo electrónico')).toHaveCSS('font-family', /Poppins/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/typography/access-${width}.png`, fullPage: true });
    authenticated = true;
    await page.reload();
    await expect(page.locator(width < 768 ? '.mobile-focus' : '.desktop-focus')).toBeVisible();
    await fonts(page);
    const brand = page.locator(width < 768 ? '.forest-brand:visible' : '.sidebar-brand:visible');
    await expect(brand).toHaveCSS('font-family', /Bungee/);
    await expect(brand).toHaveCSS('font-weight', '400');
    const dimensions = await brand.evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    if (width < 768) {
      const labels = await page.locator('.bottom-nav button span').evaluateAll((elements) =>
        elements.map((element) => {
          const label = element.getBoundingClientRect();
          return { left: label.left, right: label.right };
        }),
      );
      expect(labels).toHaveLength(5);
      labels.forEach((label, index) => {
        expect(label.left).toBeGreaterThanOrEqual(index ? labels[index - 1].right + 1 : 0);
        expect(label.right).toBeLessThanOrEqual(width);
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/typography/home-${width}.png`, fullPage: true });
    await page.goto('/acceso?view=tasks');
    await expect(
      page.locator(width < 768 ? '.mobile-task-rows' : '.desktop-table').first(),
    ).toBeVisible();
    await fonts(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const external = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => /fonts\.(googleapis|gstatic)\.com|fontsquirrel\.com/.test(url)),
    );
    expect(external).toEqual([]);
  });
}

test('public pages use the same pairing without JavaScript or external font requests', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await fonts(page);
      await expect(page.locator('.public-header .public-brand')).toHaveCSS('font-family', /Bungee/);
      await expect(page.locator('.public-header .public-brand')).toHaveCSS('font-weight', '400');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `artifacts/typography/landing-${width}.png`, fullPage: true });
      await page.goto('/privacidad');
      await fonts(page);
      await expect(page.locator('main h1')).toHaveCSS('font-family', /Poppins/);
    }
  } finally {
    await context.close();
  }
});

test('a new installed PWA has both font families offline before using every weight', async ({
  page,
  context,
}) => {
  const origin = 'http://127.0.0.1:4174';
  await page.goto(origin + '/acceso');
  await expect(page.getByLabel('Tu correo electrónico')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const saved = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith('bandarlog-static-'));
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(saved).toContain('/typography.css');
  expect(saved).toContain('/public-fonts/bungee-latin-400-normal.woff2');
  expect(saved).toContain('/public-fonts/poppins-latin-900-normal.woff2');
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Volvemos en cuanto haya conexión' }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.load('400 24px Bungee');
    await document.fonts.load('500 16px Poppins');
    await document.fonts.load('900 26px Poppins');
  });
  expect(
    await page.evaluate(
      () =>
        document.fonts.check('500 16px Poppins') &&
        document.fonts.check('900 26px Poppins') &&
        document.fonts.check('400 24px Bungee'),
    ),
  ).toBe(true);
});
