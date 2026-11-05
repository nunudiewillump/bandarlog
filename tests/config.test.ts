import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../server/config';

test('production refuses incomplete settings, insecure Neon and URL paths before DB setup', () => {
  const valid = {
    NODE_ENV: 'production',
    APP_URL: 'https://bandarlog.example.org',
    DATABASE_URL: 'postgresql://example@db.neon.tech/db?sslmode=verify-full',
    SMTP_HOST: 'smtp.example.org',
    SMTP_USER: 'example',
    SMTP_PASS: 'test-only-placeholder',
    MAIL_FROM: 'Bandarlog <grupo@example.org>',
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
  assert.throws(() => validateEnvironment({ ...valid, SMTP_PASS: '' }), /SMTP_PASS/);
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

test('production accepts Resend with only its API key and authorized sender', () => {
  const resend = {
    NODE_ENV: 'production',
    APP_URL: 'https://bandarlog.app',
    DATABASE_URL: 'postgresql://example@db.neon.tech/db?sslmode=verify-full',
    AUTH_CHALLENGE_SECRET: 'test-only-auth-challenge-secret-at-least-32',
    MAIL_TRANSPORT: 'resend',
    MAIL_FROM: 'Bandarlog <notifications@bandarlog.app>',
    RESEND_API_KEY: 're_test-only-placeholder',
  };
  assert.equal(validateEnvironment(resend).production, true);
  assert.throws(() => validateEnvironment({ ...resend, RESEND_API_KEY: '' }), /RESEND_API_KEY/);
  assert.throws(() => validateEnvironment({ ...resend, MAIL_FROM: '' }), /MAIL_FROM/);
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
