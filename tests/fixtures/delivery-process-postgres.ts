import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { sealMail } from '../../server/dispatch-envelope';
type Event = {
  type: string;
  key?: string;
  to?: string[];
  text?: string;
  html?: string;
  endpoint?: string;
  payload?: { body: string };
  status: number;
};
export async function exerciseDeliveryProcess(
  parent: pg.Pool,
  parentUrl: string,
  contextSecret: string,
) {
  const parsed = new URL(parentUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  const name = 'bandarlog_asvs_delivery_' + randomBytes(6).toString('hex');
  await parent.query('create database ' + name);
  parsed.pathname = '/' + name;
  const owner = new pg.Pool({ connectionString: parsed.toString() });
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const kid = 'delivery_' + randomBytes(6).toString('hex'),
    wakeToken = 'synthetic-provider-wake-only-at-least-32-characters';
  const events: Event[] = [];
  let child: ChildProcess | undefined,
    logs = '';
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child!.once('exit', r));
    }
    child = undefined;
  };
  const wait = async (predicate: () => Promise<boolean>, label: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    const states = (
      await owner.query(
        'select status,attempts,count(*)::integer as n from notifications group by status,attempts',
      )
    ).rows;
    assert.fail(
      label +
        ' ' +
        JSON.stringify({
          states,
          events: events.map((e) => ({
            type: e.type,
            key: e.key,
            status: e.status,
            endpoint: e.endpoint,
          })),
        }) +
        ' ' +
        logs,
    );
  };
  const start = async (acceptRetry: boolean) => {
    const runtime = new URL(parsed);
    runtime.username = 'bandarlog_delivery';
    runtime.password = '';
    child = spawn(
      process.execPath,
      ['--import', 'tsx', '--import', './tests/fixtures/provider-observer.ts', 'server/index.ts'],
      {
        env: {
          ...process.env,
          APP_COMPONENT: 'delivery',
          NODE_ENV: 'production',
          PORT: '3137',
          APP_URL: 'https://bandarlog.app',
          LEGACY_APP_ORIGINS: '',
          DATABASE_URL: runtime.toString(),
          MIGRATION_DATABASE_URL: undefined,
          GROUP_CONTEXT_SECRET: contextSecret,
          AUTH_CHALLENGE_SECRET: undefined,
          DISPATCH_KEY_ID: kid,
          DISPATCH_PUBLIC_KEY: pair.publicKey,
          DISPATCH_PRIVATE_KEYS: JSON.stringify({ [kid]: pair.privateKey }),
          DELIVERY_WAKE_TOKEN: wakeToken,
          DELIVERY_URL: undefined,
          IDENTITY_URL: undefined,
          DELIVERY_PAUSED: '0',
          MAIL_TRANSPORT: 'resend',
          MAIL_FROM: 'Bandarlog <synthetic@example.test>',
          RESEND_API_KEY: 're_synthetic_not_real',
          RESEND_TEMPLATE_ID: '',
          SMTP_HOST: undefined,
          SMTP_USER: undefined,
          SMTP_PASS: undefined,
          GMAIL_CLIENT_SECRET: undefined,
          GMAIL_REFRESH_TOKEN: undefined,
          GOOGLE_LOGIN_CLIENT_ID: '',
          GOOGLE_LOGIN_CLIENT_SECRET: undefined,
          ARTWORK_WORKER_URL: '',
          ARTWORK_WORKER_TOKEN: '',
          CONSUMPTION_METRICS: '0',
          SYNTHETIC_DELIVERY_OBSERVER: '1',
          SYNTHETIC_PROVIDER_ACCEPT_RETRY: acceptRetry ? '1' : '0',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    child.stdout!.on('data', (x) => (logs += x));
    child.stderr!.on('data', (x) => (logs += x));
    child.on('message', (message: any) => {
      if (message?.type?.startsWith('provider.')) events.push(message);
    });
    await wait(async () => {
      if (child!.exitCode !== null) assert.fail('Delivery process exited: ' + logs);
      try {
        return (await fetch('http://127.0.0.1:3137/api/health')).ok;
      } catch {
        return false;
      }
    }, 'Delivery healthcheck did not become ready');
  };
  const wake = (group?: string, token = wakeToken) =>
    fetch('http://127.0.0.1:3137/internal/wake', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(group ? { group } : {}),
    });
  const mail = (id: string) =>
    events.filter((e) => e.type === 'provider.email' && e.key === 'bandarlog-notification/' + id);
  const platform = (id: string) =>
    events.filter((e) => e.type === 'provider.email' && e.key === 'bandarlog-platform/' + id);
  const push = (suffix: string) =>
    events.filter((e) => e.type === 'provider.push' && e.endpoint?.endsWith('/' + suffix));
  try {
    await migrate(drizzle(owner), { migrationsFolder: 'migrations' });
    await owner.query('insert into bandarlog_api.context_key(id,secret) values(true,$1)', [
      contextSecret,
    ]);
    const groups = ['A', 'B'].map((label) => ({
      id: randomUUID(),
      privateId: randomBytes(16).toString('hex'),
      uid: randomUUID(),
      label,
    }));
    for (const g of groups) {
      await owner.query('insert into scout_groups(id,private_id,name) values($1,$2,$3)', [
        g.id,
        g.privateId,
        'Synthetic ' + g.label,
      ]);
      await owner.query(
        `insert into users(group_id,id,name,email,role,preferences) values($1,$2,$3,$4,'member','{"notifications":true,"weekly":false}')`,
        [
          g.id,
          g.uid,
          'Synthetic ' + g.label,
          g.label === 'A' ? 'a@example.test' : 'b-retry@example.test',
        ],
      );
    }
    const [a, b] = groups,
      ids = {
        a: randomUUID(),
        b: randomUUID(),
        active: randomUUID(),
        expired: randomUUID(),
        p: randomUUID(),
        q: randomUUID(),
        pushA: randomUUID(),
        pushB: randomUUID(),
      };
    const encrypted = (marker: string) =>
      sealMail(
        { subject: 'Synthetic ' + marker, body: marker, html: '<p>' + marker + '</p>' },
        pair.publicKey,
        kid,
      );
    for (const row of [
      { id: ids.a, g: a, marker: 'credential-A-only', state: 'pending_v2', lease: null },
      { id: ids.b, g: b, marker: 'credential-B-only', state: 'pending_v2', lease: null },
      {
        id: ids.active,
        g: a,
        marker: 'credential-active-lease',
        state: 'sending',
        lease: '1 hour',
      },
      {
        id: ids.expired,
        g: a,
        marker: 'credential-expired-lease',
        state: 'sending',
        lease: '-1 minute',
      },
    ])
      await owner.query(
        "insert into notifications(group_id,id,dedupe,email,subject,body,html,status,created_at,lease_id,lease_until) values($1,$2,$2,$3,'Encrypted synthetic',$4,'',$5,now(),$6,case when $7::text is null then null else now()+$7::interval end)",
        [
          row.g.id,
          row.id,
          row.g === b ? 'b-retry@example.test' : 'a@example.test',
          encrypted(row.marker),
          row.state,
          row.lease ? 'lease-' + row.id : null,
          row.lease,
        ],
      );
    for (const row of [
      { id: ids.p, marker: 'platform-P-only', state: 'pending_v2', lease: null },
      { id: ids.q, marker: 'platform-Q-only', state: 'sending', lease: '1 hour' },
    ])
      await owner.query(
        "insert into platform_mail(id,dedupe,email,subject,body,html,status,created_at,lease_id,lease_until) values($1,$1,'platform@example.test','Encrypted platform',$2,'',$3,now(),$4,case when $5::text is null then null else now()+$5::interval end)",
        [row.id, encrypted(row.marker), row.state, row.lease ? 'lease-' + row.id : null, row.lease],
      );
    await owner.query(
      'select bandarlog_api.finish_platform_mail_v2($1,\'wrong-lease\',\'{"status":"sent"}\')',
      [ids.q],
    );
    assert.equal(
      (await owner.query('select status from platform_mail where id=$1', [ids.q])).rows[0].status,
      'sending',
    );
    for (const [g, suffix] of [
      [a, 'a-ok'],
      [a, 'a-retry'],
      [b, 'b-ok'],
    ] as const) {
      await owner.query(
        'insert into push_subscriptions(group_id,id,user_id,subscription) values($1,$2,$3,$4)',
        [
          g.id,
          suffix,
          g.uid,
          JSON.stringify({
            endpoint: 'https://fcm.googleapis.com/fcm/send/' + suffix,
            keys: { p256dh: 'synthetic', auth: 'synthetic' },
          }),
        ],
      );
    }
    for (const [g, id] of [
      [a, ids.pushA],
      [b, ids.pushB],
    ] as const)
      await owner.query(
        'insert into push_outbox(group_id,id,user_id,payload) values($1,$2,$3,$4)',
        [
          g.id,
          id,
          g.uid,
          JSON.stringify({
            title: 'Synthetic',
            body: 'push-' + g.label + '-only',
            url: '/g/' + g.privateId + '/',
            tag: 'synthetic-' + g.label,
          }),
        ],
      );
    await start(false);
    assert.equal((await wake(a.privateId, 'wrong-token')).status, 403);
    await Promise.all([wake(a.privateId), wake(b.privateId), wake()]);
    await wait(async () => {
      const rows = (await owner.query('select id,status,attempts from notifications')).rows;
      return (
        rows.find((r) => r.id === ids.a)?.status === 'sent' &&
        rows.find((r) => r.id === ids.expired)?.status === 'sent' &&
        rows.find((r) => r.id === ids.b)?.status === 'pending' &&
        rows.find((r) => r.id === ids.b)?.attempts === '1' &&
        platform(ids.p).length === 1 &&
        push('a-retry').length === 1 &&
        push('b-ok').length === 1
      );
    }, 'The initial delivery/retry state was not persisted');
    const failed = mail(ids.b).length;
    assert.ok(failed >= 1);
    assert.equal(mail(ids.a).length, 1);
    assert.equal(mail(ids.active).length, 0);
    assert.equal(platform(ids.q).length, 0);
    assert.ok(
      (
        await owner.query(
          'select next_attempt_at>now() as deferred from notifications where id=$1',
          [ids.b],
        )
      ).rows[0].deferred,
    );
    await Promise.all([wake(a.privateId), wake(b.privateId), wake()]);
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(mail(ids.b).length, failed);
    assert.equal(push('a-retry').length, 1);
    await stop();
    await start(true);
    await Promise.all([wake(a.privateId), wake(b.privateId), wake()]);
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(mail(ids.b).length, failed);
    assert.equal(push('a-ok').length, 1);
    assert.equal(push('a-retry').length, 1);
    assert.equal(mail(ids.active).length, 0);
    await owner.query(
      "update notifications set next_attempt_at=now()-interval '1 second' where id=$1",
      [ids.b],
    );
    await owner.query(
      "update notifications set lease_until=now()-interval '1 second' where id=$1",
      [ids.active],
    );
    await owner.query(
      "update platform_mail set lease_until=now()-interval '1 second' where id=$1",
      [ids.q],
    );
    await owner.query(
      "update push_deliveries set next_attempt_at=now()-interval '1 second' where subscription_id='a-retry'",
    );
    await Promise.all([wake(a.privateId), wake(b.privateId), wake()]);
    await wait(async () => {
      const mails = Number(
        (await owner.query("select count(*) as n from notifications where status='sent'")).rows[0]
          .n,
      );
      const globals = Number(
        (await owner.query("select count(*) as n from platform_mail where status='sent'")).rows[0]
          .n,
      );
      const pushes = Number(
        (await owner.query('select count(*) as n from push_outbox where sent_at is not null'))
          .rows[0].n,
      );
      return mails === 4 && globals === 2 && pushes === 2;
    }, 'Deferred work did not complete after restart and its explicit deadline');
    assert.equal(mail(ids.b).length, failed + 1);
    assert.equal(mail(ids.a).length, 1);
    assert.equal(mail(ids.expired).length, 1);
    assert.equal(mail(ids.active).length, 1);
    assert.equal(platform(ids.p).length, 1);
    assert.equal(platform(ids.q).length, 1);
    assert.equal(push('a-ok').length, 1);
    assert.equal(push('a-retry').length, 2);
    assert.equal(push('b-ok').length, 1);
    for (const [id, recipient, marker] of [
      [ids.a, 'a@example.test', 'credential-A-only'],
      [ids.b, 'b-retry@example.test', 'credential-B-only'],
      [ids.active, 'a@example.test', 'credential-active-lease'],
      [ids.expired, 'a@example.test', 'credential-expired-lease'],
    ] as const) {
      for (const event of mail(id)) {
        assert.deepEqual(event.to, [recipient]);
        assert.equal(event.text, marker);
        assert.equal(event.html, '<p>' + marker + '</p>');
      }
    }
    for (const [id, marker] of [
      [ids.p, 'platform-P-only'],
      [ids.q, 'platform-Q-only'],
    ] as const) {
      const [event] = platform(id);
      assert.deepEqual(event.to, ['platform@example.test']);
      assert.equal(event.text, marker);
      assert.equal(event.html, '<p>' + marker + '</p>');
    }
    for (const event of events.filter((e) => e.type === 'provider.push'))
      assert.equal(
        event.payload?.body,
        event.endpoint?.includes('/a-') ? 'push-A-only' : 'push-B-only',
      );
    assert.equal(
      Number(
        (
          await owner.query(
            'select count(*) as n from notifications where lease_id is not null or lease_until is not null',
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.ok(
      !logs.includes('credential-A-only') &&
        !logs.includes('credential-B-only') &&
        !logs.includes('BEGIN PRIVATE KEY'),
    );
  } finally {
    await stop();
    await owner.end();
    // pg-pool.end() resolves before all TCP close callbacks have fired. Wait for
    // our own sessions to finish rather than force-killing a closing idle pool.
    for (let attempt = 0; attempt < 100; attempt++) {
      const active = Number(
        (await parent.query('select count(*) as n from pg_stat_activity where datname=$1', [name]))
          .rows[0].n,
      );
      if (!active) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await parent.query('drop database ' + name);
  }
}
