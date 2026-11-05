import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailTransport } from '../server/mail';
const config = {
  MAIL_TRANSPORT: 'gmail_api',
  GMAIL_CLIENT_ID: 'test-client',
  GMAIL_CLIENT_SECRET: 'test-only-placeholder',
  GMAIL_REFRESH_TOKEN: 'test-refresh-placeholder',
};
test('Gmail HTTPS composes MIME, refreshes OAuth once and confirms message IDs', async () => {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const mock = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/token'))
      return Response.json({ access_token: 'test-access-placeholder', expires_in: 3600 });
    return Response.json({ id: 'message-confirmed' });
  }) as typeof fetch;
  const transport = createMailTransport(config, mock)!;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await transport.sendMail({
          from: 'Bandarlog <grupo@example.org>',
          to: 'persona@example.test',
          subject: 'Tu comisión · tarea',
          text: 'Mensaje de prueba',
          html: '<h1>Bandarlog</h1><p>Mensaje de prueba</p>',
          headers: { 'Message-ID': '<stable@example.test>' },
        })
      ).messageId,
      'message-confirmed',
    );
  assert.equal(calls.filter((c) => c.url.endsWith('/token')).length, 1);
  const sent = calls.find((c) => c.url.endsWith('/messages/send'))!;
  assert.equal(sent.options?.method, 'POST');
  const mime = Buffer.from(JSON.parse(String(sent.options?.body)).raw, 'base64url').toString();
  assert.match(mime, /To: persona@example.test/);
  assert.match(mime, /Message-ID: <stable@example.test>/);
  assert.match(mime, /Mensaje de prueba/);
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /<h1>Bandarlog<\/h1>/);
});
test('Gmail failures propagate without exposing provider responses or credentials', async () => {
  const mock = (async () =>
    new Response('sensitive-provider-body', { status: 401 })) as typeof fetch;
  const transport = createMailTransport(config, mock)!;
  await assert.rejects(
    () => transport.sendMail({ to: 'persona@example.test', text: 'test' }),
    (e) =>
      e instanceof Error &&
      e.message.includes('401') &&
      !e.message.includes('sensitive-provider-body'),
  );
  assert.equal(createMailTransport({ MAIL_TRANSPORT: 'preview' }), null);
});

test('Resend sends the existing text/HTML templates with an idempotency key', async () => {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const mock = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    return Response.json({ id: 'resend-message-id' });
  }) as typeof fetch;
  const transport = createMailTransport(
    { MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test-only-placeholder' },
    mock,
  )!;
  const message = {
    from: 'Bandarlog <notifications@bandarlog.app>',
    to: 'persona@example.test',
    subject: 'Tu comisión · tarea',
    text: 'Mensaje de prueba',
    html: '<h1>Bandarlog</h1><p>Mensaje de prueba</p>',
    headers: { 'Message-ID': '<550e8400-e29b-41d4-a716-446655440000@bandarlog.local>' },
  };
  assert.equal((await transport.sendMail(message)).messageId, 'resend-message-id');
  assert.equal((await transport.sendMail(message)).messageId, 'resend-message-id');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, 'https://api.resend.com/emails');
    assert.equal(call.options?.method, 'POST');
    assert.equal(
      (call.options?.headers as Record<string, string>)['Idempotency-Key'],
      'bandarlog-notification/550e8400-e29b-41d4-a716-446655440000',
    );
    assert.equal(
      (call.options?.headers as Record<string, string>).Authorization,
      'Bearer re_test-only-placeholder',
    );
    assert.deepEqual(JSON.parse(String(call.options?.body)), {
      from: 'Bandarlog <notifications@bandarlog.app>',
      to: ['persona@example.test'],
      subject: 'Tu comisión · tarea',
      text: 'Mensaje de prueba',
      html: '<h1>Bandarlog</h1><p>Mensaje de prueba</p>',
    });
  }
});

test('Resend does not reuse an idempotency key for independent messages', async () => {
  const calls: RequestInit[] = [];
  const mock = (async (_url: string | URL | Request, options?: RequestInit) => {
    calls.push(options!);
    return Response.json({ id: 'resend-message-id' });
  }) as typeof fetch;
  const transport = createMailTransport(
    { MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test-only-placeholder' },
    mock,
  )!;
  await transport.sendMail({
    from: 'Bandarlog <notifications@bandarlog.app>',
    to: 'persona@example.test',
    subject: 'Código de acceso',
    text: 'Tu código',
  });
  assert.equal((calls[0].headers as Record<string, string>)['Idempotency-Key'], undefined);
});

test('Resend requires credentials and hides provider response bodies on failures', async () => {
  assert.throws(() => createMailTransport({ MAIL_TRANSPORT: 'resend' }), /RESEND_API_KEY/);
  const mock = (async () =>
    new Response('provider-secret-details', { status: 403 })) as typeof fetch;
  const transport = createMailTransport(
    { MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test-only-placeholder' },
    mock,
  )!;
  await assert.rejects(
    () =>
      transport.sendMail({
        from: 'Bandarlog <notifications@bandarlog.app>',
        to: 'persona@example.test',
        subject: 'Test',
        text: 'Test',
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes('403') &&
      !error.message.includes('provider-secret-details') &&
      !error.message.includes('re_test-only-placeholder'),
  );
  const noId = createMailTransport(
    { MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test-only-placeholder' },
    (async () => Response.json({ status: 'accepted' })) as typeof fetch,
  )!;
  await assert.rejects(
    () =>
      noId.sendMail({
        from: 'Bandarlog <notifications@bandarlog.app>',
        to: 'persona@example.test',
        subject: 'Test',
        text: 'Test',
      }),
    /identificador/,
  );
});
