import { test, expect } from '@playwright/test';
import { renderTokenBridge, renderPublicForm, renderApprovalPage } from '../../server/public-site';
import { contentSecurityPolicy } from '../../server/http-security';
const csp = Object.entries(contentSecurityPolicy.directives)
  .map(([k, v]) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ' ' + v.join(' '))
  .join('; ');
for (const action of ['confirmar-grupo', 'aprobar-grupo'] as const) {
  test(`${action}: fragments travel only in POST bodies and review does not activate or approve`, async ({
    page,
    context,
    baseURL,
  }) => {
    const token = 'd'.repeat(64),
      requests: { url: string; method: string; body: string }[] = [];
    const path = '/' + action;
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (![path, path + '/revisar'].includes(url.pathname)) return route.continue();
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData() || '',
      });
      const html =
        request.method() === 'GET'
          ? renderTokenBridge(path as '/confirmar-grupo' | '/aprobar-grupo', baseURL!)
          : url.pathname.endsWith('/revisar')
            ? action === 'confirmar-grupo'
              ? renderPublicForm(path, baseURL!, 'Confirma para crear el grupo.', token)
              : renderApprovalPage(
                  baseURL!,
                  { groupName: 'Synthetic', name: 'Tester', email: 'tester@example.test' },
                  token,
                )
            : '<!doctype html><html><body><p>Confirmado por el usuario</p></body></html>';
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: {
          'Content-Security-Policy': csp,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
        body: html,
      });
    });
    await page.goto(path + '#token=' + token);
    const button = page.getByRole('button', {
      name: action === 'confirmar-grupo' ? 'Confirmar y crear mi grupo' : 'Aprobar solicitud',
    });
    await expect(button).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0].method).toBe('GET');
    expect(requests[1].method).toBe('POST');
    expect(new URLSearchParams(requests[1].body).get('token')).toBe(token);
    expect(requests.every((r) => !r.url.includes(token))).toBe(true);
    expect(page.url()).not.toContain(token);
    await button.click();
    await expect(page.getByText('Confirmado por el usuario')).toBeVisible();
    expect(requests).toHaveLength(3);
    expect(new URLSearchParams(requests[2].body).get('token')).toBe(token);
    if (action === 'aprobar-grupo')
      expect(new URLSearchParams(requests[2].body).get('decision')).toBe('approve');
  });
}
