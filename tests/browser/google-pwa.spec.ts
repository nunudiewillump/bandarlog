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
