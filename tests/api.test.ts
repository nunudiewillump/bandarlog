import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let server: ChildProcess, dir: string;
const base = 'http://127.0.0.1:3099/api';
let admin: { cookie: string; csrf: string }, member: { cookie: string; csrf: string };
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

test('bulk invitations and resends use valid personal access links and admit the invited recipient', async () => {
  const recipients = ['personal+one@example.test', 'personal-two@example.test'];
  const created = await request('/invitations', 'POST', {
    commissionId: 'cocina',
    emails: recipients,
    role: 'scouter',
  });
  assert.equal(created.status, 201);
  const assertLink = (message: any, recipient: string) => {
    const plainLink = message.body.match(/^https?:\/\/\S+$/m)?.[0];
    assert.ok(plainLink);
    const button = message.html.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
    assert.equal(button, plainLink);
    const url = new URL(button);
    assert.equal(url.origin, 'http://localhost:5173');
    assert.match(url.searchParams.get('token') || '', /^invite\.[a-f0-9-]{36}\.[a-f0-9]{64}$/);
    assert.ok(message.body.includes(recipient));
    return url.searchParams.get('token')!;
    assert.equal(url.hostname.endsWith('.'), false);
  };
  let mails = (await request('/dev/mail')).body;
  for (const recipient of recipients) {
    const message = mails.find(
      (m: any) => m.email === recipient && m.subject === 'Te invitan a Bandarlog',
    );
    assertLink(message, recipient);
  }
  const invitation = (await request('/data')).body.invitations.find(
    (i: any) => i.email === recipients[0],
  );
  assert.equal(
    (await request(`/invitations/${invitation.id}`, 'PATCH', { action: 'resend' })).status,
    200,
  );
  mails = (await request('/dev/mail')).body;
  const token = assertLink(
    mails.find(
      (m: any) => m.email === recipients[0] && m.subject.startsWith('Recordatorio de invitación'),
    ),
    recipients[0],
  );
  const accepted = await request('/auth/verify', 'POST', { token });
  assert.equal(accepted.status, 200);
  assert.equal((await request('/auth/verify', 'POST', { token })).status, 400);
  assert.equal((await request('/dev/mail')).body.length, mails.length);
  const personal = { cookie: accepted.cookie, csrf: '' };
  const me = (await request('/me', 'GET', undefined, personal)).body.user;
  assert.equal(me.email, recipients[0]);
  assert.equal(me.role, 'member');
  const data = (await request('/data', 'GET', undefined, personal)).body;
  assert.deepEqual(
    data.commissions.map((c: any) => c.id),
    ['cocina'],
  );
  assert.equal(data.members.find((m: any) => m.userId === me.id).role, 'scouter');
});

test('direct invitation tokens are bound to the invitation, including for existing users', async () => {
  const recipient = 'bound-invite@example.test';
  await request('/invitations', 'POST', { email: recipient, commissionId: 'cocina' });
  await request('/invitations', 'POST', { email: recipient, projectId: 'camp' });
  const messages = (await request('/dev/mail')).body.filter((m: any) => m.email === recipient);
  const tokens = messages.map((m: any) =>
    new URL(m.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token'),
  );
  const invites = (await request('/data')).body.invitations.filter(
    (i: any) => i.email === recipient,
  );
  const commission = invites.find((i: any) => i.commissionId === 'cocina');
  const revokedToken = tokens.find((token: string) => token.includes(commission.id));
  await request(`/invitations/${commission.id}`, 'PATCH', { action: 'revoke' });
  assert.equal((await request('/auth/verify', 'POST', { token: revokedToken })).status, 403);
  assert.equal(
    (await request('/auth/verify', 'POST', { token: revokedToken.slice('invite.'.length) })).status,
    400,
  );
  assert.ok(!(await request('/data')).body.users.some((u: any) => u.email === recipient));
  const projectToken = tokens.find((token: string) => token !== revokedToken);
  const accepted = await request('/auth/verify', 'POST', { token: projectToken });
  assert.equal(accepted.status, 200);
  const personal = { cookie: accepted.cookie, csrf: '' };
  const data = (await request('/data', 'GET', undefined, personal)).body;
  assert.equal(data.commissions.length, 0);
  assert.deepEqual(
    data.projects.map((p: any) => p.id),
    ['camp'],
  );
  await request('/invitations', 'POST', { email: recipient, commissionId: 'logistica' });
  const latest = (await request('/dev/mail')).body.filter((m: any) => m.email === recipient).at(-1);
  const existingToken = new URL(latest.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get(
    'token',
  );
  const pending = (await request('/data')).body.invitations.find(
    (i: any) => i.email === recipient && i.status === 'pending',
  );
  await request(`/invitations/${pending.id}`, 'PATCH', { action: 'revoke' });
  assert.equal((await request('/auth/verify', 'POST', { token: existingToken })).status, 403);
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
    admin,
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
  assert.match(taskMail.html, />Ver tarea<\/a>/);
  assert.equal((taskMail.html.match(/data-mail-action=/g) || []).length, 3);
  assert.match(taskMail.html, /mail-grass\.png/);
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
  assert.equal((await request('/profile', 'PATCH', {})).status, 400);
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
  const preferencesBeforePhoto = profile.preferences;
  assert.equal((await request('/profile', 'PATCH', { avatarUrl: avatar })).status, 200);
  profile = (await request('/me')).body.user;
  assert.equal(profile.name, 'Álex actualizado');
  assert.equal(profile.preferences, preferencesBeforePhoto);
  assert.equal((await request('/profile', 'PATCH', { forestEffects: false })).status, 200);
  profile = (await request('/me')).body.user;
  assert.equal(JSON.parse(profile.preferences).forestEffects, false);
  assert.deepEqual(JSON.parse(profile.preferences).reminderDays, [10, 2]);
  assert.equal(JSON.parse(profile.preferences).creation, false);
  assert.equal(profile.name, 'Álex actualizado');
  assert.equal((await request('/profile', 'PATCH', { name: 'Álex actualizado' })).status, 200);
  assert.equal(JSON.parse((await request('/me')).body.user.preferences).forestEffects, false);
  assert.equal((await request('/profile', 'PATCH', { forestEffects: 'false' })).status, 400);
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
        forestEffects: true,
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

test('named associations are automatic, Christmas follows the camp name and only unmatched commissions allow changes', async () => {
  const project = await request('/projects', 'POST', {
    name: 'Campamento de Navidad QA',
    type: 'camp',
    parentId: 'ronda',
    starts: '2027-01-02',
    ends: '2027-01-05',
    artworkTheme: 'scout',
  });
  assert.equal(project.status, 201);
  assert.equal(project.body.artworkTheme, 'christmas');
  assert.equal(
    (await request(`/projects/${project.body.id}`, 'PATCH', { artworkTheme: 'scout' }, member))
      .status,
    403,
  );
  assert.equal(
    (await request(`/projects/${project.body.id}`, 'PATCH', { artworkTheme: 'scout' })).status,
    409,
  );
  for (const [name, key] of [
    ['Servicios', 'navidad-servicios'],
    ['Animación', 'navidad-animacion'],
    ['Material', 'navidad-material'],
    ['Menú', 'navidad-menu'],
    ['Logística', 'navidad-logistica'],
    ['Lugar', 'navidad-lugar'],
  ]) {
    const created = await request('/commissions', 'POST', {
      name,
      projectId: project.body.id,
      members: [{ userId: 'alex', role: 'responsible' }],
    });
    assert.equal(created.status, 201);
    const c = (await request('/data')).body.commissions.find(
      (entry: any) => entry.id === created.body.id,
    );
    assert.equal(c.name, name);
    assert.equal(c.artworkKey, key);
    assert.equal(c.artworkLocked, true);
    assert.equal(c.artworkMode, 'automatic');
    assert.equal(
      (await request(`/commissions/${c.id}/artwork`, 'POST', { key: 'navidad-01' })).status,
      409,
    );
  }
  const unmatched = await request('/commissions', 'POST', {
    name: 'Equipo QA sin coincidencias',
    projectId: project.body.id,
    members: [{ userId: 'alex', role: 'responsible' }],
  });
  const cid = unmatched.body.id;
  assert.equal(
    (await request(`/commissions/${cid}/artwork`, 'POST', { key: 'cocina-04' })).status,
    400,
  );
  assert.equal(
    (await request(`/commissions/${cid}/artwork`, 'POST', { key: 'navidad-01' })).status,
    200,
  );
  let c = (await request('/data')).body.commissions.find((entry: any) => entry.id === cid);
  assert.equal(c.artworkLocked, false);
  assert.equal(c.artworkKey, 'navidad-01');
  assert.equal(c.artworkMode, 'manual');
  assert.equal((await request(`/commissions/${cid}/artwork`, 'POST', { key: null })).status, 200);
  c = (await request('/data')).body.commissions.find((entry: any) => entry.id === cid);
  assert.equal(c.artworkMode, 'automatic');
});

test('coordination extends the catalogue with a validated pair stored in the database', async () => {
  const { default: sharp } = await import('sharp');
  const image =
    'data:image/png;base64,' +
    (
      await sharp({ create: { width: 128, height: 128, channels: 4, background: '#124d38' } })
        .png()
        .toBuffer()
    ).toString('base64');
  const input = {
    name: 'Nuevo farol navideño',
    collection: 'christmas',
    family: 'tecnica',
    icon: image,
    mascot: image,
  };
  assert.equal((await request('/artwork/catalog', 'POST', input, member)).status, 403);
  assert.equal(
    (
      await request('/artwork/catalog', 'POST', {
        ...input,
        icon: 'data:image/svg+xml;base64,PHN2Zz4=',
      })
    ).status,
    400,
  );
  const created = await request('/artwork/catalog', 'POST', input);
  assert.equal(created.status, 201);
  const catalogue = (await request('/artwork/catalog')).body;
  const added = catalogue.find((item: any) => item.id === created.body.id);
  assert.equal(added.name, input.name);
  assert.equal(added.collection, 'christmas');
  assert.match(added.iconUrl, /^\/api\/artwork\/assets\//);
  assert.equal(added.iconData, undefined);
  const response = await fetch(base + '/artwork/assets/' + created.body.id + '/icon', {
    headers: { cookie: admin.cookie },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /image\/webp/);
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'webp');
});

test('camp summaries expose aggregates only within authorised camps and grant no task access', async () => {
  const commission = await request('/commissions', 'POST', {
    name: 'Comisión ajena para resumen',
    projectId: 'camp',
    members: [{ userId: 'carlos', role: 'responsible' }],
  });
  const created = await request('/tasks', 'POST', {
    title: 'DETALLE PRIVADO DE OTRA COMISIÓN',
    commissionId: commission.body.id,
    due: '2028-06-01T12:00:00+02:00',
    responsibleIds: ['carlos'],
  });
  assert.equal(created.status, 201);
  await request(`/tasks/${created.body.id}`, 'PATCH', {
    status: 'blocked',
    blockedReason: 'Motivo reservado',
  });
  const privateCamp = await request('/projects', 'POST', {
    name: 'Campamento no autorizado',
    type: 'camp',
    parentId: 'ronda',
    starts: '2028-01-01',
    ends: '2028-01-03',
  });
  const data = (await request('/data', 'GET', undefined, member)).body;
  const camp = data.campSummaries.find((camp: any) => camp.id === 'camp');
  const aggregate = camp.commissions.find((c: any) => c.id === commission.body.id);
  assert.equal(aggregate.open, 1);
  assert.equal(aggregate.blocked, 1);
  assert.ok(!data.tasks.some((t: any) => t.id === created.body.id));
  assert.ok(!data.commissions.some((c: any) => c.id === commission.body.id));
  assert.ok(!JSON.stringify(data).includes('DETALLE PRIVADO DE OTRA COMISIÓN'));
  assert.ok(!JSON.stringify(data).includes('Motivo reservado'));
  assert.ok(!data.campSummaries.some((camp: any) => camp.id === privateCamp.body.id));
  assert.equal(
    (await request(`/tasks/${created.body.id}`, 'PATCH', { status: 'done' }, member)).status,
    403,
  );
  assert.equal(
    (await request(`/tasks/${created.body.id}/comments`, 'POST', { body: 'No permitido' }, member))
      .status,
    403,
  );
});

test('completion versions allow undo but reject restoring over a concurrent edit', async () => {
  const created = await request('/tasks', 'POST', {
    title: 'Control de versión y deshacer',
    commissionId: 'cocina',
    due: '2028-06-01T12:00:00+02:00',
    responsibleIds: ['alex'],
  });
  const task = (await request('/data')).body.tasks.find((t: any) => t.id === created.body.id);
  const blocked = await request(`/tasks/${task.id}`, 'PATCH', {
    status: 'blocked',
    blockedReason: 'Esperando material',
    expectedUpdatedAt: task.updatedAt,
  });
  assert.equal(blocked.status, 200);
  const completed = await request(`/tasks/${task.id}`, 'PATCH', {
    status: 'done',
    expectedUpdatedAt: blocked.body.task.updatedAt,
  });
  assert.equal(completed.status, 200);
  const undone = await request(`/tasks/${task.id}`, 'PATCH', {
    status: 'blocked',
    blockedReason: 'Esperando material',
    expectedUpdatedAt: completed.body.task.updatedAt,
  });
  assert.equal(undone.status, 200);
  assert.equal(undone.body.task.blockedReason, 'Esperando material');
  const latest = await request(`/tasks/${task.id}`, 'PATCH', { due: '2028-06-02T12:00:00+02:00' });
  assert.equal(latest.status, 200);
  const conflict = await request(`/tasks/${task.id}`, 'PATCH', {
    status: 'pending',
    expectedUpdatedAt: undone.body.task.updatedAt,
  });
  assert.equal(conflict.status, 409);
  const saved = (await request('/data')).body.tasks.find((t: any) => t.id === task.id);
  assert.equal(saved.status, 'blocked');
  assert.equal(saved.due, latest.body.task.due);
});

test('offline retries are idempotent and retained assignments keep their original timestamps', async () => {
  const mutation = crypto.randomUUID();
  const input = {
    title: 'Sin cobertura',
    commissionId: 'cocina',
    responsibleIds: ['alex'],
    due: '2026-12-31T22:59:59Z',
  };
  const created = await request('/tasks', 'POST', input, admin, mutation);
  assert.equal(created.status, 201);
  const again = await request('/tasks', 'POST', input, admin, mutation);
  assert.deepEqual(again.body, created.body);
  assert.equal(
    (await request('/tasks', 'POST', { ...input, title: 'Otro' }, admin, mutation)).status,
    409,
  );
  const data = (await request('/data')).body;
  assert.equal(data.tasks.filter((t: any) => t.title === input.title).length, 1);
  const assignedAt = data.assignments.find((a: any) => a.taskId === created.body.id).assignedAt;
  assert.ok(assignedAt);
  await request(`/tasks/${created.body.id}`, 'PATCH', {
    responsibleIds: ['alex'],
    due: '2027-01-01T22:59:59Z',
  });
  const next = (await request('/data')).body;
  assert.equal(
    next.assignments.find((a: any) => a.taskId === created.body.id).assignedAt,
    assignedAt,
  );
  const change = crypto.randomUUID(),
    task = next.tasks.find((t: any) => t.id === created.body.id);
  const patch = { status: 'done', expectedUpdatedAt: task.updatedAt };
  const done = await request(`/tasks/${task.id}`, 'PATCH', patch, admin, change);
  assert.equal(done.status, 200);
  assert.deepEqual(
    (await request(`/tasks/${task.id}`, 'PATCH', patch, admin, change)).body,
    done.body,
  );
  await request(`/tasks/${task.id}`, 'DELETE');
});
test('device push config exposes only the public key and subscriptions require valid providers', async () => {
  const config = await request('/push/config');
  assert.equal(config.status, 200);
  assert.ok(config.body.publicKey);
  assert.equal(config.body.privateKey, undefined);
  const subscription = {
    endpoint: 'https://127.0.0.1/private',
    keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
  };
  assert.equal((await request('/push/subscriptions', 'POST', subscription)).status, 400);
  const real = { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/test-only' };
  assert.equal((await request('/push/subscriptions', 'POST', real)).status, 200);
  assert.equal(
    (await request('/push/subscriptions', 'DELETE', { endpoint: real.endpoint })).status,
    200,
  );
});

test('only administrators add or remove users and removal revokes access while preserving history', async () => {
  const responsible = await login('laura@example.test');
  await request('/users/ana/role', 'PATCH', { role: 'coordination' });
  const coordination = await login('ana@example.test');
  for (const actor of [responsible, coordination]) {
    assert.equal(
      (
        await request(
          '/invitations',
          'POST',
          { commissionId: 'cocina', emails: ['admin-only@example.test'] },
          actor,
        )
      ).status,
      403,
    );
    assert.equal((await request('/users/miguel', 'DELETE', undefined, actor)).status, 403);
  }
  assert.equal((await request('/users/alex', 'DELETE')).status, 400);
  assert.equal((await request('/users/carlos', 'DELETE')).status, 409);
  await request('/invitations', 'POST', { email: 'removed-user@example.test' });
  const targetSession = await login('removed-user@example.test');
  const target = (await request('/data')).body.users.find(
    (u: any) => u.email === 'removed-user@example.test',
  );
  assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 200);
  assert.equal((await request('/me', 'GET', undefined, targetSession)).status, 401);
  const removed = (await request('/data')).body.users.find((u: any) => u.id === target.id);
  assert.ok(removed.disabledAt);
  assert.equal((await request('/invitations', 'POST', { email: target.email })).status, 201);
  assert.equal(
    (await request('/data')).body.users.find((u: any) => u.id === target.id).role,
    'member',
  );
  await request('/users/ana/role', 'PATCH', { role: 'member' });
});

test('full task edits preserve permissions and update title, description, deadline and assignments atomically', async () => {
  const created = await request('/tasks', 'POST', {
    title: 'Antes',
    description: 'Descripción original',
    commissionId: 'cocina',
    due: '2027-06-01T21:59:59Z',
    responsibleIds: ['carlos'],
  });
  const tid = created.body.id;
  const scouter = await login('carlos@example.test'),
    responsible = await login('laura@example.test');
  assert.deepEqual(created.body.task.checklist, []);
  for (const change of [
    { title: 'No autorizado' },
    { description: '' },
    { title: 'No', status: 'done' },
  ])
    assert.equal((await request(`/tasks/${tid}`, 'PATCH', change, scouter)).status, 403);
  const updated = await request(
    `/tasks/${tid}`,
    'PATCH',
    {
      title: 'Después',
      description: 'Descripción nueva',
      due: '2027-06-02T21:59:59Z',
      responsibleIds: ['alex', 'carlos'],
      expectedUpdatedAt: created.body.task.updatedAt,
    },
    responsible,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.title, 'Después');
  assert.equal(updated.body.task.description, 'Descripción nueva');
  const data = (await request('/data')).body;
  assert.deepEqual(
    data.assignments
      .filter((a: any) => a.taskId === tid)
      .map((a: any) => a.userId)
      .sort(),
    ['alex', 'carlos'],
  );
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        { title: 'Antiguo', expectedUpdatedAt: created.body.task.updatedAt },
        responsible,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { description: '' }, responsible)).status,
    200,
  );
  for (const change of [
    { title: ' ' },
    { title: 'x'.repeat(201) },
    { description: 'x'.repeat(5001) },
  ])
    assert.equal((await request(`/tasks/${tid}`, 'PATCH', change)).status, 400);
  const isolated = await request('/commissions', 'POST', {
    name: 'Edición aislada',
    projectId: 'ronda',
    members: [{ userId: 'alex', role: 'responsible' }],
  });
  const unrelated = await request('/tasks', 'POST', {
    title: 'Otra comisión',
    commissionId: isolated.body.id,
    due: '2027-06-02T21:59:59Z',
    responsibleIds: ['alex'],
  });
  assert.equal(
    (
      await request(
        `/tasks/${unrelated.body.id}`,
        'PATCH',
        { title: 'Fuera de ámbito' },
        responsible,
      )
    ).status,
    403,
  );
  await request(`/tasks/${unrelated.body.id}`, 'DELETE');
  await request(`/tasks/${tid}`, 'DELETE');
});

test('optional checklist enforces structural and assignment permissions, audit, replay and nonblocking completion', async () => {
  const created = await request('/tasks', 'POST', {
    title: 'Con pasos opcionales',
    commissionId: 'cocina',
    due: '2027-07-01T21:59:59Z',
    responsibleIds: ['carlos'],
  });
  const tid = created.body.id,
    step = crypto.randomUUID(),
    otherStep = crypto.randomUUID();
  const scouter = await login('carlos@example.test'),
    outsider = await login('ana@example.test'),
    responsible = await login('laura@example.test');
  const change = (checklistChange: unknown, auth = admin, mutation?: string) =>
    request(`/tasks/${tid}`, 'PATCH', { checklistChange }, auth, mutation);
  assert.equal(
    (await change({ action: 'add', id: step, title: 'No puede crear' }, scouter)).status,
    403,
  );
  const replay = crypto.randomUUID();
  const added = await change(
    { action: 'add', id: step, title: 'Preparar la lista' },
    responsible,
    replay,
  );
  assert.equal(added.status, 200);
  assert.deepEqual(
    (await change({ action: 'add', id: step, title: 'Preparar la lista' }, responsible, replay))
      .body,
    added.body,
  );
  assert.equal((await change({ action: 'add', id: step, title: 'Duplicado' })).status, 409);
  await change({ action: 'add', id: otherStep, title: 'Paso pendiente' }, responsible);
  assert.equal((await change({ action: 'toggle', id: step, done: true }, outsider)).status, 403);
  assert.equal((await change({ action: 'edit', id: step, title: 'No' }, scouter)).status, 403);
  assert.equal((await change({ action: 'remove', id: step }, scouter)).status, 403);
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        { checklistChange: { action: 'toggle', id: step, done: true }, title: 'No' },
        scouter,
      )
    ).status,
    403,
  );
  const marked = await change({ action: 'toggle', id: step, done: true }, scouter);
  assert.equal(marked.body.task.checklist[0].done, true);
  const edited = await change({ action: 'edit', id: step, title: 'Revisar la lista' }, responsible);
  assert.equal(edited.body.task.checklist[0].done, true);
  assert.equal(
    (
      await request(
        `/tasks/${tid}`,
        'PATCH',
        {
          checklistChange: { action: 'toggle', id: step, done: false },
          expectedUpdatedAt: marked.body.task.updatedAt,
        },
        scouter,
      )
    ).status,
    409,
  );
  const finished = await request(`/tasks/${tid}`, 'PATCH', { status: 'done' }, scouter);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.task.checklist[1].done, false);
  const removed = await change({ action: 'remove', id: step }, responsible);
  assert.equal(removed.body.task.status, 'done');
  assert.deepEqual(
    removed.body.task.checklist.map((s: any) => s.id),
    [otherStep],
  );
  assert.equal((await change({ action: 'remove', id: step }, responsible)).status, 404);
  const data = (await request('/data')).body;
  assert.equal(
    data.activity.filter((a: any) => a.taskId === tid && a.body === 'Ha añadido un paso.').length,
    2,
  );
  await request(`/tasks/${tid}`, 'DELETE');
  assert.equal(
    (await change({ action: 'toggle', id: otherStep, done: true }, responsible)).status,
    404,
  );
});

test('checklist input validation and archived task restrictions leave existing data intact', async () => {
  const project = await request('/projects', 'POST', {
    name: 'Pasos archivados',
    type: 'ronda',
    starts: '2026-01-01',
    ends: '2027-12-31',
  });
  const commission = await request('/commissions', 'POST', {
    name: 'Equipo pasos',
    projectId: project.body.id,
    members: [{ userId: 'alex', role: 'responsible' }],
  });
  const created = await request('/tasks', 'POST', {
    title: 'Validación pasos',
    commissionId: commission.body.id,
    due: '2027-07-01T21:59:59Z',
    responsibleIds: ['alex'],
  });
  const tid = created.body.id,
    id = crypto.randomUUID();
  for (const checklistChange of [
    { action: 'add', id, title: ' ' },
    { action: 'add', id, title: 'x'.repeat(241) },
    { action: 'add', id: '../task', title: 'No' },
    { action: 'toggle', id, done: 'true' },
    { action: 'add', id, title: 'No', done: true },
  ])
    assert.equal((await request(`/tasks/${tid}`, 'PATCH', { checklistChange })).status, 400);
  assert.equal(
    (await request(`/tasks/${tid}`, 'PATCH', { checklist: [{ id, title: 'Bypass', done: true }] }))
      .status,
    400,
  );
  assert.deepEqual(
    (await request('/data')).body.tasks.find((t: any) => t.id === tid).checklist,
    [],
  );
  await request(`/projects/${project.body.id}`, 'PATCH', { archived: true });
  for (const body of [
    { title: 'Archivada' },
    { checklistChange: { action: 'add', id, title: 'No' } },
    { checklistChange: { action: 'toggle', id, done: true } },
  ])
    assert.equal((await request(`/tasks/${tid}`, 'PATCH', body)).status, 409);
});

test('all project types are independent, optional metadata and keep the legacy API compatible', async () => {
  for (const type of [undefined, null, 'general', 'camp', 'event', 'other', 'ronda']) {
    const created = await request('/projects', 'POST', {
      name: `Proyecto independiente ${type ?? 'sin tipo'}`,
      ...(type !== undefined ? { type } : {}),
      starts: '2028-01-01',
      ends: '2028-01-03',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.parentId, null);
    assert.equal(created.body.type, type ?? 'general');
    const commission = await request('/commissions', 'POST', {
      name: 'Comisión común',
      projectId: created.body.id,
      members: [{ userId: 'alex', role: 'responsible' }],
    });
    assert.equal(commission.status, 201);
    const task = await request('/tasks', 'POST', {
      title: 'La misma función para todos',
      commissionId: commission.body.id,
      due: '2028-01-02T21:59:59Z',
      responsibleIds: ['alex'],
    });
    assert.equal(task.status, 201);
    const snapshot = (await request('/data')).body;
    assert.equal(snapshot.projectSummaries.find((p: any) => p.id === created.body.id).open, 1);
    assert.equal(
      (await request(`/projects/${created.body.id}`, 'PATCH', { archived: true })).status,
      200,
    );
    assert.equal(
      (await request(`/tasks/${task.body.id}`, 'PATCH', { title: 'Archivada' })).status,
      409,
    );
  }
  const legacy = await request('/projects', 'POST', {
    name: 'Referencia histórica',
    type: 'camp',
    parentId: 'ronda',
    starts: '2028-01-01',
    ends: '2028-01-03',
  });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.body.parentId, 'ronda');
  await request(`/projects/${legacy.body.id}`, 'PATCH', { type: 'event' });
  const saved = (await request('/data')).body.projects.find((p: any) => p.id === legacy.body.id);
  assert.equal(saved.type, 'event');
  assert.equal(saved.parentId, 'ronda');
  for (const body of [
    { type: 'invalid' },
    { starts: '2028-02-03', ends: '2028-01-01' },
    { parentId: 'missing' },
  ]) {
    const result = await request('/projects', 'POST', {
      name: 'Inválido',
      starts: '2028-01-01',
      ends: '2028-01-03',
      ...body,
    });
    assert.equal(result.status, 400);
  }
  assert.equal(
    (
      await request(
        '/projects',
        'POST',
        { name: 'Sin permiso', type: 'event', starts: '2028-01-01', ends: '2028-01-03' },
        member,
      )
    ).status,
    403,
  );
});

test('General and Event summaries preserve scoped aggregates without exposing hidden task details', async () => {
  for (const type of ['general', 'event']) {
    const project = await request('/projects', 'POST', {
      name: `Resumen privado ${type}`,
      type,
      starts: '2028-01-01',
      ends: '2028-01-03',
    });
    await request(`/projects/${project.body.id}/members`, 'POST', { userIds: ['laura'] });
    const commission = await request('/commissions', 'POST', {
      name: `Comisión privada ${type}`,
      projectId: project.body.id,
      members: [{ userId: 'carlos', role: 'responsible' }],
    });
    const task = await request('/tasks', 'POST', {
      title: `SECRETO ${type}`,
      description: 'Descripción reservada',
      commissionId: commission.body.id,
      due: '2028-01-02T21:59:59Z',
      responsibleIds: ['carlos'],
    });
    const data = (await request('/data', 'GET', undefined, member)).body;
    assert.equal(data.projectSummaries.find((p: any) => p.id === project.body.id).open, 1);
    assert.ok(!JSON.stringify(data).includes(`SECRETO ${type}`));
    assert.ok(!data.commissions.some((c: any) => c.id === commission.body.id));
    assert.equal(
      (await request(`/tasks/${task.body.id}`, 'PATCH', { status: 'done' }, member)).status,
      403,
    );
  }
});

test('commission managers edit and delete only their commission; history and names survive logical deletion', async () => {
  const responsible = await login('carlos@example.test');
  const project = (
    await request('/projects', 'POST', {
      name: 'Gestión de comisiones',
      starts: '2028-01-01',
      ends: '2028-12-31',
    })
  ).body;
  const created = await request('/commissions', 'POST', {
    name: 'Comisión editable',
    description: 'Original',
    projectId: project.id,
    members: [
      { userId: 'carlos', role: 'responsible' },
      { userId: 'laura', role: 'scouter' },
    ],
  });
  assert.equal(created.status, 201);
  const cid = created.body.id;
  const task = (
    await request('/tasks', 'POST', {
      commissionId: cid,
      title: 'Historia de comisión',
      description: 'Conservar',
      due: '2028-02-01T12:00:00Z',
      responsibleIds: ['laura'],
    })
  ).body;
  const version = task.task.updatedAt;
  assert.equal(
    (await request(`/commissions/${cid}`, 'PATCH', { name: 'No permitido' }, member)).status,
    403,
  );
  assert.equal(
    (await request('/commissions/cocina', 'PATCH', { name: 'Ajena' }, responsible)).status,
    403,
  );
  assert.equal((await request(`/commissions/${cid}`, 'DELETE', undefined, member)).status, 403);
  assert.equal(
    (
      await request(
        `/commissions/${cid}`,
        'PATCH',
        { name: '  ', description: 'Inválida' },
        responsible,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/commissions/${cid}`, 'PATCH', { projectId: 'ronda' }, responsible)).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/commissions/${cid}`,
        'PATCH',
        {
          name: 'Servicios',
          description: 'Nueva descripción',
          expected: { name: 'Comisión editable', description: 'Original' },
        },
        responsible,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/commissions/${cid}`,
        'PATCH',
        {
          description: 'Sobrescribir',
          expected: { name: 'Comisión editable', description: 'Original' },
        },
        responsible,
      )
    ).status,
    409,
  );
  let data = (await request('/data')).body;
  const edited = data.commissions.find((c: any) => c.id === cid);
  assert.equal(edited.name, 'Servicios');
  assert.equal(edited.description, 'Nueva descripción');
  assert.equal(edited.artworkLocked, true);
  assert.equal(data.tasks.find((t: any) => t.id === task.id).updatedAt, version);
  assert.equal(
    (
      await request(
        `/commissions/${cid}/invitations`,
        'POST',
        { email: 'cancelled-commission@example.test', name: 'Invitada', role: 'scouter' },
        admin,
      )
    ).status,
    201,
  );
  await request(`/projects/${project.id}`, 'PATCH', { archived: true });
  assert.equal(
    (await request(`/commissions/${cid}`, 'PATCH', { name: 'Archivada' }, responsible)).status,
    409,
  );
  assert.equal(
    (await request(`/commissions/${cid}`, 'DELETE', undefined, responsible)).status,
    409,
  );
  await request(`/projects/${project.id}`, 'PATCH', { archived: false });
  assert.equal(
    (await request(`/commissions/${cid}`, 'DELETE', undefined, responsible)).status,
    200,
  );
  data = (await request('/data')).body;
  assert.ok(!data.commissions.some((c: any) => c.id === cid));
  assert.ok(!data.tasks.some((t: any) => t.id === task.id));
  assert.ok(
    !data.projectSummaries
      .find((p: any) => p.id === project.id)
      .commissions.some((c: any) => c.id === cid),
  );
  assert.equal(
    data.invitations.find((i: any) => i.email === 'cancelled-commission@example.test').status,
    'cancelled',
  );
  for (const [path, method, body] of [
    [`/commissions/${cid}`, 'PATCH', { name: 'Reaparece' }],
    [`/commissions/${cid}/members`, 'POST', { userIds: ['ana'] }],
    [`/commissions/${cid}/artwork`, 'POST', {}],
    [`/tasks/${task.id}`, 'PATCH', { status: 'done' }],
    [`/tasks/${task.id}/comments`, 'POST', { body: 'Invisible' }],
    [
      `/tasks`,
      'POST',
      {
        commissionId: cid,
        title: 'No crear',
        due: '2028-02-01T12:00:00Z',
        responsibleIds: ['laura'],
      },
    ],
  ] as const)
    assert.equal((await request(path, method, body)).status, 404, path);
  assert.equal(
    (
      await request('/commissions', 'POST', {
        name: 'Servicios',
        projectId: project.id,
        members: [{ userId: 'carlos', role: 'responsible' }],
      })
    ).status,
    201,
  );
});

test('tutorial stays isolated, persists per user, deduplicates retry receipts and protects admin metrics', async () => {
  const learner = await login('ana@example.test');
  const coordinator = await login('miguel@example.test');
  await request('/users/miguel/role', 'PATCH', { role: 'coordination' });
  assert.equal((await request('/tutorial/stats', 'GET', undefined, learner)).status, 403);
  assert.equal((await request('/tutorial/stats', 'GET', undefined, coordinator)).status, 403);
  const initial = await request('/tutorial', 'GET', undefined, learner);
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.events, {});
  const realBefore = (await request('/data')).body;
  const mailBefore = (await request('/dev/mail')).body;
  for (const body of [
    { action: 'shown', userId: 'alex' },
    { action: 'update', expectedVersion: 0, content: 'PRIVATE-NOT-STORED' },
  ])
    assert.equal((await request('/tutorial', 'POST', body, learner)).status, 400);
  assert.equal(
    (
      await request(
        '/tutorial',
        'POST',
        { action: 'open' },
        { cookie: learner.cookie, csrf: 'wrong' },
      )
    ).status,
    403,
  );
  const mutation = 'a5b44641-ff54-4515-a56d-66fe6a58afed';
  const first = await request('/tutorial', 'POST', { action: 'open' }, learner, mutation);
  assert.equal(first.status, 200);
  assert.deepEqual(
    (await request('/tutorial', 'POST', { action: 'open' }, learner, mutation)).body,
    first.body,
  );
  let p = first.body.progress;
  const check = await request(
    '/tutorial',
    'POST',
    { action: 'check', index: 0, done: true, expectedVersion: p.version },
    learner,
  );
  assert.equal(check.status, 200);
  p = check.body.progress;
  assert.deepEqual((await request('/tutorial', 'GET', undefined, learner)).body.steps, [
    true,
    false,
  ]);
  assert.equal(
    (
      await request(
        '/tutorial',
        'POST',
        { action: 'check', index: 1, done: true, expectedVersion: 0 },
        learner,
      )
    ).status,
    409,
  );
  p = (
    await request('/tutorial', 'POST', { action: 'update', expectedVersion: p.version }, learner)
  ).body.progress;
  const completed = await request(
    '/tutorial',
    'POST',
    { action: 'status', status: 'done', expectedVersion: p.version },
    learner,
  );
  assert.equal(completed.body.celebrate, true);
  p = completed.body.progress;
  assert.deepEqual(p.steps, [true, false]);
  const completedAt = p.events.tutorial_completed;
  p = (await request('/tutorial', 'POST', { action: 'undo', expectedVersion: p.version }, learner))
    .body.progress;
  assert.equal(p.taskStatus, 'pending');
  const repeated = await request(
    '/tutorial',
    'POST',
    { action: 'status', status: 'done', expectedVersion: p.version },
    learner,
  );
  assert.equal(repeated.body.celebrate, false);
  p = (await request('/tutorial', 'POST', { action: 'open', restart: true }, learner)).body
    .progress;
  assert.equal(p.taskStatus, 'pending');
  assert.deepEqual(p.steps, [false, false]);
  assert.equal(p.events.tutorial_completed, completedAt);
  const stats = (await request('/tutorial/stats')).body;
  assert.deepEqual([stats.shown, stats.started, stats.completed, stats.reopened], [1, 1, 1, 1]);
  assert.deepEqual(stats.features, { checklist: 1, update: 1, completed: 1, undo: 1 });
  assert.deepEqual(stats.rates, {
    started: 100,
    skipped: 0,
    completed: 100,
    completedAmongStarted: 100,
  });
  assert.ok(!JSON.stringify(stats).includes('ana@example.test'));
  assert.deepEqual((await request('/data')).body, realBefore);
  assert.deepEqual((await request('/dev/mail')).body, mailBefore);
  assert.deepEqual((await request('/tutorial', 'GET', undefined, member)).body.events, {});
  await request('/tutorial', 'POST', { action: 'shown' }, member);
  await request('/tutorial', 'POST', { action: 'shown' }, member);
  const skipped = await request('/tutorial', 'POST', { action: 'skip' }, member);
  await request('/tutorial', 'POST', { action: 'skip' }, member);
  assert.ok(skipped.body.progress.events.tutorial_skipped);
  const next = (await request('/tutorial/stats')).body;
  assert.deepEqual(
    [next.shown, next.started, next.skipped, next.completed, next.abandoned],
    [2, 1, 1, 1, 0],
  );
});
