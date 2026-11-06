import { test, expect } from '@playwright/test';
import { renderMail } from '../../server/mail-template';
import { mkdir } from 'node:fs/promises';

for (const width of [390, 1440]) {
  test(`cooldown acknowledges a pending request, recovers a usable code form and reloads it at ${width}px`, async ({
    page,
  }) => {
    let verified = false,
      requests = 0;
    const challengeId = 'a'.repeat(64);
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/config'))
        return route.fulfill({
          json: { googleEnabled: false, group: { name: 'Grupo de prueba' } },
        });
      if (path.endsWith('/health'))
        return route.fulfill({ json: { ok: true, mail: 'development' } });
      if (path.endsWith('/me'))
        return route.fulfill({ status: 401, json: { error: 'Inicia sesión' } });
      if (path.endsWith('/auth/code/request')) {
        requests++;
        // The response stays pending until the UI has acknowledged the action.
        await responseGate;
        return route.fulfill({
          status: 429,
          json: {
            error: 'Espera antes de solicitar otro código.',
            retryAfter: 45,
            expiresIn: 500,
            challengeId,
          },
        });
      }
      if (path.endsWith('/auth/code/verify')) {
        expect(route.request().postDataJSON()).toEqual({ challengeId, code: '012345' });
        verified = true;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 404, json: { error: 'Fuera del caso' } });
    });
    await page.goto('/acceso');
    await page.getByLabel('Tu correo electrónico').fill('one@example.test');
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('form button.primary')!;
      const start = performance.now();
      const observer = new MutationObserver(() => {
        if (button.disabled) {
          observer.disconnect();
          requestAnimationFrame(() => {
            (window as any).feedbackMs = performance.now() - start;
          });
        }
      });
      observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
      button.click();
    });
    let latency = 0;
    try {
      await expect(page.getByRole('button', { name: 'Recibir código' })).toBeDisabled();
      await expect(page.getByRole('status', { name: 'Comprobando acceso…' })).toBeVisible();
      await expect.poll(() => requests).toBe(1);
      await expect(page.getByLabel('Código de acceso')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => (window as any).feedbackMs)).toBeGreaterThan(0);
      latency = await page.evaluate(() => (window as any).feedbackMs as number);
      test.info().annotations.push({ type: 'feedback', description: latency.toFixed(1) + ' ms' });
      // Wall-clock budgets on shared runners are a separate, explicit benchmark.
      if (process.env.BANDARLOG_PERFORMANCE_BUDGET === 'strict')
        expect(latency).toBeLessThanOrEqual(100);
    } finally {
      releaseResponse();
    }
    await expect(page.getByLabel('Código de acceso')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Espera antes');
    await mkdir('artifacts/access-recovery', { recursive: true });
    await page.screenshot({
      path: `artifacts/access-recovery/code-entry-${width}.png`,
      fullPage: true,
    });
    await expect(page.getByRole('button', { name: /Reenviar en/ })).toBeDisabled();
    await page.getByLabel('Código de acceso').fill('012');
    await page.reload();
    await expect(page.getByLabel('Código de acceso')).toBeVisible();
    await expect(page.getByLabel('Código de acceso')).toHaveValue('');
    expect(requests).toBe(1);
    await page.getByLabel('Código de acceso').fill('012345');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect.poll(() => verified).toBe(true);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('bandarlog:pending-access:')))
      .toBeNull();
  });
}

test('code mail stays prominent and readable on a phone and desktop', async ({ page }) => {
  const html = renderMail({
    title: 'Tu código de acceso a Bandarlog',
    body: 'Grupo: Prueba\nTu código de acceso es: 012345\nCaduca en 10 minutos.',
    appUrl: 'http://127.0.0.1:5174',
  });
  await mkdir('artifacts/access-recovery', { recursive: true });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(html);
    await expect(page.locator('[data-mail-code]')).toHaveText('012345');
    const img = page.locator('img[src$="monkey-key-2d.png"]');
    await expect
      .poll(() =>
        img.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/access-recovery/code-mail-${width}.png`,
      fullPage: true,
    });
  }
});
