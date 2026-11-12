import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';
async function fixture(page: Page, holdHealth = false) {
  const data = mobileFixture(10);
  data.user.onboardingCompletedAt = '2026-11-01';
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  let requested = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') {
      if (holdHealth) await gate;
      return route.fulfill({ json: { ok: true, mail: 'preview' } });
    }
    if (path === '/api/me')
      return route.fulfill({ json: { user: data.user, csrf: 'performance-fixture' } });
    if (path === '/api/data') {
      requested = true;
      return route.fulfill({ json: data.summary() });
    }
    return route.fulfill({ status: 404, json: { error: 'Fuera del escenario' } });
  });
  return { release, requested: () => requested };
}
test('data starts before a slow health check finishes and loading stays paper', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const control = await fixture(page, true);
  try {
    await page.goto('/acceso');
    await expect.poll(control.requested).toBe(true);
    await expect(page.locator('.loading')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
    await expect(page.locator('.app-shell')).toHaveCount(0);
  } finally {
    control.release();
  }
  await expect(page.locator('.mobile-focus')).toBeVisible();
});
test('portrait/landscape uses cached canopy paint, keeps native scrolling and supports back/forward', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await fixture(page);
  await page.goto('/acceso');
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (!process.env.BANDARLOG_BASELINE)
    await expect(page.locator('.app-forest-header .botanical-decoration')).toHaveClass(
      /is-raster-ready/,
    );
  const samples: number[] = [];
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Performance.enable');
  const before = (await client.send('Performance.getMetrics')).metrics;
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    await page.setViewportSize(i % 2 ? { width: 393, height: 852 } : { width: 852, height: 393 });
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    samples.push(performance.now() - start);
  }
  const after = (await client.send('Performance.getMetrics')).metrics;
  const durations = Object.fromEntries(
    ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map((name) => [
      name,
      Number(
        (
          ((after.find((m) => m.name === name)?.value || 0) -
            (before.find((m) => m.name === name)?.value || 0)) *
          1000
        ).toFixed(2),
      ),
    ]),
  );
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await mkdir('artifacts/performance', { recursive: true });
  await writeFile(
    'artifacts/performance/orientation-' +
      (process.env.BANDARLOG_BASELINE ? 'before' : 'after') +
      '.json',
    JSON.stringify(
      { cpuSlowdown: 4, rotations: 6, roundTripAndTwoFramesMs: samples, durations },
      null,
      2,
    ),
  );
  await expect(page.locator('.bottom-nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (!process.env.BANDARLOG_BASELINE) {
    await expect(page.locator('.app-forest-header .botanical-decoration')).toHaveClass(
      /is-raster-ready/,
    );
    await expect(page.locator('.app-forest-header .botanical-art')).toBeHidden();
    await expect(page.locator('html')).toHaveCSS('scrollbar-width', 'none');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
  }
  if (process.env.BANDARLOG_BASELINE) return;
  await page.locator('.bottom-nav').getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect(page.locator('.project-grid')).toBeVisible();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: 'Comisiones', exact: true })
    .click();
  await expect(page.locator('.mobile-commission-groups')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.project-grid')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.mobile-commission-groups')).toBeVisible();
});
test('offline status and cached reads use readonly transactions and reuse the connection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await fixture(page);
  await page.goto('/acceso');
  await expect(page.locator('.mobile-focus')).toBeVisible();
  const result = await page.evaluate(async () => {
    let writes = 0,
      opens = 0;
    const put = IDBObjectStore.prototype.put,
      open = indexedDB.open;
    IDBObjectStore.prototype.put = function (...args: any[]) {
      writes++;
      return (put as any).apply(this, args);
    };
    indexedDB.open = function (...args: any[]) {
      opens++;
      return (open as any).apply(this, args);
    };
    try {
      for (let i = 0; i < 5; i++) {
        await (window as any).BandarlogOffline.status();
        await (window as any).BandarlogOffline.cached('/me');
      }
      return { writes, opens };
    } finally {
      IDBObjectStore.prototype.put = put;
      indexedDB.open = open;
    }
  });
  expect(result).toEqual({ writes: 0, opens: 0 });
});

test('paper startup exists before the application module, and missing raster art keeps the original SVG', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto('/acceso');
  await expect(page.locator('.initial-loading')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
  await page.unroute('**/src/main.tsx');
  await fixture(page);
  await page.route('**/canopy/*.webp', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await expect(page.locator('.app-forest-header .botanical-art')).toBeVisible();
  await expect(page.locator('.app-forest-header .botanical-mobile-picture')).toBeHidden();
});

test('mobile canopy keeps the approved geometry and depth; desktop remains vector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await fixture(page);
  await page.goto('/acceso');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.app-forest-header .botanical-decoration')).toHaveClass(
    /is-raster-ready/,
  );
  await mkdir('artifacts/performance', { recursive: true });
  const header = page.locator('.app-forest-header');
  await header.screenshot({ path: 'artifacts/performance/mobile-canopy-raster.png' });
  await header
    .locator('.botanical-decoration')
    .evaluate((element) => element.classList.remove('is-raster-ready'));
  await header.screenshot({ path: 'artifacts/performance/mobile-canopy-vector.png' });
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect(page.locator('.topbar .botanical-art')).toBeVisible();
  await page.screenshot({ path: 'artifacts/performance/desktop.png' });
});

test.describe('coarse pointer during rotation', () => {
  test.use({ isMobile: true, hasTouch: true });
  test('intermediate phone dimensions keep paper surfaces and readable navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await fixture(page);
    await page.goto('/acceso?view=project&project=round-v2');
    await expect(page.locator('.main > .back')).toBeVisible();
    await page.setViewportSize({ width: 852, height: 700 });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
    await expect(page.locator('.main > .back')).toHaveCSS('color', 'rgb(18, 77, 56)');
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.locator('.bottom-nav')).toBeVisible();
  });
});
