import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Resend } from 'resend';
import { createMailTransport } from '../server/mail';
import { MailDeliveryError, mailFailure, type ResendSend } from '../server/resend-mail';
import { renderMail } from '../server/mail-template';
import { resendTemplateDefinition, resendVariables } from '../server/resend-template';
import { validateEnvironment } from '../server/config';

const env = {
  MAIL_TRANSPORT: 'resend',
  RESEND_API_KEY: 're_test_only_not_a_real_key',
  RESEND_TEMPLATE_ID: 'bandarlog-transactional-v1',
  MAIL_FROM: 'Bandarlog <avisos@example.test>',
};
const message = {
  to: 'delivered@example.test',
  subject: 'Acceso a Bandarlog',
  text: 'Tu código de acceso: 123456',
  html: renderMail({
    title: 'Acceso a Bandarlog',
    body: 'Tu código de acceso: 123456',
    appUrl: 'https://bandarlog.example.test',
  }),
  idempotencyKey: 'bandarlog-notification/test-row',
};

test('official SDK sends a published template over HTTP with a stable idempotency header', async () => {
  const calls: { key: string | undefined; body: any }[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/emails');
    assert.equal(req.headers.authorization, 'Bearer ' + env.RESEND_API_KEY);
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ key: req.headers['idempotency-key'] as string, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'provider-message-1' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const sdk = new Resend(env.RESEND_API_KEY, { baseUrl: 'http://127.0.0.1:' + port });
    const transport = createMailTransport(
      { ...env, MAIL_REPLY_TO: 'soporte@example.test' },
      undefined,
      sdk.emails.send.bind(sdk.emails),
    )!;
    for (let i = 0; i < 2; i++)
      assert.equal((await transport.sendMail(message)).messageId, 'provider-message-1');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1], 'retries must send identical payloads and keys');
    assert.equal(calls[0].key, message.idempotencyKey);
    assert.equal(calls[0].body.from, env.MAIL_FROM);
    assert.equal(calls[0].body.reply_to, 'soporte@example.test');
    assert.equal(calls[0].body.template.id, env.RESEND_TEMPLATE_ID);
    assert.equal(Object.keys(calls[0].body.template.variables).length, 50);
    assert.equal(calls[0].body.html, undefined);
    assert.equal(calls[0].body.text, undefined);
    assert.equal(JSON.stringify(calls[0].body).includes('idempotencyKey'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('hosted template reproduces branded content, Unicode and text without truncation', () => {
  const text = '🍌 Bosque & equipo '.repeat(550);
  const html = renderMail({
    title: 'Revisión <equipo>',
    body: text,
    appUrl: 'https://bandarlog.example.test',
    actions: [
      { label: 'Ver tarea', url: 'https://bandarlog.example.test/tarea/1' },
      ...(['in_progress', 'blocked', 'done'] as const).map((kind) => ({
        label: kind,
        kind,
        url: 'https://bandarlog.example.test/tarea/1?action=' + kind,
      })),
    ],
  });
  const template = resendTemplateDefinition('https://bandarlog.example.test');
  const vars = resendVariables('Revisión <equipo>', text, html)!;
  const htmlRendered = template.html.replace(/\{\{\{([A-Z_0-9]+)\}\}\}/g, (_, key) => vars[key]);
  assert.equal(htmlRendered, html.replace(/<!--bandarlog-(main|note):(start|end)-->/g, ''));
  assert.equal(
    template.text.replace(/\{\{\{([A-Z_0-9]+)\}\}\}/g, (_, key) => vars[key]),
    text,
  );
  assert.equal(template.variables.length, 50);
  assert.equal(new Set(template.variables.map((v) => v.key)).size, 50);
  for (const value of Object.values(vars)) {
    assert.ok(value.length <= 2000);
    assert.equal(/[\uD800-\uDBFF]$/.test(value), false);
  }
  assert.match(htmlRendered, /monkey-wave-2d.png/);
  assert.match(htmlRendered, /mail-grass.png/);
  assert.equal((htmlRendered.match(/data-mail-action=/g) || []).length, 3);
});

test('legacy and oversized messages keep their full HTML snapshot', async () => {
  const captured: any[] = [];
  const sender: ResendSend = async (payload) => {
    captured.push(payload);
    return { data: { id: 'legacy' }, error: null, headers: null };
  };
  const transport = createMailTransport(env, undefined, sender)!;
  await createMailTransport({ ...env, RESEND_TEMPLATE_ID: '' }, undefined, sender)!.sendMail({
    ...message,
    headers: { 'Message-ID': '<old@bandarlog.local>' },
  });
  const inline = captured.pop();
  assert.equal(inline.headers, undefined, 'preserve the inline payload used before SDK migration');
  assert.equal(
    inline.html,
    message.html,
    'existing deployments work without template configuration',
  );
  const legacy = '<h1>Correo ya en cola</h1>';
  await transport.sendMail({ ...message, html: legacy });
  const large = message.html.replace(
    /(?<=<!--bandarlog-main:start-->)[\s\S]*(?=<!--bandarlog-main:end-->)/,
    'x'.repeat(80001),
  );
  await transport.sendMail({ ...message, html: large });
  assert.equal(captured[0].html, legacy);
  assert.equal(captured[1].html, large);
  assert.equal(captured[0].text, message.text);
  assert.equal(captured[0].template, undefined);
  let calls = 0;
  await assert.rejects(
    () =>
      createMailTransport(env, undefined, async () => {
        calls++;
        return sender({} as any);
      })!.sendMail({ ...message, idempotencyKey: undefined }),
    MailDeliveryError,
  );
  assert.equal(calls, 0);
});

test('provider failures are sanitized, terminal errors stop and transient errors respect backoff', async () => {
  const clock = Date.parse('2026-11-05T12:00:00Z');
  for (const [status, retryable] of [
    [401, false],
    [422, false],
    [429, true],
    [500, true],
  ] as const) {
    const transport = createMailTransport(env, undefined, async () => ({
      data: null,
      error: {
        name: status === 429 ? 'rate_limit_exceeded' : 'validation_error',
        statusCode: status,
        message: 'sensitive-provider-body',
      },
      headers: { 'retry-after': '120' },
    }))!;
    await assert.rejects(
      () => transport.sendMail(message),
      (error) => {
        assert.ok(error instanceof MailDeliveryError);
        assert.equal(error.retryable, retryable);
        assert.equal(error.message.includes('sensitive-provider-body'), false);
        const result = mailFailure(error, 1, clock);
        assert.equal(result.status, retryable ? 'pending' : 'failed');
        assert.equal(result.nextAttemptAt, retryable ? '2026-11-05T12:02:00.000Z' : null);
        return true;
      },
    );
  }
  assert.equal(
    mailFailure(new MailDeliveryError(true), 2, clock).nextAttemptAt,
    '2026-11-05T12:00:30.000Z',
  );
  assert.equal(mailFailure(new MailDeliveryError(true), 5, clock).status, 'failed');
  const network = createMailTransport(env, undefined, async () => {
    throw new Error('private');
  })!;
  await assert.rejects(
    () => network.sendMail(message),
    (error) =>
      error instanceof MailDeliveryError && error.retryable && !error.message.includes('private'),
  );
  const ambiguous = createMailTransport(
    env,
    undefined,
    async () =>
      ({
        data: null,
        error: null,
        headers: null,
      }) as any,
  )!;
  await assert.rejects(() => ambiguous.sendMail(message), MailDeliveryError);
});

test('Resend production validates all its settings and preserves explicit transport selection', () => {
  const valid = {
    ...env,
    NODE_ENV: 'production',
    APP_URL: 'https://bandarlog.example.test',
    DATABASE_URL: 'postgresql://test@db.neon.tech/test?sslmode=verify-full',
    AUTH_CHALLENGE_SECRET: 'test-only-stable-secret-at-least-32-characters',
    SMTP_PORT: 'unused-legacy-value',
  };
  assert.equal(validateEnvironment(valid).production, true);
  for (const key of ['RESEND_API_KEY', 'MAIL_FROM'])
    assert.throws(() => validateEnvironment({ ...valid, [key]: '' }), new RegExp(key));
  assert.equal(
    createMailTransport({ RESEND_API_KEY: env.RESEND_API_KEY }),
    null,
    'a setup key must never enable delivery on its own',
  );
  assert.equal(createMailTransport({ ...env, MAIL_TRANSPORT: 'preview' }), null);
});
