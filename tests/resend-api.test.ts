import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, mkdir, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

test('delivery migration preserves existing outbox snapshots and group ownership', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-mail-migration-'));
  const pg = new PGlite();
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 16);
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile('migrations/' + entry.tag + '.sql', join(folder, entry.tag + '.sql'));
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: folder });
    await pg.exec(`INSERT INTO notifications(id,dedupe,email,subject,body,html,status,created_at)
      VALUES ('old-notification','old-notification','test@example.test','Asunto','Texto','<p>Original</p>','preview',now());
      INSERT INTO platform_mail(id,dedupe,email,subject,body,html,status,created_at)
      VALUES ('old-platform','old-platform','test@example.test','Asunto','Texto','<p>Original</p>','pending',now());`);
    const tables = ['notifications', 'platform_mail'];
    const old = await Promise.all(tables.map((table) => pg.query(`select * from ${table}`)));
    await migrate(db, { migrationsFolder: 'migrations' });
    for (const [i, table] of tables.entries()) {
      const row = (await pg.query<Record<string, unknown>>(`select * from ${table}`)).rows[0];
      assert.equal(row.next_attempt_at, null);
      assert.equal(row.provider_message_id, null);
      delete row.next_attempt_at;
      delete row.provider_message_id;
      assert.deepEqual(row, old[i].rows[0]);
    }
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('real auth and group-request flows persist provider IDs and scheduled failures without sending real mail', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bandarlog-resend-api-'));
  const calls: { key: string; payload: any }[] = [];
  const provider = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    calls.push({ key: req.headers['idempotency-key'] as string, payload });
    const to = payload.to[0];
    res.setHeader('Content-Type', 'application/json');
    if (to === 'laura@example.test') {
      res.statusCode = 429;
      res.setHeader('Retry-After', '300');
      res.end(
        JSON.stringify({
          statusCode: 429,
          name: 'rate_limit_exceeded',
          message: 'private rate response',
        }),
      );
    } else if (to === 'ana@example.test') {
      res.statusCode = 401;
      res.end(
        JSON.stringify({
          statusCode: 401,
          name: 'validation_error',
          message: 'private unauthorized response',
        }),
      );
    } else res.end(JSON.stringify({ id: 'provider-' + calls.length }));
  });
  let child: ChildProcess | undefined;
  let logs = '';
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  try {
    const providerUrl = 'http://127.0.0.1:' + (provider.address() as { port: number }).port;
    const preload = join(folder, 'mock-provider.mjs');
    await writeFile(
      preload,
      `const realFetch = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        const parsed = new URL(String(url));
        if (parsed.origin === 'https://api.resend.com')
          return realFetch(${JSON.stringify(providerUrl)} + parsed.pathname, options);
        return realFetch(url, options);
      };`,
    );
    // Reserve an available port instead of sharing a hard-coded port with other API suites.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const origin = 'http://127.0.0.1:' + port;
    child = spawn(
      process.execPath,
      ['--import', pathToFileURL(preload).href, '--import', 'tsx', 'server/index.ts'],
      {
        env: {
          ...process.env,
          PORT: String(port),
          DATA_DIR: folder,
          DATABASE_URL: '',
          NODE_ENV: 'test',
          APP_URL: origin,
          MAIL_TRANSPORT: 'resend',
          MAIL_FROM: 'Bandarlog <test@example.test>',
          RESEND_API_KEY: 're_not_a_real_key',
          RESEND_TEMPLATE_ID: 'bandarlog-transactional-v1',
          ARTWORK_WORKER_URL: '',
          ARTWORK_WORKER_TOKEN: '',
          GOOGLE_LOGIN_CLIENT_ID: '',
          GOOGLE_LOGIN_CLIENT_SECRET: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout?.on('data', (value) => {
      logs += value;
    });
    child.stderr?.on('data', (value) => {
      logs += value;
    });
    let cookie = '',
      csrf = '';
    const api = async (path: string, body?: unknown) => {
      const response = await fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie: cookie,
          'X-CSRF-Token': csrf,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { response, data: await response.json() };
    };
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(origin + '/api/health')).ok) break;
      } catch {}
      if (i === 299) throw new Error('Test server failed to start: ' + logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await api('/api/health')).data.mail, 'resend');
    assert.equal(
      (await api('/api/auth/request', { email: 'alex@example.test' })).response.status,
      200,
    );
    const waitForMail = async (email: string, status: string) => {
      for (let i = 0; i < 100; i++) {
        const row = (await api('/api/dev/mail')).data.find(
          (m: any) => m.email === email && m.status === status,
        );
        if (row) return row;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Expected outbox state: ' + status);
    };
    const accepted = await waitForMail('alex@example.test', 'sent');
    assert.match(accepted.providerMessageId, /^provider-/);
    assert.equal(accepted.nextAttemptAt, null);
    assert.equal(calls[0].key, 'bandarlog-notification/' + accepted.id);
    const token = accepted.body.match(/token=([a-f0-9]+)/)[1];
    const login = await api('/api/auth/verify', { token });
    cookie = login.response.headers.get('set-cookie')!.split(';')[0];
    csrf = (await api('/api/me')).data.csrf;
    await api('/api/auth/request', { email: 'ana@example.test' });
    const failed = await waitForMail('ana@example.test', 'failed');
    assert.equal(failed.attempts, '1');
    assert.equal(failed.nextAttemptAt, null);
    assert.equal(
      (await api('/api/auth/request', { email: 'laura@example.test' })).response.status,
      200,
    );
    const retry = await waitForMail('laura@example.test', 'pending');
    // The pending row can briefly exist before the first send finishes.
    for (let i = 0; i < 100; i++) {
      const row = (await api('/api/dev/mail')).data.find((m: any) => m.id === retry.id);
      if (row.attempts === '1') {
        assert.ok(Date.parse(row.nextAttemptAt) > Date.now() + 240000);
        break;
      }
      if (i === 99) assert.fail('429 must persist its scheduled retry');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const attemptsForRetry = () =>
      calls.filter((call) => call.key === 'bandarlog-notification/' + retry.id).length;
    const beforeRetry = attemptsForRetry();
    await api('/api/notifications/process', {});
    assert.equal(attemptsForRetry(), beforeRetry, 'processing must not ignore Retry-After');
    await fetch(origin + '/crear-grupo', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        groupName: 'Prueba aislada',
        name: 'Test',
        email: 'owner@example.test',
        terms: 'accepted',
        colorPrimary: '#d75a9e',
        colorSecondary: '#7b3d93',
      }),
    });
    let platform: any;
    for (let i = 0; i < 100; i++) {
      platform = (await api('/api/dev/platform-mail')).data.find((m: any) => m.status === 'sent');
      if (platform) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(platform?.providerMessageId);
    assert.ok(calls.some((call) => call.key === 'bandarlog-platform/' + platform.id));
    assert.equal(logs.includes('private unauthorized response'), false);
    assert.equal(logs.includes('private rate response'), false);
    assert.equal(logs.includes('re_not_a_real_key'), false);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child!.once('exit', resolve));
    }
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    await rm(folder, { recursive: true, force: true });
  }
});
