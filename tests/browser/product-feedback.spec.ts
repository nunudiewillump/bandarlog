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
    if (path === '/api/platform/feedback' && new URL(request.url()).searchParams.get('cursor'))
      return route.fulfill({ json: {
        insights: [], nextCursor: '',
        items: [{ id: 'older', category: 'idea', body: 'Mejora anterior', status: 'new',
          revision: 1, replyEmail: 'contacto@example.test', createdAt: '2026-11-20T10:00:00Z' }],
      } });
    if (path === '/api/platform/feedback')
      return route.fulfill({
        json: {
          insights: [
            {
              day: '2026-11-26',
              category: 'idea',
              total: 1,
              pending: status === 'resolved' ? 0 : 1,
            },
          ],
          items: [
            {
              id: feedbackId,
              ...submission,
              status,
              revision: 1,
              createdAt: '2026-11-26T10:00:00Z',
            },
          ],
          nextCursor: feedbackId,
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
  await expect(page.getByRole('heading', { name: 'Bandeja de feedback' })).toBeVisible();
  const search = page.getByLabel('Buscar texto o correo en esta página');
  await search.fill('texto inexistente');
  await expect(page.getByText('0 de 1 aportaciones en esta página')).toBeVisible();
  await search.fill('MEJORA');
  await expect(page.getByText('Una mejora para el grupo.')).toBeVisible();
  await page.getByLabel('Categoría en esta página').selectOption('bug');
  await expect(page.getByText('Sin resultados')).toBeVisible();
  await page.getByLabel('Categoría en esta página').selectOption('idea');
  await page.getByRole('button', { name: 'Métricas y campañas' }).click();
  await expect(page.getByRole('heading', { name: 'Métricas y campañas' })).toBeVisible();
  await page.getByRole('button', { name: 'Bandeja', exact: true }).click();
  await expect(search).toHaveValue('MEJORA');
  await page.getByLabel('Cambiar estado de aportación').selectOption('resolved');
  await expect.poll(() => status).toBe('resolved');
  await expect(page.getByLabel('Cambiar estado de aportación')).toHaveValue('resolved');
  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Mejora anterior')).toBeVisible();
  await expect(page.getByRole('link', { name: 'contacto@example.test' }))
    .toHaveAttribute('href', 'mailto:contacto@example.test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(search).toHaveValue('MEJORA');
  await expect(page.getByText('Una mejora para el grupo.')).toBeVisible();
});

test('an optional follow-up survey opens from Inicio and sends explicit ratings', async ({
  page,
}) => {
  const fixture = mobileFixture(1);
  fixture.user.onboardingCompletedAt = '2026-01-01T00:00:00Z';
  let submitted: unknown;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: { user: fixture.user, csrf: 'fixture', productCampaignsEnabled: true },
      });
    if (path === '/api/data') return route.fulfill({ json: fixture.summary() });
    if (path === '/api/tutorial')
      return route.fulfill({ json: { events: { tutorial_skipped: '2026-01-01T00:00:00Z' } } });
    if (path === '/api/product-survey') {
      const command = request.postDataJSON();
      if (command.action === 'offer')
        return route.fulfill({
          json: { id: '5917fb55-ee3f-48e9-979c-5207dbf50868', campaign: 'F03', version: 1 },
        });
      submitted = command;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/acceso');
  await expect(page.locator('.home-notices > .home-notice').filter({
    has: page.getByRole('button', { name: 'Dar mi opinión' }),
  })).toBeVisible();
  await page.getByRole('button', { name: 'Dar mi opinión' }).click();
  const survey = page.getByRole('region', { name: '¿Cómo te está funcionando Bandarlog?' });
  const scales = survey.getByRole('combobox');
  await expect(scales).toHaveCount(7);
  await expect(scales.first()).toHaveValue('');
  for (const rating of await scales.all()) await rating.selectOption('3');
  await scales.last().selectOption('9');
  await survey.getByRole('button', { name: 'Enviar opinión' }).click();
  await expect(page.getByText('Gracias por compartir tu opinión.')).toBeVisible();
  expect(submitted).toMatchObject({
    action: 'submit',
    answers: { scores: [3, 3, 3, 3, 3, 3], nps: 9 },
  });
});

test('platform administration previews and versions a campaign and reads privacy-filtered trends', async ({
  page,
}) => {
  const csrf = 'b'.repeat(64);
  const campaign = 'C-' + 'a'.repeat(32);
  let published: any;
  await page.route('**/api/platform/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/me'))
      return route.fulfill({
        json: { name: 'Administración', csrf, productFeedbackEnabled: true },
      });
    if (path.endsWith('/feedback'))
      return route.fulfill({ json: { campaigns: [], insights: [], items: [] } });
    if (path.endsWith('/campaign-library')) {
      if (request.method() === 'POST') {
        expect(request.headers()['x-csrf-token']).toBe(csrf);
        published = request.postDataJSON();
        return route.fulfill({ json: { campaign, version: 1 } });
      }
      return route.fulfill({
        json: published
          ? [
              {
                campaign,
                version: 1,
                versions: [1],
                paused: false,
                configuration: {
                  ...published.configuration,
                  questions: [{ id: 'q1', label: published.configuration.questions[0] }],
                },
              },
            ]
          : [],
      });
    }
    if (path.endsWith('/insights/segments'))
      return route.fulfill({
        json: [
          {
            campaign: 'F03',
            version: 1,
            segment: '2026-11-16',
            invited: 24,
            completed: 12,
            dismissed: 0,
            nps: 0,
          },
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/plataforma#feedback');
  await page.getByRole('button', { name: 'Métricas y campañas' }).click();
  await page.getByText('Gestionar campañas').click();
  await page.getByLabel('Título', { exact: true }).fill('Experiencia de noviembre');
  await page.getByLabel('Primer día (hora de Madrid)').fill('2030-11-20');
  await page.getByLabel('Último día (hora de Madrid)').fill('2030-11-25');
  await page.getByLabel('Destinatarios').selectOption('management');
  await page.getByLabel('Preguntas (una por línea)').fill('¿Cómo valoras el flujo?');
  await page.getByLabel('Opciones de campaña').selectOption('preview');
  await expect(page.getByRole('heading', { name: 'Experiencia de noviembre' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear campaña' }).click();
  await expect(page.getByText('Versión 1 publicada.')).toBeVisible();
  expect(published.configuration).toMatchObject({
    audience: 'management',
    questions: ['¿Cómo valoras el flujo?'],
  });
  await page.getByLabel('Opciones de campaña').selectOption('duplicate');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Experiencia de noviembre (copia)');
  await expect(page.getByLabel('Primer día (hora de Madrid)')).toHaveValue('');
  await expect(page.getByLabel('Último día (hora de Madrid)')).toHaveValue('');
  await expect(page.getByLabel('Destinatarios')).toHaveValue('management');
  await expect(page.getByLabel('Preguntas (una por línea)')).toHaveValue('¿Cómo valoras el flujo?');
  expect(published.configuration.title).toBe('Experiencia de noviembre');
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.getByText('Evolución y segmentos').click();
  await page.getByLabel('Dimensión').selectOption('week');
  await expect(page.getByRole('row').filter({ hasText: '2026-11-16' })).toContainText('50 %');
});
