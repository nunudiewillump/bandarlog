// Local-only synthetic comparison. See docs/neon-iteration-20261113.md.
import pg from 'pg';
import { connect } from '../server/db';
import { groupContext } from '../server/group-context';
import * as s from '../server/schema';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const baseline = resolve(process.argv[2] || '../bandarlog-neon-baseline');
const candidate = resolve(process.argv[3] || '.');
const output = resolve(process.env.BENCHMARK_DIR || 'work/neon-benchmark');
await mkdir(output, { recursive: true });
const observer = resolve(dirname(fileURLToPath(import.meta.url)), 'benchmark-driver.mjs');
const url = process.env.TEST_POSTGRES_URL!;
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.equal(
  new URL(url).pathname,
  '/bandarlog_benchmark',
  'dedicated empty synthetic database only',
);
process.env.DATABASE_URL = url;
const { db, ownerDb, close } = await connect();
assert.equal(
  (await ownerDb.select({ id: s.users.id }).from(s.users).limit(1)).length,
  0,
  'Use an empty synthetic database',
);
const fixtures: any[] = [];
for (let n = 0; n < 10; n++) {
  const [group] = await ownerDb
    .insert(s.groups)
    .values({ name: `Benchmark ${n}` })
    .returning();
  await groupContext.run(group, async () => {
    const users = Array.from({ length: 17 }, (_, i) => ({
      id: group.id + '-u' + i,
      name: 'Synthetic ' + i,
      email: `synthetic-${i}@example.invalid`,
      role: i === 0 ? 'admin' : 'member',
      onboardingCompletedAt: new Date().toISOString(),
      preferences: JSON.stringify({ notifications: true, weekly: false }),
      avatarUrl: 'data:image/png;base64,' + String.fromCharCode(65 + i).repeat(12000),
    }));
    await db.insert(s.users).values(users);
    await db.insert(s.projects).values({ id: group.id + '-p', name: 'Project' });
    await db
      .insert(s.commissions)
      .values({
        id: group.id + '-c',
        projectId: group.id + '-p',
        name: 'Commission',
        description: 'QA',
        icon: 'Tent',
      });
    await db
      .insert(s.members)
      .values(
        users.map((u) => ({
          id: u.id + '-m',
          commissionId: group.id + '-c',
          userId: u.id,
          role: 'scouter',
        })),
      );
    const tasks = Array.from({ length: 3 }, (_, i) => ({
      id: group.id + '-t' + i,
      commissionId: group.id + '-c',
      title: 'Synthetic task ' + i,
      description: 'fixture',
      due: '2030-01-01T12:00:00Z',
      status: 'pending',
      updatedAt: '2026-11-13T00:00:00Z',
    }));
    await db.insert(s.tasks).values(tasks);
    await db
      .insert(s.assignments)
      .values(
        tasks.flatMap((t) =>
          users.slice(0, 3).map((u) => ({ id: t.id + u.id, taskId: t.id, userId: u.id })),
        ),
      );
    if (n === 0)
      await db
        .insert(s.activity)
        .values(
          Array.from({ length: 125 }, (_, i) => ({
            id: group.id + '-a' + i,
            taskId: tasks[0].id,
            userId: users[0].id,
            kind: 'comment',
            body: 'Synthetic ' + i,
            createdAt: new Date(Date.UTC(2026, 10, 12, 0, i)).toISOString(),
          })),
        );
    const token = 'synthetic-' + group.id;
    await db
      .insert(s.sessions)
      .values({
        id: createHash('sha256').update(token).digest('hex'),
        userId: users[0].id,
        csrf: 'benchmark-only',
        expires: '2027-01-01T00:00:00Z',
      });
    fixtures.push({
      base: '/g/' + group.privateId + '/api',
      token,
      task: tasks[0].id,
      groupId: group.id,
    });
  });
}
await close();
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
for (const name of ['bandarlog_benchmark_before', 'bandarlog_benchmark_after'])
  await admin.query(`create database ${name} template bandarlog_benchmark`);
await admin.end();
const results: any[] = [];
for (const target of process.env.BENCH_REVERSE ? [candidate, baseline] : [baseline, candidate]) {
  const childUrl = new URL(url);
  childUrl.pathname =
    target === baseline ? '/bandarlog_benchmark_before' : '/bandarlog_benchmark_after';
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', observer, 'server/index.ts'],
    {
      cwd: target,
      env: {
        ...process.env,
        PORT: '3138',
        DATABASE_URL: childUrl.toString(),
        NODE_ENV: 'test',
        APP_URL: 'http://localhost:5173',
        MAIL_TRANSPORT: 'preview',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        ARTWORK_WORKER_URL: '',
        CONSUMPTION_METRICS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let logs = '';
  child.stdout!.on('data', (x) => (logs += x));
  child.stderr!.on('data', (x) => (logs += x));
  const driver = async (command: string) => {
    const response = once(child, 'message');
    child.send(command);
    return (await response)[0];
  };
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch('http://127.0.0.1:3138/api/live')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
      if (i === 149) throw Error(logs);
    }
    await new Promise((r) => setTimeout(r, 2200));
    const request = async (fixture: any, path = '/data', method = 'GET', body?: any) => {
      const start = performance.now();
      const response = await fetch('http://127.0.0.1:3138' + fixture.base + path, {
        method,
        headers: {
          Cookie: 'bandarlog=' + fixture.token,
          'X-CSRF-Token': 'benchmark-only',
          'Content-Type': 'application/json',
        },
        body: body && JSON.stringify(body),
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      const data = JSON.parse(text);
      if (path === '/data') assert.ok(data.users.every((u: any) => u.groupId === fixture.groupId));
      return { ms: performance.now() - start, bytes: Buffer.byteLength(text) };
    };
    await driver('reset');
    const initial = [];
    for (const f of fixtures) initial.push(await request(f));
    const coldStats = await driver('report');
    const firstTimes = initial.map((x) => x.ms).sort((a, b) => a - b);
    results.push({
      target: target === baseline ? 'baseline' : 'candidate',
      phase: 'process-cache-cold',
      requests: 10,
      httpBytes: initial.reduce((n, x) => n + x.bytes, 0),
      p50: firstTimes[4],
      p95: firstTimes[9],
      driver: coldStats,
    });
    for (const phase of ['warm', 'concurrent', 'mutations']) {
      await driver('reset');
      const samples = [];
      if (phase === 'warm')
        for (let round = 0; round < 10; round++)
          for (const f of fixtures) samples.push(await request(f));
      if (phase === 'concurrent')
        samples.push(...(await Promise.all(fixtures.map((f) => request(f)))));
      if (phase === 'mutations')
        for (let round = 0; round < 10; round++)
          for (const f of fixtures)
            samples.push(await request(f, '/tasks/' + f.task, 'PATCH', { title: 'Changed title' }));
      await new Promise((r) => setTimeout(r, 100));
      const stats = await driver('report');
      const sorted = samples.map((x) => x.ms).sort((a, b) => a - b);
      results.push({
        target: target === baseline ? 'baseline' : 'candidate',
        phase,
        requests: samples.length,
        httpBytes: samples.reduce((n, x) => n + x.bytes, 0),
        p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        driver: stats,
      });
    }
    await writeFile(
      output + '/' + (target === baseline ? 'baseline' : 'candidate') + '-benchmark.log',
      logs,
    );
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
  }
}
await writeFile(
  output + '/benchmark-results.json',
  JSON.stringify(
    {
      environment:
        'PostgreSQL 18 local, 10 groups, 17 users/group with 12kB synthetic photos, 3 tasks/group, 3 assignees/task, 125 activity entries in first group. Preview providers only. No scale-to-zero simulation.',
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
