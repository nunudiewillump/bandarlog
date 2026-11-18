import { component } from '../server/components';
import { generateKeyPairSync } from 'node:crypto';
const dispatch = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../server/config';

test('production refuses incomplete settings, insecure Neon and URL paths before DB setup', () => {
  const valid = {
    NODE_ENV: 'production',
    APP_COMPONENT: 'identity',
    GROUP_CONTEXT_SECRET: '42'.repeat(32),
    DISPATCH_PUBLIC_KEY: dispatch.publicKey,
    DELIVERY_URL: 'http://localhost:3125',
    DELIVERY_WAKE_TOKEN: 'synthetic-token-with-at-least-32-characters',
    APP_URL: 'https://bandarlog.example.org',
    DATABASE_URL: 'postgresql://example@db.neon.tech/db?sslmode=verify-full',
    AUTH_CHALLENGE_SECRET: 'test-only-auth-challenge-secret-at-least-32',
  };
  assert.equal(validateEnvironment(valid).production, true);
  assert.throws(
    () => validateEnvironment({ ...valid, AUTH_CHALLENGE_SECRET: '' }),
    /AUTH_CHALLENGE_SECRET/,
  );
  assert.throws(
    () => validateEnvironment({ ...valid, AUTH_CHALLENGE_SECRET: 'too-short' }),
    /AUTH_CHALLENGE_SECRET/,
  );
  assert.throws(
    () => validateEnvironment({ ...valid, GOOGLE_LOGIN_CLIENT_ID: 'test-client' }),
    /GOOGLE_LOGIN_CLIENT_SECRET/,
  );
  assert.throws(() => validateEnvironment({ ...valid, SMTP_PASS: 'forbidden' }), /SMTP_PASS/);
  assert.throws(
    () =>
      validateEnvironment({
        ...valid,
        DATABASE_URL: valid.DATABASE_URL.replace('verify-full', 'disable'),
      }),
    /sslmode=verify-full/,
  );
  assert.throws(
    () => validateEnvironment({ ...valid, APP_URL: 'http://bandarlog.example.org' }),
    /HTTPS/,
  );
  assert.throws(
    () => validateEnvironment({ ...valid, APP_URL: valid.APP_URL + '/ruta' }),
    /sin ruta/,
  );
  assert.throws(() => validateEnvironment({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.equal(validateEnvironment({}).production, false);
});

test('only the delivery component accepts provider credentials; HTTP needs none', () => {
  const common = {
    NODE_ENV: 'production',
    APP_URL: 'https://bandarlog.app',
    DATABASE_URL: 'postgresql://example@db.neon.tech/db?sslmode=verify-full',
    DELIVERY_WAKE_TOKEN: 'synthetic-token-with-at-least-32-characters',
  };
  const delivery = {
    ...common,
    APP_COMPONENT: 'delivery',
    GROUP_CONTEXT_SECRET: '42'.repeat(32),
    DISPATCH_PRIVATE_KEYS: JSON.stringify({ primary: dispatch.privateKey }),
    DISPATCH_PUBLIC_KEY: dispatch.publicKey,
    MAIL_TRANSPORT: 'resend',
    MAIL_FROM: 'Bandarlog <notifications@bandarlog.app>',
    RESEND_API_KEY: 're_synthetic-only',
  };
  assert.equal(validateEnvironment(delivery).production, true);
  assert.throws(() => validateEnvironment({ ...delivery, RESEND_API_KEY: '' }), /RESEND_API_KEY/);
  assert.throws(() => validateEnvironment({ ...delivery, MAIL_FROM: '' }), /MAIL_FROM/);
  const http = {
    ...common,
    APP_COMPONENT: 'http',
    DISPATCH_PUBLIC_KEY: dispatch.publicKey,
    DELIVERY_URL: 'http://localhost:3125',
    IDENTITY_URL: 'http://localhost:3124',
  };
  assert.equal(validateEnvironment(http).production, true);
  for (const name of [
    'GROUP_CONTEXT_SECRET',
    'AUTH_CHALLENGE_SECRET',
    'GOOGLE_LOGIN_CLIENT_SECRET',
    'RESEND_API_KEY',
    'SMTP_PASS',
    'DISPATCH_PRIVATE_KEYS',
  ])
    assert.throws(() => validateEnvironment({ ...http, [name]: 'forbidden' }), new RegExp(name));
  assert.throws(
    () => validateEnvironment({ ...http, IDENTITY_URL: 'https://attacker.example' }),
    /IDENTITY_URL/,
  );
  assert.throws(() => validateEnvironment({ ...http, APP_COMPONENT: 'development' }), /integrado/);
});

test('bandarlog.app uses the legacy Railway origin only as an explicit migration alias', () => {
  const config = validateEnvironment({ APP_URL: 'https://bandarlog.app' });
  assert.deepEqual(config.legacyOrigins, ['https://bandarlog-production.up.railway.app']);
  assert.deepEqual(
    validateEnvironment({ APP_URL: 'https://bandarlog.app', LEGACY_APP_ORIGINS: '' }).legacyOrigins,
    [],
  );
  assert.deepEqual(validateEnvironment({}).legacyOrigins, []);
  for (const origin of [
    'http://old.example',
    'https://old.example/path',
    'https://user@old.example',
    'https://bandarlog.app',
  ])
    assert.throws(
      () => validateEnvironment({ APP_URL: 'https://bandarlog.app', LEGACY_APP_ORIGINS: origin }),
      /LEGACY_APP_ORIGINS/,
    );
});

test('a remote database without an explicit environment never silently starts the integrated development runtime', () => {
  assert.equal(
    component({ DATABASE_URL: 'postgresql://synthetic@db.neon.tech/synthetic' }),
    'http',
  );
  assert.throws(
    () => validateEnvironment({ DATABASE_URL: 'postgresql://synthetic@db.neon.tech/synthetic' }),
    /NODE_ENV/,
  );
  assert.equal(
    component({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic@localhost/synthetic' }),
    'development',
  );
  assert.equal(component({}), 'development');
});
