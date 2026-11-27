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
  await expect(page.getByRole('button', { name: 'Ver presentación', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).first().click();
  await page.locator('.profile-help > summary').click();
  await page.getByRole('button', { name: 'Ver presentación de Bandarlog' }).click();
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
    await dialog.getByRole('button', { name: step === 7 ? 'Explorar la herramienta' : 'Siguiente' }).click();
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

test('the founder can explore, replay, dismiss preparation and start it from profile', async ({
  page, browser,
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
  await expect(page.getByRole('region', { name: 'Puesta en marcha del grupo' })).toHaveCount(0);
  await expect(page.locator('.home-notices > .welcome-invitation')).toHaveCSS('padding-bottom', '30px');
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
  for (let i = 1; i < 6; i++) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await expect(dialog.getByRole('heading', { name: '¡Esto solo acaba de empezar!' })).toBeVisible();
  await dialog.screenshot({ path: join(captures, 'bienvenida-elecciones-escritorio.png') });
  await page.setViewportSize({ width: 390, height: 900 });
  await dialog.screenshot({ path: join(captures, 'bienvenida-elecciones-movil.png') });
  await dialog.getByRole('button', { name: 'Volver a ver la bienvenida' }).click();
  await expect(dialog.getByText('Paso 1 de 7')).toBeVisible();
  for (let i = 0; i < 6; i++) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Explorar la herramienta' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '¿Empezamos la aventura?' })).toBeVisible();
  await page.reload();
  const preparation = page.getByRole('region', { name: '¿Empezamos la aventura?' });
  await expect(preparation).toBeVisible();
  await preparation.screenshot({ path: join(captures, 'invitacion-preparar-grupo.png') });
  await preparation.getByRole('button', { name: 'Ahora no' }).click();
  await expect(preparation).toHaveCount(0);
  await page.reload();
  await expect(preparation).toHaveCount(0);
  const anotherDevice = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    await anotherDevice.addCookies(await page.context().cookies());
    const fresh = await anotherDevice.newPage();
    await fresh.goto(base + '/');
    await expect(fresh.locator('.desktop-home')).toBeVisible();
    await expect(fresh.getByRole('heading', { name: '¿Empezamos la aventura?' })).toHaveCount(0);
    await expect(fresh.getByRole('button', { name: 'Ver presentación', exact: true })).toHaveCount(0);
    await expect(fresh.locator('.admin-setup-guide')).toHaveCount(0);
  } finally {
    await anotherDevice.close();
  }
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).first().click();
  await page.locator('.profile-help > summary').click();
  await page.getByRole('button', { name: 'Ver presentación de Bandarlog' }).click();
  for (let i = 0; i < 6; i++) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Preparar mi grupo' }).click();
  await expect(page.locator('.admin-setup-guide')).toBeVisible();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  const history = await page.request.get(base + '/api/welcome-presentation').then((result) => result.json());
  expect(history.adoption.events).toMatchObject({
    choice_replay: expect.any(String), choice_explore: expect.any(String),
    choice_prepare: expect.any(String), guide_started: expect.any(String),
  });
});
