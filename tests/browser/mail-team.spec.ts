import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { renderMail } from '../../server/mail-template';
import { mobileFixture } from '../fixtures/mobile';

for (const width of [320, 1440])
  test(`mail icons remain in one row below Ver tarea at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.setContent(
      renderMail({
        title: 'Nueva tarea',
        body: 'Revisar el material del campamento.',
        appUrl: 'http://127.0.0.1:5174',
        actions: [
          { label: 'Ver tarea', url: 'http://127.0.0.1:5174/?task=1' },
          {
            label: 'Marcar en curso',
            kind: 'in_progress',
            url: 'http://127.0.0.1:5174/?task=1&action=in_progress',
          },
          {
            label: 'Completar tarea',
            kind: 'done',
            url: 'http://127.0.0.1:5174/?task=1&action=done',
          },
          {
            label: 'Bloquear tarea',
            kind: 'blocked',
            url: 'http://127.0.0.1:5174/?task=1&action=blocked',
          },
        ],
      }),
    );
    const actions = page.locator('[data-mail-action]');
    await expect(actions).toHaveCount(3);
    const boxes = await actions.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    const view = await page.getByRole('link', { name: 'Ver tarea', exact: true }).boundingBox();
    expect(boxes[0].y).toBeGreaterThan(view!.y + view!.height);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const [kind, color] of [
      ['in_progress', 'rgb(39, 108, 174)'],
      ['blocked', 'rgb(247, 201, 72)'],
      ['done', 'rgb(18, 77, 56)'],
    ])
      await expect(page.locator(`[data-mail-action="${kind}"]`)).toHaveCSS(
        'background-color',
        color,
      );
    const grass = page.locator('img[src$="/mail-grass.png"]');
    expect((await grass.boundingBox())!.y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    expect(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await mkdir('artifacts/mail-team', { recursive: true });
    await page.screenshot({ path: `artifacts/mail-team/email-${width}.png` });
  });

for (const width of [320, 1440])
  for (const [pending, tone] of [
    [3, 'green'],
    [6, 'yellow'],
    [10, 'red'],
  ] as const)
    test(`personal zero stays personal and team ${pending}/10 is ${tone} at ${width}px`, async ({
      page,
    }) => {
      const fixture = mobileFixture();
      fixture.user.onboardingCompletedAt = '2026-10-28T00:00:00Z';
      const own = new Set(
        fixture.data.assignments.filter((a) => a.userId === fixture.user.id).map((a) => a.taskId),
      );
      const others = fixture.data.tasks.filter((t) => !own.has(t.id)).slice(0, 10);
      const ids = new Set(others.map((t) => t.id));
      fixture.data.tasks = fixture.data.tasks.filter((t) => own.has(t.id) || ids.has(t.id));
      for (const task of fixture.data.tasks) task.status = 'done';
      for (const task of others.slice(0, pending)) task.status = 'pending';
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/health') return route.fulfill({ json: { ok: true } });
        if (path === '/api/me')
          return route.fulfill({
            json: { user: fixture.user, csrf: 'fixture', development: false },
          });
        if (path === '/api/data') return route.fulfill({ json: fixture.data });
        return route.fulfill({ status: 404, json: { error: 'No disponible' } });
      });
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Tareas del equipo/ })).toBeVisible();
      const count = page.locator('.team-task-count:visible');
      await expect(count).toHaveAttribute('data-pending', String(pending));
      await expect(count).toHaveAttribute('data-total', '10');
      await expect(count).toHaveClass(new RegExp(`\\b${tone}\\b`));
      if (width === 320) {
        const personal = page
          .locator('.mobile-focus .focus-counts > span')
          .filter({ hasText: 'Por completar' })
          .locator('.animated-counter');
        await expect(personal).toHaveAttribute('data-value', '0');
        await expect(page.locator('.mobile-focus').getByRole('checkbox')).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await mkdir('artifacts/mail-team', { recursive: true });
      await page.screenshot({ path: `artifacts/mail-team/team-${tone}-${width}.png` });
    });
