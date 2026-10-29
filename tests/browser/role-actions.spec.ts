import { test, expect } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';
for (const role of ['scouter', 'responsible', 'coordination', 'admin']) {
  test(`${role}: forbidden actions are absent and commission/task scope is respected`, async ({
    page,
  }) => {
    const fixture = mobileFixture(5),
      data = fixture.summary();
    fixture.user.role = ['admin', 'coordination'].includes(role) ? role : 'member';
    const user = fixture.user;
    data.users = data.users.map((u) => (u.id === user.id ? user : u));
    const cid = data.commissions[0].id,
      other = data.commissions[1].id;
    data.members.forEach((m) => {
      if (m.userId === user.id)
        m.role = role === 'responsible' && m.commissionId === cid ? 'responsible' : 'scouter';
    });
    const tasks = data.tasks.filter((t) => t.commissionId === cid).slice(0, 2);
    tasks.forEach((t) => {
      t.status = 'pending';
    });
    data.assignments = data.assignments.filter((a) => !tasks.some((t) => t.id === a.taskId));
    data.assignments.push({ id: 'mine', taskId: tasks[0].id, userId: user.id });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/health') return route.fulfill({ json: { ok: true } });
      if (path === '/api/me')
        return route.fulfill({ json: { user, csrf: 'roles-test', development: false } });
      if (path === '/api/data') return route.fulfill({ json: data });
      return route.fulfill({ status: 404, json: { error: 'No mutation expected.' } });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/?view=people');
    await expect(page.getByRole('button', { name: 'Invitar personas', exact: true })).toHaveCount(
      role === 'admin' ? 1 : 0,
    );
    const deletion = page.locator('.person-removal');
    if (role === 'admin') await expect(deletion.first()).toBeVisible();
    else await expect(deletion).toHaveCount(0);
    await expect(
      page.locator('.sidebar nav').getByRole('button', { name: 'Proyectos', exact: true }),
    ).toHaveCount(1);
    await page.goto(
      `/?view=commission&commission=${cid}&project=${data.commissions[0].projectId}&task=${tasks[1].id}`,
    );
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.detail-heading')).toBeVisible();
    const manages = role !== 'scouter';
    await expect(dialog.getByRole('button', { name: 'Completar', exact: true })).toHaveCount(
      manages ? 1 : 0,
    );
    await expect(
      dialog.getByRole('button', { name: 'Ajustes de la tarea', exact: true }),
    ).toHaveCount(manages ? 1 : 0);
    if (manages)
      await dialog.getByRole('button', { name: 'Ajustes de la tarea', exact: true }).click();
    await expect(dialog.locator('.reassign')).toHaveCount(manages ? 1 : 0);
    if (role === 'scouter') {
      await page.goto(`/?task=${tasks[0].id}`);
      await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Completar', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('dialog').locator('.reassign')).toHaveCount(0);
    }
    if (role === 'responsible') {
      const otherTask = data.tasks.find(
        (t) =>
          t.commissionId === other &&
          !data.assignments.some((a) => a.taskId === t.id && a.userId === user.id),
      )!;
      await page.goto(`/?task=${otherTask.id}`);
      await expect(page.getByRole('dialog').locator('.reassign')).toHaveCount(0);
      await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Completar', exact: true }),
      ).toHaveCount(0);
    }
  });
}
