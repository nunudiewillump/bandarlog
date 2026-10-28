import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { mobileFixture } from '../fixtures/mobile';
async function forest(page: Page, options: { pending?: boolean; unavailable?: boolean } = {}) {
  const fixture = mobileFixture(10);
  let pending = options.pending || false,
    unavailable = options.unavailable || false;
  const saved: any[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, mail: 'development' } });
    if (path === '/api/auth/config')
      return route.fulfill({ json: { googleEnabled: false, codeEnabled: true } });
    if (path === '/api/me') {
      if (unavailable)
        return route.fulfill({
          status: 503,
          json: { error: 'Servicio temporalmente no disponible.' },
        });
      return route.fulfill({
        json: {
          user: { ...fixture.user, onboardingCompletedAt: pending ? null : '2026-10-28T00:00:00Z' },
          csrf: 'forest-test-csrf',
          development: false,
        },
      });
    }
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/onboarding') {
      const input = route.request().postDataJSON();
      saved.push(input);
      pending = false;
      fixture.user.name = input.name;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'Ruta fuera de este escenario aislado.' } });
  });
  return {
    saved,
    restore: () => {
      unavailable = false;
    },
  };
}
test('new profile requires a name, preserves it when cancelling crop and can omit the optional photo', async ({
  page,
}) => {
  const state = await forest(page, { pending: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Ahora no, sin foto' }).click();
  await expect(page.getByRole('alert')).toContainText('Escribe tu nombre');
  expect(state.saved).toHaveLength(0);
  await page.getByLabel('Nombre', { exact: true }).fill('Nombre elegido');
  const photo = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#124d38' },
  })
    .jpeg()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'profile.jpeg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancelar recorte', exact: true })
    .click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Nombre elegido');
  await mkdir('artifacts/forest-experience', { recursive: true });
  await page.screenshot({ path: 'artifacts/forest-experience/onboarding-375.png', fullPage: true });
  await page.getByRole('button', { name: 'Ahora no, sin foto' }).click();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  expect(state.saved).toEqual([{ name: 'Nombre elegido' }]);
  await page.reload();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toHaveCount(0);
});
test('a failed boot offers retry instead of claiming the session expired, and recovers at 375px', async ({
  page,
}) => {
  const state = await forest(page, { unavailable: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No se pudo cargar Bandarlog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recibir código', exact: true })).toHaveCount(0);
  state.restore();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await expect(page.locator('.forest-canopy:visible')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page.locator(
      'img[src="/monkey.webp"], img[src*="/artwork/mascots/"], svg image[href*="/artwork/mascots/"]',
    ),
  ).toHaveCount(0);
});
test('phone landscape retains the canopy and four destinations while scrolling commission rows', async ({
  page,
}) => {
  await forest(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await expect(page.locator('.forest-canopy:visible')).toHaveCount(1);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Comisiones', exact: true }).click();
  await expect(page.locator('.mobile-commission-groups .commission-row')).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = await nav.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/forest-experience/landscape-844.png' });
});
