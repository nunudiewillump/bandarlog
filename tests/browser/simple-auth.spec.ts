import { test, expect } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';
for (const method of ['email', 'google'] as const) {
  test(`${method} primary login opens the app without requesting a passkey`, async ({ page }) => {
    const fixture = mobileFixture(1);
    fixture.user.onboardingCompletedAt = '2026-11-01T00:00:00Z';
    let authenticated = false;
    const passkeyRequests: string[] = [];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/passkeys/')) {
        passkeyRequests.push(path);
        return route.fulfill({ status: 404, json: { error: 'Removed' } });
      }
      if (path.endsWith('/auth/config'))
        return route.fulfill({ json: { googleEnabled: true, group: { name: 'Synthetic' } } });
      if (path.endsWith('/auth/code/request'))
        return route.fulfill({
          json: { challengeId: 'a'.repeat(64), expiresIn: 600, retryAfter: 60 },
        });
      if (path.endsWith('/auth/code/verify')) {
        expect(route.request().postDataJSON().code).toBe('012345');
        authenticated = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (path.endsWith('/auth/google/start')) {
        authenticated = true;
        return route.fulfill({ status: 302, headers: { location: '/acceso' } });
      }
      if (path.endsWith('/tutorial'))
        return route.fulfill({ json: { events: { tutorial_skipped: '2026-11-01T00:00:00Z' } } });
      if (path.endsWith('/health')) return route.fulfill({ json: { ok: true } });
      if (path.endsWith('/me'))
        return route.fulfill(
          authenticated
            ? { json: { user: fixture.user, csrf: 'synthetic-csrf', development: false } }
            : { status: 401, json: { error: 'Inicia sesión' } },
        );
      if (path.endsWith('/data')) return route.fulfill({ json: fixture.data });
      return route.fulfill({ json: [] });
    });
    await page.goto('/acceso');
    if (method === 'email') {
      await page.getByLabel('Tu correo electrónico').fill('synthetic@example.test');
      await page.getByRole('button', { name: 'Recibir código', exact: true }).click();
      await page.getByLabel('Código de acceso').fill('012345');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    } else await page.getByRole('link', { name: 'Continuar con Google', exact: true }).click();
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.getByText(/Protege tu acceso con una passkey/)).toHaveCount(0);
    expect(passkeyRequests).toEqual([]);
  });
}
