import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
async function login(page: any) {
  await page.goto('/');
  await page.getByLabel('Tu correo electrónico').fill('alex@example.test');
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
