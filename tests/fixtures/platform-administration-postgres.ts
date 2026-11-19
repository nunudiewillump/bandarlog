import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { startComponents } from './components-postgres';
import { provisionTestContext, TEST_CONTEXT_SECRET } from './group-signing';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export async function exercisePlatformAdministration(testUrl: string, cluster: pg.Pool) {
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname),
    'Disposable local PostgreSQL required',
  );
  const dbName = 'bandarlog_platform_' + process.pid;
  assert.ok(/^[a-z0-9_]+$/.test(dbName));
  await cluster.query('CREATE DATABASE ' + dbName);
  const url = new URL(testUrl);
  url.pathname = '/' + dbName;
  const owner = new pg.Pool({ connectionString: url.toString(), max: 2 });
  let services: Awaited<ReturnType<typeof startComponents>> | undefined;
  const origin = 'https://bandarlog.app',
    base = 'http://127.0.0.1:3123';
  async function api(path: string, method = 'GET', body?: any, cookie = '', csrf?: string) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, headers: response.headers, data };
  }
  try {
    await migrate(drizzle(owner), { migrationsFolder: 'migrations' });
    await provisionTestContext(owner);
    for (const role of ['http', 'identity', 'delivery'])
      await owner.query('alter role bandarlog_' + role + ' login');
    await owner.query(
      "insert into public.scout_groups(id,private_id,name) values('platform-source',repeat('b',32),'Original group')",
    );
    await owner.query(
      "insert into public.users(group_id,id,name,email,role) values('platform-source','source-user','Independent admin','independent@example.test','admin')",
    );
    await owner.query(
      "insert into bandarlog_api.platform_admins(email,name) select email,name from public.users where id='source-user'",
    );
    // Real deletion in this disposable DB, BEFORE startup. No group or group user is left.
    await owner.query("delete from public.users where id='source-user'");
    await owner.query(
      "delete from public.scout_groups where id in ('platform-source','rosales-702')",
    );
    assert.equal(
      (await owner.query('select count(*)::integer n from public.scout_groups')).rows[0].n,
      0,
    );
    services = await startComponents(url.toString(), TEST_CONTEXT_SECRET);
    assert.equal((await api('/plataforma')).status, 200);
    assert.equal((await api('/api/platform/me')).status, 401);
    const groupCookie =
      '__Host-bandarlog-' + 'b'.repeat(32) + '=' + randomBytes(32).toString('hex');
    assert.equal((await api('/api/platform/overview', 'GET', undefined, groupCookie)).status, 401);
    const requested = await api('/api/platform/auth/code/request', 'POST', {
      email: 'independent@example.test',
    });
    assert.equal(requested.status, 202);
    const mail = (
      await owner.query(
        "select * from public.platform_mail where email='independent@example.test' order by created_at desc limit 1",
      )
    ).rows[0];
    const plain = services.decode(mail);
    const code = plain.body.match(/código de acceso es: (\d{6})/)![1];
    assert.equal(
      (
        await api('/api/platform/auth/code/verify', 'POST', {
          email: 'independent@example.test',
          challengeId: requested.data.challengeId,
          code: 'abcdef',
        })
      ).status,
      400,
    );
    const login = await api('/api/platform/auth/code/verify', 'POST', {
      email: 'independent@example.test',
      challengeId: requested.data.challengeId,
      code,
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-bandarlog-platform='))!;
    assert.ok(
      cookieHeader.includes('HttpOnly') &&
        cookieHeader.includes('Secure') &&
        cookieHeader.includes('SameSite=Strict') &&
        !cookieHeader.includes('Domain='),
    );
    let cookie = cookieHeader.split(';')[0];
    let me = await api('/api/platform/me', 'GET', undefined, cookie);
    assert.equal(me.status, 200);
    let csrf = me.data.csrf;
    assert.equal((await api('/api/platform/overview', 'GET', undefined, cookie)).status, 200);
    assert.equal(
      (
        await api('/api/platform/auth/code/verify', 'POST', {
          email: 'independent@example.test',
          challengeId: requested.data.challengeId,
          code,
        })
      ).status,
      400,
    );
    assert.equal(
      (await api('/api/platform/logout', 'POST', {}, cookie, 'f'.repeat(64))).status,
      403,
    );
    await services.restart();
    assert.equal(
      (await api('/api/platform/me', 'GET', undefined, cookie)).status,
      200,
      'independent session survives group deletion and process restart',
    );
    const oauth = await api('/api/platform/auth/google/start', 'GET', undefined, cookie);
    assert.equal(oauth.status, 302);
    const state = new URL(oauth.headers.get('location')!).searchParams.get('state')!;
    const flow = (
      await owner.query('select nonce from bandarlog_api.platform_oauth where id=$1', [hash(state)])
    ).rows[0];
    const browserCookie = oauth.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-bandarlog-platform-google-'))!
      .split(';')[0];
    const providerCode =
      'synthetic.' +
      Buffer.from(
        JSON.stringify({
          nonce: flow.nonce,
          sub: 'independent-platform-provider',
          email: 'independent@example.test',
          hd: 'example.test',
        }),
      ).toString('base64url');
    const callback = await api(
      '/api/auth/google/callback?state=' + state + '&code=' + providerCode,
      'GET',
      undefined,
      browserCookie,
    );
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/plataforma');
    const googleCookie = callback.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-bandarlog-platform='))!;
    assert.ok(googleCookie, 'Google issues an independent platform session with no group present');
    assert.equal(
      (await api('/api/platform/me', 'GET', undefined, cookie)).status,
      401,
      'Google rotates this browser platform session',
    );
    cookie = googleCookie.split(';')[0];
    me = await api('/api/platform/me', 'GET', undefined, cookie);
    csrf = me.data.csrf;
    assert.equal((await api('/api/platform/me', 'GET', undefined, cookie)).status, 200);
    const ordinaryRaw = randomBytes(32).toString('hex');
    await owner.query(
      "insert into public.scout_groups(id,private_id,name) values('ordinary',repeat('c',32),'Ordinary group')",
    );
    await owner.query(
      "insert into public.users(group_id,id,email,name,role) values('ordinary','ordinary-admin','other@example.test','Other admin','admin')",
    );
    await owner.query(
      "insert into public.sessions(group_id,id,user_id,csrf,expires,assurance,primary_verified_at) values('ordinary',$1,'ordinary-admin',repeat('d',64),now()+interval '1 day','primary',now())",
      [hash(ordinaryRaw)],
    );
    assert.equal(
      (await api('/api/platform/me', 'GET', undefined, '__Host-bandarlog-platform=' + ordinaryRaw))
        .status,
      401,
      'group bearer cannot become a platform session',
    );
    await owner.query(
      "insert into public.projects(group_id,id,name) values('ordinary','usage-project','PRIVATE PROJECT CONTENT')",
    );
    await owner.query(
      "insert into public.commissions(group_id,id,project_id,name,description,icon) values('ordinary','usage-commission','usage-project','Private commission','','')",
    );
    await owner.query(
      "insert into public.tasks(group_id,id,commission_id,title,description,due,status,updated_at) values('ordinary','usage-task','usage-commission','PRIVATE TASK CONTENT','PRIVATE DESCRIPTION',now(),'pending',now())",
    );
    await owner.query(
      "insert into public.activity(group_id,id,task_id,user_id,kind,body,created_at) values('ordinary','usage-comment','usage-task','ordinary-admin','comment','PRIVATE COMMENT CONTENT',now())",
    );
    const aggregate = await api('/api/platform/metrics', 'GET', undefined, cookie);
    assert.equal(aggregate.status, 200);
    assert.equal(aggregate.data.usage.comments, 1);
    assert.ok(!JSON.stringify(aggregate.data).includes('PRIVATE'));
    assert.ok(!JSON.stringify(aggregate.data).includes('other@example.test'));
    const requestId = hash('independent-request');
    await owner.query(
      "insert into public.group_registrations(id,email,name,group_name,color_primary,color_secondary,expires) values($1,'new-group@example.test','First admin','New isolated group','#123456','#654321',now()+interval '1 day')",
      [requestId],
    );
    const review = { decision: 'approve', reason: 'Checked fictitious request', confirmed: true };
    const [a, b] = await Promise.all([
      api('/api/platform/requests/' + requestId + '/review', 'POST', review, cookie, csrf),
      api('/api/platform/requests/' + requestId + '/review', 'POST', review, cookie, csrf),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.data.replayed !== b.data.replayed, true);
    assert.equal(
      (
        await owner.query('select count(*)::integer n from public.platform_mail where dedupe=$1', [
          'group-approved-' + requestId,
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await api(
          '/api/platform/requests/' + requestId + '/review',
          'POST',
          { ...review, decision: 'reject' },
          cookie,
          csrf,
        )
      ).status,
      409,
    );
    assert.equal((await api('/api/platform/test-mail', 'POST', {}, cookie, csrf)).status, 202);
    assert.equal((await api('/api/platform/test-mail', 'POST', {}, cookie, csrf)).status, 429);
    assert.equal(
      (
        await api(
          '/api/platform/test-mail',
          'POST',
          { email: 'attacker@example.test' },
          cookie,
          csrf,
        )
      ).status,
      400,
    );
    const identityUrl = new URL(url);
    identityUrl.username = 'bandarlog_identity';
    identityUrl.password = '';
    const identity = new pg.Pool({ connectionString: identityUrl.toString() });
    try {
      await assert.rejects(identity.query('select * from bandarlog_api.platform_admins'), {
        code: '42501',
      });
      await assert.rejects(
        identity.query("select bandarlog_api.platform_admin_auth('code.finish','{}',0,'forged')"),
        { code: '42501' },
      );
      await assert.rejects(
        identity.query(
          "select bandarlog_api.platform_admin_issue('x',repeat('a',64),repeat('b',64),'email','')",
        ),
        { code: '42501' },
      );
      await assert.rejects(
        identity.query('select bandarlog_api.platform_admin_close($1,NULL)', [
          cookie.split('=')[1],
        ]),
        { code: '42501' },
      );
    } finally {
      await identity.end();
    }
    for (const role of ['http', 'delivery']) {
      const deniedUrl = new URL(url);
      deniedUrl.username = 'bandarlog_' + role;
      deniedUrl.password = '';
      const denied = new pg.Pool({ connectionString: deniedUrl.toString() });
      try {
        await assert.rejects(denied.query('select * from bandarlog_api.platform_admins'), {
          code: '42501',
        });
        await assert.rejects(
          denied.query('select bandarlog_api.platform_admin_me($1)', [cookie.split('=')[1]]),
          { code: '42501' },
        );
        await assert.rejects(
          denied.query("select bandarlog_api.platform_admin_auth('code.finish','{}',0,'forged')"),
          { code: '42501' },
        );
      } finally {
        await denied.end();
      }
    }
    await owner.query(
      "update bandarlog_api.platform_admins set enabled=false where email='independent@example.test'",
    );
    assert.equal((await api('/api/platform/me', 'GET', undefined, cookie)).status, 403);
    await owner.query(
      "update bandarlog_api.platform_admins set enabled=true where email='independent@example.test'",
    );
    await owner.query(
      "update bandarlog_api.platform_sessions set created_at=now()-interval '16 minutes'",
    );
    assert.equal((await api('/api/platform/test-mail', 'POST', {}, cookie, csrf)).status, 428);
    await owner.query(
      "update bandarlog_api.platform_sessions set expires=now()-interval '1 second'",
    );
    assert.equal((await api('/api/platform/me', 'GET', undefined, cookie)).status, 401);
  } finally {
    await services?.stop();
    await owner.end();
    await cluster.query('DROP DATABASE ' + dbName + ' WITH (FORCE)');
  }
}
