import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function login(page: Page) {
  const email = 'ana@example.test';
  await page.request.post('/api/auth/request', { data: { email } });
  const mails = await page.request.get('/api/dev/mail').then((response) => response.json());
  const mail = mails
    .filter(
      (entry: { email: string; body: string }) =>
        entry.email === email && entry.body.includes('token='),
    )
    .at(-1);
  const response = await page.request.post('/api/auth/verify', {
    data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
  });
  expect(response.ok()).toBeTruthy();
  return page.request.get('/api/me').then((response) => response.json());
}

test('existing account can finish the seven steps, reload and replay from profile', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { csrf } = await login(page);
  const headers = { 'X-CSRF-Token': csrf };
  await page.request.post('/api/tutorial', { headers, data: { action: 'open' } });
  const tutorial = await page.request.get('/api/tutorial').then((response) => response.json());
  await page.request.post('/api/tutorial', {
    headers,
    data: { action: 'status', status: 'done', expectedVersion: tutorial.version },
  });
  const before = await page.request.get('/api/tutorial').then((response) => response.json());
  expect(before.events.tutorial_completed).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver presentación', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const captures = process.env.WELCOME_SCREENSHOTS || info.outputPath('welcome');
  await mkdir(captures, { recursive: true });
  for (let step = 1; step <= 7; step++) {
    await expect(dialog.getByText(`Paso ${step} de 7`)).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 1 })).toBeFocused();
    await dialog.screenshot({ path: join(captures, `paso-${step}.png`) });
    if (step === 3) {
      const handle = dialog.locator('.home-slide-handle');
      await handle.scrollIntoViewIfNeeded();
      const thumb = (await handle.boundingBox())!;
      const track = (await dialog.locator('.home-slide').boundingBox())!;
      const y = thumb.y + thumb.height / 2;
      await page.mouse.move(thumb.x + thumb.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width - thumb.width / 2 - 3, y, { steps: 12 });
      await page.mouse.up();
      await dialog.getByRole('button', { name: 'Bloquear tarea' }).click();
      await dialog.getByRole('button', { name: 'Confirmar bloqueo' }).click();
      await expect(dialog.getByText('Falta confirmar el menú.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
      await expect(dialog.locator('.mobile-task-row.done')).toBeVisible();
    }
    await dialog.getByRole('button', { name: step === 7 ? '¡Vamos allá!' : 'Siguiente' }).click();
  }
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ver presentación', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).first().click();
  await page.locator('.profile-help > summary').click();
  const replay = page.getByRole('button', { name: 'Ver presentación de Bandarlog' });
  await expect(replay).toBeVisible();
  await replay.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(captures, 'perfil-ayuda.png') });
  await replay.click();
  await expect(dialog.getByText('Paso 1 de 7')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(replay).toBeFocused();
  expect(await page.request.get('/api/tutorial').then((response) => response.json())).toEqual(
    before,
  );
});

test('the new administrator is offered the presentation only after the setup guide', async ({
  page,
}, info) => {
  const name = 'Grupo Ribera';
  const email = 'welcome-founder-' + Date.now() + '@example.test';
  const group = { colorPrimary: '#284964', colorSecondary: '#e69370' };
  const headers = { Origin: 'http://127.0.0.1:5174' };
  const registration = await page.request.post('/crear-grupo', {
    headers,
    form: { groupName: name, name: 'Persona fundadora', email, terms: 'accepted', ...group },
  });
  expect(registration.status()).toBe(202);
  const mail = () => page.request.get('/api/dev/platform-mail').then((response) => response.json());
  const review = (await mail()).find(
    (entry: { email: string; body: string }) =>
      entry.email === 'join@bandarlog.app' && entry.body.includes(email),
  );
  const reviewToken = new URL(review.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token')!;
  expect(
    (
      await page.request.post('/aprobar-grupo', {
        headers,
        form: { token: reviewToken, decision: 'approve' },
      })
    ).ok(),
  ).toBeTruthy();
  const activation = (await mail()).find(
    (entry: { email: string; body: string }) =>
      entry.email === email && entry.body.includes('/confirmar-grupo'),
  );
  const activationToken = new URL(activation.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get(
    'token',
  )!;
  const response = await page.request.post('/confirmar-grupo', {
    headers,
    form: { token: activationToken },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  const base = response.headers().location.replace(/\/$/, '');
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await expect(page.getByText('¡Descubre Bandarlog en 2 minutos!')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Puesta en marcha del grupo' })).toBeVisible();
  await expect(page.getByText('¡Descubre Bandarlog en 2 minutos!')).toHaveCount(0);
  const { csrf } = await page.request.get(base + '/api/me').then((reply) => reply.json());
  expect(
    (
      await page.request.patch(base + '/api/profile', {
        headers: { ...headers, 'X-CSRF-Token': csrf },
        data: { adminGuideCompleted: true },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Ver presentación', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(name)).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 760 });
    await expect(dialog.getByText('Paso 1 de 7')).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
  expect(
    await dialog.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--welcome-primary').trim(),
    ),
  ).toBe(group.colorPrimary);
  expect(
    await dialog.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--welcome-secondary').trim(),
    ),
  ).toBe(group.colorSecondary);
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  const captures = process.env.WELCOME_SCREENSHOTS || info.outputPath('welcome');
  await mkdir(captures, { recursive: true });
  await dialog.screenshot({
    path: join(captures, 'pañoleta-grupo-nuevo.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Omitir' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ver presentación', exact: true })).toHaveCount(0);
});
