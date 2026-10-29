import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const loginCookies = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page, email = 'alex@example.test') {
  const cached = loginCookies.get(email);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    return;
  }
  await page.goto('/');
  await page.getByLabel('Tu correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Recibir código', exact: true }).click();
  await expect(page.getByLabel('Código de acceso')).toBeVisible();
  const outbox = await (await page.request.get('/api/dev/mail')).json();
  const message = outbox.filter((m: any) => m.email === email && /\b\d{6}\b/.test(m.body)).at(-1);
  expect(message).toBeTruthy();
  await page.getByLabel('Código de acceso').fill(message.body.match(/\b(\d{6})\b/)[1]);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  loginCookies.set(email, await page.context().cookies());
}

async function finishFirstAccess(page: Page) {
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toHaveCount(0);
}

async function createCommission(page: any, name = `Equipo QA ${Date.now()}`, projectId = 'camp') {
  const session = await (await page.request.get('/api/me')).json();
  const response = await page.request.post('/api/commissions', {
    headers: { 'X-CSRF-Token': session.csrf, Origin: 'http://127.0.0.1:5174' },
    data: { name, projectId, members: [{ userId: session.user.id, role: 'responsible' }] },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}
async function openUnmatchedCommission(page: any) {
  const cid = await createCommission(page);
  await page.goto(`/?view=commission&project=camp&commission=${cid}`);
  return cid;
}
async function personalInvitation(page: any) {
  const recipient = `invited-${Date.now()}@example.test`;
  const session = await (await page.request.get('/api/me')).json();
  const response = await page.request.post('/api/commissions/cocina/invitations', {
    headers: { 'X-CSRF-Token': session.csrf, Origin: 'http://127.0.0.1:5174' },
    data: { email: recipient, name: 'Persona invitada', role: 'scouter' },
  });
  expect(response.ok()).toBeTruthy();
  const mails = await (await page.request.get('/api/dev/mail')).json();
  const message = mails.find(
    (m: any) => m.email === recipient && m.subject === 'Te invitan a Bandarlog',
  );
  const link = message.body.match(/^https?:\/\/\S+$/m)[0];
  expect(new URL(link).hostname).toBe('127.0.0.1');
  expect(message.html).toContain(`href="${link}"`);
  return { recipient, link };
}

test('a new person accepts the first invitation email and enters without requesting another email', async ({
  page,
  browser,
}) => {
  await login(page);
  const { recipient, link } = await personalInvitation(page);
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  try {
    const invited = await context.newPage();
    let requestedEmails = 0;
    invited.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/request') requestedEmails++;
    });
    await invited.goto(link);
    await expect(
      invited.getByRole('button', { name: 'Aceptar invitación y entrar' }),
    ).toBeVisible();
    await invited.reload();
    expect((await invited.request.get('http://127.0.0.1:5174/api/me')).status()).toBe(401);
    await mkdir('artifacts/invitaciones', { recursive: true });
    await invited.screenshot({
      path: 'artifacts/invitaciones/aceptar.png',
      animations: 'disabled',
    });
    await invited.getByRole('button', { name: 'Aceptar invitación y entrar' }).click();
    await finishFirstAccess(invited);
    await expect(invited.locator('.mobile-focus')).toBeVisible();
    const me = await (await invited.request.get('http://127.0.0.1:5174/api/me')).json();
    expect(me.user.email).toBe(recipient);
    expect(me.user.role).toBe('member');
    const data = await (await invited.request.get('http://127.0.0.1:5174/api/data')).json();
    expect(data.commissions.map((c: any) => c.id)).toEqual(['cocina']);
    expect(requestedEmails).toBe(0);
    expect(new URL(invited.url()).searchParams.has('token')).toBe(false);
    const mails = await (await page.request.get('/api/dev/mail')).json();
    expect(mails.filter((m: any) => m.email === recipient)).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test('accepting an invitation while another account is signed in enters as the invited person', async ({
  page,
}) => {
  await login(page);
  const { recipient, link } = await personalInvitation(page);
  await page.goto(link);
  await expect(page.getByRole('button', { name: 'Aceptar invitación y entrar' })).toBeVisible();
  expect((await (await page.request.get('/api/me')).json()).user.email).toBe('alex@example.test');
  await page.getByRole('button', { name: 'Aceptar invitación y entrar' }).click();
  await finishFirstAccess(page);
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/me')).json()).user.email).toBe(recipient);
  const data = await (await page.request.get('/api/data')).json();
  expect(data.commissions.map((c: any) => c.id)).toEqual(['cocina']);
});
test('desktop: commission, task, comments and persistent status', async ({ page }) => {
  // This full workflow includes login, creation, comments, completion and a reload.
  test.setTimeout(60000);
  await login(page);
  await page.getByRole('navigation').first().getByRole('button', { name: 'Comisiones' }).click();
  await page.getByRole('button', { name: 'Nueva comisión' }).click();
  const dialog = page.getByRole('dialog');
  const name = `Equipo QA ${Date.now()}`;
  await dialog.getByLabel('Nombre de la comisión').fill(name);
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByLabel('Añadir Laura Martín').check();
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await dialog.getByRole('button', { name: 'Crear comisión' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await dialog.getByLabel('Título', { exact: true }).fill('Revisar material de prueba');
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-12');
  await dialog.getByText('Laura Martín', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Revisar material de prueba' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Bloquear tarea' }).click();
  await dialog.getByLabel('¿Qué impide avanzar?').fill('Esperando confirmación');
  await dialog.getByRole('button', { name: 'Confirmar bloqueo' }).click();
  await expect(dialog.getByText('Esperando confirmación', { exact: true })).toBeVisible();
  await dialog.getByLabel('Añadir comentario').fill('Lo revisaremos en equipo.');
  await dialog.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(dialog.getByText('Lo revisaremos en equipo.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(dialog.getByText('Terminada', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Revisar material de prueba', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Terminada', { exact: true })).toBeVisible();
});
test('responsive screenshots and no horizontal overflow', async ({ page }) => {
  await mkdir('artifacts', { recursive: true });
  await page.goto('/');
  await page.screenshot({
    path: 'artifacts/acceso-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await login(page);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(200);
    await expect(page.getByRole('main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/inicio-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Mis tareas' })
    .click();
  await page.screenshot({
    path: 'artifacts/mis-tareas-390.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Comisiones' })
    .click();
  await page.screenshot({
    path: 'artifacts/comisiones-390.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Nueva comisión' }).click();
  await page.getByRole('dialog').getByLabel('Nombre de la comisión').fill('Cocina');
  await page.screenshot({ path: 'artifacts/crear-comision-390.png', animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: 'Siguiente' }).click();
  await page.screenshot({ path: 'artifacts/seleccionar-personas-390.png', animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page
    .getByRole('button', { name: /Cocina/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Revisar listado de material' }).click();
  await page.screenshot({
    path: 'artifacts/detalle-390.png',
    fullPage: false,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'artifacts/comision-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('navigation').first().getByRole('button', { name: 'Campamentos' }).click();
  await page.getByRole('button', { name: /Campamento de verano/ }).click();
  await page.screenshot({
    path: 'artifacts/proyecto-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('built PWA serves an explicit offline screen and never caches API responses', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.evaluate(() => fetch('/api/health'));
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const paths = [];
    for (const key of keys) {
      for (const request of await (await caches.open(key)).keys())
        paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  expect(cached.some((p) => p.startsWith('/api'))).toBeFalsy();
  await page.context().setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Volvemos en cuanto haya conexión' }),
  ).toBeVisible();
  await expect(page.getByText(/No se han guardado cambios sin conexión/)).toBeVisible();
  await page.context().setOffline(false);
});

test('People sends single and bulk invitations, reports duplicates, and previews a branded email', async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole('navigation')
    .first()
    .getByRole('button', { name: 'Personas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Invitar personas', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Lista de correos' }).check();
  const stamp = Date.now();
  const first = `list-${stamp}@example.test`,
    second = `other-${stamp}@example.test`;
  await dialog.getByLabel('Correos electrónicos').fill(first + '; invalid');
  await expect(
    dialog.getByRole('button', { name: 'Enviar invitaciones', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel('Correos electrónicos')
    .fill(first + '; ' + second + '\n' + first.toUpperCase());
  await dialog.getByRole('button', { name: 'Enviar invitaciones', exact: true }).click();
  await expect(dialog.locator('.invitation-result')).toContainText('2 invitaciones preparadas');
  await page.screenshot({ path: 'artifacts/invitaciones-personas.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Enviar invitaciones', exact: true }).click();
  await expect(dialog.locator('.invitation-result')).toContainText('0 invitaciones preparadas');
  await expect(dialog.locator('.invitation-result')).toContainText('2 direcciones omitidas');
  await dialog.getByRole('radio', { name: 'Un correo' }).check();
  await dialog
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`single-${stamp}@example.test`);
  await dialog.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
  await expect(dialog.locator('.invitation-result')).toContainText('1 invitaciones preparadas');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('.sidebar-profile').click();
  await page.getByRole('button', { name: 'Ver correos de prueba' }).click();
  const frame = page.locator('.email-preview').first();
  await expect(frame).toBeVisible();
  await frame.screenshot({ path: 'artifacts/correo-invitacion.png', animations: 'disabled' });
  const src = await frame.getAttribute('srcdoc');
  expect(src).toContain('Bandarlog');
  expect(src).toContain('#124d38');
  const preview = await page.context().newPage();
  await preview.route('**/brand-mark.*', (route) =>
    route.fulfill({ path: 'public/brand-mark.png', contentType: 'image/png' }),
  );
  await preview.setViewportSize({ width: 900, height: 900 });
  await preview.setContent(
    src!.replaceAll('http://127.0.0.1:5174', 'https://bandarlog.example.org'),
  );
  await preview.screenshot({
    path: 'artifacts/correo-invitacion.png',
    fullPage: true,
    animations: 'disabled',
  });
  // Create this preview's notification instead of relying on a task from a
  // previous test; this case must also work in an isolated fresh database.
  const session = await (await page.request.get('/api/me')).json();
  const taskTitle = `Correo de tarea QA ${stamp}`;
  const taskCreated = await page.request.post('/api/tasks', {
    headers: { 'X-CSRF-Token': session.csrf, Origin: 'http://127.0.0.1:5174' },
    data: {
      title: taskTitle,
      commissionId: 'cocina',
      due: new Date(Date.now() + 7 * 86400000).toISOString(),
      responsibleIds: [session.user.id],
    },
  });
  expect(taskCreated.status()).toBe(201);
  const previewTaskId = (await taskCreated.json()).id;
  const messages = await (await page.request.get('/api/dev/mail')).json();
  const taskMessage = messages
    .slice()
    .reverse()
    .find(
      (m: any) =>
        m.subject.includes('Nueva asignación') &&
        m.html?.includes(taskTitle) &&
        m.html?.includes('Completar tarea'),
    );
  expect(taskMessage).toBeTruthy();
  await preview.setContent(
    taskMessage.html.replaceAll('http://127.0.0.1:5174', 'https://bandarlog.example.org'),
  );
  await preview.screenshot({
    path: 'artifacts/correo-tarea.png',
    fullPage: true,
    animations: 'disabled',
  });
  await preview.setViewportSize({ width: 390, height: 900 });
  expect(
    await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await preview.screenshot({
    path: 'artifacts/correo-tarea-movil.png',
    fullPage: true,
    animations: 'disabled',
  });
  await preview.close();
  expect(
    (
      await page.request.delete(`/api/tasks/${previewTaskId}`, {
        headers: { 'X-CSRF-Token': session.csrf, Origin: 'http://127.0.0.1:5174' },
      })
    ).ok(),
  ).toBe(true);
});

test('Responsible has a scoped panel and can create, reschedule and delete an unassigned task', async ({
  page,
}) => {
  await login(page, 'laura@example.test');
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await expect(
    page.getByRole('region', { name: 'Panel de Responsable', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/panel-responsable.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = `Tarea Responsable ${Date.now()}`;
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-12');
  await dialog.getByText('Carlos López', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  await dialog.getByText('Editar tarea', { exact: true }).click();
  await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-14');
  await dialog.getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(dialog.getByText(/14 jun/).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(dialog.getByText('Terminada', { exact: true })).toBeVisible();
  await dialog.getByText('Eliminar tarea', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});

test('invitation destinations are locked to their commission or project and radios use green', async ({
  page,
}) => {
  await login(page);
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await page.getByRole('main').getByRole('button', { name: 'Personas', exact: true }).click();
  await page.getByRole('button', { name: 'Invitar personas', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('.invitation-destination')).toContainText('Cocina');
  await expect(dialog.getByRole('combobox', { name: 'Destino de la invitación' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Rol en la comisión' }).click();
  const option = page.getByRole('option', { name: 'Responsable', exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await dialog.getByRole('radio', { name: 'Lista de correos' }).check();
  expect(
    await dialog
      .getByRole('radio', { name: 'Lista de correos' })
      .evaluate((el) => getComputedStyle(el).accentColor),
  ).toBe('rgb(18, 77, 56)');
  await dialog.getByLabel('Correos electrónicos').fill(`commission-${Date.now()}@example.test`);
  const first = page.waitForRequest(
    (r) => r.url().endsWith('/api/commissions/cocina/invitations') && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Enviar invitaciones', exact: true }).click();
  expect((await first).postDataJSON().commissionId).toBe('cocina');
  await expect(dialog.locator('.invitation-result')).toContainText('1 invitaciones preparadas');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto('/?view=project&project=camp');
  await page.getByRole('main').getByRole('button', { name: 'Personas', exact: true }).click();
  await page.getByRole('button', { name: 'Invitar personas', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.invitation-destination')).toContainText('Campamento');
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await dialog
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`project-${Date.now()}@example.test`);
  const second = page.waitForRequest((r) => r.url().endsWith('/api/projects/camp/invitations'));
  await dialog.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
  expect((await second).postDataJSON().projectId).toBe('camp');
  await expect(dialog.locator('.invitation-result')).toContainText('1 invitaciones preparadas');
  await page.screenshot({ path: 'artifacts/invitacion-proyecto.png', animations: 'disabled' });
});

test('users explicitly edit a profile photo and custom reminder schedule across reloads', async ({
  page,
}) => {
  await login(page);
  await page.goto('/?view=profile');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Álex Perfil');
  await page.getByLabel('Foto de perfil').setInputFiles('public/icon-192.png');
  await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ajustar foto' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.locator('.profile-information')).toContainText('Álex Perfil');
  await page.locator('.profile-preferences > summary').click();
  await page.getByRole('button', { name: 'Configurar avisos', exact: true }).click();
  await page.getByLabel('Días antes del vencimiento').fill('10, 2');
  await page.getByLabel('Al vencer la tarea', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar avisos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Configurar avisos', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-information')).toContainText('Álex Perfil');
  await expect(page.getByAltText('Tu foto de perfil')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.locator('.profile-preferences > summary').click();
  await page.getByRole('button', { name: 'Configurar avisos', exact: true }).click();
  await expect(page.getByLabel('Días antes del vencimiento')).toHaveValue('10, 2');
  await expect(page.getByLabel('Al vencer la tarea', { exact: true })).not.toBeChecked();
  await page.screenshot({
    path: 'artifacts/perfil-avisos.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Días antes del vencimiento').fill('7, 3');
  await page.getByLabel('Al vencer la tarea', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar avisos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Configurar avisos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Álex Martín');
  await page.getByRole('button', { name: 'Quitar foto', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.locator('.profile-information')).toContainText('Álex Martín');
});

test('mobile photo crop accepts a JPEG over 5 MB under the production image policy and saves the selected area', async ({
  page,
}) => {
  await page.route('**/*', async (route) => {
    if (route.request().isNavigationRequest()) {
      const response = await route.fetch();
      return route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': "img-src 'self' data:" },
      });
    }
    return route.continue();
  });
  await login(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/?view=profile');
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  const before = await (await page.request.get('/api/me')).json();
  const image = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: '#00cc00' },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 400, height: 600, channels: 3, background: '#ff0000' },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
      {
        input: await sharp({
          create: { width: 400, height: 600, channels: 3, background: '#0000ff' },
        })
          .png()
          .toBuffer(),
        left: 800,
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();
  const original = Buffer.concat([image, Buffer.alloc(6 * 1024 * 1024)]);
  await page
    .getByLabel('Foto de perfil')
    .setInputFiles({ name: 'foto-grande.jpeg', mimeType: 'image/jpeg', buffer: original });
  const editor = page.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(editor).toBeVisible();
  for (let i = 0; i < 4; i++) await editor.getByRole('button', { name: 'Acercar foto' }).click();
  await expect(editor.getByRole('slider', { name: 'Zoom' })).toHaveValue('2');
  const stage = await editor.locator('.photo-crop-stage').boundingBox();
  await page.mouse.move(stage!.x + stage!.width - 18, stage!.y + stage!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + 18, stage!.y + stage!.height / 2, { steps: 10 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await mkdir('artifacts/revision-movil', { recursive: true });
  await page.screenshot({
    path: 'artifacts/revision-movil/editor-foto-320.png',
    animations: 'disabled',
  });
  await editor.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const after = await (await page.request.get('/api/me')).json();
  expect(after.user.preferences).toBe(before.user.preferences);
  expect(after.user.avatarUrl.length).toBeLessThan(220000);
  const saved = Buffer.from(after.user.avatarUrl.split(',')[1], 'base64');
  const center = await sharp(saved)
    .extract({ left: 128, top: 128, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(center[2]).toBeGreaterThan(center[0] + 100);
  await page.reload();
  await expect(page.getByAltText('Tu foto de perfil')).toBeVisible();
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await expect(page.getByAltText('Vista previa de tu foto')).toBeVisible();
  await page.getByLabel('Foto de perfil').setInputFiles('public/icon-192.png');
  await page.getByRole('button', { name: 'Cancelar recorte' }).click();
  const cancelled = await (await page.request.get('/api/me')).json();
  expect(cancelled.user.avatarUrl).toBe(after.user.avatarUrl);
  await page.getByLabel('Foto de perfil').setInputFiles({
    name: 'corrupta.jpeg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('No se pudo leer esta foto');
  expect((await (await page.request.get('/api/me')).json()).user.avatarUrl).toBe(
    after.user.avatarUrl,
  );
  await page.getByRole('button', { name: 'Quitar foto' }).click();
});

test('a banana fills while waiting for initial data and disappears when ready', async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/health', async (route) => {
    await hold;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status', { name: 'Cargando Bandarlog…' })).toBeVisible();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'artifacts/carga-banana.png' });
  release();
  await expect(page.getByLabel('Tu correo electrónico')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Cargando Bandarlog…' })).not.toBeVisible();
});

test('completing a task confirms persistence before showing the vine animation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await page.getByRole('button', { name: 'Revisar listado de material', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const complete = dialog.getByRole('button', { name: 'Completar', exact: true });
  if (await complete.isVisible()) {
    await complete.click();
    await expect(page.locator('.task-celebration')).toBeVisible();
    await expect(page.locator('.task-celebration > strong')).toHaveCount(0);
    await expect(page.locator('.undo-toast')).toContainText('Deshacer');
    await expect(page.locator('.vine-swing img')).toHaveAttribute('src', '/monkey-vine-2d.webp');
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'artifacts/tarea-completada.png' });
    await expect(page.locator('.task-celebration')).not.toBeVisible();
    await expect(dialog.getByText('Terminada', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Reabrir tarea' }).click();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.locator('.task-celebration')).toBeVisible();
  await expect(page.locator('.vine-swing')).not.toHaveCSS('display', 'none');
  const start = await page.locator('.vine-swing').boundingBox();
  await page.waitForTimeout(350);
  const moved = await page.locator('.vine-swing').boundingBox();
  expect(moved!.x).toBeGreaterThan(start!.x + 20);
  await expect(dialog.getByText('Terminada', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Reabrir tarea' }).click();
});

test('catalogue artwork is immediate and can be selected on mobile', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await openUnmatchedCommission(page);
  await expect(page.getByRole('button', { name: 'Elegir icono', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Preparando ilustraciones…' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Buscar icono').fill('Desayunos');
  await dialog.getByRole('button', { name: 'Desayunos', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
  await dialog.getByLabel('Buscar icono').fill('Desayunos');
  await expect(dialog.getByRole('button', { name: 'Desayunos', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'artifacts/catalogo-movil.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Elegir automáticamente' }).click();
});

test('Servicios, Animación and Logística automatically use their pair and hide manual selection', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 900 });
  for (const [name, key, mascot] of [
    ['Servicios', 'servicios-general', '/artwork/mascots/servicios.webp'],
    ['Animación', 'animacion-general', '/artwork/mascots/animacion.webp'],
    ['Logística', 'logistica-02', '/artwork/mascots/002.webp#tile=4'],
  ]) {
    let data = await (await page.request.get('/api/data')).json();
    const existing = data.commissions.find((c: any) => c.projectId === 'camp' && c.name === name);
    const cid = existing?.id || (await createCommission(page, name));
    await page.goto(`/?view=commission&project=camp&commission=${cid}`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Elegir icono', exact: true })).toHaveCount(0);
    data = await (await page.request.get('/api/data')).json();
    const commission = data.commissions.find((c: any) => c.id === cid);
    expect(commission.artworkKey).toBe(key);
    expect(commission.artworkLocked).toBe(true);
    expect(commission.mascotUrl).toBe(mascot);
    await expect(page.locator('.commission-icon img')).toHaveAttribute(
      'src',
      `/artwork/icons/${key}.svg`,
    );
    await expect(page.locator('.commission-mascot')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: `artifacts/mobile-v2/catalogo-${key}.png`,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 900 });
  }
});

test('camp creation uses camp labels and the project controls its Christmas collection', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('navigation').first().getByRole('button', { name: 'Campamentos' }).click();
  await page.getByRole('button', { name: 'Nuevo campamento', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('dialog', { name: 'Nuevo campamento', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Crear campamento', exact: true })).toBeVisible();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Campamento de Navidad');
  await expect(dialog.getByRole('combobox', { name: 'Colección de iconos' })).toHaveText('Navidad');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto('/?view=project&project=camp');
  await page.locator('.project-appearance > summary').click();
  await page.getByRole('combobox', { name: 'Colección de iconos' }).click();
  await page.getByRole('option', { name: 'Navidad', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Colección de iconos' })).toHaveText('Navidad');
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await expect(page.getByRole('heading', { name: 'Cocina', exact: true })).toBeVisible();
  await expect(page.locator('.commission-icon img')).toHaveAttribute('src', /navidad-/);
  const iconBox = await page.locator('.commission-icon img').boundingBox();
  const frameBox = await page.locator('.commission-icon').boundingBox();
  expect(iconBox!.x).toBeGreaterThanOrEqual(frameBox!.x);
  expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
  await page.screenshot({ path: 'artifacts/comision-navidad.png', animations: 'disabled' });
  await expect(page.getByRole('button', { name: 'Elegir icono', exact: true })).toHaveCount(0);
  await openUnmatchedCommission(page);
  await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Colección:')).toContainText('Navidad');
  await page.screenshot({ path: 'artifacts/catalogo-navidad.png', animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto('/?view=project&project=camp');
  await page.locator('.project-appearance > summary').click();
  await page.getByRole('combobox', { name: 'Colección de iconos' }).click();
  await page.getByRole('option', { name: 'Scouts', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Colección de iconos' })).toHaveText('Scouts');
});

test('Campamento de Navidad assigns all six Christmas pairs without manual controls', async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page);
  const session = await (await page.request.get('/api/me')).json();
  const response = await page.request.post('/api/projects', {
    headers: { 'X-CSRF-Token': session.csrf, Origin: 'http://127.0.0.1:5174' },
    data: {
      name: 'Campamento de Navidad',
      type: 'camp',
      parentId: 'ronda',
      artworkTheme: 'scout',
      starts: '2027-12-26',
      ends: '2027-12-30',
    },
  });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  expect(project.artworkTheme).toBe('christmas');
  await page.goto(`/?view=project&project=${project.id}`);
  await page.locator('.project-appearance > summary').click();
  await expect(page.getByRole('combobox', { name: 'Colección de iconos' })).toBeDisabled();
  for (const [name, key] of [
    ['Servicios', 'servicios'],
    ['Animación', 'animacion'],
    ['Material', 'material'],
    ['Menú', 'menu'],
    ['Logística', 'logistica'],
    ['Lugar', 'lugar'],
  ]) {
    const cid = await createCommission(page, name, project.id);
    await page.goto(`/?view=commission&project=${project.id}&commission=${cid}`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.locator('.commission-icon img')).toHaveAttribute(
      'src',
      `/artwork/icons/navidad-${key}.svg`,
    );
    await expect(page.locator('.commission-mascot')).toHaveCount(0);
    await expect(
      page.locator('img[src*="/artwork/mascots/"], svg image[href*="/artwork/mascots/"]'),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Elegir icono', exact: true })).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/mobile-v2/navidad-${key}.png`,
      animations: 'disabled',
    });
  }
});

test('coordination uploads a new matching pair and can use it after reloading', async ({
  page,
}) => {
  await login(page);
  await openUnmatchedCommission(page);
  await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Añadir icono al catálogo' }).click();
  await dialog.getByLabel('Nombre del icono').fill(`Farol adicional QA ${Date.now()}`);
  await dialog.getByLabel('Icono', { exact: true }).setInputFiles('public/brand-mark.png');
  await page.screenshot({ path: 'artifacts/ampliar-catalogo.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Guardar y utilizar' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.commission-icon img')).toHaveAttribute(
    'src',
    /^\/api\/artwork\/assets\//,
  );
  await expect(page.locator('.commission-mascot')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Equipo QA/ })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
  await dialog.getByRole('button', { name: 'Elegir automáticamente' }).click();
});
