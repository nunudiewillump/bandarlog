import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Independent process/storage: neither production nor the existing API/e2e fixture is used.
const origin = 'http://127.0.0.1:3199';
const base = origin + '/api';
type Auth = { cookie: string; csrf: string };
let server: ChildProcess | undefined;
let directory = '';
let admin: Auth;
async function request(path: string, method = 'GET', body?: unknown, auth?: Auth) {
  const response = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    body: type.includes('application/json') ? await response.json() : await response.text(),
    cookie: response.headers.get('set-cookie') || '',
  };
}
async function mailFor(email: string, subject: string) {
  const result = await request('/dev/mail');
  assert.equal(result.status, 200);
  const mail = result.body
    .filter((item: any) => item.email === email && item.subject.includes(subject))
    .at(-1);
  assert.ok(mail, `Expected isolated preview mail for ${subject}`);
  return mail;
}
async function session(cookie: string) {
  const auth = { cookie: cookie.split(';')[0], csrf: '' };
  const me = await request('/me', 'GET', undefined, auth);
  assert.equal(me.status, 200);
  auth.csrf = me.body.csrf;
  return { auth, user: me.body.user };
}
async function challenge(email: string) {
  const response = await request('/auth/code/request', 'POST', { email });
  assert.equal(response.status, 200);
  assert.equal(response.body.resendAfter, 60);
  assert.equal(response.body.expiresIn, 600);
  assert.equal(typeof response.body.challengeId, 'string');
  assert.ok(response.body.challengeId.length >= 20);
  assert.equal(response.body.code, undefined);
  const mail = await mailFor(email, 'código de acceso');
  const code = mail.body.match(/\b(\d{6})\b/)?.[1];
  assert.ok(code, 'Preview contains one-time code');
  return { response, code: code as string, id: response.body.challengeId as string };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bandarlog-forest-auth-'));
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3199',
      DATA_DIR: directory,
      APP_URL: origin,
      NODE_ENV: 'test',
      DATABASE_URL: '',
      MAIL_TRANSPORT: 'preview',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      GOOGLE_LOGIN_CLIENT_ID: '',
      GOOGLE_LOGIN_CLIENT_SECRET: '',
      AUTH_CHALLENGE_SECRET: 'test-only-forest-auth-secret-for-isolated-fixture',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout?.on('data', (data) => (logs += data));
  server.stderr?.on('data', (data) => (logs += data));
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      if ((await fetch(base + '/health')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 299) throw new Error(logs || 'Isolated auth API did not start');
  }
  assert.equal(
    (await request('/auth/request', 'POST', { email: 'alex@example.test' })).status,
    200,
  );
  const mail = await mailFor('alex@example.test', 'enlace');
  const token = mail.body.match(/token=([a-f0-9]+)/)?.[1];
  assert.ok(token);
  const login = await request('/auth/verify', 'POST', { token });
  assert.equal(login.status, 200);
  admin = (await session(login.cookie)).auth;
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server!.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('Google is optional and legacy users remain configured without repeat onboarding', async () => {
  const config = await request('/auth/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.googleEnabled, false);
  assert.equal(config.body.codeEnabled, true);
  assert.equal((await request('/auth/google/start')).status, 503);
  const me = await request('/me', 'GET', undefined, admin);
  assert.ok(me.body.user.onboardingCompletedAt);
  assert.equal(
    (await request('/onboarding', 'POST', { name: 'No CSRF' }, { cookie: admin.cookie, csrf: '' }))
      .status,
    403,
  );
});

test('a six-digit email code signs in within the app, is single use and creates a revocable long session', async () => {
  const c = await challenge('ana@example.test');
  const login = await request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/i);
  assert.match(login.cookie, /SameSite=Lax/i);
  const age = Number(login.cookie.match(/Max-Age=(\d+)/)?.[1]);
  assert.ok(age >= 2591990 && age <= 2592000, 'Cookie lasts approximately thirty days');
  assert.match(login.cookie.split(';')[0], /^bandarlog=[a-f0-9]{64}$/);
  const current = await session(login.cookie);
  assert.equal(current.user.email, 'ana@example.test');
  assert.equal(
    (await request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code })).status,
    400,
  );
  assert.equal((await request('/logout', 'POST', {}, current.auth)).status, 200);
  assert.equal((await request('/me', 'GET', undefined, current.auth)).status, 401);
});

test('unknown email receives the same challenge envelope but no mail and cannot create access', async () => {
  const email = 'unknown-forest@example.test';
  const result = await request('/auth/code/request', 'POST', { email });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), [
    'challengeId',
    'expiresIn',
    'message',
    'resendAfter',
  ]);
  const outbox = await request('/dev/mail');
  assert.equal(
    outbox.body.some((item: any) => item.email === email),
    false,
  );
  const verify = await request('/auth/code/verify', 'POST', {
    challengeId: result.body.challengeId,
    code: '000000',
  });
  assert.equal(verify.status, 400);
  assert.equal(verify.cookie, '');
  assert.equal(
    (await request('/auth/code/request', 'POST', { email: 'invalid-email' })).status,
    400,
  );
});

test('concurrent code submissions create exactly one session', async () => {
  const c = await challenge('miguel@example.test');
  const results = await Promise.all([
    request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code }),
    request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  assert.equal(results.filter((result) => result.cookie).length, 1);
});

test('five wrong guesses lock the challenge and a resend cooldown preserves the issued code', async () => {
  const c = await challenge('carlos@example.test');
  const wrong = c.code === '000000' ? '111111' : '000000';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await request('/auth/code/verify', 'POST', { challengeId: c.id, code: wrong });
    assert.equal(result.status, attempt < 5 ? 400 : 429);
    assert.equal(result.cookie, '');
  }
  assert.equal(
    (await request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code })).status,
    429,
  );
  const resend = await challenge('laura@example.test');
  assert.equal(
    (await request('/auth/code/request', 'POST', { email: 'laura@example.test' })).status,
    429,
  );
  assert.equal(
    (await request('/auth/code/verify', 'POST', { challengeId: resend.id, code: resend.code }))
      .status,
    200,
  );
});

test('an invited person accepts through code, chooses a required name once and retains only the invited scope', async () => {
  const email = 'invited-forest@example.test';
  const invite = await request(
    '/invitations',
    'POST',
    { commissionId: 'cocina', email, name: 'Invitada', role: 'scouter' },
    admin,
  );
  assert.equal(invite.status, 201);
  const c = await challenge(email);
  const login = await request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code });
  assert.equal(login.status, 200);
  const current = await session(login.cookie);
  assert.equal(current.user.onboardingCompletedAt, null);
  assert.equal(current.user.role, 'member');
  assert.equal((await request('/onboarding', 'POST', { name: '   ' }, current.auth)).status, 400);
  assert.equal(
    (await request('/onboarding', 'POST', { name: 'Nombre elegido' }, current.auth)).status,
    200,
  );
  const after = await request('/me', 'GET', undefined, current.auth);
  assert.equal(after.body.user.name, 'Nombre elegido');
  assert.ok(after.body.user.onboardingCompletedAt);
  assert.equal(after.body.user.avatarUrl, null);
  const repeated = await request('/me', 'GET', undefined, current.auth);
  assert.equal(repeated.body.user.onboardingCompletedAt, after.body.user.onboardingCompletedAt);
  const data = await request('/data', 'GET', undefined, current.auth);
  assert.ok(data.body.commissions.some((item: any) => item.id === 'cocina'));
  assert.ok(!data.body.commissions.some((item: any) => item.id === 'logistica'));
  assert.equal(
    (await request('/projects', 'POST', { name: 'No acceso', type: 'ronda' }, current.auth)).status,
    403,
  );
});

test('revoking an invitation after a code was issued prevents acceptance', async () => {
  const email = 'revoked-forest@example.test';
  const invited = await request(
    '/invitations',
    'POST',
    { commissionId: 'cocina', email, name: 'Revocada', role: 'scouter' },
    admin,
  );
  assert.equal(invited.status, 201);
  const c = await challenge(email);
  const data = await request('/data', 'GET', undefined, admin);
  const invitation = data.body.invitations.find((item: any) => item.email === email);
  assert.ok(invitation);
  assert.equal(
    (await request(`/invitations/${invitation.id}`, 'PATCH', { action: 'revoke' }, admin)).status,
    200,
  );
  const verify = await request('/auth/code/verify', 'POST', { challengeId: c.id, code: c.code });
  assert.equal(verify.status, 403);
  assert.equal(verify.cookie, '');
});
