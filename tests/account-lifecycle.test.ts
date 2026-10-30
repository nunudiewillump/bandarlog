import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let server: ChildProcess, dir: string;
const base = 'http://127.0.0.1:3107/api';
let admin: { cookie: string; csrf: string };
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  auth = admin,
  mutation?: string,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(mutation ? { 'X-Mutation-ID': mutation } : {}),
      ...(auth ? { cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
const sessionCache = new Map<string, { cookie: string; csrf: string; token: string }>();
async function login(email: string) {
  const cached = sessionCache.get(email);
  if (cached) return cached;
  await request('/auth/request', 'POST', { email });
  const mails = await request('/dev/mail');
  const mail = mails.body
    .filter((m: any) => m.email === email && m.subject.includes('enlace'))
    .at(-1);
  const token = mail.body.match(/token=([a-f0-9]+)/)[1];
  const session = await request('/auth/verify', 'POST', { token });
  assert.equal(session.status, 200);
  const me = await request('/me', 'GET', undefined, { cookie: session.cookie, csrf: '' });
  const result = { cookie: session.cookie, csrf: me.body.csrf, token };
  sessionCache.set(email, result);
  return result;
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bandarlog-test-'));
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3107',
      DATA_DIR: dir,
      APP_URL: 'http://localhost:5173',
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'preview',
      ARTWORK_WORKER_URL: '',
      ARTWORK_WORKER_TOKEN: '',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout?.on('data', (x) => (logs += x));
  server.stderr?.on('data', (x) => (logs += x));
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(base + '/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 299) throw new Error(logs);
  }
  admin = await login('alex@example.test');
});
after(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function bugReviewUser(label: string) {
  const email = `bug-review-${label}@example.test`;
  assert.equal((await request('/invitations', 'POST', { email })).status, 201);
  const auth = await login(email);
  const user = (await request('/data')).body.users.find((u: any) => u.email === email);
  return { ...user, auth };
}

test('bug review: deleted commissions do not block account removal but live pending tasks do', async () => {
  const target = await bugReviewUser('historical-tasks');
  const commissions: string[] = [];
  for (const name of ['Historial eliminado', 'Trabajo vigente']) {
    const created = await request('/commissions', 'POST', {
      name,
      projectId: 'camp',
      members: [{ userId: target.id, role: 'scouter' }],
    });
    assert.equal(created.status, 201);
    commissions.push(created.body.id);
  }
  const tasks: string[] = [];
  for (const commissionId of commissions) {
    const created = await request('/tasks', 'POST', {
      title: 'Pendiente de la revisión',
      commissionId,
      due: '2028-06-01T21:59:59Z',
      responsibleIds: [target.id],
    });
    assert.equal(created.status, 201);
    tasks.push(created.body.id);
  }
  assert.equal((await request(`/commissions/${commissions[0]}`, 'DELETE')).status, 200);
  const data = (await request('/data')).body;
  assert.ok(!data.commissions.some((c: any) => c.id === commissions[0]));
  assert.ok(!data.tasks.some((t: any) => t.id === tasks[0]));
  assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 409);
  assert.equal((await request(`/tasks/${tasks[1]}`, 'PATCH', { status: 'done' })).status, 200);
  assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 200);
  assert.equal((await request('/me', 'GET', undefined, target.auth)).status, 401);
  const history = (await request('/data')).body;
  assert.ok(history.tasks.some((t: any) => t.id === tasks[1] && t.status === 'done'));
  assert.ok(history.assignments.some((a: any) => a.taskId === tasks[1] && a.userId === target.id));
  assert.equal(
    (await request(`/tasks/${tasks[1]}`, 'PATCH', { title: 'Historial editable' })).status,
    200,
  );
  assert.equal((await request(`/tasks/${tasks[1]}`, 'PATCH', { status: 'pending' })).status, 409);
  assert.equal(
    (await request(`/commissions/${commissions[1]}/members`, 'POST', { userIds: ['alex'] })).status,
    200,
  );
  assert.equal(
    (await request(`/tasks/${tasks[1]}`, 'PATCH', { status: 'pending', responsibleIds: ['alex'] }))
      .status,
    200,
  );
});

test('bug review: weekly summaries exclude disabled administrators and coordinators', async () => {
  const removed = [];
  for (const role of ['admin', 'coordination']) {
    const target = await bugReviewUser(`removed-${role}`);
    assert.equal((await request(`/users/${target.id}/role`, 'PATCH', { role })).status, 200);
    assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 200);
    removed.push(target);
  }
  assert.equal((await request('/notifications/process', 'POST', {})).status, 200);
  const weekly = (await request('/dev/mail')).body.filter((m: any) =>
    m.subject.startsWith('Resumen semanal'),
  );
  assert.ok(weekly.some((m: any) => m.email === 'alex@example.test'));
  for (const target of removed) {
    assert.ok(!weekly.some((m: any) => m.email === target.email), target.email);
    assert.equal((await request('/me', 'GET', undefined, target.auth)).status, 401);
  }
});

test('bug review: weekly summaries respect the general and weekly switches independently', async () => {
  const target = await bugReviewUser('weekly-preferences');
  assert.equal(
    (await request(`/users/${target.id}/role`, 'PATCH', { role: 'coordination' })).status,
    200,
  );
  for (const settings of [
    { notifications: false, weekly: true },
    { notifications: true, weekly: false },
  ]) {
    assert.equal((await request('/profile', 'PATCH', settings, target.auth)).status, 200);
    assert.equal((await request('/notifications/process', 'POST', {})).status, 200);
    assert.ok(
      !(await request('/dev/mail')).body.some(
        (m: any) => m.email === target.email && m.subject.startsWith('Resumen semanal'),
      ),
    );
  }
  assert.equal(
    (await request('/profile', 'PATCH', { notifications: true, weekly: true }, target.auth)).status,
    200,
  );
  await request('/notifications/process', 'POST', {});
  const first = (await request('/dev/mail')).body.filter(
    (m: any) => m.email === target.email && m.subject.startsWith('Resumen semanal'),
  );
  assert.ok(first.length > 0);
  await request('/notifications/process', 'POST', {});
  const second = (await request('/dev/mail')).body.filter(
    (m: any) => m.email === target.email && m.subject.startsWith('Resumen semanal'),
  );
  assert.equal(second.length, first.length);
});

test('bug review: re-inviting a removed manager never restores their former global privileges', async () => {
  const target = await bugReviewUser('reinvited-manager');
  assert.equal((await request(`/users/${target.id}/role`, 'PATCH', { role: 'admin' })).status, 200);
  assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 200);
  assert.equal(
    (
      await request('/invitations', 'POST', {
        commissionId: 'cocina',
        email: target.email,
        role: 'responsible',
      })
    ).status,
    201,
  );
  const invitation = (await request('/dev/mail')).body
    .filter(
      (m: any) =>
        m.email === target.email &&
        m.subject === 'Te invitan a Bandarlog' &&
        m.body.includes('invite.'),
    )
    .at(-1);
  const token = new URL(invitation.body.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  const accepted = await request('/auth/verify', 'POST', { token });
  assert.equal(accepted.status, 200);
  const me = await request('/me', 'GET', undefined, { cookie: accepted.cookie, csrf: '' });
  assert.equal(me.body.user.role, 'member');
  const auth = { cookie: accepted.cookie, csrf: me.body.csrf };
  assert.equal(
    (
      await request(
        '/projects',
        'POST',
        { name: 'No permitido', starts: '2028-01-01', ends: '2028-12-31' },
        auth,
      )
    ).status,
    403,
  );
  const data = (await request('/data')).body;
  assert.ok(
    data.members.some(
      (m: any) => m.userId === target.id && m.commissionId === 'cocina' && m.role === 'responsible',
    ),
  );
  assert.equal((await request('/me', 'GET', undefined, target.auth)).status, 401);
});

test('bug review: changing roles of disabled accounts is rejected', async () => {
  const target = await bugReviewUser('disabled-role');
  assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/users/${target.id}/role`, 'PATCH', { role: 'admin' })).status, 404);
  const user = (await request('/data')).body.users.find((u: any) => u.id === target.id);
  assert.ok(user.disabledAt);
  assert.equal(user.role, 'member');
});
