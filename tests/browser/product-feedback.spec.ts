import { expect, test } from '@playwright/test';
import { mobileFixture } from '../fixtures/mobile';

test('voluntary feedback from Perfil reaches the authorized platform inbox', async ({ page }) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  const feedbackId = '5917fb55-ee3f-48e9-979c-5207dbf50868';
  let submission: Record<string, string> | undefined;
  let status = 'new';
  const csrf = 'a'.repeat(64);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'fixture', productFeedbackEnabled: true },
      });
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/product-feedback') {
      submission = request.postDataJSON();
      return route.fulfill({ status: 201, json: { id: feedbackId } });
    }
    if (path === '/api/platform/me')
      return route.fulfill({
        json: { name: 'Administración', csrf, productFeedbackEnabled: true },
      });
    if (path === '/api/platform/feedback')
      return route.fulfill({
        json: {
          items: [
            {
              id: feedbackId,
              ...submission,
              status,
              revision: 1,
              createdAt: '2026-11-26T10:00:00Z',
            },
          ],
          nextCursor: '',
        },
      });
    if (path === '/api/platform/feedback/' + feedbackId) {
      expect(request.headers()['x-csrf-token']).toBe(csrf);
      status = request.postDataJSON().status;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/?view=profile');
  await page.getByText('Ayúdanos a mejorar', { exact: true }).click();
  await page.getByLabel('Tipo de aportación').selectOption('idea');
  await page.getByLabel('Tu aportación').fill('Una mejora para el grupo.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText('Gracias. Tu aportación se ha enviado.')).toBeVisible();
  expect(submission).toEqual({ category: 'idea', body: 'Una mejora para el grupo.' });
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.goto('/plataforma#feedback');
  await expect(page.getByText('Una mejora para el grupo.')).toBeVisible();
  await page.getByLabel('Cambiar estado de aportación').selectOption('resolved');
  await expect.poll(() => status).toBe('resolved');
  await expect(page.getByLabel('Cambiar estado de aportación')).toHaveValue('resolved');
});
