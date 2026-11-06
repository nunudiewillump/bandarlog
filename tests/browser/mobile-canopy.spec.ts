import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { mobileFixture } from '../fixtures/mobile';

async function prepare(page: Page, width = 390, view = 'tasks') {
  const fixture = mobileFixture(10);
  fixture.user.role = 'admin';
  fixture.user.onboardingCompletedAt = '2026-11-01T00:00:00Z';
  fixture.user.preferences = JSON.stringify({
    forestEffects: true,
    notifications: true,
    overdueWeekly: true,
    overdueDaily: false,
    reminderDays: [7, 3],
    weekly: false,
  });
  const changes: Record<string, unknown>[] = [];
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem('bandarlog-push-asked:mobile-scouter', 'yes'),
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, mail: 'development' } });
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'canopy-only-fixture', development: false },
      });
    if (path === '/api/data') return route.fulfill({ json: structuredClone(fixture.summary()) });
    if (path === '/api/profile' && route.request().method() === 'PATCH') {
      const change = route.request().postDataJSON();
      changes.push(change);
      const { name, avatarUrl, ...preferences } = change;
      if (name !== undefined) fixture.user.name = name;
      if (avatarUrl !== undefined) fixture.user.avatarUrl = avatarUrl;
      fixture.user.preferences = JSON.stringify({
        ...JSON.parse(fixture.user.preferences!),
        ...preferences,
      });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'Fuera del escenario aislado.' } });
  });
  await page.goto('/acceso?view=' + view);
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await mkdir('artifacts/mobile-canopy', { recursive: true });
  return { fixture, changes };
}

test('larger brand marks fit at phone and desktop widths; badges match and project icons are centered', async ({
  page,
}) => {
  test.setTimeout(60000);
  const palettes: Record<string, unknown>[] = [];
  for (const width of [320, 1024, 1440]) {
    await prepare(page, width);
    const brand = page.locator(width < 768 ? '.forest-brand:visible' : '.sidebar-brand:visible');
    const icon = brand.locator('img');
    const box = await icon.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(width === 1024 ? 36 : 44);
    const brandSize = await brand.evaluate((element) => ({
      content: element.scrollWidth,
      width: element.clientWidth,
    }));
    expect(brandSize.content).toBeLessThanOrEqual(brandSize.width + 1);
    const colors: Record<string, unknown> = {};
    for (const status of ['pending', 'done']) {
      const badge = page.locator('.badge.' + status + ':visible').first();
      await expect(badge).toBeVisible();
      colors[status] = await badge.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          background: style.backgroundColor,
          radius: style.borderRadius,
          weight: style.fontWeight,
          padding: style.padding,
        };
      });
    }
    palettes.push(colors);
    expect(colors.pending).not.toEqual(colors.done);
    await page.screenshot({ path: 'artifacts/mobile-canopy/tasks-' + width + '.png' });
    await page
      .locator(width < 768 ? '.bottom-nav' : '.sidebar')
      .getByRole('button', { name: 'Proyectos', exact: true })
      .click();
    for (const art of await page.locator('.project-card .project-art:visible').all()) {
      const tile = await art.boundingBox();
      const glyph = await art.locator('svg').first().boundingBox();
      expect(Math.abs(tile!.x + tile!.width / 2 - glyph!.x - glyph!.width / 2)).toBeLessThan(1);
      expect(Math.abs(tile!.y + tile!.height / 2 - glyph!.y - glyph!.height / 2)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'artifacts/mobile-canopy/projects-' + width + '.png' });
  }
  expect(palettes[0]).toEqual(palettes[2]);
});

test('desktop scrollbars and public brand use the same forest palette as the application', async ({
  page,
}) => {
  await prepare(page, 1440);
  const palette = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).scrollbarColor);
  expect(palette).toBe('rgb(56, 108, 76) rgb(237, 240, 229)');
  await page.goto('/');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).scrollbarColor),
  ).toBe(palette);
  expect((await page.locator('.public-header .public-brand img').boundingBox())!.width).toBe(48);
});

test.describe('touch and installed mobile layout', () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const [platform, inset] of [
    ['ios', 47],
    ['android', 24],
  ] as const)
    test(
      platform + ' standalone reserves controls but lets the fixed canopy paint to the top',
      async ({ page }) => {
        await page.addInitScript((platform) => {
          if (platform === 'ios') Object.defineProperty(navigator, 'standalone', { value: true });
          else {
            const original = window.matchMedia.bind(window);
            window.matchMedia = (query) => {
              const media = original(query);
              return query === '(display-mode: standalone)'
                ? new Proxy(media, {
                    get(target, key) {
                      if (key === 'matches') return true;
                      const value = Reflect.get(target, key, target);
                      return typeof value === 'function' ? value.bind(target) : value;
                    },
                  })
                : media;
            };
          }
        }, platform);
        await prepare(page);
        await page.evaluate(
          (inset) => document.documentElement.style.setProperty('--forest-safe-top', inset + 'px'),
          inset,
        );
        await expect(page.locator('html')).toHaveClass(/mobile-pwa-no-zoom/);
        await expect(page.locator('body')).toHaveCSS('padding-top', '0px');
        await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 59, 45)');
        const header = page.locator('.app-forest-header');
        const leaves = header.locator('.botanical-decoration');
        await expect(leaves).toHaveCSS('position', 'fixed');
        expect((await header.boundingBox())!.y).toBe(0);
        expect((await leaves.boundingBox())!.y).toBe(0);
        // Check rendered leaves, not just the box: the former native status strip was flat.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const { data, info } = await sharp(
          await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: inset } }),
        )
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (const y of [4, Math.floor(inset / 2), inset - 4]) {
          const greens = Array.from(
            { length: info.width },
            (_, x) => data[(y * info.width + x) * info.channels + 1],
          );
          expect(Math.max(...greens) - Math.min(...greens)).toBeGreaterThan(15);
          expect(greens.filter((green) => green > 67).length).toBeGreaterThan(30);
        }
        expect((await header.locator('.forest-brand').boundingBox())!.y).toBeGreaterThanOrEqual(
          inset,
        );
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement, '::before').content),
        ).toBe('none');
        await expect(
          page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
        ).toHaveAttribute('content', 'black-translucent');
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
          'content',
          '#103b2d',
        );
        await page.screenshot({
          path: 'artifacts/mobile-canopy/' + platform + '-simulated-safe-area.png',
        });
        await page.evaluate(() => scrollTo(0, 500));
        expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200);
        expect((await header.boundingBox())!.y).toBe(0);
        expect((await leaves.boundingBox())!.y).toBe(0);
        expect(
          await header.locator('.forest-brand').evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            );
          }),
        ).toBe(true);
        const touch = await page.context().newCDPSession(page);
        const before = await page.evaluate(() => scrollY);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: 190, y: 600 }],
        });
        for (const y of [500, 400, 300, 220]) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: 190, y }],
          });
          await page.waitForTimeout(20);
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
        await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
      },
    );

  test('touch moves nearby app leaves; a breeze runs every 15 seconds and respects reduced motion and preferences', async ({
    page,
  }) => {
    await page.clock.install();
    await prepare(page);
    const surface = page.locator('.app-forest-header .botanical-decoration');
    await page.clock.runFor(100);
    await page.dispatchEvent('.app-forest-header', 'pointerdown', {
      pointerType: 'touch',
      clientX: 160,
      clientY: 90,
      pointerId: 1,
      bubbles: true,
    });
    await page.clock.runFor(50);
    expect(
      await surface
        .locator('.botanical-bough')
        .evaluateAll((boughs) =>
          boughs.some(
            (bough) =>
              Math.abs(parseFloat((bough as SVGElement).style.getPropertyValue('--bough-x'))) > 0.2,
          ),
        ),
    ).toBe(true);
    await page.dispatchEvent('.app-forest-header', 'pointerup', {
      pointerType: 'touch',
      bubbles: true,
    });
    await page.clock.runFor(14_000);
    await expect(surface).not.toHaveClass(/has-mobile-breeze/);
    await page.clock.runFor(1300);
    await expect(surface).toHaveClass(/has-mobile-breeze/);
    await page.clock.runFor(2500);
    await expect(surface).not.toHaveClass(/has-mobile-breeze/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.runFor(30_000);
    await expect(surface).not.toHaveClass(/has-mobile-breeze/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Perfil', exact: true }).click();
    await page.locator('.profile-preferences > summary').click();
    await page.getByLabel('Mostrar copa y hojas', { exact: true }).click();
    await expect(page.locator('.botanical-decoration')).toHaveCount(0);
    await page.clock.runFor(30_000);
    await expect(page.locator('.ambient-leaf')).toHaveCount(0);
  });

  test('public mobile canopy reacts to touch, breathes every 15 seconds and remains fixed while scrolling', async ({
    page,
  }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    const header = page.locator('.public-header');
    expect((await header.locator('.public-brand img').boundingBox())!.width).toBe(40);
    await page.dispatchEvent('.public-header', 'pointerdown', {
      pointerType: 'touch',
      clientX: 140,
      clientY: 75,
      pointerId: 1,
      bubbles: true,
    });
    await page.clock.runFor(100);
    expect(
      await header
        .locator('.public-canopy-twig')
        .evaluateAll((twigs) =>
          twigs.some(
            (twig) =>
              Math.abs(parseFloat((twig as SVGElement).style.getPropertyValue('--bough-x'))) > 0.2,
          ),
        ),
    ).toBe(true);
    await page.dispatchEvent('.public-header', 'pointerup', {
      pointerType: 'touch',
      bubbles: true,
    });
    await page.clock.runFor(15_100);
    await expect(header).toHaveClass(/has-mobile-breeze/);
    const twig = header.locator('.public-canopy-twig').first();
    await expect(twig).toHaveCSS('animation-delay', '0s');
    await expect(twig).toHaveCSS('animation-play-state', 'running');
    const gust = await twig.evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (!animation) return null;
      animation.currentTime = 800;
      return getComputedStyle(element).transform;
    });
    expect(gust).not.toBeNull();
    expect(gust).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
    await page.evaluate(() => scrollTo(0, 250));
    expect((await header.boundingBox())!.y).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.runFor(30_000);
    await expect(header).not.toHaveClass(/has-mobile-breeze/);
  });

  test('daily and weekly reminder switches persist independently in the mobile profile', async ({
    page,
  }) => {
    const { changes } = await prepare(page, 390, 'profile');
    await page.locator('.profile-preferences > summary').click();
    await page.getByRole('button', { name: 'Configurar avisos', exact: true }).click();
    const daily = page.getByLabel('Un recordatorio diario mientras siga vencida', { exact: true });
    const weekly = page.getByLabel('Un recordatorio semanal mientras siga vencida', {
      exact: true,
    });
    await expect(daily).not.toBeChecked();
    await expect(weekly).toBeChecked();
    await daily.check();
    await expect(weekly).toBeChecked();
    await page.getByRole('button', { name: 'Guardar avisos', exact: true }).click();
    await expect.poll(() => changes.length).toBe(1);
    expect(changes[0]).toMatchObject({
      overdueDaily: true,
      overdueWeekly: true,
      reminderDays: [7, 3],
    });
    await page.reload();
    await page.locator('.profile-preferences > summary').click();
    await expect(page.locator('.profile-notice-summary')).toContainText('vencidas cada día');
    await expect(page.locator('.profile-notice-summary')).toContainText('vencidas cada semana');
    await page.getByRole('button', { name: 'Configurar avisos', exact: true }).click();
    await expect(daily).toBeChecked();
    await expect(weekly).toBeChecked();
    await weekly.uncheck();
    await expect(daily).toBeChecked();
    await page.getByRole('button', { name: 'Guardar avisos', exact: true }).click();
    await expect.poll(() => changes.length).toBe(2);
    expect(changes[1]).toMatchObject({ overdueDaily: true, overdueWeekly: false });
  });
});
