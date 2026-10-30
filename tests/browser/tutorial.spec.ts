import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mobileFixture } from '../fixtures/mobile';
import { emptyTutorial, type TutorialProgress } from '../../shared/tutorial';
import { advanceTutorial, summarizeTutorial } from '../../server/tutorial';
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page, email = 'ana@example.test') {
  if (sessions.has(email)) {
    await page.context().addCookies(sessions.get(email)!);
    return;
  }
  await page.request.post('/api/auth/request', { data: { email } });
  const mail = (await page.request.get('/api/dev/mail').then((r) => r.json()))
    .filter((m: any) => m.email === email && m.body.includes('token='))
    .at(-1);
  const response = await page.request.post('/api/auth/verify', {
    data: { token: mail.body.match(/token=([a-f0-9]+)/)[1] },
  });
  expect(response.ok()).toBeTruthy();
  sessions.set(email, await page.context().cookies());
}
async function fixture(page: Page, { role = 'member', onboarded = true } = {}) {
  const state = mobileFixture();
  state.user.role = role;
  state.user.onboardingCompletedAt = onboarded ? '2026-10-28T00:00:00Z' : null;
  let progress = emptyTutorial();
  const calls: { path: string; body: any }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'POST') calls.push({ path, body: request.postDataJSON() });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/me')
      return route.fulfill({
        json: { user: state.user, csrf: 'tutorial-fixture', development: false },
      });
    if (path === '/api/data') return route.fulfill({ json: state.summary() });
    if (path === '/api/tutorial' && request.method() === 'GET')
      return route.fulfill({ json: progress });
    if (path === '/api/tutorial') {
      const command = request.postDataJSON();
      const result = advanceTutorial(progress, command);
      progress = result.progress;
      return route.fulfill({ json: result });
    }
    if (path === '/api/tutorial/stats')
      return route.fulfill({ json: summarizeTutorial([progress]) });
    if (path === '/api/onboarding') {
      state.user.name = request.postDataJSON().name;
      state.user.onboardingCompletedAt = new Date().toISOString();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'No disponible en esta prueba' } });
  });
  return {
    state,
    calls,
    progress: () => progress,
    setProgress: (next: TutorialProgress) => {
      progress = next;
    },
  };
}
async function replay(page: Page) {
  await page
    .locator('.bottom-nav:visible')
    .getByRole('button', { name: 'Perfil', exact: true })
    .click();
  await page.locator('.profile-help > summary').click();
  await page.getByRole('button', { name: 'Repetir tutorial', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
}

test('existing user discovers the real persisted tutorial at 320px, with no real task mutations or stored update text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 950 });
  await login(page);
  const mutations: { path: string; body: any }[] = [];
  page.on('request', (r) => {
    if (!['GET', 'HEAD'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/'))
      mutations.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  const before = await page.request.get('/api/data').then((r) => r.json());
  await page.goto('/');
  const invitation = page.getByRole('region', { name: 'Tu primera misión', exact: true });
  await expect(invitation).toBeVisible();
  await invitation.scrollIntoViewIfNeeded();
  await expect(invitation.getByRole('button', { name: 'Empezar', exact: true })).toBeEnabled();
  await mkdir('artifacts/tutorial', { recursive: true });
  await page.screenshot({ path: 'artifacts/tutorial/invitation-320.png' });
  await invitation.getByRole('button', { name: 'Empezar', exact: true }).click();
  const mission = page.getByRole('region', { name: 'Tu primera misión', exact: true });
  await expect(
    page.getByRole('heading', { name: 'Preparar la mochila de la patrulla', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/tutorial/mission-top-320.png' });
  await page
    .getByRole('checkbox', { name: 'Completar paso: Comprobar la cantimplora', exact: true })
    .check();
  await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Completar paso: Comprobar la cantimplora', exact: true }),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
  const privateText = 'PRIVATE-PRACTICE-DO-NOT-STORE';
  await page.getByLabel('Publicar una actualización', { exact: true }).fill(privateText);
  await mission.getByRole('button', { name: 'Publicar actualización', exact: true }).click();
  await expect(mission.locator('.activity-list')).toContainText(privateText);
  await page.getByRole('button', { name: 'Marcar en curso', exact: true }).click();
  await expect(mission.locator('.badge')).toHaveText('En curso');
  await page.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.locator('.tutorial-celebration')).toContainText('¡Ya estás listo!');
  await expect(page.locator('.task-celebration')).toHaveCount(0);
  const celebration = await page.locator('.tutorial-celebration').boundingBox(),
    nav = await page.locator('.bottom-nav').boundingBox();
  expect(celebration!.y + celebration!.height).toBeLessThan(nav!.y);
  await page.getByRole('button', { name: 'Cerrar celebración', exact: true }).click();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(mission.locator('.badge')).toHaveText('En curso');
  await page.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(mission.locator('.badge')).toHaveText('Terminada');
  await expect(page.locator('.tutorial-celebration')).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a Inicio', exact: true }).click();
  await expect(page.locator('.tutorial-invite')).toHaveCount(0);
  await replay(page);
  await page.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(mission.locator('.badge')).toHaveText('Terminada');
  await expect(page.locator('.tutorial-celebration')).toHaveCount(0);
  expect(mutations.every((r) => r.path === '/api/tutorial')).toBe(true);
  expect(JSON.stringify(mutations)).not.toContain(privateText);
  const persisted = await page.request.get('/api/tutorial').then((r) => r.json());
  expect(JSON.stringify(persisted)).not.toContain(privateText);
  expect(persisted.events.tutorial_completed).toBeTruthy();
  expect(persisted.events.tutorial_undo_used).toBeTruthy();
  expect(await page.request.get('/api/data').then((r) => r.json())).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('artifacts/tutorial', { recursive: true });
  await page.screenshot({ path: 'artifacts/tutorial/mission-320.png' });
});

test('onboarding precedes discovery, omission persists and replay is in Profile Help', async ({
  page,
}) => {
  const mock = await fixture(page, { onboarded: false });
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '¿Cómo te llamamos?', exact: true }),
  ).toBeVisible();
  expect(mock.calls.filter((r) => r.path === '/api/tutorial')).toHaveLength(0);
  await page.getByLabel('Nombre', { exact: true }).fill('Scouter de prueba');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.tutorial-invite')).toBeVisible();
  await expect(page.locator('.tutorial-mission')).toHaveCount(0);
  await expect(
    page.locator('.tutorial-invite').getByRole('button', { name: 'Omitir', exact: true }),
  ).toBeEnabled();
  await page
    .locator('.tutorial-invite')
    .getByRole('button', { name: 'Omitir', exact: true })
    .click();
  await expect(page.locator('.tutorial-invite')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.mobile-focus')).toBeVisible();
  await expect(page.locator('.tutorial-invite')).toHaveCount(0);
  await replay(page);
  await expect(page.locator('.tutorial-mission')).toBeVisible();
  expect(mock.progress().events.tutorial_started).toBeTruthy();
  expect(mock.progress().events.tutorial_reopened).toBeTruthy();
  expect(mock.calls.some((r) => r.path.startsWith('/api/tasks'))).toBe(false);
});

test('first shown is gated by visibility and is not duplicated by reloads', async ({ page }) => {
  const mock = await fixture(page);
  await page.addInitScript(() => {
    const Native = window.IntersectionObserver;
    window.IntersectionObserver = class extends Native {
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        this.callback = callback;
      }
      observe(target: Element) {
        if (target.classList.contains('tutorial-invite'))
          (window as any).revealTutorial = () =>
            this.callback(
              [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
              this,
            );
        else super.observe(target);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.tutorial-invite')).toBeVisible();
  expect(mock.calls.filter((r) => r.body.action === 'shown')).toHaveLength(0);
  await page.evaluate(() => (window as any).revealTutorial());
  await expect.poll(() => mock.calls.filter((r) => r.body.action === 'shown').length).toBe(1);
  await page.reload();
  await expect(page.locator('.tutorial-invite')).toBeVisible();
  expect(mock.calls.filter((r) => r.body.action === 'shown')).toHaveLength(1);
});

for (const reduced of [false, true])
  test(`completion without checklist or update celebrates once and permits immediate exit (reduced=${reduced})`, async ({
    page,
  }) => {
    const mock = await fixture(page);
    await page.setViewportSize({ width: reduced ? 390 : 1440, height: 950 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto('/?view=tutorial');
    await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Completar', exact: true }).click();
    const celebration = page.locator('.tutorial-celebration');
    await expect(celebration).toBeVisible();
    await expect(celebration).toContainText('Tu primera misión está completada');
    await expect(celebration.locator('.tutorial-note')).toHaveCount(3);
    await expect(celebration.locator('.tutorial-note').first()).toHaveCSS(
      'animation-name',
      reduced ? 'none' : 'tutorial-notes',
    );
    await expect(celebration.locator('img')).toHaveCSS(
      'animation-name',
      reduced ? 'none' : 'tutorial-trumpet',
    );
    expect(
      await celebration
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
    expect(mock.progress().events.tutorial_checklist_used).toBeUndefined();
    expect(mock.progress().events.tutorial_update_published).toBeUndefined();
    await mkdir('artifacts/tutorial', { recursive: true });
    await page.screenshot({
      path: `artifacts/tutorial/celebration-${reduced ? 'reduced-mobile' : 'desktop'}.png`,
    });
    await celebration.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.locator('.tutorial-celebration')).toHaveCount(0);
    await expect(page.locator('.tutorial-invite')).toHaveCount(0);
  });

for (const role of ['member', 'coordination', 'admin'])
  test(`tutorial statistics are discoverable only for admin (role=${role})`, async ({ page }) => {
    await fixture(page, { role });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/?view=profile');
    await page.locator('.profile-help > summary').click();
    await expect(page.getByRole('button', { name: 'Repetir tutorial', exact: true })).toBeVisible();
    const summary = page.locator('.tutorial-stats > summary');
    await expect(summary).toHaveCount(role === 'admin' ? 1 : 0);
    if (role === 'admin') {
      await summary.click();
      await expect(page.locator('.tutorial-stats')).toContainText('Usuarios a los que se mostró');
      await expect(page.locator('.tutorial-stats')).toContainText('Nunca iniciado ni omitido');
      await mkdir('artifacts/tutorial', { recursive: true });
      await page.screenshot({ path: 'artifacts/tutorial/admin-stats-1440.png' });
    }
  });

test('a tutorial deep link cannot open or act on a real task supplied in URL parameters', async ({
  page,
}) => {
  const mock = await fixture(page);
  const real = mock.state.data.tasks[0];
  await page.goto(`/?view=tutorial&task=${real.id}&action=done`);
  await expect(page.getByRole('button', { name: 'Completar', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: 'Detalle de tarea', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Completar', exact: true }).click();
  await expect(page.locator('.tutorial-celebration')).toBeVisible();
  expect(mock.calls.every((call) => call.path === '/api/tutorial')).toBe(true);
  expect(real.status).not.toBe('done');
});
