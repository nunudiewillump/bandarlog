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
