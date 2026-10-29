import { test, expect, type Page } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';
import { artworkCatalog } from '../../shared/scout-catalog';
import { mkdir } from 'node:fs/promises';
async function setup(
  page: Page,
  options: {
    count?: 1 | 5 | 10;
    role?: string;
    empty?: boolean;
    width?: number;
    level?: 'personal' | 'commissions' | 'projects' | 'clear';
    fail?: boolean;
    delay?: number;
  } = {},
) {
  const fixture = mobileFixture(options.count || 10);
  if (options.role) fixture.user.role = options.role;
  if (options.empty)
    Object.assign(fixture.data, {
      projects: [],
      commissions: [],
      tasks: [],
      members: [],
      assignments: [],
      projectMembers: [],
      activity: [],
      users: [fixture.user],
      campSummaries: [],
    });
  const own = new Set(
    fixture.data.assignments.filter((a) => a.userId === fixture.user.id).map((a) => a.taskId),
  );
  if (options.level && options.level !== 'personal')
    for (const task of fixture.allTasks) if (own.has(task.id)) task.status = 'done';
  if (options.level === 'projects' || options.level === 'clear')
    for (const task of fixture.data.tasks) task.status = 'done';
  if (options.level === 'clear') for (const task of fixture.allTasks) task.status = 'done';
  const calls: string[] = [];
  await page.setViewportSize({ width: options.width || 390, height: 900 });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, mail: 'development' } });
    if (path === '/api/artwork/catalog') return route.fulfill({ json: artworkCatalog });
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'test-only-csrf', development: true },
      });
    if (path === '/api/data')
      return route.fulfill({
        json: structuredClone(options.empty ? fixture.data : fixture.summary()),
      });
    if (path.startsWith('/api/tasks/') && route.request().method() === 'PATCH') {
      const id = path.split('/').at(-1)!;
      calls.push(id);
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
      if (options.fail)
        return route.fulfill({ status: 503, json: { error: 'No se ha podido guardar la tarea.' } });
      const input = route.request().postDataJSON(),
        task = fixture.allTasks.find((t) => t.id === id)!;
      if (!own.has(id)) return route.fulfill({ status: 403, json: { error: 'Solo consulta' } });
      if (input.expectedUpdatedAt !== task.updatedAt)
        return route.fulfill({ status: 409, json: { error: 'La tarea ha cambiado.' } });
      Object.assign(task, {
        status: input.status,
        blockedReason: input.blockedReason || null,
        updatedAt: new Date(Math.max(Date.now(), +new Date(task.updatedAt) + 1)).toISOString(),
      });
      return route.fulfill({ json: { ok: true, task: { ...task } } });
    }
    return route.fulfill({ status: 404, json: { error: 'No disponible en esta prueba aislada' } });
  });
  await page.goto('/');
  await expect(page.locator('.mobile-focus')).toBeVisible();
  return { ...fixture, calls };
}
const metric = (page: Page, label: string) =>
  page
    .locator('.mobile-focus .focus-counts > span')
    .filter({ hasText: label })
    .locator('.animated-counter');
for (const count of [1, 5, 10] as const)
  for (const width of [320, 390, 430])
    test(`mobile ${width}px with ${count} commissions remains bounded and accessible`, async ({
      page,
    }) => {
      await setup(page, { count, width });
      await expect(page.locator('.mobile-focus .mobile-task-row')).toHaveCount(3);
      await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '7');
      await expect(page.locator('.animated-counter[data-animating="true"]:visible')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const control = await page.getByRole('checkbox').first().boundingBox();
      expect(control!.width).toBeGreaterThanOrEqual(44);
      expect(control!.height).toBeGreaterThanOrEqual(44);
      await mkdir('artifacts/mobile-v2', { recursive: true });
      await page.screenshot({
        path: `artifacts/mobile-v2/after-${count}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('navigation', { name: 'Navegación principal' })
        .getByRole('button', { name: 'Comisiones' })
        .click();
      await expect(page.locator('.mobile-commission-groups .commission-row')).toHaveCount(count);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
test('mobile completion animates 7→6, done and progress, then undo restores authoritative counts', async ({
  page,
}) => {
  await setup(page);
  const box = await metric(page, 'Por completar').boundingBox();
  // Observe the real CSS animation before the save. Sequential assertions can
  // outlive its 350ms duration on a busy renderer.
  await page.locator('.mobile-focus').evaluate((focus) => {
    (window as any).__counterAnimations = [];
    focus.addEventListener('animationstart', (event) => {
      const animation = event as AnimationEvent;
      const target = animation.target as HTMLElement;
      if (!target.classList.contains('counter-current')) return;
      const counter = target.closest('.animated-counter');
      const text = target.closest('.focus-counts > span')?.textContent || '';
      const label = text.includes('Por completar')
        ? 'Por completar'
        : text.includes('Terminadas')
          ? 'Terminadas'
          : '';
      if (label)
        (window as any).__counterAnimations.push({
          label,
          animation: animation.animationName,
          value: counter?.getAttribute('data-value'),
        });
    });
  });
  await page.getByRole('checkbox', { name: 'Completar Mi tarea 1', exact: true }).click();
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '6');
  await expect(metric(page, 'Terminadas')).toHaveAttribute('data-value', '9');
  await expect
    .poll(() => page.evaluate(() => (window as any).__counterAnimations))
    .toEqual(
      expect.arrayContaining([
        { label: 'Por completar', animation: 'counter-enter-down', value: '6' },
        { label: 'Terminadas', animation: 'counter-enter-up', value: '9' },
      ]),
    );
  await expect(page.locator('.mobile-focus .mobile-progress .animated-counter')).toHaveAttribute(
    'data-value',
    '60',
  );
  const nextBox = await metric(page, 'Por completar').boundingBox();
  expect(nextBox!.width).toBe(box!.width);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '7');
  await expect(metric(page, 'Terminadas')).toHaveAttribute('data-value', '8');
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Comisiones' })
    .click();
  await expect(page.locator('.mobile-commission-groups .commission-row')).toHaveCount(10);
});
test('the last personal task gets a satisfaction pause before read-only team context', async ({
  page,
}) => {
  const fixture = await setup(page);
  for (const task of fixture.data.tasks)
    if (
      task.id !== 'v2-task-0' &&
      fixture.data.assignments.some((a) => a.taskId === task.id && a.userId === fixture.user.id)
    )
      task.status = 'done';
  await page.reload();
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '1');
  await page.getByRole('checkbox', { name: 'Completar Mi tarea 1', exact: true }).click();
  await expect(page.locator('.mobile-focus')).toHaveAttribute('data-holding', 'true');
  await expect(page.locator('.personal-clear')).toContainText('¡Tus tareas están al día!');
  await expect(page.locator('.mobile-focus .focus-primary')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('.mobile-focus .focus-primary')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/mobile-v2/last-task.png', animations: 'disabled' });
  await expect(page.getByRole('heading', { name: 'Mis comisiones', exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.locator('.personal-clear')).toBeVisible();
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '30');
  await expect(metric(page, 'Bloqueadas')).toHaveAttribute('data-value', '1');
  await expect(metric(page, 'Terminadas')).toHaveAttribute('data-value', '30');
  await expect(page.locator('.mobile-focus .mobile-task-row')).toHaveCount(3);
  await expect(page.locator('.mobile-focus').getByRole('checkbox')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
  await page.locator('.mobile-focus .mobile-task-open').first().click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Completar', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.screenshot({ path: 'artifacts/mobile-v2/team-context.png', animations: 'disabled' });
});
for (const level of ['projects', 'clear'] as const)
  test(`Always Something reaches ${level} without inventing work`, async ({ page }) => {
    await setup(page, { level });
    await expect(page.locator('.mobile-focus')).toHaveAttribute('data-focus-level', level);
    await expect(page.locator('.personal-clear')).toBeVisible();
    await expect(page.locator('.mobile-focus').getByRole('checkbox')).toHaveCount(0);
    if (level === 'projects') {
      await expect(
        page.getByRole('heading', { name: 'Tus comisiones están al día' }),
      ).toBeVisible();
      await expect(page.locator('.mobile-focus .project-overview')).toHaveCount(1);
      await expect(
        page.locator('.mobile-focus .project-overview > p [data-value="14"]'),
      ).toHaveCount(1);
    } else await expect(page.getByRole('heading', { name: 'Todo al día' })).toBeVisible();
    await page.screenshot({
      path: `artifacts/mobile-v2/${level}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
test('failed saves produce no celebration or definitive counter change', async ({ page }) => {
  await setup(page, { fail: true });
  await page.getByRole('checkbox', { name: 'Completar Mi tarea 1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se ha podido guardar');
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '7');
  await expect(page.locator('.task-celebration')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toHaveCount(0);
});
test('quick consecutive actions stay synchronised and reduced motion updates directly', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await setup(page, { delay: 120 });
  await page.evaluate(() => {
    (window as any).__vineStarts = 0;
    document.addEventListener('animationstart', (event) => {
      if ((event.target as Element).matches('.vine-swing')) (window as any).__vineStarts++;
    });
  });
  await page.getByRole('checkbox', { name: 'Completar Mi tarea 1', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Completar Mi tarea 7', exact: true }).click();
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '5');
  await expect(metric(page, 'Terminadas')).toHaveAttribute('data-value', '10');
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-animating', 'false');
  expect(fixture.calls.length).toBe(2);
  expect(new Set(fixture.calls).size).toBe(2);
  await expect
    .poll(() => page.evaluate(() => (window as any).__vineStarts), { timeout: 6500 })
    .toBe(2);
  const beforeCross = await page.locator('.vine-swing').boundingBox();
  await page.waitForTimeout(350);
  const afterCross = await page.locator('.vine-swing').boundingBox();
  expect(afterCross!.x).toBeGreaterThan(beforeCross!.x + 20);
  await expect(
    page.locator('.mobile-focus .focus-counts > span').filter({ hasText: 'Bloqueadas' }),
  ).toHaveCount(0);
});
test('detail back navigation preserves filters and the scroll position', async ({ page }) => {
  await setup(page);
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Mis tareas' })
    .click();
  await page.locator('.mobile-task-filters > summary').click();
  await page
    .locator('.mobile-task-filters')
    .getByRole('button', { name: 'Terminadas', exact: true })
    .click();
  const row = page.locator('.mobile-list .mobile-task-open').last();
  await row.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await row.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.locator('.mobile-task-filters').getByRole('button', { name: 'Terminadas', exact: true }),
  ).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 4);
  expect(new URL(page.url()).searchParams.get('task')).toBeNull();
});

test('simultaneous quick actions animate once and ignore duplicate submissions', async ({
  page,
}) => {
  const fixture = await setup(page, { delay: 150 });
  await page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLButtonElement>('.mobile-focus .quick-complete');
    controls[0].click();
    controls[0].click();
    controls[1].click();
  });
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-value', '5');
  await expect(metric(page, 'Terminadas')).toHaveAttribute('data-value', '10');
  expect(fixture.calls).toHaveLength(2);
  expect(new Set(fixture.calls).size).toBe(2);
  await expect(metric(page, 'Por completar')).toHaveAttribute('data-animating', 'false');
  await page.locator('.focus-full-list').click();
  await expect(page.locator('.mobile-list .mobile-task-row')).toHaveCount(15);
  await expect(page.locator('.animated-counter[data-animating="true"]:visible')).toHaveCount(0);
});

for (const width of [320, 390, 430])
  for (const clear of [false, true])
    test(`mobile screen review ${width}px, ${clear ? 'all clear' : 'active tasks'}`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await setup(page, { width, role: 'admin', level: clear ? 'clear' : 'personal' });
      await mkdir('artifacts/revision-movil', { recursive: true });
      const views = [
        ['home', ''],
        ['tasks', '?view=tasks'],
        ['commissions', '?view=commissions'],
        ['projects', '?view=projects'],
        ['project', '?view=project&project=camp-v2'],
        ['commission', '?view=commission&project=camp-v2&commission=commission-v2-5'],
        ['people', '?view=people'],
        ['profile', '?view=profile'],
        ['settings', '?view=settings'],
        ['alerts', '?view=alerts'],
      ];
      for (const [name, query] of views) {
        await page.goto('/' + query);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(
          page.locator(
            'img[src="/monkey.webp"], img[src*="/artwork/mascots/"], svg image[href*="/artwork/mascots/"]',
          ),
        ).toHaveCount(0);
        await expect(page.locator('.loading')).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          name,
        ).toBe(true);
        if (name === 'people') {
          for (const element of await page.locator('.person-row strong').all()) {
            const box = await element.boundingBox();
            expect((await element.locator('..').boundingBox())!.width).toBeGreaterThan(140);
            expect(box!.height).toBeLessThan(60);
          }
        }
        await page.screenshot({
          path: `artifacts/revision-movil/${name}-${clear ? 'clear' : 'active'}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      for (const [query, tabs] of [
        ['?view=commission&project=camp-v2&commission=commission-v2-5', ['Personas', 'Actividad']],
        ['?view=project&project=camp-v2', ['Comisiones', 'Tareas', 'Personas']],
      ] as const) {
        await page.goto('/' + query);
        for (const tab of tabs) {
          await page.locator('.page-tabs').getByRole('button', { name: tab, exact: true }).click();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            query + tab,
          ).toBe(true);
          await page.screenshot({
            path: `artifacts/revision-movil/tab-${query.includes('commission&') ? 'commission' : 'project'}-${tab}-${clear ? 'clear' : 'active'}-${width}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
      await page.goto('/?view=tasks');
      await page.locator('.mobile-list .mobile-task-open').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({
        path: `artifacts/revision-movil/task-detail-${clear ? 'clear' : 'active'}-${width}.png`,
        animations: 'disabled',
      });
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
      await page.goto('/?view=commission&project=camp-v2&commission=commission-v2-9');
      if (
        (await page
          .getByRole('button', { name: 'Ajustes de la comisión', exact: true })
          .getAttribute('aria-expanded')) !== 'true'
      )
        await page.getByRole('button', { name: 'Ajustes de la comisión', exact: true }).click();
      await page.getByRole('button', { name: 'Elegir icono', exact: true }).click();
      const catalogue = page.getByRole('dialog');
      await expect(catalogue).toBeVisible();
      expect(
        await catalogue.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/revision-movil/artwork-${clear ? 'clear' : 'active'}-${width}.png`,
        animations: 'disabled',
      });
      await catalogue.getByRole('button', { name: 'Cerrar', exact: true }).click();
      for (const [view, action] of [
        ['commissions', 'Nueva comisión'],
        ['tasks', 'Nueva tarea'],
        ['projects', 'Nuevo proyecto'],
        ['people', 'Invitar personas'],
      ]) {
        await page.goto('/?view=' + view);
        await page.getByRole('button', { name: action, exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        expect(
          await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
          action,
        ).toBe(true);
        await page.screenshot({
          path: `artifacts/revision-movil/form-${view}-${clear ? 'clear' : 'active'}-${width}.png`,
          animations: 'disabled',
        });
        await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      }
    });

for (const width of [320, 430])
  test(`new member empty screens are readable at ${width}px`, async ({ page }) => {
    await setup(page, { width, empty: true });
    for (const view of [
      'home',
      'tasks',
      'commissions',
      'projects',
      'people',
      'profile',
      'alerts',
    ]) {
      await page.goto('/?view=' + view);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(
        page.locator(
          'img[src="/monkey.webp"], img[src*="/artwork/mascots/"], svg image[href*="/artwork/mascots/"]',
        ),
      ).toHaveCount(0);
      await expect(page.locator('.loading')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (view === 'home') {
        await expect(page.getByRole('heading', { name: 'Sin tareas asignadas' })).toBeVisible();
        await expect(page.locator('.clear-summary')).toHaveCount(0);
      }
      await page.screenshot({
        path: `artifacts/revision-movil/empty-${view}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
