import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/** Inspect authored CSS poses without waiting for the whole fourteen-second cycle. */
async function holdPose(page: Page, milliseconds: number) {
  await page.evaluate(async (time) => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = time;
    }
    // Give Chromium's compositor the updated paused pose before screenshotting it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, milliseconds);
}

async function expectDecodedScene(page: Page) {
  await expect(page.locator('.public-keyboard-scene')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.public-keyboard-scene img').evaluateAll(
        (images) =>
          images.length >= 2 &&
          images.every((element) => {
            const image = element as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          }),
      ),
    )
    .toBe(true);
  await page.locator('.public-keyboard-scene img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
  });
  const sources = await page.locator('.public-keyboard-scene img').evaluateAll((images) =>
    images.map((element) => {
      const image = element as HTMLImageElement;
      const source = new URL(image.currentSrc, location.href);
      return { local: source.origin === location.origin, path: source.pathname };
    }),
  );
  for (const source of sources) {
    expect(source.local).toBe(true);
    expect(source.path).toMatch(/\.webp$/);
  }
}

for (const width of [320, 390, 768, 1440]) {
  test(`forest entrance keeps its scene, readable access and public links at ${width}px`, async ({
    page,
  }) => {
    const mutations: string[] = [];
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url());
      if (new URL(request.url()).origin !== 'http://127.0.0.1:5174')
        externalRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: width >= 768 ? 950 : 844 });
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/public-landing/);
    const heading = page.getByRole('heading', { name: /Menos lío.*Más grupo/ });
    await expect(heading).toBeVisible();
    await expectDecodedScene(page);
    await holdPose(page, 1000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const canopy = await page.locator('.public-canopy').boundingBox();
    expect(canopy?.height).toBeGreaterThan(50);
    expect(
      await page.locator('.public-falling-stage .public-falling').evaluateAll((leaves) =>
        leaves.some((leaf) => {
          const box = leaf.getBoundingClientRect();
          const stage = leaf.parentElement!.getBoundingClientRect();
          return (
            Number(getComputedStyle(leaf).opacity) > 0.1 &&
            box.width > 0 &&
            box.height > 0 &&
            box.bottom > stage.top &&
            box.top < stage.bottom
          );
        }),
      ),
    ).toBe(true);
    const scene = await page.locator('.public-keyboard-scene').boundingBox();
    const title = await heading.boundingBox();
    expect(scene).not.toBeNull();
    expect(title).not.toBeNull();
    if (width === 1440) {
      expect(scene!.width).toBeGreaterThan(width * 0.38);
      expect(scene!.width).toBeLessThan(width * 0.68);
      expect(scene!.x).toBeLessThan(width * 0.15);
    } else if (width <= 390) {
      expect(scene!.y).toBeGreaterThan(title!.y + title!.height - 2);
      expect(scene!.width).toBeGreaterThan(width * 0.7);
    }

    const enter = page.getByRole('link', { name: 'Entrar a mi grupo', exact: true });
    await expect(enter).toHaveAttribute('href', '/entrar');
    await expect(enter).toBeVisible();
    await enter.scrollIntoViewIfNeeded();
    expect(
      await enter.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await expect(page.locator('.public-falling-stage')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('iframe')).toHaveCount(0);

    await mkdir('artifacts/forest-landing', { recursive: true });
    await page.screenshot({ path: `artifacts/forest-landing/home-${width}.png`, fullPage: true });
    await enter.click();
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByLabel('ID de grupo', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(heading).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sobre Bandarlog', exact: true })).toHaveAttribute(
      'href',
      '/presentacion',
    );
    await expect(page.getByRole('link', { name: 'Privacidad', exact: true })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    expect(mutations).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}

test('typing becomes a smile, can be paused by keyboard, and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  await expectDecodedScene(page);
  const working = page.locator('.public-keyboard-working-frame');
  const smile = page.locator('.public-keyboard-smile-frame');
  const hands = page.locator('.public-keyboard-hands');
  await expect(hands).toHaveCSS('animation-name', /public-typing/);
  await holdPose(page, 1000);
  await expect(working).toHaveCSS('opacity', '1');
  await expect(smile).toHaveCSS('opacity', '0');
  await holdPose(page, 12500);
  await expect(working).toHaveCSS('opacity', '0');
  await expect(smile).toHaveCSS('opacity', '1');
  await expect(hands).toHaveCSS('opacity', '0');
  await mkdir('artifacts/forest-landing', { recursive: true });
  await page.screenshot({ path: 'artifacts/forest-landing/smile-1440.png', fullPage: true });

  const pause = page.getByRole('checkbox', { name: 'Pausar animación', exact: true });
  await pause.focus();
  await page.keyboard.press('Space');
  await expect(pause).toBeChecked();
  await expect(hands).toHaveCSS('animation-name', 'none');
  await expect(smile).toHaveCSS('opacity', '1');
  await expect(page.locator('.public-falling-stage')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(pause).not.toBeChecked();
  await expect(hands).toHaveCSS('animation-name', /public-typing/);

  const sceneBefore = await page.locator('.public-keyboard-scene').boundingBox();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hands).toHaveCSS('animation-name', 'none');
  await expect(smile).toHaveCSS('opacity', '1');
  await expect(working).toHaveCSS('opacity', '0');
  await expect(page.locator('.public-falling-stage')).toBeHidden();
  expect(await page.locator('.public-keyboard-scene').boundingBox()).toEqual(sceneBefore);
});

test.describe('forest entrance without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps the illustration, pause control and access usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Menos lío/ })).toBeVisible();
    await expectDecodedScene(page);
    const pause = page.getByRole('checkbox', { name: 'Pausar animación', exact: true });
    await pause.check();
    await expect(page.locator('.public-keyboard-hands')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.public-keyboard-smile-frame')).toHaveCSS('opacity', '1');
    await page.getByRole('link', { name: 'Entrar a mi grupo', exact: true }).click();
    await expect(page.getByLabel('ID de grupo', { exact: true })).toBeVisible();
  });
});
