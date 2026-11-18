// Loaded only by the synthetic delivery process. No real provider requests leave it.
import { createHash } from 'node:crypto';
import webpush from 'web-push';
if (process.env.SYNTHETIC_DELIVERY_OBSERVER !== '1' || !process.send)
  throw Error('The provider observer is restricted to the isolated IPC test process.');
const accepted = process.env.SYNTHETIC_PROVIDER_ACCEPT_RETRY === '1';
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url !== 'https://api.resend.com/emails' || request.method !== 'POST')
    throw Error('Unexpected outbound request in the isolated delivery fixture.');
  const payload = await request.json(),
    key = request.headers.get('idempotency-key') || '';
  const to = Array.isArray(payload.to) ? payload.to : [payload.to];
  const status = !accepted && to.includes('b-retry@example.test') ? 429 : 200;
  process.send!({
    type: 'provider.email',
    key,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    status,
  });
  return status === 429
    ? Response.json(
        { name: 'rate_limit_exceeded', message: 'Synthetic retry', statusCode: 429 },
        { status, headers: { 'retry-after': '300' } },
      )
    : Response.json({
        id: 'synthetic-' + createHash('sha256').update(key).digest('hex').slice(0, 24),
      });
};
webpush.sendNotification = async (subscription, payload) => {
  const status = !accepted && subscription.endpoint.endsWith('/a-retry') ? 503 : 201;
  process.send!({
    type: 'provider.push',
    endpoint: subscription.endpoint,
    payload: JSON.parse(String(payload)),
    status,
  });
  if (status !== 201)
    throw Object.assign(new Error('Synthetic push retry'), { statusCode: status });
  return { statusCode: status, headers: {}, body: '' };
};
