import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  codeVerifier,
  equalSecret,
  googleEmailAuthoritative,
  verifyGoogleToken,
  sessionDeadline,
  SESSION_IDLE,
} from '../server/auth-security';

test('short codes are keyed and bound to challenge and recipient', () => {
  const digest = codeVerifier(
    'test-secret-not-for-production',
    'challenge-a',
    'member@example.test',
    '123456',
  );
  assert.equal(digest.length, 64);
  assert.notEqual(
    digest,
    codeVerifier('another-secret', 'challenge-a', 'member@example.test', '123456'),
  );
  assert.notEqual(
    digest,
    codeVerifier('test-secret-not-for-production', 'challenge-b', 'member@example.test', '123456'),
  );
  assert.notEqual(
    digest,
    codeVerifier('test-secret-not-for-production', 'challenge-a', 'another@example.test', '123456'),
  );
  assert.equal(equalSecret(digest, digest), true);
  assert.equal(equalSecret(digest, 'short'), false);
});

test('Google ID tokens require signature, issuer, audience, expiry and the browser nonce', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'test-google-key',
    use: 'sig',
    alg: 'RS256',
  };
  const time = Date.now();
  const claims = {
    iss: 'https://accounts.google.com',
    aud: 'client-test',
    sub: 'google-stable-user',
    email: 'member@gmail.com',
    email_verified: true,
    nonce: 'browser-specific-nonce',
    iat: Math.floor(time / 1000),
    exp: Math.floor(time / 1000) + 3600,
  };
  function token(change: Record<string, unknown> = {}, key = privateKey, alg = 'RS256') {
    const data =
      Buffer.from(JSON.stringify({ alg, kid: 'test-google-key' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ ...claims, ...change })).toString('base64url');
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
  }
  const valid = verifyGoogleToken(token(), [jwk], 'client-test', claims.nonce, time);
  assert.equal(valid.sub, claims.sub);
  for (const bad of [
    token({}, other.privateKey),
    token({ iss: 'https://attacker.example.test' }),
    token({ aud: 'other-client' }),
    token({ exp: Math.floor(time / 1000) - 1 }),
    token({ nonce: 'different-browser' }),
    token({ email_verified: false }),
    token({ aud: ['client-test', 'other-client'] }),
    token({}, privateKey, 'none'),
  ])
    assert.throws(() => verifyGoogleToken(bad, [jwk], 'client-test', claims.nonce, time));
  assert.throws(() => verifyGoogleToken(token(), [], 'client-test', claims.nonce, time));
  assert.equal(
    verifyGoogleToken(
      token({ aud: ['client-test', 'other-client'], azp: 'client-test' }),
      [jwk],
      'client-test',
      claims.nonce,
      time,
    ).sub,
    claims.sub,
  );
});

test('verified external Google email still needs proof of ownership and session renewal respects absolute expiry', () => {
  assert.equal(googleEmailAuthoritative({ email: 'member@gmail.com', email_verified: true }), true);
  assert.equal(
    googleEmailAuthoritative({
      email: 'member@troop.example.test',
      email_verified: true,
      hd: 'troop.example.test',
    }),
    true,
  );
  assert.equal(
    googleEmailAuthoritative({ email: 'member@troop.example.test', email_verified: true }),
    false,
  );
  assert.equal(
    googleEmailAuthoritative({
      email: 'member@troop.example.test',
      email_verified: true,
      hd: 'another.example.test',
    }),
    false,
  );
  const time = Date.now();
  assert.equal(
    +new Date(sessionDeadline(new Date(time + 60000).toISOString(), time)),
    time + 60000,
  );
  assert.equal(
    +new Date(sessionDeadline(new Date(time + 90 * 86400000).toISOString(), time)),
    time + SESSION_IDLE,
  );
});
