import pg from 'pg';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const execute = promisify(execFile);
export async function exerciseRestore(owner: pg.Pool, url: string) {
  const source = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
  assert.match(source.pathname, /^\/bandarlog_(?:asvs_[a-z0-9_]+|security_test)$/);
  const sourceName = source.pathname.slice(1),
    target = 'bandarlog_restore_' + randomBytes(6).toString('hex');
  const container = process.env.POSTGRES_CONTAINER_ID || 'bandarlog-security-test';
  assert.match(container, /^[a-zA-Z0-9_-]+$/);
  const actor = (
    await owner.query(
      "select u.id,u.group_id from users u where u.role='admin' and u.disabled_at is null and exists(select from tasks t where t.group_id=u.group_id) limit 1",
    )
  ).rows[0];
  assert.ok(actor);
  const bearer = randomBytes(32).toString('hex');
  await owner.query(
    "insert into sessions(id,group_id,user_id,csrf,expires,assurance,mfa_verified_at) values($1,$2,$3,'restore-fixture',now()+interval '1 day','mfa',now())",
    [createHash('sha256').update(bearer).digest('hex'), actor.group_id, actor.id],
  );
  const tables = ['users', 'tasks', 'commissions', 'projects', 'activity', 'assignments'];
  const fingerprints = async (pool: pg.Pool) =>
    Promise.all(
      tables.map(
        async (table) =>
          (
            await pool.query(
              `select count(*)::integer as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) as fingerprint from public.${table} t`,
            )
          ).rows[0],
      ),
    );
  const before = await fingerprints(owner);
  let dump: Buffer;
  try {
    dump = (
      await execute(
        'docker',
        [
          'exec',
          container,
          'pg_dump',
          '-U',
          'postgres',
          '--format=custom',
          '--no-owner',
          sourceName,
        ],
        { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      )
    ).stdout;
  } catch {
    throw Error('No se pudo crear la copia sintética aislada.');
  }
  await owner.query(`create database "${target}"`);
  const restoredUrl = new URL(url);
  restoredUrl.pathname = '/' + target;
  const restored = new pg.Pool({ connectionString: restoredUrl.toString() });
  try {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'postgres',
        '--no-owner',
        '--exit-on-error',
        '--dbname',
        target,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    const completion = once(child, 'exit');
    child.stdin.end(dump);
    const [code] = await completion;
    assert.equal(code, 0, 'La restauración sintética debe finalizar sin errores.');
    assert.deepEqual(
      await fingerprints(restored),
      before,
      'Las tareas y el historial deben conservarse íntegramente.',
    );
    const runtime = new URL(restoredUrl);
    runtime.username = 'bandarlog_http';
    runtime.password = '';
    const c = new pg.Client({ connectionString: runtime.toString() });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        "select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.session_token',$2,true)",
        [actor.group_id, bearer],
      );
      await c.query('set local role bandarlog_user_app');
      assert.ok((await c.query('select id from tasks')).rowCount! > 0);
      await assert.rejects(c.query('select * from platform_mail'), { code: '42501' });
      await c.query('rollback');
    } finally {
      await c.end();
    }
  } finally {
    await restored.end();
    await owner.query(`drop database "${target}"`);
  }
}
