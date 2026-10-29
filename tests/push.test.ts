import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPushEndpoint } from '../server/push';
test('push accepts browser providers and rejects local, credentialed and lookalike endpoints', () => {
  for (const url of [
    'https://fcm.googleapis.com/fcm/send/example',
    'https://web.push.apple.com/Qexample',
    'https://updates.push.services.mozilla.com/wpush/v2/example',
  ])
    assert.equal(validPushEndpoint(url), true, url);
  for (const url of [
    'http://127.0.0.1/',
    'https://localhost/',
    'https://fcm.googleapis.com.evil.test/',
    'https://user@fcm.googleapis.com/',
    'https://fcm.googleapis.com:444/',
  ])
    assert.equal(validPushEndpoint(url), false, url);
});
