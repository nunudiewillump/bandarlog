import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { contentSecurityPolicy } from '../../server/http-security';
import { mobileFixture } from '../fixtures/mobile';
const policy = Object.entries(contentSecurityPolicy.directives)
  .map(
    ([name, values]) =>
      name.replace(/[A-Z]/g, (v) => '-' + v.toLowerCase()) + ' ' + values.join(' '),
  )
  .join('; ');
test('Google/email primary access completes a UV passkey in the PWA shell under restrictive CSP', async ({
  page,
  context,
}) => {
  const origin = 'http://localhost:4174',
    base = '/g/' + 'a'.repeat(32),
    fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-11-01T00:00:00Z';
  fixture.user.preferences = JSON.stringify({ notifications: false, forestEffects: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const html = await readFile('dist/index.html', 'utf8'),
    offline = await readFile('public/offline-store.js', 'utf8');
  let verified = false,
    cryptographicallyVerified = false,
    challenge = '',
    csrf = 'synthetic-primary';
  const recovery = Array.from({ length: 10 }, (_, n) => n.toString(16).padStart(32, '0'));
  const violations: string[] = [];
  await page.addInitScript(() => {
    (window as any).policyViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as any).policyViolations.push(e.violatedDirective),
    );
  });
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.continue();
    const path = url.pathname;
    if (path === base + '/' || path === '/acceso')
      return route.fulfill({
        contentType: 'text/html',
        body: html,
        headers: {
          'Content-Security-Policy': policy,
          'X-Bandarlog-Public-Shell': '1',
          'Cache-Control': 'no-store',
          'Set-Cookie':
            '__Host-bandarlog-' +
            'a'.repeat(32) +
            '=' +
            'c'.repeat(64) +
            '; Path=/; Secure; HttpOnly; SameSite=Lax',
        },
      });
    if (path.endsWith('/offline-store.js'))
      return route.fulfill({
        contentType: 'application/javascript',
        body: offline,
        headers: { 'Cache-Control': 'no-store' },
      });
    if (path.endsWith('/sw.js'))
      return route.fulfill({
        contentType: 'application/javascript',
        body: await readFile('public/sw.js', 'utf8'),
        headers: { 'Content-Security-Policy': policy, 'Cache-Control': 'no-cache' },
      });
    if (path.endsWith('/manifest.webmanifest'))
      return route.fulfill({
        json: {
          id: base + '/',
          name: 'Synthetic Bandarlog',
          short_name: 'Bandarlog',
          start_url: base + '/',
          scope: base + '/',
          display: 'standalone',
          icons: [],
        },
      });
    if (path.endsWith('/api/health')) return route.fulfill({ json: { ok: true } });
    if (path.endsWith('/api/me'))
      return route.fulfill(
        verified
          ? {
              json: {
                user: fixture.user,
                group: { privateId: 'a'.repeat(32) },
                csrf,
                development: false,
                offlineUntil: Date.now() + 86400000,
              },
            }
          : { status: 428, json: { error: 'Completa la verificación de acceso.' } },
      );
    if (path.endsWith('/api/data')) {
      expect(verified).toBe(true);
      return route.fulfill({ json: fixture.summary() });
    }
    if (path.endsWith('/api/auth/passkeys/status'))
      return route.fulfill({
        json: { required: !verified, reauthenticate: false, hasPasskeys: false, csrf },
      });
    if (path.endsWith('/api/auth/passkeys/register/options')) {
      expect(request.headers()['x-csrf-token']).toBe(csrf);
      const options = await generateRegistrationOptions({
        rpName: 'Bandarlog',
        rpID: 'localhost',
        userName: 'synthetic@example.test',
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        supportedAlgorithmIDs: [-7],
      });
      challenge = options.challenge;
      return route.fulfill({ json: { id: 'b'.repeat(64), options } });
    }
    if (path.endsWith('/api/auth/passkeys/register/verify')) {
      const body = request.postDataJSON();
      expect(body.id).toBe('b'.repeat(64));
      expect(request.headers()['x-csrf-token']).toBe(csrf);
      const result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: 'localhost',
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7],
      });
      cryptographicallyVerified = result.verified && result.registrationInfo.userVerified;
      expect(cryptographicallyVerified).toBe(true);
      const authCookie = (await context.cookies()).find(
        (c) => c.name === '__Host-bandarlog-' + 'a'.repeat(32),
      );
      expect(authCookie).toMatchObject({ httpOnly: true, secure: true, path: '/' });
      expect(await page.evaluate(() => document.cookie)).not.toContain('c'.repeat(64));
      verified = true;
      csrf = 'synthetic-mfa';
      return route.fulfill({ json: { ok: true, recoveryCodes: recovery, csrf } });
    }
    if (path.endsWith('/api/tutorial'))
      return route.fulfill({
        json: { events: {}, steps: [false, false], version: 0, taskStatus: 'pending' },
      });
    if (path.endsWith('/api/events')) return route.fulfill({ status: 503, body: '' });
    if (path.includes('/api/')) return route.fulfill({ json: { ok: true } });
    if (path.startsWith('/assets/'))
      return route.fulfill({
        contentType: path.endsWith('.css') ? 'text/css' : 'application/javascript',
        body: await readFile('dist' + path),
      });
    return route.fulfill({
      response: await route.fetch({ url: 'http://127.0.0.1:4174' + url.pathname + url.search }),
    });
  });
  await page.goto(origin + base + '/');
  await expect(
    page.getByRole('heading', { name: 'Protege tu acceso con una passkey' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Crear passkey', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Guarda tus códigos de recuperación' }),
  ).toBeVisible();
  expect(cryptographicallyVerified).toBe(true);
  expect(
    await page.evaluate(async () => {
      const b = (window as any).BandarlogOffline;
      return { me: await b.cached('/me'), data: await b.cached('/data') };
    }),
  ).toEqual({ me: null, data: null });
  await page.getByRole('checkbox', { name: 'He guardado los códigos en un lugar seguro' }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mis tareas', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).policyViolations)).toEqual(violations);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  expect(
    (await page.evaluate(async () => await caches.keys())).some((k) =>
      k.startsWith('bandarlog-static-'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(async () => {
      const keys = await caches.keys();
      const urls = (
        await Promise.all(
          keys.map(async (key) =>
            (await (await caches.open(key)).keys()).map((request) => request.url),
          ),
        )
      ).flat();
      return urls.some(
        (url) => url.includes('/api/') || /[?&#](token|ticket|code|state|proof)=/.test(url),
      );
    }),
  ).toBe(false);
});
