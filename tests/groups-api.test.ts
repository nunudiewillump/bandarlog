import { publicInfo } from '../shared/public-info';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let processChild: ChildProcess, dir: string;
const origin = 'http://127.0.0.1:3111';
type Session = { base: string; cookie: string; csrf: string; userId: string };
async function call(path: string, method = 'GET', body?: any, session?: Session, form = false) {
  const response = await fetch(origin + (session?.base || '') + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(body
        ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }
        : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
    },
    body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
  });
  const raw = await response.text();
  let data: any = raw;
  try {
    data = JSON.parse(raw);
  } catch {}
  return { status: response.status, body: data, headers: response.headers };
}
async function createGroup(name: string, email = 'same-owner@example.test') {
  const requested = await call(
    '/crear-grupo',
    'POST',
    {
      groupName: name,
      name: 'Persona administradora',
      email,
      colorPrimary: '#276cae',
      colorSecondary: '#f7c948',
      terms: 'accepted',
    },
    undefined,
    true,
  );
  assert.equal(requested.status, 202);
  const pendingMail = (await call('/api/dev/platform-mail')).body;
  assert.ok(
    !pendingMail.some(
      (m: any) => m.email === email && m.subject.includes('aprobado') && m.body.includes(name),
    ),
  );
  const ownerMail = pendingMail
    .filter((m: any) => m.email === publicInfo.contact && m.body.includes(name))
    .at(-1);
  const ownerToken = new URL(ownerMail.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get(
    'token',
  );
  assert.equal(
    (await call('/confirmar-grupo', 'POST', { token: ownerToken }, undefined, true)).status,
    400,
    'owner token cannot activate a group',
  );
  assert.equal((await call('/aprobar-grupo?token=' + ownerToken)).status, 200);
  assert.equal(
    (
      await call(
        '/aprobar-grupo',
        'POST',
        { token: ownerToken, decision: 'approve' },
        undefined,
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        '/aprobar-grupo',
        'POST',
        { token: ownerToken, decision: 'approve' },
        undefined,
        true,
      )
    ).status,
    409,
  );
  const outbox = (await call('/api/dev/platform-mail')).body;
  const mail = outbox
    .filter((m: any) => m.email === email && m.subject.includes('aprobado'))
    .at(-1);
  const token = new URL(mail.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token');
  const opened = await call('/confirmar-grupo?token=' + token);
  assert.equal(opened.status, 200);
  const confirmed = await call('/confirmar-grupo', 'POST', { token }, undefined, true);
  assert.equal(confirmed.status, 303);
  assert.equal((await call('/confirmar-grupo', 'POST', { token }, undefined, true)).status, 400);
  const base = confirmed.headers.get('location')!.replace(/\/$/, '');
  assert.match(base, /^\/g\/[a-f0-9]{32}$/);
  const cookie = confirmed.headers.get('set-cookie')!.split(';')[0];
  assert.ok(confirmed.headers.get('set-cookie')!.includes('Path=' + base));
  const session: Session = { base, cookie, csrf: '', userId: '' };
  const me = await call('/api/me', 'GET', undefined, session);
  assert.equal(me.status, 200);
  session.csrf = me.body.csrf;
  session.userId = me.body.user.id;
  assert.equal(me.body.group.name, name);
  assert.equal(me.body.user.role, 'admin');
  assert.equal(me.body.group.plan, 'free');
  return session;
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bandarlog-groups-api-'));
  processChild = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3111',
      APP_URL: origin,
      DATA_DIR: dir,
      NODE_ENV: 'test',
      DATABASE_URL: '',
      MAIL_TRANSPORT: 'preview',
      SMTP_HOST: '',
      GOOGLE_LOGIN_CLIENT_ID: '',
      GOOGLE_LOGIN_CLIENT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  processChild.stdout?.on('data', (x) => (log += x));
  processChild.stderr?.on('data', (x) => (log += x));
  for (let n = 0; n < 300; n++) {
    try {
      if ((await fetch(origin + '/api/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(log);
});
after(async () => {
  if (processChild) {
    processChild.kill('SIGTERM');
    await new Promise((r) => processChild.once('exit', r));
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('public home and policies need no login, signup verifies email, and billing cannot charge', async () => {
  const home = await call('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /Menos lío/);
  assert.match((await call('/?utm_source=example')).body, /Menos lío/);
  assert.ok(!home.headers.get('set-cookie'));
  for (const path of [
    '/presentacion',
    '/privacidad',
    '/condiciones',
    '/crear-grupo',
    '/suscripcion-demo',
  ])
    assert.equal((await call(path)).status, 200, path);
  assert.match((await call('/privacidad')).body, /Dabi Arguiñena Giménez/);
  assert.match((await call('/privacidad')).body, /darguinenagimenez@gmail.com/);
  const demo = (await call('/suscripcion-demo')).body;
  assert.match(demo, /No se realizan cobros/);
  assert.ok(!demo.includes('stripe.com'));
  assert.equal((await call('/suscripcion-demo', 'POST', { plan: 'paid' })).status, 404);
  const forbidden = await fetch(origin + '/crear-grupo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://other.example',
    },
    body: 'groupName=Invalid',
  });
  assert.equal(forbidden.status, 403);
  assert.equal(
    (
      await call(
        '/crear-grupo',
        'POST',
        { groupName: 'No', name: 'No', email: 'not-an-email', terms: 'accepted' },
        undefined,
        true,
      )
    ).status,
    400,
  );
  assert.equal((await call('/g/unknown/api/health')).status, 404);
  assert.equal((await call('/api/data')).status, 401);
});

test('independent groups can share an owner email without sharing sessions, roles, work, mail or metrics', async () => {
  const a = await createGroup('Grupo A'),
    b = await createGroup('Grupo B');
  assert.notEqual(a.base, b.base);
  const encoded = '/g/%' + a.base.charCodeAt(3).toString(16) + a.base.slice(4);
  const canonical = await call(encoded + '/api/me');
  assert.equal(canonical.status, 308);
  assert.equal(canonical.headers.get('location'), a.base + '/api/me');
  assert.equal((await call(encoded + '/api/profile', 'POST', { name: 'No' })).status, 400);

  assert.notEqual(a.userId, b.userId);
  assert.equal((await call('/api/me', 'GET', undefined, { ...b, cookie: a.cookie })).status, 401);
  for (const session of [a, b]) {
    const data = (await call('/api/data', 'GET', undefined, session)).body;
    assert.equal(data.users.length, 1);
    assert.equal(data.projects.length, 0);
    assert.equal(data.commissions.length, 0);
    assert.equal(data.tasks.length, 0);
    assert.equal(data.users[0].id, session.userId);
  }
  const project = await call(
    '/api/projects',
    'POST',
    { name: 'Campamento A', type: 'camp', starts: '2027-01-01', ends: '2027-01-07' },
    a,
  );
  assert.equal(project.status, 201);
  const commission = await call(
    '/api/commissions',
    'POST',
    {
      name: 'Material',
      projectId: project.body.id,
      members: [{ userId: a.userId, role: 'responsible' }],
    },
    a,
  );
  assert.equal(commission.status, 201);
  const task = await call(
    '/api/tasks',
    'POST',
    {
      title: 'Preparar material',
      description: 'Solo grupo A',
      commissionId: commission.body.id,
      due: '2027-01-05T21:59:59Z',
      responsibleIds: [a.userId],
    },
    a,
  );
  assert.equal(task.status, 201);
  assert.equal(
    (await call('/api/commissions/' + commission.body.id, 'PATCH', { name: 'No' }, b)).status,
    404,
  );
  assert.equal(
    (await call('/api/tasks/' + task.body.id, 'PATCH', { status: 'done' }, b)).status,
    404,
  );
  assert.equal(
    (
      await call(
        '/api/commissions',
        'POST',
        {
          name: 'No',
          projectId: project.body.id,
          members: [{ userId: b.userId, role: 'responsible' }],
        },
        b,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call('/api/users/' + a.userId + '/role', 'PATCH', { role: 'member' }, b)).status,
    404,
  );
  assert.equal((await call('/api/notifications', 'GET', undefined, b)).body.length, 0);
  const mail = (await call('/api/notifications', 'GET', undefined, a)).body;
  assert.ok(mail.length > 0);
  assert.ok(mail.every((m: any) => m.email === 'same-owner@example.test'));
  assert.equal((await call('/api/data', 'GET', undefined, b)).body.tasks.length, 0);
  const completed = await call('/api/tasks/' + task.body.id, 'PATCH', { status: 'done' }, a);
  assert.equal(completed.status, 200);
  const manifest = (await call('/manifest.webmanifest', 'GET', undefined, a)).body;
  assert.equal(manifest.scope, a.base + '/');
  assert.equal(manifest.start_url, a.base + '/');
  const settings = await call(
    '/api/group',
    'PATCH',
    { name: 'Grupo A nuevo', colorPrimary: '#ff0000', colorSecondary: '#0000ff' },
    a,
  );
  assert.equal(settings.status, 200);
  assert.equal((await call('/api/group', 'GET', undefined, b)).body.name, 'Grupo B');
  assert.equal((await call('/api/group', 'GET', undefined, a)).body.name, 'Grupo A nuevo');
  assert.equal(
    (
      await call(
        '/api/group',
        'PATCH',
        { name: 'No plan', colorPrimary: '#000000', colorSecondary: '#ffffff', plan: 'paid' },
        a,
      )
    ).status,
    400,
  );
  const owner = (await call('/api/me', 'GET', undefined, a)).body.user;
  assert.equal((await call('/api/onboarding', 'POST', { name: owner.name }, a)).status, 200);
  await call('/api/tutorial', 'POST', { action: 'shown' }, a);
  assert.equal((await call('/api/tutorial/stats', 'GET', undefined, a)).body.shown, 1);
  assert.equal((await call('/api/tutorial/stats', 'GET', undefined, b)).body.shown, 0);
  assert.equal(
    (
      await call(
        '/api/group',
        'PATCH',
        { name: 'No', colorPrimary: 'red', colorSecondary: '#000000' },
        a,
      )
    ).status,
    400,
  );
  const otherProject = await call(
    '/api/projects',
    'POST',
    { name: 'Proyecto B', starts: '2027-01-01', ends: '2027-12-31' },
    b,
  );
  const otherCommission = await call(
    '/api/commissions',
    'POST',
    {
      name: 'Equipo B',
      projectId: otherProject.body.id,
      members: [{ userId: b.userId, role: 'responsible' }],
    },
    b,
  );
  for (const [session, cid, role] of [
    [a, commission.body.id, 'scouter'],
    [b, otherCommission.body.id, 'responsible'],
  ] as const) {
    assert.equal(
      (
        await call(
          '/api/invitations',
          'POST',
          { commissionId: cid, email: 'shared-member@example.test', role },
          session,
        )
      ).status,
      201,
    );
  }
  const inviteToken = async (session: Session) => {
    const mails = (await call('/api/dev/mail', 'GET', undefined, session)).body;
    const mail = mails.find((m: any) => m.email === 'shared-member@example.test');
    const link = new URL(mail.body.match(/^https?:\/\/\S+$/m)[0]);
    assert.equal(link.pathname, session.base + '/');
    return link.searchParams.get('token');
  };
  const tokenA = await inviteToken(a),
    tokenB = await inviteToken(b);
  assert.equal((await call('/api/auth/verify', 'POST', { token: tokenA }, b)).status, 400);
  const memberSessions: Session[] = [];
  for (const [session, token] of [
    [a, tokenA],
    [b, tokenB],
  ] as const) {
    const accepted = await call('/api/auth/verify', 'POST', { token }, session);
    assert.equal(accepted.status, 200);
    const member = {
      ...session,
      cookie: accepted.headers.get('set-cookie')!.split(';')[0],
      csrf: '',
      userId: '',
    };
    const me = (await call('/api/me', 'GET', undefined, member)).body;
    member.csrf = me.csrf;
    member.userId = me.user.id;
    assert.equal(me.user.role, 'member');
    assert.equal(
      (
        await call(
          '/api/group',
          'PATCH',
          { name: 'No', colorPrimary: '#000000', colorSecondary: '#ffffff' },
          member,
        )
      ).status,
      403,
    );
    memberSessions.push(member);
  }
  assert.notEqual(memberSessions[0].userId, memberSessions[1].userId);
  assert.equal(
    (
      await call(
        '/api/commissions/' + commission.body.id,
        'PATCH',
        { description: 'No' },
        memberSessions[0],
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        '/api/commissions/' + otherCommission.body.id,
        'PATCH',
        { description: 'Responsable de B' },
        memberSessions[1],
      )
    ).status,
    200,
  );
});

test('only the owner review link can authorize activation; rejection creates no account', async () => {
  const email = 'rejected-request@example.test';
  assert.equal(
    (
      await call(
        '/crear-grupo',
        'POST',
        { groupName: 'Grupo no autorizado', name: 'Solicitante', email, terms: 'accepted' },
        undefined,
        true,
      )
    ).status,
    202,
  );
  const mails = (await call('/api/dev/platform-mail')).body;
  assert.ok(!mails.some((m: any) => m.email === email));
  const ownerMail = mails
    .filter((m: any) => m.email === publicInfo.contact && m.body.includes('Grupo no autorizado'))
    .at(-1);
  const token = new URL(ownerMail.body.match(/^https?:\/\/\S+$/m)[0]).searchParams.get('token');
  assert.equal(
    (
      await call(
        '/aprobar-grupo',
        'POST',
        { token: '0'.repeat(64), decision: 'approve' },
        undefined,
        true,
      )
    ).status,
    409,
  );
  assert.equal((await call('/confirmar-grupo', 'POST', { token }, undefined, true)).status, 400);
  assert.equal(
    (await call('/aprobar-grupo', 'POST', { token, decision: 'reject' }, undefined, true)).status,
    200,
  );
  assert.equal(
    (await call('/aprobar-grupo', 'POST', { token, decision: 'approve' }, undefined, true)).status,
    409,
  );
  assert.equal((await call('/confirmar-grupo', 'POST', { token }, undefined, true)).status, 400);
  const last = (await call('/api/dev/platform-mail')).body.filter((m: any) => m.email === email);
  assert.equal(last.length, 1);
  assert.ok(!last[0].body.includes('/confirmar-grupo'));
});

test('root resumes valid legacy and private-group sessions without granting access from a navigation hint', async () => {
  const group = await createGroup('Grupo recordado', 'remembered@example.test');
  const me = await call('/api/me', 'GET', undefined, group);
  const hintCookie = me.headers
    .getSetCookie()
    .find((value) => value.startsWith('bandarlog_entry='))!;
  assert.ok(hintCookie.includes('HttpOnly'));
  assert.match(hintCookie, /Path=\/(?:;|$)/);
  const hint = hintCookie.split(';')[0];
  const rootSession = { ...group, base: '', cookie: hint };
  const resumed = await call('/', 'GET', undefined, rootSession);
  assert.equal(resumed.status, 303);
  assert.equal(resumed.headers.get('location'), group.base + '/');
  assert.match(resumed.headers.get('cache-control')!, /no-store/);
  assert.match(resumed.headers.get('vary')!, /Cookie/);
  assert.equal(
    (await call('/api/me', 'GET', undefined, { ...group, cookie: hint })).status,
    401,
    'navigation hint is never an API credential',
  );
  assert.equal((await call('/privacidad', 'GET', undefined, rootSession)).status, 200);
  const loggedOut = await call(
    '/api/logout',
    'POST',
    {},
    { ...group, cookie: group.cookie + '; ' + hint },
  );
  assert.equal(loggedOut.status, 200);
  assert.equal(
    (await call('/', 'GET', undefined, rootSession)).status,
    200,
    'revoked session returns the public landing',
  );

  const challenge = await call('/api/auth/code/request', 'POST', { email: 'alex@example.test' });
  assert.equal(challenge.status, 200);
  const mail = (await call('/api/dev/mail')).body
    .filter((m: any) => m.email === 'alex@example.test' && /\b\d{6}\b/.test(m.body))
    .at(-1);
  const verified = await call('/api/auth/code/verify', 'POST', {
    challengeId: challenge.body.challengeId,
    code: mail.body.match(/\b(\d{6})\b/)[1],
  });
  assert.equal(verified.status, 200);
  const legacyCookie = verified.headers
    .getSetCookie()
    .find((value) => value.startsWith('bandarlog='))!
    .split(';')[0];
  const oldInstall = { base: '', cookie: legacyCookie, csrf: '', userId: '' };
  const legacyRoot = await call('/', 'GET', undefined, oldInstall);
  assert.equal(legacyRoot.status, 303);
  assert.equal(legacyRoot.headers.get('location'), '/acceso');
  assert.equal(
    (await call('/api/me', 'GET', undefined, oldInstall)).body.user.email,
    'alex@example.test',
  );
  const manifest = (await call('/manifest.webmanifest')).body;
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/acceso');
  assert.equal(manifest.scope, '/');
});
