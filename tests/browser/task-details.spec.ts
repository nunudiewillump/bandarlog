import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
async function login(page: Page, email = 'laura@example.test') {
  const requested = await page.request.post('/api/auth/request', { data: { email } });
  expect(requested.ok()).toBeTruthy();
  const message = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === email && m.body.includes('token='))
    .at(-1);
  expect(
    (
      await page.request.post('/api/auth/verify', {
        data: { token: message.body.match(/token=([a-f0-9]+)/)[1] },
      })
    ).ok(),
  ).toBeTruthy();
  return page.request.get('/api/me').then((r) => r.json());
}
async function task(page: Page, title: string, responsibleIds = ['carlos']) {
  const session = await page.request.get('/api/me').then((r) => r.json());
  const response = await page.request.post('/api/tasks', {
    headers: { 'X-CSRF-Token': session.csrf },
    data: {
      title,
      description: 'Descripción inicial',
      due: '2027-06-14T12:00:00Z',
      commissionId: 'cocina',
      responsibleIds,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function patch(page: Page, id: string, body: unknown) {
  const session = await page.request.get('/api/me').then((r) => r.json());
  const response = await page.request.patch(`/api/tasks/${id}`, {
    headers: { 'X-CSRF-Token': session.csrf },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function remove(page: Page, id: string) {
  const session = await page.request.get('/api/me').then((r) => r.json());
  await page.request.delete(`/api/tasks/${id}`, { headers: { 'X-CSRF-Token': session.csrf } });
}
async function addStep(page: Page, title: string) {
  const section = page.getByRole('region', { name: 'Pasos de la tarea' });
  await section.getByRole('button', { name: /^Añadir paso/ }).click();
  await section.getByLabel('Nuevo paso', { exact: true }).fill(title);
  await section.getByRole('button', { name: 'Guardar paso', exact: true }).click();
  await expect(section.getByText(title, { exact: true })).toBeVisible();
}
for (const width of [320, 1440])
  test(`full task editing is explicit, cancellable and preserves untouched values at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await login(page);
    const created = await task(page, `Editar ${width}`);
    await page.goto(`/?task=${created.id}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveCount(0);
    await dialog.locator('.reassign > summary').click();
    await dialog.getByLabel('Título', { exact: true }).fill('Cambio descartado');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog.locator('.detail-heading')).toContainText(`Editar ${width}`);
    await dialog.locator('.reassign > summary').click();
    await dialog.getByLabel('Título', { exact: true }).fill(`Título actualizado ${width}`);
    await dialog.getByLabel('Descripción', { exact: true }).fill('Descripción actualizada');
    await mkdir('artifacts/task-details', { recursive: true });
    await dialog.locator('.task-edit-form').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/task-details/editor-${width}.png` });
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(dialog.locator('.detail-heading')).toContainText(`Título actualizado ${width}`);
    await expect(dialog.locator('.description')).toHaveText('Descripción actualizada');
    let saved = (await page.request.get('/api/data').then((r) => r.json())).tasks.find(
      (t: any) => t.id === created.id,
    );
    expect(+new Date(saved.due)).toBe(+new Date(created.task.due));
    await dialog.locator('.reassign > summary').click();
    await dialog.getByLabel('Fecha límite', { exact: true }).fill('2027-06-16');
    await dialog.getByRole('checkbox', { name: 'Álex Martín', exact: true }).check();
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(dialog.locator('.detail-fields')).toContainText('16 jun');
    await expect(dialog.locator('.detail-fields')).toContainText('Álex Martín');
    await page.reload();
    await expect(dialog.locator('.detail-heading')).toContainText(`Título actualizado ${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await remove(page, created.id);
  });

test('mobile checklist supports add, edit, tick and removal and never blocks completion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await login(page);
  const created = await task(page, 'Checklist opcional');
  await page.goto(`/?task=${created.id}`);
  const section = page.getByRole('region', { name: 'Pasos de la tarea' });
  await expect(section.getByRole('button')).toHaveCount(1);
  await addStep(page, 'Comprobar material');
  await addStep(page, 'Confirmar menús');
  await section
    .getByRole('checkbox', { name: 'Completar paso: Comprobar material', exact: true })
    .click();
  await expect(
    section.getByRole('checkbox', { name: 'Completar paso: Comprobar material', exact: true }),
  ).toBeChecked();
  await section.getByLabel('Acciones del paso: Comprobar material', { exact: true }).click();
  await section.getByRole('button', { name: 'Editar paso', exact: true }).click();
  await section.getByLabel('Texto del paso', { exact: true }).fill('Revisar material');
  await section.getByRole('button', { name: 'Guardar texto del paso', exact: true }).click();
  await expect(
    section.getByRole('checkbox', { name: 'Completar paso: Revisar material', exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: 'artifacts/task-details/checklist-mobile.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Terminada', { exact: true })).toBeVisible();
  await expect(
    section.getByRole('checkbox', { name: 'Completar paso: Confirmar menús', exact: true }),
  ).not.toBeChecked();
  await section.getByLabel('Acciones del paso: Revisar material', { exact: true }).click();
  await section.getByRole('button', { name: 'Eliminar paso', exact: true }).click();
  await expect(section.getByText('Revisar material', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(section.getByText('Confirmar menús', { exact: true })).toBeVisible();
  await remove(page, created.id);
});

test('an assigned Scouter only ticks steps and an unassigned Scouter sees a read-only checklist', async ({
  page,
  browser,
}) => {
  await login(page);
  const created = await task(page, 'Pasos con permisos');
  const step = crypto.randomUUID();
  await patch(page, created.id, {
    checklistChange: { action: 'add', id: step, title: 'Paso asignado' },
  });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 390, height: 950 },
  });
  const scouter = await context.newPage();
  try {
    await login(scouter, 'carlos@example.test');
    await scouter.goto(`/?task=${created.id}`);
    const section = scouter.getByRole('region', { name: 'Pasos de la tarea' });
    await expect(section.locator('.checklist-options')).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^Añadir paso/ })).toHaveCount(0);
    await expect(scouter.getByRole('dialog').locator('.reassign')).toHaveCount(0);
    await section
      .getByRole('checkbox', { name: 'Completar paso: Paso asignado', exact: true })
      .click();
    await expect(section.getByRole('checkbox')).toBeChecked();
    const unrelated = await task(page, 'Solo consulta', ['alex']);
    await patch(page, unrelated.id, {
      checklistChange: { action: 'add', id: crypto.randomUUID(), title: 'Paso de otra persona' },
    });
    await scouter.goto(`/?task=${unrelated.id}`);
    await expect(
      scouter
        .getByRole('region', { name: 'Pasos de la tarea' })
        .getByText('Paso de otra persona', { exact: true }),
    ).toBeVisible();
    await expect(
      scouter.getByRole('region', { name: 'Pasos de la tarea' }).getByRole('checkbox'),
    ).toHaveCount(0);
    await remove(page, unrelated.id);
  } finally {
    await context.close();
    await remove(page, created.id);
  }
});

test('an open editor retains its draft and refuses to overwrite a concurrent change', async ({
  page,
}) => {
  await login(page);
  const created = await task(page, 'Título inicial');
  await page.goto(`/?task=${created.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.locator('.reassign > summary').click();
  await dialog.getByLabel('Descripción', { exact: true }).fill('Borrador local');
  await patch(page, created.id, { title: 'Cambio de otra persona' });
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog.locator('.task-edit-form .error')).toContainText('La tarea ha cambiado');
  await expect(dialog.getByLabel('Descripción', { exact: true })).toHaveValue('Borrador local');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.reload();
  await dialog.locator('.reassign > summary').click();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Cambio de otra persona');
  await expect(dialog.getByLabel('Descripción', { exact: true })).toHaveValue(
    'Descripción inicial',
  );
  await remove(page, created.id);
});

test('offline title edits and dependent checklist changes sync without losing steps or duplicating them', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await login(page);
  const created = await task(page, 'Sin cobertura', ['laura']);
  await patch(page, created.id, {
    checklistChange: { action: 'add', id: crypto.randomUUID(), title: 'Paso inicial' },
  });
  await page.goto(`http://127.0.0.1:4174/?task=${created.id}`);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole('dialog').locator('.detail-heading')).toHaveText('Sin cobertura');
  await context.setOffline(true);
  await page.reload();
  const section = page.getByRole('region', { name: 'Pasos de la tarea' }),
    dialog = page.getByRole('dialog');
  await section
    .getByRole('checkbox', { name: 'Completar paso: Paso inicial', exact: true })
    .click();
  await expect(
    section.getByRole('checkbox', { name: 'Completar paso: Paso inicial', exact: true }),
  ).toBeChecked();
  await dialog.locator('.reassign > summary').click();
  await dialog.getByLabel('Título', { exact: true }).fill('Editada sin cobertura');
  await dialog.getByLabel('Descripción', { exact: true }).fill('Guardada en la cola');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await addStep(page, 'Segundo paso');
  await section
    .getByRole('checkbox', { name: 'Completar paso: Segundo paso', exact: true })
    .click();
  await expect(page.locator('.sync-status')).toContainText('4 cambios pendientes');
  await context.setOffline(false);
  await expect(page.locator('.sync-status')).toHaveCount(0, { timeout: 20000 });
  const saved = (await page.request.get('/api/data').then((r) => r.json())).tasks.find(
    (t: any) => t.id === created.id,
  );
  expect(saved.title).toBe('Editada sin cobertura');
  expect(saved.description).toBe('Guardada en la cola');
  expect(saved.checklist.map((s: any) => [s.title, s.done])).toEqual([
    ['Paso inicial', true],
    ['Segundo paso', true],
  ]);
  await remove(page, created.id);
});
