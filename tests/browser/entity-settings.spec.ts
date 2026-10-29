import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { renderMail } from '../../server/mail-template';
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page) {
  const cached = sessions.get('admin');
  if (cached) {
    await page.context().addCookies(cached);
    return;
  }
  await page.request.post('/api/auth/request', { data: { email: 'alex@example.test' } });
  const mail = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === 'alex@example.test' && m.body.includes('token='))
    .at(-1);
  expect(
    (
      await page.request.post('/api/auth/verify', {
        data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
      })
    ).ok(),
  ).toBeTruthy();
  sessions.set('admin', await page.context().cookies());
}

for (const width of [320, 1440])
  test(`header settings edit projects, commissions and tasks without collisions at ${width}px`, async ({
    page,
  }) => {
    await login(page);
    await page.setViewportSize({ width, height: 950 });
    const session = await page.request.get('/api/me').then((r) => r.json());
    const headers = { 'X-CSRF-Token': session.csrf };
    const created = await page.request
      .post('/api/commissions', {
        headers,
        data: {
          name: `Prueba engranaje ${width} ${Date.now()}`,
          description: 'Original',
          projectId: 'camp',
          members: [{ userId: 'alex', role: 'responsible' }],
        },
      })
      .then((r) => r.json());
    await page.goto(`/?view=commission&project=camp&commission=${created.id}`);
    const gear = page.getByRole('button', { name: 'Ajustes de la comisión', exact: true });
    const title = page.getByRole('heading', { name: /Prueba engranaje/ });
    await expect(gear).toBeVisible();
    const g = await gear.boundingBox(),
      h = await title.boundingBox();
    expect(g!.x).toBeGreaterThanOrEqual(h!.x + h!.width);
    await gear.click();
    const settings = page.getByRole('region', { name: 'Ajustes de la comisión', exact: true });
    await settings.locator('.commission-edit > summary').click();
    await settings.getByLabel('Nombre', { exact: true }).fill(`Comisión editada ${width}`);
    await settings.getByLabel('Descripción', { exact: true }).fill('Descripción editada');
    await settings.getByRole('button', { name: 'Guardar comisión', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Comisión editada ${width}`, exact: true }),
    ).toBeVisible();
    // A second edit in the same open session uses the new base, not a stale draft.
    await settings.getByLabel('Descripción', { exact: true }).fill('Segunda descripción');
    await settings.getByRole('button', { name: 'Guardar comisión', exact: true }).click();
    await expect(
      settings.getByRole('button', { name: 'Guardar comisión', exact: true }),
    ).toBeDisabled();
    await mkdir('artifacts/entity-settings', { recursive: true });
    await page.screenshot({ path: `artifacts/entity-settings/commission-${width}.png` });
    await settings.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click();
    await gear.click();
    await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }),
    ).toBeFocused();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    const task = await page.request
      .post('/api/tasks', {
        headers,
        data: {
          commissionId: created.id,
          title: 'Tarea de ajustes',
          description: 'Sin cambios',
          due: '2028-06-01T12:00:00Z',
          responsibleIds: ['alex'],
        },
      })
      .then((r) => r.json());
    await page.goto(`/?task=${task.id}`);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Ajustes de la tarea', exact: true }).click();
    await expect(dialog.locator('.reassign > summary > span')).toHaveCSS('clip-path', 'none');
    await dialog.locator('.reassign > summary').click();
    await dialog.getByLabel('Título', { exact: true }).fill('Tarea editada desde engranaje');
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(dialog.locator('.detail-heading > h2')).toHaveText(
      'Tarea editada desde engranaje',
    );
    await page.screenshot({ path: `artifacts/entity-settings/task-${width}.png` });
    await page.goto('/?view=project&project=camp');
    await page.getByRole('button', { name: 'Ajustes del proyecto', exact: true }).click();
    const project = page.getByRole('region', { name: 'Ajustes del proyecto', exact: true });
    await project.getByRole('combobox', { name: 'Tipo de proyecto', exact: true }).click();
    await page.getByRole('option', { name: 'Evento', exact: true }).click();
    await expect(
      project.getByRole('combobox', { name: 'Tipo de proyecto', exact: true }),
    ).toHaveText('Evento');
    await expect(project).toBeVisible();
    await page.screenshot({ path: `artifacts/entity-settings/project-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(project).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ajustes del proyecto', exact: true }),
    ).toBeFocused();
    await page.goto(`/?view=commission&project=camp&commission=${created.id}`);
    await gear.click();
    await settings.locator('.commission-delete > summary').click();
    await settings
      .getByRole('button', { name: 'Confirmar eliminación de comisión', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: `Comisión editada ${width}`, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Ajustes del proyecto', exact: true }),
    ).toBeVisible();
    const data = await page.request.get('/api/data').then((r) => r.json());
    expect(data.commissions.some((c: any) => c.id === created.id)).toBe(false);
    expect(data.tasks.some((t: any) => t.id === task.id)).toBe(false);
    await page.goto(`/?view=commission&project=camp&commission=${created.id}`);
    await expect(
      page.getByRole('heading', { name: 'Comisión no disponible', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ver comisiones', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Comisiones', exact: true })).toBeVisible();
  });

for (const width of [320, 1440])
  test(`email waving mascot is public and does not squeeze the message at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.setContent(
      renderMail({
        title: 'Tarea asignada',
        body: 'Revisar el material del campamento.\nConsulta los pasos y la fecha límite en Bandarlog.',
        appUrl: 'http://127.0.0.1:5174',
        actions: [{ label: 'Ver tarea', url: 'http://127.0.0.1:5174/?task=example' }],
      }),
    );
    const mascot = page.getByRole('img', { name: 'Un mono de Bandarlog saludando', exact: true });
    await expect(mascot).toBeVisible();
    expect(
      await mascot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('link', { name: 'Ver tarea', exact: true })).toBeVisible();
    await mkdir('artifacts/entity-settings', { recursive: true });
    await page.screenshot({ path: `artifacts/entity-settings/email-${width}.png` });
  });
