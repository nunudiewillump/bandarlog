import { exerciseEvaluationTemplateBoundary } from './fixtures/evaluation-templates';
import { exerciseDeliveryProcess } from './fixtures/delivery-process-postgres';
import { exerciseMaintenance } from './fixtures/maintenance-postgres';
import { exerciseRestore } from './fixtures/restore-postgres';
import { exerciseServiceBoundary } from './fixtures/service-postgres';
import { startComponents } from './fixtures/components-postgres';
import { exerciseActorBoundary } from './fixtures/actor-postgres';
import { exercisePushWork } from './fixtures/push-work';
import { randomBytes, createHash as hashForTest } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { provisionTestContext, TEST_CONTEXT_SECRET } from './fixtures/group-signing';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seed } from '../server/seed';
import { pushService } from '../server/push';
import { connect } from '../server/db';
import { groupContext } from '../server/group-context';
import * as s from '../server/schema';
import { sql, eq } from 'drizzle-orm';

const testUrl = process.env.TEST_POSTGRES_URL;
assert.ok(
  testUrl,
  'TEST_POSTGRES_URL is mandatory: PostgreSQL security tests must never be silently skipped',
);
assert.ok(
  ['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname),
  'Use a disposable local database',
);
// The legacy compatibility test is explicit; production never infers this mode from a missing NODE_ENV.
process.env.APP_COMPONENT = 'development';
const ownerPool = new pg.Pool({ connectionString: testUrl });
const ownerDb = drizzle(ownerPool, { schema: s });
const runtimeUrl = new URL(testUrl);
runtimeUrl.username = 'bandarlog_runtime';
runtimeUrl.password = ''; // Isolated CI service uses local trust, never production credentials.
before(async () => {
  await migrate(ownerDb, { migrationsFolder: 'migrations' });
  await provisionTestContext(ownerPool);
  await ownerPool.query('alter role bandarlog_runtime login');
  for (const role of ['http', 'identity', 'delivery'])
    await ownerPool.query('alter role bandarlog_' + role + ' login');
  await ownerPool.query("select set_config('bandarlog.group_id','rosales-702',false)");
  await seed(ownerDb);
});
after(async () => {
  await ownerPool.end();
});

test('PostgreSQL pooled queries and transactions retain the correct group and reset the role', async () => {
  const testUrl = process.env.TEST_POSTGRES_URL!;
  const parsed = new URL(testUrl);
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(parsed.hostname),
    'Use a dedicated local PostgreSQL test database',
  );
  const old = process.env.DATABASE_URL;
  process.env.DATABASE_URL = runtimeUrl.toString();
  const { db, global: platform, close } = await connect();
  try {
    const groups = await ownerDb
      .insert(s.groups)
      .values(Array.from({ length: 10 }, (_, n) => ({ name: `Pooled group ${n}` })))
      .returning();
    for (const group of groups)
      await groupContext.run(group, async () => {
        await db.insert(s.users).values({
          id: group.id,
          name: group.name,
          email: 'pool-shared@example.test',
          role: 'admin',
        });
      });
    await assert.rejects(db.select().from(s.users));
    await Promise.all(
      groups.map((group) =>
        groupContext.run(group, async () => {
          for (let i = 0; i < 6; i++) {
            const rows = await db.select().from(s.users);
            assert.equal(rows.length, 1);
            assert.equal(rows[0].groupId, group.id);
            await db.transaction(async (tx) => {
              const r = await tx.execute(sql`select current_user as role`);
              assert.equal(r.rows[0].role, 'bandarlog_group_app');
              assert.equal((await tx.select().from(s.users))[0].id, group.id);
            });
          }
          await assert.rejects(db.select().from(s.platformMail));
          await assert.rejects(db.select().from(s.groups));
          await assert.rejects(
            db.transaction(async (tx) => {
              await tx.insert(s.projects).values({ id: group.id, name: 'Rolled back' });
              throw Error('rollback-test');
            }),
            /rollback-test/,
          );
          assert.equal((await db.select().from(s.projects)).length, 0);
        }),
      ),
    );
    await groupContext.run(groups[0], async () => {
      const other = groups[1];
      assert.equal((await db.select().from(s.users).where(eq(s.users.id, other.id))).length, 0);
      assert.equal(
        (
          await db
            .update(s.users)
            .set({ name: 'Forbidden' })
            .where(eq(s.users.id, other.id))
            .returning()
        ).length,
        0,
      );
      await assert.rejects(
        db.insert(s.projects).values({ id: 'cross-group', groupId: other.id, name: 'Forbidden' }),
      );
      await assert.rejects(
        db
          .insert(s.assignments)
          .values({ id: 'cross-assignment', taskId: 'missing-other-task', userId: other.id }),
      );
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.execute(sql`select set_config('bandarlog.group_id',${other.id},true)`);
          await tx.select().from(s.users);
        }),
        /Failed query/,
      );
      // The actor check must reject a forged session even with a VALID signed group context.
      await assert.rejects(
        platform.updateGroup('forged-session', {
          name: 'Forbidden',
          colorPrimary: '#112233',
          colorSecondary: '#334455',
        }),
        (error: any) => error.cause?.code === '42501',
      );
      await assert.rejects(db.execute(sql`set role postgres`));
      await assert.rejects(db.execute(sql`set role neondb_owner`));
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.execute(sql`select 1/0`);
        }),
      );
      assert.equal((await db.select().from(s.users))[0].groupId, groups[0].id);
    });
    const raw = new pg.Pool({ connectionString: runtimeUrl.toString(), max: 1 });
    try {
      for (const table of [
        'scout_groups',
        'group_registrations',
        'platform_mail',
        'push_keys',
        'users',
        'bandarlog_api.context_key',
      ])
        await assert.rejects(
          raw.query('select * from ' + (table.includes('.') ? table : 'public.' + table)),
          (e: any) => e.code === '42501',
        );
      await assert.rejects(raw.query('set role postgres'), (e: any) => e.code === '42501');
      const row = (
        await raw.query(
          "select current_user, current_setting('bandarlog.group_id',true) as context",
        )
      ).rows[0];
      assert.equal(row.current_user, 'bandarlog_runtime');
      assert.ok(!row.context);
      await raw.query('begin');
      await raw.query('set local role bandarlog_group_app');
      await assert.rejects(raw.query('select * from users'), (e: any) => e.code === '42501');
      await raw.query('rollback');
      await raw.query('begin');
      await raw.query('set local role bandarlog_group_app');
      await assert.rejects(
        raw.query(
          "insert into users(id,name,email,role) values('no-context','No','no-context@example.test','member')",
        ),
      );
      await raw.query('rollback');
      assert.equal(
        (await raw.query('select current_user')).rows[0].current_user,
        'bandarlog_runtime',
      );
      // The definer validates a live admin session in the active group, independently of Express.
      await raw.query('begin');
      await raw.query("select set_config('bandarlog.group_id',$1,true)", [groups[0].id]);
      await assert.rejects(
        raw.query(
          "select bandarlog_api.update_group('forged-session','Forbidden','#112233','#334455')",
        ),
        (e: any) => e.code === '42501',
      );
      await raw.query('rollback');
      assert.equal(
        (
          await raw.query('select bandarlog_api.activate_group($1,$2,$3) as value', [
            'f'.repeat(64),
            'a'.repeat(64),
            'b'.repeat(64),
          ])
        ).rows[0].value,
        null,
      );
    } finally {
      await raw.end();
    }
    const delivered: string[] = [];
    const push = await pushService(
      db,
      'https://example.test',
      undefined,
      async (subscription: any) => {
        delivered.push(subscription.endpoint);
        return { statusCode: 201, body: '', headers: {} };
      },
      platform.pushKeys,
    );
    await Promise.all(
      groups.map((group) =>
        groupContext.run(group, async () => {
          await db.insert(s.notifications).values({
            id: 'mail-' + group.id,
            dedupe: 'mail-' + group.id,
            email: group.id + '@example.test',
            subject: group.name,
            body: group.id,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
          await db
            .insert(s.pushOutbox)
            .values({ id: 'push-' + group.id, userId: group.id, payload: '{}' });
          await db.insert(s.pushSubscriptions).values({
            id: 'device-' + group.id,
            userId: group.id,
            subscription: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/' + group.id }),
          });
          const mail = await db.select().from(s.notifications);
          assert.equal(mail.length, 1);
          assert.equal(mail[0].body, group.id);
          assert.equal(mail[0].email, group.id + '@example.test');
          assert.equal(
            await push.send(
              group.id,
              { title: 'Synthetic', body: group.id, url: '/', tag: 'qa' },
              'push-' + group.id,
            ),
            true,
          );
        }),
      ),
    );
    assert.deepEqual(
      delivered.sort(),
      groups.map((g) => 'https://fcm.googleapis.com/' + g.id).sort(),
    );
    const stateHash = randomBytes(32).toString('hex');
    await ownerDb.insert(s.googleStates).values({
      id: stateHash,
      groupId: groups[1].id,
      browser: 'test',
      nonce: 'test',
      verifier: 'test',
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    assert.equal((await platform.oauthGroup(stateHash))?.id, groups[1].id);
    assert.equal(await platform.oauthGroup('unknown'), null);
    // Startup rejects both the former owner credential and a mismatched signing key.
    process.env.DATABASE_URL = testUrl;
    await assert.rejects(connect(), /runtime/);
    process.env.DATABASE_URL = runtimeUrl.toString();
    process.env.GROUP_CONTEXT_SECRET = '99'.repeat(32);
    await assert.rejects(connect());
    process.env.GROUP_CONTEXT_SECRET = TEST_CONTEXT_SECRET;
    await provisionTestContext(ownerPool);
    await exercisePushWork(db, ownerDb);
    const role = await ownerDb.execute(sql`select current_user as role`);
    assert.notEqual(role.rows[0].role, 'bandarlog_group_app');
  } finally {
    await close();
    if (old === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old;
  }
});

test('production public pages and legacy-domain redirects preserve safe links without forwarding posts', async () => {
  const { spawn } = await import('node:child_process');
  const testUrl = process.env.TEST_POSTGRES_URL!;
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname));
  await ownerPool.query('update bandarlog_api.security_configuration set mfa_enforced=false');
  const { stop, decode } = await startComponents(testUrl, TEST_CONTEXT_SECRET);
  try {
    const { request: httpRequest } = await import('node:http');
    const request = (
      path: string,
      host = 'bandarlog.app',
      method = 'GET',
      body?: string,
      cookie?: string,
    ) =>
      new Promise<{ status: number; headers: Headers; text: () => Promise<string> }>(
        (resolve, reject) => {
          const q = httpRequest(
            {
              hostname: '127.0.0.1',
              port: 3123,
              path,
              method,
              headers: {
                Host: host,
                ...(cookie ? { Cookie: cookie } : {}),
                ...(body ? { 'Content-Type': 'application/json', Origin: 'https://' + host } : {}),
              },
            },
            (response) => {
              let content = '';
              response.on('data', (x) => (content += x));
              response.on('end', () =>
                resolve({
                  status: response.statusCode!,
                  headers: new Headers(
                    Object.entries(response.headers).flatMap(([k, v]) =>
                      typeof v === 'string'
                        ? [[k, v]]
                        : Array.isArray(v)
                          ? v.map((value) => [k, value])
                          : [],
                    ),
                  ),
                  text: async () => content,
                }),
              );
            },
          );
          q.on('error', reject);
          if (body) q.write(body);
          q.end();
        },
      );
    type Login = { base: string; cookie: string; csrf: string; userId: string };
    async function api(path: string, method = 'GET', body?: unknown, login?: Login, form = false) {
      const response = await fetch('http://127.0.0.1:3123' + (login?.base || '') + path, {
        method,
        redirect: 'manual',
        headers: {
          Origin: 'https://bandarlog.app',
          ...(body
            ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }
            : {}),
          ...(login ? { Cookie: login.cookie, 'X-CSRF-Token': login.csrf } : {}),
        },
        body: body
          ? form
            ? new URLSearchParams(body as Record<string, string>).toString()
            : JSON.stringify(body)
          : undefined,
      });
      const text = await response.text();
      let data: any = text;
      try {
        data = JSON.parse(text);
      } catch {}
      return { status: response.status, data, headers: response.headers };
    }
    assert.match(
      (await api('/presentacion?token=synthetic', 'GET', undefined, undefined, true)).headers.get(
        'cache-control',
      ) || '',
      /no-store/,
    );
    async function completeEmailLogin(login: Login) {
      const raw = login.cookie.slice(login.cookie.indexOf('=') + 1);
      const [session] = await ownerDb
        .select()
        .from(s.sessions)
        .where(eq(s.sessions.id, hashForTest('sha256').update(raw).digest('hex')));
      const [user] = await ownerDb.select().from(s.users).where(eq(s.users.id, session.userId));
      const requested = await api('/api/auth/code/request', 'POST', { email: user.email }, login);
      assert.equal(requested.status, 200);
      const mails = (
        await ownerDb.select().from(s.notifications).where(eq(s.notifications.email, user.email))
      ).map(decode);
      const mail = mails.filter((m) => m.body.includes('Tu código de acceso es:')).at(-1)!;
      const verified = await api(
        '/api/auth/code/verify',
        'POST',
        {
          challengeId: requested.data.challengeId,
          code: mail.body.match(/código de acceso es: (\d{6})/)![1],
        },
        login,
      );
      assert.equal(verified.status, 200);
      login.cookie = verified.headers
        .getSetCookie()
        .find((c) => /^(?:__Host-bandarlog-[a-f0-9]{32}|bandarlog)=/.test(c))!
        .split(';')[0];
      const me = await api('/api/me', 'GET', undefined, login);
      assert.equal(me.status, 200);
      login.csrf = me.data.csrf;
    }
    async function register(name: string): Promise<Login> {
      const email = ('pg-' + name + '@example.test').toLowerCase();
      assert.equal(
        (
          await api(
            '/crear-grupo',
            'POST',
            { groupName: name, name: 'Admin', email, terms: 'accepted' },
            undefined,
            true,
          )
        ).status,
        202,
      );
      const mail = (await ownerDb.select().from(s.platformMail))
        .map(decode)
        .filter((m) => m.body.includes(email))
        .at(-1)!;
      const approvalUrl = new URL(mail.body.match(/^https?:\/\/\S+$/m)![0]);
      assert.equal(approvalUrl.searchParams.get('token'), null);
      const approval = new URLSearchParams(approvalUrl.hash.slice(1)).get('token')!;
      assert.equal(
        (await api('/aprobar-grupo/revisar', 'POST', { token: approval }, undefined, true)).status,
        200,
      );
      assert.equal(
        (await api('/confirmar-grupo', 'POST', { token: approval }, undefined, true)).status,
        400,
      );
      assert.equal(
        (
          await api(
            '/aprobar-grupo',
            'POST',
            { token: approval, decision: 'approve' },
            undefined,
            true,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await api(
            '/aprobar-grupo',
            'POST',
            { token: approval, decision: 'approve' },
            undefined,
            true,
          )
        ).status,
        409,
      );
      const activationMail = (
        await ownerDb.select().from(s.platformMail).where(eq(s.platformMail.email, email))
      )
        .map(decode)
        .at(-1)!;
      const activationUrl = new URL(activationMail.body.match(/^https?:\/\/\S+$/m)![0]);
      assert.equal(activationUrl.searchParams.get('token'), null);
      const activation = new URLSearchParams(activationUrl.hash.slice(1)).get('token')!;
      assert.equal(
        (await api('/confirmar-grupo/revisar', 'POST', { token: activation }, undefined, true))
          .status,
        200,
      );
      const activated = await api(
        '/confirmar-grupo',
        'POST',
        { token: activation },
        undefined,
        true,
      );
      assert.equal(activated.status, 303);
      assert.equal(
        (await api('/confirmar-grupo', 'POST', { token: activation }, undefined, true)).status,
        400,
      );
      const login = {
        base: activated.headers.get('location')!.replace(/\/$/, ''),
        cookie: activated.headers
          .getSetCookie()
          .find((c) => /^(?:__Host-bandarlog-[a-f0-9]{32}|bandarlog)=/.test(c))!
          .split(';')[0],
        csrf: '',
        userId: '',
      };
      assert.equal((await api('/api/me', 'GET', undefined, login)).status, 200);
      await completeEmailLogin(login);
      const me = await api('/api/me', 'GET', undefined, login);
      assert.equal(me.status, 200);
      assert.equal(JSON.parse(me.data.user.preferences).foundingAdmin, true);
      login.csrf = me.data.csrf;
      login.userId = me.data.user.id;
      return login;
    }
    const a = await register('A-' + Date.now()),
      b = await register('B-' + Date.now());
    assert.equal((await api(a.base + '/api/data')).status, 401);
    assert.equal((await api('/api/me', 'GET', undefined, { ...b, cookie: a.cookie })).status, 401);
    // Synthetic grants exercise the real database/HTTP exchange without contacting Google.
    const digest = (value: string) => hashForTest('sha256').update(value).digest('hex');
    const proof = randomBytes(32).toString('hex'),
      ticket = randomBytes(32).toString('hex');
    const groupA = (await ownerDb.select().from(s.users).where(eq(s.users.id, a.userId)))[0]
      .groupId;
    await ownerDb.insert(s.googleHandoffs).values({
      id: digest(ticket),
      groupId: groupA,
      challenge: digest(proof),
      userId: a.userId,
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    assert.equal((await api('/api/auth/google/return', 'POST', { ticket, proof }, b)).status, 403);
    assert.equal(
      (await api('/api/auth/google/return', 'POST', { ticket, proof: 'f'.repeat(64) }, a)).status,
      403,
    );
    assert.equal(
      (
        await api(
          '/api/auth/google/start?handoff_challenge=' +
            digest(proof) +
            '&handoff_origin=' +
            encodeURIComponent('https://evil.example'),
          'GET',
          undefined,
          a,
        )
      ).status,
      400,
    );
    const start = await api(
      '/api/auth/google/start?handoff_challenge=' +
        digest(proof) +
        '&handoff_origin=' +
        encodeURIComponent('https://bandarlog.app'),
      'GET',
      undefined,
      a,
    );
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const storedState = (
      await ownerDb
        .select()
        .from(s.googleStates)
        .where(eq(s.googleStates.id, digest(state)))
    )[0];
    assert.equal(storedState.returnOrigin, 'https://bandarlog.app');
    assert.equal(storedState.handoffChallenge, digest(proof));
    const flowCookie = start.headers
      .getSetCookie()
      .find((c) => /^__Host-bandarlog-google-[a-f0-9]{64}=/.test(c))!
      .split(';')[0];
    const syntheticEmail = (await ownerDb.select().from(s.users).where(eq(s.users.id, a.userId)))[0]
      .email;
    const code =
      'synthetic.' +
      Buffer.from(
        JSON.stringify({
          nonce: storedState.nonce,
          sub: 'synthetic-provider-' + a.userId,
          email: syntheticEmail,
          hd: 'example.test',
        }),
      ).toString('base64url');
    const callback = await api(
      '/api/auth/google/callback?state=' + state + '&code=' + code,
      'GET',
      undefined,
      { ...a, cookie: flowCookie },
      true,
    );
    assert.equal(callback.status, 200);
    const issuedResume = callback.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-bandarlog-google-resume-'))!;
    assert.ok(
      issuedResume &&
        issuedResume.includes('HttpOnly') &&
        issuedResume.includes('Secure') &&
        issuedResume.includes('SameSite=Lax') &&
        issuedResume.includes('Max-Age=60') &&
        !issuedResume.includes('Domain='),
    );
    assert.ok(callback.data.includes('https://bandarlog.app'));
    const fullResume = await api(
      '/api/auth/google/resume',
      'POST',
      { proof },
      { ...a, cookie: a.cookie + '; ' + issuedResume.split(';')[0] },
    );
    assert.equal(fullResume.status, 200, 'signed provider callback resumes without postMessage');
    a.cookie = fullResume.headers
      .getSetCookie()
      .find((c) => /^__Host-bandarlog-[a-f0-9]{32}=/.test(c))!
      .split(';')[0];
    a.csrf = (await api('/api/me', 'GET', undefined, a)).data.csrf;

    const returned = await api('/api/auth/google/return', 'POST', { ticket, proof }, a);
    assert.equal(returned.status, 200);
    a.cookie = returned.headers
      .getSetCookie()
      .find((c) => /^(?:__Host-bandarlog-[a-f0-9]{32}|bandarlog)=/.test(c))!
      .split(';')[0];
    const primaryMe = await api('/api/me', 'GET', undefined, a);
    assert.equal(primaryMe.status, 200, 'Google primary session grants direct access');
    a.csrf = primaryMe.data.csrf;
    assert.equal((await api('/api/auth/passkeys/status', 'GET', undefined, a)).status, 404);
    assert.equal((await api('/api/auth/passkeys/register/options', 'POST', {}, a)).status, 404);
    assert.ok(
      returned.headers
        .getSetCookie()
        .some(
          (c) =>
            /^(?:__Host-bandarlog-[a-f0-9]{32}|bandarlog)=/.test(c) &&
            c.includes('HttpOnly') &&
            c.includes('Path=/') &&
            !c.includes('Domain='),
        ),
    );
    assert.equal((await api('/api/auth/google/return', 'POST', { ticket, proof }, a)).status, 403);
    // A chosen proof in somebody else's Google URL must not be enough to log in.
    const resumeProof = randomBytes(32).toString('hex'),
      resumeTicket = randomBytes(32).toString('hex');
    await ownerDb.insert(s.googleHandoffs).values({
      id: digest(resumeTicket),
      groupId: groupA,
      challenge: digest(resumeProof),
      userId: a.userId,
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    const resumeName =
      '__Host-bandarlog-google-resume-' + a.base.split('/').at(-1) + '-' + digest(resumeProof);
    assert.equal(
      (await api('/api/auth/google/resume', 'POST', { proof: resumeProof }, a)).status,
      202,
      'proof alone cannot resume',
    );
    const wrongBrowser = {
      ...a,
      cookie: a.cookie + '; ' + resumeName + '=' + randomBytes(32).toString('hex'),
    };
    assert.equal(
      (await api('/api/auth/google/resume', 'POST', { proof: resumeProof }, wrongBrowser)).status,
      202,
      'another browser cookie cannot resume',
    );
    const bound = { ...a, cookie: a.cookie + '; ' + resumeName + '=' + resumeTicket };
    assert.equal(
      (
        await api(
          '/api/auth/google/resume',
          'POST',
          { proof: resumeProof },
          {
            ...b,
            cookie:
              b.cookie +
              '; __Host-bandarlog-google-resume-' +
              b.base.split('/').at(-1) +
              '-' +
              digest(resumeProof) +
              '=' +
              resumeTicket,
          },
        )
      ).status,
      202,
      'another group cannot resume',
    );
    const resumedGoogle = await api(
      '/api/auth/google/resume',
      'POST',
      { proof: resumeProof },
      bound,
    );
    assert.equal(resumedGoogle.status, 200);
    a.cookie = resumedGoogle.headers
      .getSetCookie()
      .find((c) => /^__Host-bandarlog-[a-f0-9]{32}=/.test(c))!
      .split(';')[0];
    a.csrf = (await api('/api/me', 'GET', undefined, a)).data.csrf;
    assert.equal(
      (await api('/api/auth/google/resume', 'POST', { proof: resumeProof }, bound)).status,
      202,
      'one use only',
    );
    assert.equal(
      (
        await api(
          '/api/auth/google/return',
          'POST',
          { ticket: resumeTicket, proof: resumeProof },
          a,
        )
      ).status,
      403,
    );
    const concurrentTicket = randomBytes(32).toString('hex');
    await ownerDb.insert(s.googleHandoffs).values({
      id: digest(concurrentTicket),
      groupId: groupA,
      challenge: digest(proof),
      userId: a.userId,
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    const concurrent = await Promise.all([
      api('/api/auth/google/return', 'POST', { ticket: concurrentTicket, proof }, a),
      api(
        '/api/auth/google/resume',
        'POST',
        { proof },
        {
          ...a,
          cookie:
            a.cookie +
            '; __Host-bandarlog-google-resume-' +
            a.base.split('/').at(-1) +
            '-' +
            digest(proof) +
            '=' +
            concurrentTicket,
        },
      ),
    ]);
    assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
    assert.ok(
      concurrent.filter((r) => r.status !== 200).every((r) => [202, 403].includes(r.status)),
    );
    a.cookie = concurrent
      .find((r) => r.status === 200)!
      .headers.getSetCookie()
      .find((c) => /^(?:__Host-bandarlog-[a-f0-9]{32}|bandarlog)=/.test(c))!
      .split(';')[0];
    a.csrf = (await api('/api/me', 'GET', undefined, a)).data.csrf;
    const expired = randomBytes(32).toString('hex');
    await ownerDb.insert(s.googleHandoffs).values({
      id: digest(expired),
      groupId: groupA,
      challenge: digest(proof),
      userId: a.userId,
      expires: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(
      (await api('/api/auth/google/return', 'POST', { ticket: expired, proof }, a)).status,
      403,
    );
    const linkTicket = randomBytes(32).toString('hex');
    await ownerDb.insert(s.googleHandoffs).values({
      id: digest(linkTicket),
      groupId: groupA,
      challenge: digest(proof),
      googleSubject: 'synthetic-subject',
      googleEmail: 'synthetic@example.test',
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    const linking = await api('/api/auth/google/return', 'POST', { ticket: linkTicket, proof }, a);
    assert.equal(linking.status, 200);
    assert.equal(linking.data.needsEmailVerification, true);
    assert.ok(
      linking.headers
        .getSetCookie()
        .some((c) => c.startsWith('__Host-bandarlog-google-link-') && c.includes('HttpOnly')),
    );
    const project = await api(
      '/api/projects',
      'POST',
      { name: 'A project', type: 'camp', starts: '2027-01-01', ends: '2027-01-07' },
      a,
    );
    assert.equal(project.status, 201);
    const commission = await api(
      '/api/commissions',
      'POST',
      {
        name: 'A commission',
        projectId: project.data.id,
        members: [{ userId: a.userId, role: 'responsible' }],
      },
      a,
    );
    assert.equal(commission.status, 201);
    const task = await api(
      '/api/tasks',
      'POST',
      {
        title: 'Private task',
        commissionId: commission.data.id,
        due: '2027-01-05T21:59:59Z',
        responsibleIds: [a.userId],
      },
      a,
    );
    assert.equal(task.status, 201);
    assert.equal((await api('/api/data', 'GET', undefined, b)).data.tasks.length, 0);
    assert.equal(
      (await api('/api/tasks/' + task.data.id, 'PATCH', { title: 'Forbidden' }, b)).status,
      404,
    );
    assert.ok(
      [400, 404, 409].includes(
        (
          await api(
            '/api/commissions',
            'POST',
            {
              name: 'Cross',
              projectId: project.data.id,
              members: [{ userId: b.userId, role: 'responsible' }],
            },
            b,
          )
        ).status,
      ),
    );
    assert.equal(
      (
        await api(
          '/api/group',
          'PATCH',
          { name: 'A updated', colorPrimary: '#112233', colorSecondary: '#334455' },
          a,
        )
      ).status,
      200,
    );
    assert.notEqual((await api('/api/group', 'GET', undefined, b)).data.name, 'A updated');
    assert.equal((await api('/api/profile', 'PATCH', { name: 'Updated profile' }, a)).status, 200);
    const spa = await request(a.base + '/');
    assert.equal(spa.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    const healthHeaders = await request('/api/health');
    assert.equal(healthHeaders.headers.get('cross-origin-opener-policy'), 'same-origin');
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Menos lío/);
    const policy = await request('/privacidad');
    assert.equal(policy.status, 200);
    assert.match(await policy.text(), /hello@bandarlog.app/);
    const legacy = 'bandarlog-production.up.railway.app';
    const { Client } = await import('pg');
    const { createHash } = await import('node:crypto');
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      const token = 'c'.repeat(64);
      await client.query(
        "insert into users(id, group_id, name, email, role) values ('entry-production-user','rosales-702','Legacy test','legacy-entry@example.test','member') on conflict(id) do update set disabled_at=null",
      );
      await client.query(
        "insert into sessions(id, group_id, user_id, csrf, renewed_at, expires, absolute_expires_at) values ($1,'rosales-702','entry-production-user','test-only', now()-interval '2 days',now()+interval '1 day',now()+interval '2 days') on conflict(id) do update set renewed_at=excluded.renewed_at, expires=excluded.expires, absolute_expires_at=excluded.absolute_expires_at",
        [createHash('sha256').update(token).digest('hex')],
      );
      for (const host of ['bandarlog.app', legacy]) {
        const resumed = await request('/', host, 'GET', undefined, 'bandarlog=' + token);
        assert.equal(resumed.status, 303);
        assert.equal(
          resumed.headers.get('location'),
          '/g/' +
            (await ownerDb.select().from(s.groups).where(eq(s.groups.id, 'rosales-702')))[0]
              .privateId +
            '/',
          'the legacy session stays on its current origin',
        );
        assert.match(resumed.headers.get('cache-control')!, /no-store/);
      }
      assert.equal(
        (await request('/api/me', legacy, 'GET', undefined, 'bandarlog=' + token)).status,
        428,
        'Unscoped legacy cookies still require a new login with email or Google',
      );
      const legacyPrivate = (
        await ownerDb.select().from(s.groups).where(eq(s.groups.id, 'rosales-702'))
      )[0].privateId;
      const legacyProof = randomBytes(32).toString('hex');
      const legacyChallenge = createHash('sha256').update(legacyProof).digest('hex');
      const legacyStart = await request(
        '/g/' +
          legacyPrivate +
          '/api/auth/google/start?handoff_challenge=' +
          legacyChallenge +
          '&handoff_origin=' +
          encodeURIComponent('https://' + legacy),
        'bandarlog.app',
      );
      assert.equal(legacyStart.status, 302);
      const legacyState = new URL(legacyStart.headers.get('location')!).searchParams.get('state')!;
      const legacyStateRow = (
        await ownerDb
          .select()
          .from(s.googleStates)
          .where(eq(s.googleStates.id, createHash('sha256').update(legacyState).digest('hex')))
      )[0];
      assert.equal(legacyStateRow.returnOrigin, 'https://' + legacy);
      const legacyAccount = (
        await ownerDb.select().from(s.users).where(eq(s.users.id, 'entry-production-user'))
      )[0];
      const legacyCode =
        'synthetic.' +
        Buffer.from(
          JSON.stringify({
            nonce: legacyStateRow.nonce,
            sub: 'synthetic-legacy-' + legacyAccount.id,
            email: legacyAccount.email,
            hd: legacyAccount.email.split('@')[1],
          }),
        ).toString('base64url');
      const legacyFlowCookie = legacyStart.headers
        .getSetCookie()
        .find((c) => /^__Host-bandarlog-google-[a-f0-9]{64}=/.test(c))!
        .split(';')[0];
      const legacyCallback = await request(
        '/api/auth/google/callback?state=' + legacyState + '&code=' + legacyCode,
        'bandarlog.app',
        'GET',
        undefined,
        legacyFlowCookie,
      );
      assert.equal(legacyCallback.status, 200);
      const legacyDocument = await legacyCallback.text();
      assert.ok(
        legacyDocument.includes(JSON.stringify('https://' + legacy)),
        'postMessage targets the initiating legacy origin',
      );
      const legacyTicket = legacyDocument.match(/"ticket":"([a-f0-9]{64})"/)![1];
      const legacyReturn = await request(
        '/g/' + legacyPrivate + '/api/auth/google/return',
        legacy,
        'POST',
        JSON.stringify({ ticket: legacyTicket, proof: legacyProof }),
      );
      assert.equal(legacyReturn.status, 200, 'legacy PWA can consume its own returned proof');
      const canonicalGoogle = await request(
        '/g/' + legacyPrivate + '/api/auth/google/start?handoff_challenge=' + 'd'.repeat(64),
        legacy,
      );
      assert.equal(canonicalGoogle.status, 308);
      assert.equal(
        new URL(canonicalGoogle.headers.get('location')!).origin,
        'https://bandarlog.app',
      );
      assert.ok(
        !canonicalGoogle.headers.get('set-cookie'),
        'state cookies are minted only after canonical navigation',
      );
      const renewed = await request(
        '/api/me',
        legacy,
        'GET',
        undefined,
        '__Host-bandarlog-' + legacyPrivate + '=' + token,
      );
      assert.equal(renewed.status, 200);
      const hint = renewed.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-bandarlog_entry='))!;
      assert.ok(hint.includes('Secure') && hint.includes('HttpOnly'));
      assert.ok(
        Number(hint.match(/Max-Age=(\d+)/)![1]) > 1.8 * 86400,
        'the navigation hint uses the renewed deadline, capped by absolute expiry',
      );
      await client.query("update users set disabled_at=now() where id='entry-production-user'");
      assert.equal(
        (await request('/', 'bandarlog.app', 'GET', undefined, 'bandarlog=' + token)).status,
        200,
      );
      assert.equal(
        (await request('/', legacy, 'GET', undefined, 'bandarlog=' + token)).status,
        308,
      );
    } finally {
      await client.end();
    }

    const link = await request('/?token=test-only-token&task=old-task', legacy);
    assert.equal(link.status, 308);
    assert.equal(
      link.headers.get('location'),
      'https://bandarlog.app/?token=test-only-token&task=old-task',
    );
    assert.equal((await request('/api/health', legacy)).status, 200);
    assert.equal((await request('/acceso', legacy)).status, 303);
    const invalid = await request(
      '/api/auth/code/request',
      legacy,
      'POST',
      JSON.stringify({ email: 'invalid' }),
    );
    assert.equal(invalid.status, 400);
    assert.ok(!invalid.headers.get('location'));
    assert.equal((await request('/suscripcion-demo', legacy, 'POST', '{}')).status, 404);
  } finally {
    await stop();
  }
});

test('emergency rollback and signed-policy resume preserve rows and are executable', async () => {
  const client = await ownerPool.connect();
  try {
    const before = (await client.query('select count(*)::text as n from users')).rows[0].n;
    await client.query(await readFile('scripts/security/rollback-0019.sql', 'utf8'));
    await client.query('begin');
    await client.query("select set_config('bandarlog.group_id','rosales-702',true)");
    await client.query('set local role bandarlog_group_app');
    await client.query('select id from users');
    await client.query('rollback');
    await client.query(await readFile('scripts/security/resume-0019.sql', 'utf8'));
    assert.equal((await client.query('select count(*)::text as n from users')).rows[0].n, before);
    await client.query('begin');
    await client.query("select set_config('bandarlog.group_id','rosales-702',true)");
    await client.query('set local role bandarlog_group_app');
    await assert.rejects(client.query('select id from users'), (e: any) => e.code === '42501');
    await client.query('rollback');
  } finally {
    await client.query('rollback');
    await client.query(await readFile('scripts/security/resume-0019.sql', 'utf8'));
    client.release();
  }
});

test('HTTP LOGIN enforces individual authority, preimage proof and ten concurrent groups', async () => {
  await exerciseActorBoundary(ownerPool, testUrl!);
});

test('service LOGINs reject foreign capabilities, forged credentials and group role escalation', async () => {
  await exerciseServiceBoundary(ownerPool, testUrl!, TEST_CONTEXT_SECRET);
});

test('a disposable backup restores tasks/history and preserves the HTTP boundary', async () => {
  await exerciseRestore(ownerPool, testUrl!);
});

test('maintenance scripts preserve mail, provision exclusive protected keys and retire the old LOGIN', async () => {
  await exerciseMaintenance(ownerPool, process.env.TEST_POSTGRES_URL!);
});

test('production delivery decrypts isolated email/push and preserves retries, leases and receipts across restart', async () => {
  await exerciseDeliveryProcess(ownerPool, process.env.TEST_POSTGRES_URL!, TEST_CONTEXT_SECRET);
});

test('platform administration remains independent after deleting its source group and user, including Google and restart', async () => {
  const { exercisePlatformAdministration } =
    await import('./fixtures/platform-administration-postgres');
  await exercisePlatformAdministration(testUrl!, ownerPool);
});


test('PostgreSQL isolates evaluation templates and makes published versions immutable', async () => {
  await exerciseEvaluationTemplateBoundary({
    query: (query, params) => ownerPool.query(query, params),
    async transaction(fn) {
      const connection = await ownerPool.connect();
      try {
        await connection.query('begin');
        const result = await fn(connection);
        await connection.query('commit');
        return result;
      } catch (error) {
        await connection.query('rollback');
        throw error;
      } finally {
        connection.release();
      }
    },
  });
});

test('PostgreSQL scopes assigned evaluations and protects draft and submission state', async () => {
  await ownerPool.query(`
    insert into scout_groups(id,name) values ('p2-qa','P2 QA'),('p2-foreign','P2 Foreign');
    insert into users(group_id,id,name,email,role) values
      ('p2-qa','p2-manager','Manager','manager@example.test','coordination'),
      ('p2-qa','p2-member','Member','member@example.test','member'),
      ('p2-qa','p2-unassigned','Unassigned','unassigned@example.test','member'),
      ('p2-foreign','p2-foreign-admin','Foreign','foreign@example.test','admin');
    insert into evaluation_templates(group_id,id,structure) values ('p2-qa','p2-template',
      '{"sections":[{"questions":[{"id":"yes","type":"yesNo"},{"id":"note","type":"longText"}]}]}');
    insert into evaluation_template_versions(group_id,template_id,revision,structure,published_by)
      select group_id,id,1,structure,'p2-manager' from evaluation_templates where id='p2-template';
    insert into group_evaluations(group_id,id,template_id,template_revision,title,due_at) values
      ('p2-qa','p2-open','p2-template',1,'Open',now()+interval '1 day'),
      ('p2-qa','p2-expired','p2-template',1,'Expired',now()-interval '1 day');
    insert into group_evaluation_assignments(group_id,evaluation_id,user_id) values
      ('p2-qa','p2-open','p2-member'),('p2-qa','p2-expired','p2-member');
    insert into group_evaluation_assignments(group_id,evaluation_id,user_id,answers,submitted_at)
      values ('p2-qa','p2-expired','p2-manager','{"yes":false,"note":"Texto privado"}',now()-interval '2 days');
  `);
  const actors = [
    ['p2-qa', 'p2-member'],
    ['p2-qa', 'p2-manager'],
    ['p2-qa', 'p2-unassigned'],
    ['p2-foreign', 'p2-foreign-admin'],
  ].map(([group, user]) => ({ group, user, token: randomBytes(32).toString('hex') }));
  for (const { group, user, token } of actors)
    await ownerPool.query(
      "insert into sessions(group_id,id,user_id,csrf,expires,assurance,primary_verified_at) values ($1,$2,$3,'synthetic',now()+interval '1 day','primary',now())",
      [group, hashForTest('sha256').update(token).digest('hex'), user],
    );
  async function as(actor: typeof actors[number], statement: string) {
    const client = await ownerPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.session_token',$2,true)", [actor.group, actor.token]);
      await client.query('set local session authorization bandarlog_http');
      await client.query('set local role bandarlog_user_app');
      const result = await client.query(statement);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  const evaluations = 'select id from group_evaluations where id like \'p2-%\' order by id';
  const versions = "select revision from evaluation_template_versions where template_id='p2-template'";
  const drafts = "select answers from group_evaluation_assignments where evaluation_id='p2-open'";
  assert.equal((await as(actors[0], evaluations)).rowCount, 2);
  assert.equal((await as(actors[0], versions)).rowCount, 1);
  for (const actor of actors.slice(2)) {
    assert.equal((await as(actor, evaluations)).rowCount, 0);
    assert.equal((await as(actor, versions)).rowCount, 0);
  }
  assert.equal((await as(actors[1], drafts)).rowCount, 0);
  assert.equal((await as(actors[1], "update group_evaluation_assignments set revision=1 where evaluation_id='p2-open'")).rowCount, 0);
  await assert.rejects(as(actors[0], "update group_evaluation_assignments set revision=1 where evaluation_id='p2-expired'"), /Evaluation is closed/);
  assert.equal((await as(actors[0], "update group_evaluation_assignments set revision=1, submitted_at='2000-01-01' where evaluation_id='p2-open' returning submitted_at > '2020-01-01' as server_time")).rows[0].server_time, true);
  assert.equal((await as(actors[0], "update group_evaluation_assignments set revision=2, submitted_at=null where evaluation_id='p2-open'")).rowCount, 0);
  const results = "select bandarlog_api.group_evaluation_results('p2-expired') summary";
  for (const actor of [actors[0], ...actors.slice(2)])
    assert.equal((await as(actor, results)).rows[0].summary, null);
  assert.equal((await as(actors[1], "select bandarlog_api.group_evaluation_results('p2-open') summary")).rows[0].summary, null);
  assert.deepEqual((await as(actors[1], results)).rows[0].summary, {
    assigned: 2, submitted: 1, questions: {
      yes: { answered: 1, distribution: [{ value: false, count: 1 }] },
      note: { answered: 1, distribution: [] },
    },
  });
  const conclusion = "insert into group_evaluation_conclusions(evaluation_id,body,author_id) values('p2-expired','Lección','p2-manager')";
  await assert.rejects(as(actors[0], conclusion), /row-level security/);
  await assert.rejects(as(actors[1], conclusion.replace('p2-expired', 'p2-open')), /row-level security/);
  await as(actors[1], conclusion);
  assert.equal((await as(actors[0], 'select body from group_evaluation_conclusions')).rowCount, 0);
  assert.equal((await as(actors[1], 'select body from group_evaluation_conclusions')).rows[0].body, 'Lección');
  await ownerPool.query(`
    insert into projects(group_id,id,name) values ('p2-qa','p2-action-project','Proyecto');
    insert into commissions(group_id,id,project_id,name,description,icon)
      values ('p2-qa','p2-action-commission','p2-action-project','Comisión','','tent');
    insert into tasks(group_id,id,commission_id,title,description,due,status,updated_at)
      values ('p2-qa','p2-action-task','p2-action-commission','Acción','',now(),'pending',now());
  `);
  const link = "insert into group_evaluation_actions(evaluation_id,task_id,conclusion_revision) values ('p2-expired','p2-action-task',1)";
  await assert.rejects(as(actors[0], link), /row-level security/);
  await assert.rejects(as(actors[1], link.replace(',1)', ',2)')), /row-level security/);
  await as(actors[1], link);
  for (const actor of [actors[0], actors[3]])
    assert.equal((await as(actor, 'select task_id from group_evaluation_actions')).rowCount, 0);
  assert.equal((await as(actors[1], 'select task_id from group_evaluation_actions')).rows[0].task_id, 'p2-action-task');
  const lifecycle = "insert into project_lifecycle_events(project_id,actor_id,kind) values('p2-action-project','p2-manager','closed')";
  await assert.rejects(as(actors[0], lifecycle), /Project unavailable|row-level security/);
  await as(actors[1], lifecycle);
  assert.equal((await as(actors[1], "select archived from projects where id='p2-action-project'")).rows[0].archived, 'true');
  await assert.rejects(as(actors[1], "update projects set archived='false' where id='p2-action-project'"), /Use the project lifecycle operation/);
  await ownerPool.query("update project_lifecycle_events set created_at=now()-interval '16 days' where project_id='p2-action-project'");
  await assert.rejects(as(actors[1], lifecycle.replace("'closed'", "'reopened'")), /transition unavailable/);
  assert.equal((await as(actors[1], "select title from tasks where id='p2-action-task'")).rows[0].title, 'Acción');
  await ownerPool.query(`
    update project_lifecycle_events set created_at=now() where project_id='p2-action-project';
    insert into group_evaluations(group_id,id,template_id,template_revision,title,due_at,project_id)
      values ('p2-qa','p2-linked','p2-template',1,'Vinculada',now()+interval '1 day','p2-action-project');
    insert into group_evaluation_assignments(group_id,evaluation_id,user_id) values ('p2-qa','p2-linked','p2-member');
  `);
  const availability = "select bandarlog_api.group_evaluation_project_closed('p2-linked') open";
  assert.equal((await as(actors[0], availability)).rows[0].open, true);
  assert.equal((await as(actors[2], availability)).rows[0].open, false);
  await as(actors[1], lifecycle.replace("'closed'", "'reopened'"));
  assert.equal((await as(actors[0], availability)).rows[0].open, false);
  await assert.rejects(as(actors[0], "update group_evaluation_assignments set revision=1 where evaluation_id='p2-linked'"), /Evaluation is closed/);
  await as(actors[1], lifecycle);
  assert.equal((await as(actors[0], "update group_evaluation_assignments set revision=1 where evaluation_id='p2-linked'")).rowCount, 1);





  await ownerPool.query(`
    insert into group_evaluations(group_id,id,template_id,template_revision,title,due_at,response_mode)
      values ('p2-qa','p2-anonymous','p2-template',1,'Anónima',now()+interval '1 day','anonymous');
    insert into group_evaluation_assignments(group_id,evaluation_id,user_id)
      values ('p2-qa','p2-anonymous','p2-member');
    insert into users(group_id,id,name,email,role)
      values ('p2-qa','p2-local-admin','Admin QA','p2-admin@example.test','admin');
  `);
  const anonymous = await as(actors[0], `update group_evaluation_assignments
    set revision=1,submitted_at=now(),answers='{"yes":false,"note":"Texto anónimo"}'
    where evaluation_id='p2-anonymous' returning answers`);
  assert.deepEqual(anonymous.rows[0].answers, {});
  await assert.rejects(as(actors[1], 'select answers from bandarlog_api.anonymous_evaluation_answers'), /permission denied/);
  const persistedAnonymous = await ownerPool.query("select answers,to_jsonb(a) as record from bandarlog_api.anonymous_evaluation_answers a where evaluation_id='p2-anonymous'");
  assert.deepEqual(persistedAnonymous.rows[0].answers, { yes: false, note: 'Texto anónimo' });
  assert.equal(persistedAnonymous.rows[0].record.user_id, undefined);
  assert.equal(persistedAnonymous.rows[0].record.submitted_at, undefined);
  await ownerPool.query("update group_evaluations set due_at=now()-interval '1 minute' where id='p2-anonymous'");
  assert.equal((await as(actors[1], "select bandarlog_api.group_evaluation_results('p2-anonymous') summary")).rows[0].summary, null);
  const administrator = { group: 'p2-qa', user: 'p2-local-admin', token: randomBytes(32).toString('hex') };
  await ownerPool.query(
    "insert into sessions(group_id,id,user_id,csrf,expires,assurance,primary_verified_at) values ($1,$2,$3,'synthetic',now()+interval '1 day','primary',now())",
    [administrator.group, hashForTest('sha256').update(administrator.token).digest('hex'), administrator.user],
  );
  await assert.rejects(as(actors[1], "select bandarlog_api.group_evaluation_annex('p2-expired','p2-manager')"), /requires group administration/);
  assert.equal((await as(administrator, "select bandarlog_api.group_evaluation_annex('p2-anonymous','p2-local-admin') annex")).rows[0].annex, null);
  assert.deepEqual((await as(administrator, "select bandarlog_api.group_evaluation_annex('p2-expired','p2-local-admin') annex")).rows[0].annex,
    [{ name: 'Manager', answers: { yes: false, note: 'Texto privado' } }]);
  assert.equal((await ownerPool.query("select count(*) from bandarlog_api.evaluation_annex_audit where actor_id='p2-local-admin'")).rows[0].count, '1');

  const payload = "select bandarlog_api.product_feedback_submit('help','Texto ficticio',null) as id";
  const feedbackId = (await as(actors[0], payload)).rows[0].id;
  await assert.rejects(as(actors[0], 'select * from bandarlog_api.product_feedback'), /permission denied/);
  await assert.rejects(as(actors[0], "select bandarlog_api.product_feedback_list('',null,1,'')"), /permission denied/);

  const feedbackToken = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  await ownerPool.query("insert into bandarlog_api.platform_admins(id,email,name) values('feedback-admin','feedback-admin@example.test','Feedback QA')");
  await ownerPool.query(
    "insert into bandarlog_api.platform_sessions(id,admin_id,csrf) values($1,'feedback-admin',$2)",
    [hashForTest('sha256').update(feedbackToken).digest('hex'), csrf],
  );
  const identity = new URL(testUrl!);
  identity.username = 'bandarlog_identity';
  identity.password = '';
  const platformClient = new pg.Client({ connectionString: identity.toString() });
  await platformClient.connect();
  try {
    const list = (token: string, status = '') => platformClient.query(
      'select bandarlog_api.product_feedback_list($1,null,10,$2) as items', [token,status],
    );
    await assert.rejects(list(actors[0].token), /platform session expired/);
    const item = (await list(feedbackToken)).rows[0].items.find((entry: { id: string }) => entry.id === feedbackId);
    assert.equal(item.body, 'Texto ficticio');
    assert.equal(item.reply_email, null);
    assert.equal(item.group_id, undefined);
    const insights = (token: string) => platformClient.query(
      'select bandarlog_api.product_feedback_insights($1,7) as metrics', [token],
    );
    await assert.rejects(insights(actors[0].token), /platform session expired/);
    const [summary] = (await insights(feedbackToken)).rows[0].metrics;
    assert.equal(summary.category, 'help');
    assert.equal(summary.total, 1);
    assert.equal(summary.pending, 1);
    const review = (key: string, revision: number) => platformClient.query(
      "select bandarlog_api.product_feedback_review($1,$2,$3,'resolved',$4) as changed",
      [feedbackToken,key,feedbackId,revision],
    );
    await assert.rejects(review(actors[0].token,1), /invalid csrf/);
    assert.equal((await review(csrf,1)).rows[0].changed,true);
    assert.equal((await review(csrf,1)).rows[0].changed,false);
    assert.equal((await insights(feedbackToken)).rows[0].metrics[0].pending, 0);
    assert.equal((await list(feedbackToken,'resolved')).rows[0].items[0].id, feedbackId);
    await assert.rejects(platformClient.query('select * from bandarlog_api.product_feedback'), /permission denied/);
  } finally {
    await platformClient.end();
  }

});
