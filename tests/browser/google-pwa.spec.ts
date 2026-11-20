import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

test('installed PWA keeps email access available when the OAuth window cannot open', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    window.open = () => null;
  });
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { googleEnabled: true, group: { name: 'Synthetic' } } }),
  );
  await page.goto('/acceso');
  await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Utiliza el código de correo');
  await expect(page.getByRole('button', { name: 'Recibir código', exact: true })).toBeEnabled();
});

test('popup return stays in the PWA and retains additional email verification', async ({
  page,
}) => {
  // Vite serves this test document; reproduce the production SPA's narrowly scoped COOP policy.
  await page.route('**/acceso', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    });
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { googleEnabled: true, group: { name: 'Synthetic' } } }),
  );
  let challenge = '';
  let exchanges = 0;
  await page.context().route(/\/api\/auth\/google\/start\?handoff_challenge=/, async (route) => {
    const url = new URL(route.request().url());
    challenge = url.searchParams.get('handoff_challenge')!;
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
      body: `<script>opener.postMessage({type:'bandarlog.google.return',ticket:'${'a'.repeat(64)}'},location.origin)</script>`,
    });
  });
  await page.route('**/api/auth/google/return', async (route) => {
    const input = route.request().postDataJSON();
    exchanges++;
    expect(createHash('sha256').update(input.proof).digest('hex')).toBe(challenge);
    expect(input.ticket).toBe('a'.repeat(64));
    await route.fulfill({ json: { needsEmailVerification: true, email: 'verified@example.test' } });
  });
  await page.goto('/acceso');
  const original = page.url();
  await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('solicita un código');
  await expect(page.getByLabel('Tu correo electrónico')).toHaveValue('verified@example.test');
  expect(page.url()).toBe(original);
  expect(exchanges).toBe(1);
});

for (const pendingResponses of [0, 5, 99])
  test(
    pendingResponses === 99
      ? 'pending Google recovery pauses while hidden, stops at its budget and cancels for email'
      : pendingResponses
        ? 'Android PWA completes a delayed openerless Google return and retains the session on reopening'
        : 'PWA resumes immediately on foreground return when Google loses its opener',
    async ({ page, context }) => {
      const { mobileFixture } = await import('../fixtures/mobile');
      const fixture = mobileFixture(1);
      fixture.user.onboardingCompletedAt = '2026-11-01T00:00:00Z';
      await page.addInitScript((android) => {
        if (!android) Object.defineProperty(navigator, 'standalone', { value: true });
        else {
          const original = window.matchMedia.bind(window);
          window.matchMedia = (query) => {
            const media = original(query);
            if (query === '(display-mode: standalone)')
              Object.defineProperty(media, 'matches', { value: true });
            return media;
          };
        }
      }, pendingResponses > 0);
      if (pendingResponses) await page.setViewportSize({ width: 412, height: 915 });
      if (pendingResponses === 99) await page.clock.install();
      let challenge = '',
        authenticated = false,
        resumes = 0;
      await context.route(/\/api\/auth\/google\/start\?handoff_challenge=/, async (route) => {
        const url = new URL(route.request().url());
        challenge = url.searchParams.get('handoff_challenge')!;
        expect(url.searchParams.get('handoff_origin')).toBe(url.origin);
        await route.fulfill({
          headers: {
            'Set-Cookie':
              'synthetic_google_return=' + 'b'.repeat(64) + '; Path=/; HttpOnly; SameSite=Lax',
          },
          contentType: 'text/html',
          body: '<title>Google finished</title><script>window.opener=null</script>',
        });
      });
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/auth/config'))
          return route.fulfill({ json: { googleEnabled: true, group: { name: 'Synthetic' } } });
        if (path.endsWith('/auth/google/resume')) {
          resumes++;
          expect(
            createHash('sha256').update(route.request().postDataJSON().proof).digest('hex'),
          ).toBe(challenge);
          expect(route.request().headers().cookie).toContain('synthetic_google_return=');
          if (resumes <= pendingResponses)
            return route.fulfill({ status: 202, json: { pending: true } });
          authenticated = true;
          return route.fulfill({
            headers: {
              'Set-Cookie':
                'synthetic_session=verified; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
            },
            json: { ok: true },
          });
        }
        if (path.endsWith('/health')) return route.fulfill({ json: { ok: true } });
        if (path.endsWith('/me'))
          return route.fulfill(
            authenticated &&
              route.request().headers().cookie?.includes('synthetic_session=verified')
              ? { json: { user: fixture.user, csrf: 'synthetic-csrf' } }
              : { status: 401, json: { error: 'Inicia sesión' } },
          );
        if (path.endsWith('/data')) return route.fulfill({ json: fixture.data });
        if (path.endsWith('/tutorial'))
          return route.fulfill({ json: { events: { tutorial_skipped: '2026-11-01T00:00:00Z' } } });
        return route.fulfill({ json: [] });
      });
      await page.goto('/acceso');
      const opened = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
      const popup = await opened;
      await popup.waitForLoadState('domcontentloaded');
      await expect.poll(() => challenge).not.toBe('');
      await expect(page.getByRole('status', { name: 'Comprobando acceso…' })).toHaveCount(0);
      const began = Date.now();
      await popup.close();
      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      if (pendingResponses === 99) {
        const fallback = page.getByRole('button', { name: 'Usar código de correo', exact: true });
        await expect.poll(() => resumes).toBe(1);
        await expect(fallback).toBeEnabled();
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.clock.fastForward(10000);
        expect(resumes).toBe(1);
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect.poll(() => resumes).toBe(2);
        await expect(fallback).toBeEnabled();
        // A foreground return starts one bounded burst, not an idle polling loop.
        for (let attempt = 3; attempt <= 13; attempt++) {
          await page.clock.fastForward(2100);
          await expect.poll(() => resumes).toBe(attempt);
          await expect(fallback).toBeEnabled();
        }
        await page.clock.fastForward(10000);
        expect(resumes).toBe(13);
        await fallback.click();
        await page.clock.fastForward(10000);
        expect(resumes).toBe(13);
        await expect(
          page.getByRole('button', { name: 'Recibir código', exact: true }),
        ).toBeEnabled();
        return;
      }
      await expect(page.locator('.app-shell')).toBeVisible({
        timeout: pendingResponses ? 8000 : 2000,
      });
      expect(Date.now() - began).toBeLessThan(pendingResponses ? 8000 : 2000);
      expect(resumes).toBe(pendingResponses + 1);
      if (pendingResponses) {
        await page.reload();
        await expect(page.locator('.app-shell')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Continuar con Google', exact: true }),
        ).toHaveCount(0);
      }
    },
  );

test('legacy PWA accepts only the configured canonical Google return origin', async ({
  page,
  context,
  baseURL,
}) => {
  const { googleReturnPage } = await import('../../server/google-return');
  const parent = new URL(baseURL!).origin;
  const canonical = new URL(parent);
  canonical.hostname = 'localhost';
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.route('**/acceso', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    });
  });
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      json: { googleEnabled: true, googleOrigin: canonical.origin, group: { name: 'Synthetic' } },
    }),
  );
  await context.route(/\/api\/auth\/google\/start\?handoff_challenge=/, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') {
      url.hostname = 'localhost';
      // Start a fresh navigation so Playwright can intercept the canonical page;
      // the real HTTP 308 is covered by the PostgreSQL production-route test.
      return route.fulfill({
        contentType: 'text/html',
        headers: { 'Cross-Origin-Opener-Policy': 'unsafe-none' },
        body: '<script>location.replace(' + JSON.stringify(url.toString()) + ')</script>',
      });
    }
    const result = googleReturnPage(parent, 'c'.repeat(64));
    await route.fulfill({
      contentType: 'text/html',
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Content-Security-Policy': result.csp,
      },
      body: result.html,
    });
  });
  let exchanges = 0;
  await page.route('**/api/auth/google/resume', (route) =>
    route.fulfill({ status: 202, json: { pending: true } }),
  );
  await page.route('**/api/auth/google/return', async (route) => {
    exchanges++;
    expect(route.request().postDataJSON().ticket).toBe('c'.repeat(64));
    await route.fulfill({ json: { needsEmailVerification: true, email: 'legacy@example.test' } });
  });
  await page.goto('/acceso');
  await page.getByRole('button', { name: 'Continuar con Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('solicita un código');
  await expect(page.getByLabel('Tu correo electrónico')).toHaveValue('legacy@example.test');
  expect(exchanges).toBe(1);
  expect(new URL(page.url()).origin).toBe(parent);
});
