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
      PORT: '3099',
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

test('Scouter sees commission tasks but only acts on assignments; Responsible manages all tasks and deletes with audit', async () => {
  const scouter = await login('ana@example.test');
  const responsible = await login('laura@example.test');
  const coordination = await login('miguel@example.test');
  const create = {
    title: 'Tarea para probar roles',
    commissionId: 'cocina',
    description: 'Comprobación de permisos',
    due: '2027-06-01T12:00:00+02:00',
    responsibleIds: ['carlos'],
  };
  const made = await request('/tasks', 'POST', create, responsible);
  assert.equal(made.status, 201);
  const tid = made.body.id;
  const visible = (await request('/data', 'GET', undefined, scouter)).body;
  assert.ok(visible.tasks.some((t: any) => t.id === tid));
  assert.equal(
    visible.members.find((m: any) => m.userId === 'ana' && m.commissionId === 'cocina').role,
    'scouter',
  );
  assert.equal(
    visible.members.find((m: any) => m.userId === 'laura' && m.commissionId === 'cocina').role,
    'responsible',
  );
  assert.equal((await request('/tasks', 'POST', create, scouter)).status, 403);
  assert.equal((await request(`/tasks/${tid}`, 'PATCH', { status: 'done' }, scouter)).status, 403);
  assert.equal(
    (await request(`/tasks/${tid}/comments`, 'POST', { body: 'No asignada' }, scouter)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        { due: '2027-06-02T12:00:00+02:00' },
        await login('carlos@example.test'),
      )
    ).status,
    403,
  );
  assert.equal((await request(`/tasks/${tid}`, 'DELETE', undefined, scouter)).status, 403);
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { due: '2027-06-02T12:00:00+02:00' }, responsible))
      .status,
    200,
  );
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        { status: 'blocked', blockedReason: 'Esperando transporte' },
        responsible,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request('/users/miguel/role', 'PATCH', { role: 'coordination' })).status,
    200,
  );
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { status: 'done' }, coordination)).status,
    200,
  );
  assert.equal((await request(`/tasks/${tid}`, 'DELETE', undefined, responsible)).status, 200);
  assert.ok(!(await request('/data')).body.tasks.some((t: any) => t.id === tid));
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { status: 'pending' }, responsible)).status,
    404,
  );
  assert.equal(
    (await request(`/tasks/${tid}/comments`, 'POST', { body: 'Eliminada' }, responsible)).status,
    404,
  );
});

test('individual and bulk invitations work from People, reject invalid recipients, and preserve commission roles', async () => {
  const responsible = await login('laura@example.test');
  const scouter = await login('ana@example.test');
  assert.equal(
    (await request('/invitations', 'POST', { emails: ['forbidden@example.test'] }, responsible))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        '/invitations',
        'POST',
        { commissionId: 'cocina', emails: ['forbidden@example.test'] },
        scouter,
      )
    ).status,
    403,
  );
  const group = await request('/invitations', 'POST', {
    emails: ['group@example.test', 'GROUP@example.test', 'second@example.test'],
  });
  assert.equal(group.status, 201);
  assert.equal(group.body.created.length, 2);
  assert.equal(
    (await request('/invitations', 'POST', { emails: ['ok@example.test', 'invalid-address'] }))
      .status,
    400,
  );
  assert.ok(
    !(await request('/data')).body.invitations.some((i: any) => i.email === 'ok@example.test'),
  );
  const repeat = await request('/invitations', 'POST', {
    emails: ['group@example.test', 'alex@example.test'],
  });
  assert.equal(repeat.body.created.length, 0);
  assert.equal(repeat.body.skipped.length, 2);
  const memberInvite = await request(
    '/invitations',
    'POST',
    { commissionId: 'cocina', emails: ['new-responsible@example.test'], role: 'responsible' },
    responsible,
  );
  assert.equal(memberInvite.status, 201);
  const newcomer = await login('new-responsible@example.test');
  const data = (await request('/data', 'GET', undefined, newcomer)).body;
  const person = data.users.find((u: any) => u.email === 'new-responsible@example.test');
  assert.equal(person.role, 'member');
  assert.equal(data.members.find((m: any) => m.userId === person.id).role, 'responsible');
  assert.equal(
    (
      await request(
        '/tasks',
        'POST',
        {
          title: 'Creada por nuevo Responsable',
          commissionId: 'cocina',
          due: '2027-07-01T12:00:00Z',
          responsibleIds: [person.id],
        },
        newcomer,
      )
    ).status,
    201,
  );
  const invited = await login('group@example.test');
  const groupData = (await request('/data', 'GET', undefined, invited)).body;
  assert.equal(groupData.commissions.length, 0);
  const all = (await request('/data')).body;
  assert.ok(all.users.some((u: any) => u.email === 'group@example.test'));
  const second = all.invitations.find((i: any) => i.email === 'second@example.test');
  assert.equal(
    (await request(`/invitations/${second.id}`, 'PATCH', { action: 'revoke' }, responsible)).status,
    403,
  );
  assert.equal(
    (await request(`/invitations/${second.id}`, 'PATCH', { action: 'revoke' })).status,
    200,
  );
});

test('all queued emails include branded HTML and tasks have safe contextual action buttons', async () => {
  const messages = (await request('/dev/mail')).body;
  assert.ok(messages.length > 0);
  assert.ok(
    messages.every(
      (m: any) =>
        m.html.includes('Bandarlog') && m.html.includes('#124d38') && m.html.includes('#faf8f2'),
    ),
  );
  const taskMail = messages.find((m: any) => m.subject.includes('Nueva asignación'));
  assert.match(taskMail.html, /Completar tarea/);
  assert.match(taskMail.html, /action=done/);
  assert.match(taskMail.html, /se confirman en Bandarlog/);
});

test('project invitations stay in their project and do not grant access to its commissions', async () => {
  assert.equal(
    (
      await request('/projects/camp/invitations', 'POST', {
        projectId: 'ronda',
        emails: ['wrong-project@example.test'],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/commissions/cocina/invitations', 'POST', {
        commissionId: 'salud',
        emails: ['wrong-commission@example.test'],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        '/projects/camp/invitations',
        'POST',
        { emails: ['project-guest@example.test'] },
        member,
      )
    ).status,
    403,
  );
  const invite = await request('/projects/camp/invitations', 'POST', {
    emails: ['project-guest@example.test'],
  });
  assert.equal(invite.status, 201);
  const guest = await login('project-guest@example.test');
  const data = (await request('/data', 'GET', undefined, guest)).body;
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].id, 'camp');
  assert.equal(data.commissions.length, 0);
  assert.ok(data.projectMembers.some((m: any) => m.projectId === 'camp'));
  assert.equal(
    (await request('/projects/ronda/members', 'POST', { userIds: ['ana'] })).status,
    200,
  );
  const all = (await request('/data')).body;
  assert.ok(all.projectMembers.some((m: any) => m.projectId === 'ronda' && m.userId === 'ana'));
});

test('profile saves name, safe photos and reminder preferences without resetting omitted fields', async () => {
  const photo = await (
    await import('sharp')
  )
    .default({ create: { width: 32, height: 32, channels: 3, background: '#21865c' } })
    .png()
    .toBuffer();
  const avatar = 'data:image/png;base64,' + photo.toString('base64');
  assert.equal(
    (
      await request('/profile', 'PATCH', {
        name: 'Álex de prueba',
        avatarUrl: avatar,
        reminderDays: [10, 2],
        creation: false,
        onDue: false,
        overdueWeekly: false,
      })
    ).status,
    200,
  );
  let profile = (await request('/me')).body.user;
  assert.ok(profile.avatarUrl.startsWith('data:image/webp;base64,'));
  assert.equal(profile.name, 'Álex de prueba');
  assert.deepEqual(JSON.parse(profile.preferences).reminderDays, [10, 2]);
  assert.equal((await request('/profile', 'PATCH', { name: 'Álex actualizado' })).status, 200);
  profile = (await request('/me')).body.user;
  assert.deepEqual(JSON.parse(profile.preferences).reminderDays, [10, 2]);
  assert.equal(JSON.parse(profile.preferences).creation, false);
  assert.equal(
    (
      await request('/profile', 'PATCH', {
        name: 'Álex',
        avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/profile', 'PATCH', { name: 'Álex', reminderDays: [-1] })).status,
    400,
  );
  assert.equal(
    (
      await request('/profile', 'PATCH', {
        name: 'Álex Martín',
        avatarUrl: null,
        creation: true,
        reminderDays: [7, 3],
        onDue: true,
        overdueWeekly: true,
      })
    ).status,
    200,
  );
  assert.equal((await request('/me')).body.user.avatarUrl, null);
});

test('creation notices respect personal opt-outs', async () => {
  const ana = await login('ana@example.test');
  await request('/profile', 'PATCH', { name: 'Ana García', creation: false }, ana);
  const created = await request('/tasks', 'POST', {
    title: 'Sin aviso de creación para Ana',
    commissionId: 'cocina',
    due: '2027-06-01T12:00:00+02:00',
    responsibleIds: ['ana'],
  });
  assert.equal(created.status, 201);
  const messages = (await request('/dev/mail')).body;
  assert.ok(
    !messages.some(
      (m: any) =>
        m.email === 'ana@example.test' && m.subject.includes('Sin aviso de creación para Ana'),
    ),
  );
  await request('/profile', 'PATCH', { name: 'Ana García', creation: true }, ana);
});
