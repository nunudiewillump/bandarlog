import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let server: ChildProcess, dir: string;
const base = 'http://127.0.0.1:3099/api';
let admin: { cookie: string; csrf: string }, member: { cookie: string; csrf: string };
async function request(path: string, method = 'GET', body?: unknown, auth = admin) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
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
async function login(email: string) {
  await request('/auth/request', 'POST', { email });
  const mails = await request('/dev/mail');
  const mail = mails.body
    .filter((m: any) => m.email === email && m.subject.includes('enlace'))
    .at(-1);
  const token = mail.body.match(/token=([a-f0-9]+)/)[1];
  const session = await request('/auth/verify', 'POST', { token });
  assert.equal(session.status, 200);
  const me = await request('/me', 'GET', undefined, { cookie: session.cookie, csrf: '' });
  return { cookie: session.cookie, csrf: me.body.csrf, token };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bandarlog-test-'));
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3099',
      DATA_DIR: dir,
      APP_URL: 'http://localhost:5173',
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'preview',
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
  member = await login('laura@example.test');
});
after(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});
test('login tokens are single use; unauthenticated and CSRF mutations are denied', async () => {
  const a = await login('ana@example.test');
  assert.equal((await request('/auth/verify', 'POST', { token: a.token })).status, 400);
  assert.equal((await request('/data', 'GET', undefined, { cookie: '', csrf: '' })).status, 401);
  assert.equal(
    (await request('/tasks', 'POST', {}, { cookie: admin.cookie, csrf: '' })).status,
    403,
  );
  assert.equal(
    (await request('/auth/request', 'POST', { email: 'unknown@example.test' })).status,
    200,
  );
});
test('commissions stay separated by project and enforce unique names within project', async () => {
  const c = await request('/commissions', 'POST', {
    name: 'Cocina',
    projectId: 'ronda',
    members: [{ userId: 'miguel', role: 'coordinator' }],
  });
  assert.equal(c.status, 201);
  assert.equal(
    (
      await request('/commissions', 'POST', {
        name: 'Cocina',
        projectId: 'camp',
        members: [{ userId: 'alex', role: 'coordinator' }],
      })
    ).status,
    409,
  );
  const data = await request('/data', 'GET', undefined, member);
  assert.ok(!data.body.commissions.some((x: any) => x.id === c.body.id));
  assert.equal(
    (await request(`/commissions/${c.body.id}/members`, 'POST', { userIds: ['laura'] }, member))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        '/projects',
        'POST',
        { name: 'No', type: 'ronda', starts: '2026-01-01', ends: '2027-01-01' },
        member,
      )
    ).status,
    403,
  );
});
test('task responsibility, blocking, completion, audit and membership removal stay consistent', async () => {
  const input = {
    title: 'Prueba de integración',
    commissionId: 'cocina',
    description: 'Validación funcional',
    due: new Date(Date.now() + 86400000).toISOString(),
    responsibleIds: ['alex', 'carlos'],
  };
  assert.equal((await request('/tasks', 'POST', { ...input, responsibleIds: [] })).status, 400);
  assert.equal(
    (await request('/tasks', 'POST', { ...input, responsibleIds: ['miguel'] })).status,
    400,
  );
  const created = await request('/tasks', 'POST', input);
  assert.equal(created.status, 201);
  const tid = created.body.id;
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { status: 'done' }, await login('ana@example.test')))
      .status,
    403,
  );
  assert.equal((await request(`/tasks/${tid}`, 'PATCH', { status: 'blocked' })).status, 400);
  assert.equal(
    (
      await request(`/tasks/${tid}`, 'PATCH', {
        status: 'blocked',
        blockedReason: 'Falta confirmar proveedor',
      })
    ).status,
    200,
  );
  assert.equal((await request(`/tasks/${tid}`, 'PATCH', { responsibleIds: [] })).status, 400);
  assert.equal((await request(`/commissions/cocina/members/carlos`, 'DELETE')).status, 409);
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        { status: 'done' },
        await login('carlos@example.test'),
      )
    ).status,
    200,
  );
  let data = (await request('/data')).body;
  const task = data.tasks.find((t: any) => t.id === tid);
  assert.equal(task.completedBy, 'carlos');
  assert.ok(task.completedAt);
  assert.ok(data.activity.filter((a: any) => a.taskId === tid).length >= 3);
  const get = await fetch(base + `/tasks/${tid}?action=pending`, {
    headers: { cookie: admin.cookie },
  });
  assert.equal(get.status, 404);
  data = (await request('/data')).body;
  assert.equal(data.tasks.find((t: any) => t.id === tid).status, 'done');
  assert.equal(
    (await request(`/tasks/${tid}/comments`, 'POST', { body: 'Listo para revisar.' })).status,
    201,
  );
});
test('invitations can be accepted, revoked, and reject reuse', async () => {
  const invite = await request('/invitations', 'POST', {
    commissionId: 'cocina',
    email: 'new@example.test',
    name: 'Nueva persona',
  });
  assert.equal(invite.status, 201);
  assert.equal(
    (
      await request('/invitations', 'POST', {
        commissionId: 'cocina',
        email: 'new@example.test',
        name: 'Duplicado',
      })
    ).status,
    409,
  );
  const newcomer = await login('new@example.test');
  const data = (await request('/data', 'GET', undefined, newcomer)).body;
  assert.equal(data.commissions.length, 1);
  assert.equal(data.commissions[0].id, 'cocina');
  assert.ok(data.invitations.length === 0);
  const revoked = await request('/invitations', 'POST', {
    commissionId: 'cocina',
    email: 'revoked@example.test',
    name: 'Revocada',
  });
  assert.equal(revoked.status, 201);
  const inv = (await request('/data')).body.invitations.find(
    (i: any) => i.email === 'revoked@example.test',
  );
  assert.equal(
    (await request(`/invitations/${inv.id}`, 'PATCH', { action: 'revoke' })).status,
    200,
  );
  await request('/auth/request', 'POST', { email: 'revoked@example.test' });
  const mails = (await request('/dev/mail')).body;
  assert.ok(
    !mails.some((m: any) => m.email === 'revoked@example.test' && m.subject.includes('enlace')),
  );
});

test('reminders deduplicate previews and preserve contextual links without sending', async () => {
  assert.equal((await request('/notifications/process', 'POST', {}, member)).status, 403);
  assert.equal((await request('/notifications/process', 'POST', {})).status, 200);
  const first = (await request('/dev/mail')).body;
  assert.ok(first.some((m: any) => m.subject.startsWith('Vencimiento:')));
  assert.ok(first.some((m: any) => m.subject.startsWith('Resumen semanal')));
  assert.ok(first.every((m: any) => m.status === 'preview'));
  await request('/notifications/process', 'POST', {});
  const second = (await request('/dev/mail')).body;
  assert.equal(second.length, first.length);
  const taskMail = second.find((m: any) => m.subject.startsWith('Vencimiento:'));
  assert.match(taskMail.body, /action=done/);
  await request('/auth/request', 'POST', {
    email: 'alex@example.test',
    task: 'task-0',
    action: 'done',
  });
  const loginMail = (await request('/dev/mail')).body
    .filter((m: any) => m.subject.includes('enlace'))
    .at(-1);
  assert.match(loginMail.body, /task=task-0/);
  assert.match(loginMail.body, /action=done/);
});

test('only administrators change global roles; coordinators can search people for their commission', async () => {
  assert.equal(
    (await request('/users/carlos/role', 'PATCH', { role: 'admin' }, member)).status,
    403,
  );
  assert.equal((await request('/users/alex/role', 'PATCH', { role: 'member' })).status, 400);
  assert.equal(
    (await request('/users/miguel/role', 'PATCH', { role: 'coordination' })).status,
    200,
  );
  assert.equal((await request('/users/miguel/role', 'PATCH', { role: 'member' })).status, 200);
  const directory = await request(
    '/directory?commissionId=cocina&q=miguel',
    'GET',
    undefined,
    member,
  );
  assert.equal(directory.status, 200);
  assert.equal(directory.body[0].email, 'miguel@example.test');
});
