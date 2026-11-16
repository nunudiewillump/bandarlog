import { randomBytes } from 'node:crypto';
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
const ownerPool = new pg.Pool({ connectionString: testUrl });
const ownerDb = drizzle(ownerPool, { schema: s });
const runtimeUrl = new URL(testUrl);
runtimeUrl.username = 'bandarlog_runtime';
runtimeUrl.password = ''; // Isolated CI service uses local trust, never production credentials.
before(async () => {
  await migrate(ownerDb, { migrationsFolder: 'migrations' });
  await provisionTestContext(ownerPool);
  await ownerPool.query('alter role bandarlog_runtime login');
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
      .values([{ name: 'Pooled group A' }, { name: 'Pooled group B' }])
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
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3123',
      DATABASE_URL: runtimeUrl.toString(),
      GROUP_CONTEXT_SECRET: TEST_CONTEXT_SECRET,
      NODE_ENV: 'production',
      APP_URL: 'https://bandarlog.app',
      LEGACY_APP_ORIGINS: 'https://bandarlog-production.up.railway.app',
      AUTH_CHALLENGE_SECRET: 'test-only-production-challenge-secret-32-characters',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '587',
      SMTP_USER: 'synthetic-only',
      SMTP_PASS: 'synthetic-only',
      MAIL_FROM: 'Bandarlog <sender@example.test>',
      BOOTSTRAP_EMAIL: 'bootstrap-entry@example.test',
      GOOGLE_LOGIN_CLIENT_ID: '',
      GOOGLE_LOGIN_CLIENT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (x) => (logs += x));
  child.stderr.on('data', (x) => (logs += x));
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try {
        if ((await fetch('http://127.0.0.1:3123/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, logs);
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
        .filter((m) => m.body.includes(email))
        .at(-1)!;
      const approval = new URL(mail.body.match(/^https?:\/\/\S+$/m)![0]).searchParams.get('token')!;
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
      ).at(-1)!;
      const activation = new URL(
        activationMail.body.match(/^https?:\/\/\S+$/m)![0],
      ).searchParams.get('token')!;
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
          .find((c) => c.startsWith('bandarlog='))!
          .split(';')[0],
        csrf: '',
        userId: '',
      };
      const me = await api('/api/me', 'GET', undefined, login);
      assert.equal(me.status, 200);
      login.csrf = me.data.csrf;
      login.userId = me.data.user.id;
      return login;
    }
    const a = await register('A-' + Date.now()),
      b = await register('B-' + Date.now());
    assert.equal((await api(a.base + '/api/data')).status, 401);
    assert.equal((await api('/api/me', 'GET', undefined, { ...b, cookie: a.cookie })).status, 401);
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
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Menos lío/);
    const policy = await request('/privacidad');
    assert.equal(policy.status, 200);
    assert.match(await policy.text(), /darguinenagimenez@gmail.com/);
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
      const renewed = await request('/api/me', legacy, 'GET', undefined, 'bandarlog=' + token);
      assert.equal(renewed.status, 200);
      const hint = renewed.headers
        .getSetCookie()
        .find((value) => value.startsWith('bandarlog_entry='))!;
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
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
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
