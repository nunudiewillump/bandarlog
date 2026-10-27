import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
async function login(page: any, email = 'alex@example.test') {
  await page.goto('/');
  await page.getByLabel('Tu correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Recibir enlace de acceso' }).click();
  await page.getByRole('button', { name: 'Bandeja de desarrollo' }).click();
  await page.getByRole('button', { name: 'Abrir enlace de prueba' }).first().click();
  await page.getByRole('button', { name: 'Confirmar inicio de sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen general' })).toBeVisible();
}
test('desktop: commission, task, comments and persistent status', async ({ page }) => {
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
  await dialog.getByLabel('Fecha y hora límite').fill('2027-06-12T12:00');
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
  await page.getByRole('navigation').first().getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Ver correos de prueba' }).click();
  const frame = page.locator('.email-preview').first();
  await expect(frame).toBeVisible();
  await frame.screenshot({ path: 'artifacts/correo-invitacion.png', animations: 'disabled' });
  const src = await frame.getAttribute('srcdoc');
  expect(src).toContain('Comisiones que avanzan');
  expect(src).toContain('#124d38');
  const preview = await page.context().newPage();
  await preview.route('**/icon-192.png', (route) =>
    route.fulfill({ path: 'public/icon-192.png', contentType: 'image/png' }),
  );
  await preview.setViewportSize({ width: 660, height: 900 });
  await preview.setContent(
    src!.replaceAll('http://127.0.0.1:5174', 'https://bandarlog.example.org'),
  );
  await preview.screenshot({
    path: 'artifacts/correo-invitacion.png',
    fullPage: true,
    animations: 'disabled',
  });
  const messages = await (await page.request.get('/api/dev/mail')).json();
  const taskMessage = messages.find(
    (m: any) => m.subject.includes('Nueva asignación') && m.html?.includes('Completar tarea'),
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
});

test('Responsible has a scoped panel and can create, reschedule and delete an unassigned task', async ({
  page,
}) => {
  await login(page, 'laura@example.test');
  await page.goto('/?view=commission&project=camp&commission=cocina');
  await expect(page.getByRole('heading', { name: 'Panel de Responsable' })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/panel-responsable.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = `Tarea Responsable ${Date.now()}`;
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Fecha y hora límite').fill('2027-06-12T12:00');
  await dialog.getByText('Carlos López', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  await dialog.getByText('Editar fecha y responsables', { exact: true }).click();
  await dialog.getByLabel('Fecha límite (hora de este dispositivo)').fill('2027-06-14T12:00');
  await dialog.getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(dialog.getByText(/14 jun/).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(dialog.getByText('Terminada', { exact: true })).toBeVisible();
  await dialog.getByText('Eliminar tarea', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});
