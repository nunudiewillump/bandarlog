import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../server/db';
import { groupContext } from '../server/group-context';
import * as s from '../server/schema';
import { sql } from 'drizzle-orm';

test(
  'PostgreSQL pooled queries and transactions retain the correct group and reset the role',
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const testUrl = process.env.TEST_POSTGRES_URL!;
    const parsed = new URL(testUrl);
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(parsed.hostname),
      'Use a dedicated local PostgreSQL test database',
    );
    const old = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testUrl;
    const { db, ownerDb, close } = await connect();
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
      const role = await ownerDb.execute(sql`select current_user as role`);
      assert.notEqual(role.rows[0].role, 'bandarlog_group_app');
    } finally {
      await close();
      if (old === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = old;
    }
  },
);

test(
  'production public pages and legacy-domain redirects preserve safe links without forwarding posts',
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const { spawn } = await import('node:child_process');
    const testUrl = process.env.TEST_POSTGRES_URL!;
    assert.ok(['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname));
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: {
        ...process.env,
        PORT: '3123',
        DATABASE_URL: testUrl,
        NODE_ENV: 'production',
        APP_URL: 'https://bandarlog.app',
        LEGACY_APP_ORIGINS: 'https://bandarlog-production.up.railway.app',
        AUTH_CHALLENGE_SECRET: 'test-only-production-challenge-secret-32-characters',
        MAIL_TRANSPORT: 'gmail_api',
        MAIL_FROM: 'Bandarlog <sender@example.test>',
        GMAIL_CLIENT_ID: 'test-only-client',
        GMAIL_CLIENT_SECRET: 'test-only-secret',
        GMAIL_REFRESH_TOKEN: 'test-only-refresh',
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
                  ...(body
                    ? { 'Content-Type': 'application/json', Origin: 'https://' + host }
                    : {}),
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
            '/acceso',
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
      assert.equal((await request('/acceso', legacy)).status, 200);
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
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
  },
);
