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
  for (const width of [320, 393, 1024, 1440]) {
    await prepare(page, width);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const brand = page.locator(width < 768 ? '.forest-brand:visible' : '.sidebar-brand:visible');
    const icon = brand.locator('img');
    const box = await icon.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(width === 1024 ? 36 : 44);
    const brandSize = await brand.evaluate((element) => ({
      content: element.scrollWidth,
      width: element.clientWidth,
    }));
    expect(brandSize.content).toBeLessThanOrEqual(brandSize.width + 1);
    if (width < 768) {
      const fill = brand.locator('.botanical-brand-fill');
      await expect(fill).toBeVisible();
      await expect(fill.locator('.botanical-leaf-silhouette')).toHaveCount(2);
      const coverage = await brand.locator('.forest-brand-word').evaluate((word) => {
        const text = [...word.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.includes('Bandarlog'),
        )!;
        const index = text.textContent!.indexOf('n');
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getBoundingClientRect();
        const leaves = [...word.querySelectorAll<SVGGeometryElement>('.botanical-leaf-silhouette')];
        return [-3, 0, 3]
          .flatMap((dx) =>
            [-8, -4].map((dy) => {
              const point = new DOMPoint(rect.x + rect.width / 2 + dx, rect.y + dy);
              return leaves.some((leaf) =>
                leaf.isPointInFill(point.matrixTransform(leaf.getScreenCTM()!.inverse())),
              );
            }),
          )
          .filter(Boolean).length;
      });
      expect(coverage).toBeGreaterThanOrEqual(4);
    }
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
  expect(palettes[0]).toEqual(palettes[3]);
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
    ['ios-zero-inset', 0],
    ['android', 24],
  ] as const)
    test(
      platform +
        ' standalone keeps the header together during pull-down and blends with the status bar',
      async ({ page }) => {
        await page.addInitScript((platform) => {
          if (platform.startsWith('ios'))
            Object.defineProperty(navigator, 'standalone', { value: true });
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
        await expect(header).toHaveCSS('position', 'fixed');
        await expect(leaves).toHaveCSS('position', 'absolute');
        await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(header.locator('.botanical-backing')).toHaveCSS('display', 'none');
        await expect(page.locator('html')).toHaveCSS('overscroll-behavior-y', 'none');
        await expect(page.locator('body')).toHaveCSS('overscroll-behavior-y', 'none');
        expect((await header.boundingBox())!.y).toBe(0);
        expect((await leaves.boundingBox())!.y).toBe(0);
        const slot = await page.locator('.forest-header-slot').boundingBox();
        expect(slot!.height).toBe((await header.boundingBox())!.height);
        // The first row blends with native green; real leaves emerge below the transition.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const { data, info } = await sharp(
          await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 137 + inset } }),
        )
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (let x = 0; x < info.width; x++) {
          const offset = x * info.channels;
          expect(Math.abs(data[offset] - 16)).toBeLessThanOrEqual(1);
          expect(Math.abs(data[offset + 1] - 59)).toBeLessThanOrEqual(1);
          expect(Math.abs(data[offset + 2] - 45)).toBeLessThanOrEqual(1);
        }
        const leafRow = 56 + inset;
        const greens = Array.from(
          { length: info.width },
          (_, x) => data[(leafRow * info.width + x) * info.channels + 1],
        );
        expect(Math.max(...greens) - Math.min(...greens)).toBeGreaterThan(15);
        const leafPixels = greens.filter((green, x) => {
          const offset = (leafRow * info.width + x) * info.channels;
          return (
            green > 67 && green < 170 && green > data[offset] * 1.2 && green > data[offset + 2]
          );
        });
        expect(leafPixels.length).toBeGreaterThan(30);
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
        const touch = await page.context().newCDPSession(page);
        const brandY = (await header.locator('.forest-brand').boundingBox())!.y;
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: 190, y: 220 }],
        });
        for (const y of [280, 360, 440, 520]) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: 190, y }],
          });
          expect((await header.boundingBox())!.y).toBe(0);
          expect((await leaves.boundingBox())!.y).toBe(0);
          expect((await header.locator('.forest-brand').boundingBox())!.y).toBe(brandY);
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        expect(await page.evaluate(() => scrollY)).toBe(0);
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

  for (const [random, delay] of [
    [0, 5000],
    [0.999, 14990],
  ] as const) {
    test(`touch and pen leave the app canopy still; gentle breeze starts after ${delay}ms`, async ({
      page,
    }) => {
      const now = new Date('2026-11-06T12:00:00Z');
      await page.clock.install({ time: now });
      await page.clock.pauseAt(now);
      await page.addInitScript((random) => {
        Math.random = () => random;
      }, random);
      await prepare(page);
      const header = page.locator('.app-forest-header');
      const boughs = header.locator('.botanical-bough');
      for (const pointerType of ['touch', 'pen']) {
        for (const event of ['pointerdown', 'pointermove', 'pointerup']) {
          await page.dispatchEvent('.app-forest-header', event, {
            pointerType,
            clientX: 160,
            clientY: 70,
            pointerId: 1,
            bubbles: true,
          });
        }
      }
      await page.clock.runFor(50);
      expect(
        await boughs.evaluateAll((elements) =>
          elements.every((element) =>
            ['--bough-x', '--bough-y', '--bough-r'].every(
              (property) => !(element as SVGElement).style.getPropertyValue(property),
            ),
          ),
        ),
      ).toBe(true);
      await page.clock.runFor(delay - 51);
      await expect(header).not.toHaveClass(/has-canopy-breeze/);
      await page.clock.runFor(1);
      await expect(header).toHaveClass(/has-canopy-breeze/);
      const motion = await boughs.first().evaluate((element) => {
        const animation = element.getAnimations()[0];
        animation.currentTime = 1080;
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return {
          x: matrix.e,
          y: matrix.f,
          angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
          duration: animation.effect!.getTiming().duration,
        };
      });
      expect(motion.duration).toBe(3600);
      expect(Math.abs(motion.x)).toBeLessThanOrEqual(1.1);
      expect(Math.abs(motion.y)).toBeLessThanOrEqual(1.1);
      expect(Math.abs(motion.angle)).toBeLessThanOrEqual(0.5);
      await page.clock.runFor(4000);
      await expect(header).not.toHaveClass(/has-canopy-breeze/);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.runFor(30_000);
      await expect(header).not.toHaveClass(/has-canopy-breeze/);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.getByRole('button', { name: 'Perfil', exact: true }).click();
      await page.locator('.profile-preferences > summary').click();
      await page.getByLabel('Mostrar copa y hojas', { exact: true }).click();
      await expect(page.locator('.botanical-decoration, .botanical-brand-fill')).toHaveCount(0);
      await page.clock.runFor(30_000);
      await expect(page.locator('.ambient-leaf')).toHaveCount(0);
    });
  }

  test('public canopy ignores touch and uses a gentle 5–15 second breeze on mobile and desktop', async ({
    page,
  }) => {
    const now = new Date('2026-11-06T12:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.addInitScript(() => {
      Math.random = () => 0.999;
    });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const header = page.locator('.public-header');
      for (const event of ['pointerdown', 'pointermove', 'pointerup'])
        await page.dispatchEvent('.public-header', event, {
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
          .evaluateAll((elements) =>
            elements.every(
              (element) => !(element as SVGElement).style.getPropertyValue('--bough-x'),
            ),
          ),
      ).toBe(true);
      await expect(header.locator('.public-canopy-twig').first()).toHaveCSS(
        'animation-name',
        'none',
      );
      await page.clock.runFor(14889);
      await expect(header).not.toHaveClass(/has-canopy-breeze/);
      await page.clock.runFor(1);
      await expect(header).toHaveClass(/has-canopy-breeze/);
      const twig = header.locator('.public-canopy-twig').first();
      await expect(twig).toHaveCSS('animation-duration', '3.6s');
      const angle = await twig.evaluate((element) => {
        element.getAnimations()[0].currentTime = 1080;
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
      });
      expect(Math.abs(angle)).toBeGreaterThan(0.1);
      expect(Math.abs(angle)).toBeLessThanOrEqual(0.5);
      if (width === 320) {
        await page.evaluate(() => scrollTo(0, 250));
        expect((await header.boundingBox())!.y).toBe(0);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.runFor(30_000);
      await expect(header).not.toHaveClass(/has-canopy-breeze/);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
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
