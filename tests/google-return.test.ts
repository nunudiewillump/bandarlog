import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleReturnPage } from '../server/google-return';
import { validGoogleReturn, proofChallenge } from '../src/google-return';

test('handoff messages require the exact origin, popup and a bounded ticket', async () => {
  const popup = {} as Window;
  const ticket = 'a'.repeat(64);
  const event = {
    origin: 'https://bandarlog.app',
    source: popup,
    data: { type: 'bandarlog.google.return', ticket },
  };
  assert.equal(validGoogleReturn(event, popup, event.origin), ticket);
  assert.equal(
    validGoogleReturn({ ...event, origin: 'https://evil.example' }, popup, event.origin),
    null,
  );
  assert.equal(validGoogleReturn({ ...event, source: {} as Window }, popup, event.origin), null);
  assert.equal(
    validGoogleReturn(
      { ...event, data: { type: 'bandarlog.google.return', ticket: 'bad' } },
      popup,
      event.origin,
    ),
    null,
  );
  assert.equal(
    await proofChallenge('test'),
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  );
});
test('callback uses nonce CSP and an exact postMessage origin without URL credentials', () => {
  const page = googleReturnPage('https://bandarlog.app', 'b'.repeat(64));
  assert.match(page.csp, /default-src 'none'/);
  assert.match(page.csp, /script-src 'nonce-/);
  assert.match(page.html, /postMessage/);
  assert.match(page.html, /https:\/\/bandarlog.app/);
  assert.ok(!page.html.includes('location.href'));
  assert.ok(!page.html.includes('localStorage'));
  assert.throws(() => googleReturnPage('https://bandarlog.app', '</script>'));
});
