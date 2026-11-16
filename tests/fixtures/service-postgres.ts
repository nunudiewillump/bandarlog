import assert from 'node:assert/strict';
import pg from 'pg';
import { createHmac } from 'node:crypto';
export async function exerciseServiceBoundary(owner: pg.Pool, url: string, secret: string) {
  const group = (
    await owner.query("select id from scout_groups where id like '%' and id<>'rosales-702' limit 1")
  ).rows[0].id;
  const deadline = String(Math.floor(Date.now() / 1000) + 300);
  const proof = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(group + '\n' + deadline)
    .digest('hex');
  for (const role of ['http', 'identity', 'delivery']) {
    const uri = new URL(url);
    uri.username = 'bandarlog_' + role;
    uri.password = '';
    const c = new pg.Client({ connectionString: uri.toString() });
    await c.connect();
    try {
      await assert.rejects(c.query('select * from bandarlog_api.context_key'), { code: '42501' });
      if (role === 'http') {
        for (const q of [
          'select bandarlog_api.job_groups(false,true)',
          "select bandarlog_api.request_group('x','{}','{}')",
          'select bandarlog_api.claim_platform_mail()',
          "select bandarlog_api.push_keys('x','y')",
          'set role bandarlog_identity_app',
          'set role bandarlog_delivery_app',
        ])
          await assert.rejects(c.query(q), { code: '42501' });
      } else {
        const run = async (q: string, args: unknown[] = []) => {
          await c.query('begin');
          try {
            await c.query(
              "select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.context_deadline',$2,true),set_config('bandarlog.context_proof',$3,true)",
              [group, deadline, proof],
            );
            await c.query('set local role bandarlog_' + role + '_app');
            const r = await c.query(q, args);
            await c.query('commit');
            return r;
          } catch (e) {
            await c.query('rollback');
            throw e;
          }
        };
        await assert.rejects(run('set local role bandarlog_group_app'), { code: '42501' });
        const uid = (await owner.query('select id from users where group_id=$1 limit 1', [group]))
          .rows[0].id;
        if (role === 'identity') {
          await assert.rejects(
            run(
              "insert into sessions(group_id,id,user_id,csrf,expires,absolute_expires_at) values($1,$2,$3,'x',now()+interval '1 day',now()+interval '2 days')",
              [group, '1'.repeat(64), uid],
            ),
            { code: '42501' },
          );
          await assert.rejects(
            run(
              "insert into tokens(group_id,id,email,expires) values($1,$2,'synthetic@example.test',now()+interval '1 day')",
              [group, '2'.repeat(64)],
            ),
            { code: '42501' },
          );
          await assert.rejects(run("update users set role='admin' where id=$1", [uid]), {
            code: '42501',
          });
          await assert.rejects(c.query('select bandarlog_api.claim_platform_mail()'), {
            code: '42501',
          });
          await assert.rejects(c.query("select bandarlog_api.push_keys('x','y')"), {
            code: '42501',
          });
          await assert.rejects(
            c.query("select bandarlog_api.request_group_proof($1,'{}','{}','forged')", [
              '3'.repeat(64),
            ]),
            { code: '42501' },
          );
          await assert.rejects(run('select avatar_url from users'), { code: '42501' });
        } else {
          for (const q of [
            'select * from sessions',
            'select * from tokens',
            'select * from auth_challenges',
            'select * from google_states',
            "update users set role='admin'",
            'select * from group_registrations',
          ])
            await assert.rejects(run(q), { code: '42501' });
          assert.ok((await run('select id from tasks')).rowCount! >= 0);
        }
      }
    } finally {
      await c.end();
    }
  }
}
