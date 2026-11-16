import assert from 'node:assert/strict';
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
export async function exerciseActorBoundary(owner: pg.Pool, testUrl: string) {
  await owner.query('alter role bandarlog_http login');
  const runtime = new URL(testUrl);
  runtime.username = 'bandarlog_http';
  runtime.password = '';
  const pool = new pg.Pool({ connectionString: runtime.toString(), max: 2 });
  const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  const groups = Array.from({ length: 10 }, (_, n) => ({
    id: randomBytes(8).toString('hex'),
    name: 'Actor synthetic ' + n,
  }));
  const tokens = new Map<string, string>();
  const run = async (g: string, bearer: string, query: string, params: unknown[] = []) => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(
        "select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.session_token',$2,true)",
        [g, bearer],
      );
      await c.query('set local role bandarlog_user_app');
      const result = await c.query(query, params);
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    for (const g of groups) {
      await owner.query('insert into scout_groups(id,name) values($1,$2)', [g.id, g.name]);
      for (const role of ['admin', 'member', 'responsible']) {
        const uid = g.id + '-' + role,
          bearer = randomBytes(32).toString('hex');
        tokens.set(uid, bearer);
        await owner.query('insert into users(group_id,id,name,email,role) values($1,$2,$3,$4,$5)', [
          g.id,
          uid,
          role,
          role + '@example.test',
          role === 'responsible' ? 'member' : role,
        ]);
        await owner.query(
          "insert into sessions(group_id,id,user_id,csrf,expires,assurance,mfa_verified_at) values($1,$2,$3,'synthetic',now()+interval '1 day','mfa',now())",
          [g.id, hash(bearer), uid],
        );
      }
      await owner.query("insert into projects(group_id,id,name) values($1,$1,'Synthetic')", [g.id]);
      for (const suffix of ['own', 'hidden']) {
        const cid = g.id + '-' + suffix;
        await owner.query(
          "insert into commissions(group_id,id,project_id,name,description,icon) values($1,$2,$1,$2,'','')",
          [g.id, cid],
        );
        await owner.query(
          "insert into tasks(group_id,id,commission_id,title,description,due,status,updated_at) values($1,$2,$2,'Task','',now()+interval '1 day','pending',now())",
          [g.id, cid],
        );
        if (suffix === 'own')
          for (const role of ['member', 'responsible']) {
            await owner.query(
              'insert into members(group_id,id,commission_id,user_id,role) values($1,$2,$3,$2,$4)',
              [g.id, g.id + '-' + role, cid, role === 'responsible' ? 'responsible' : 'scouter'],
            );
          }
      }
      await owner.query(
        'insert into assignments(group_id,id,task_id,user_id) values($1,$1,$2,$3)',
        [g.id, g.id + '-own', g.id + '-member'],
      );
    }
    await Promise.all(
      groups.map(async (g) => {
        const bearer = tokens.get(g.id + '-member')!;
        const rows = await run(g.id, bearer, 'select id from tasks');
        assert.deepEqual(
          rows.rows.map((x) => x.id),
          [g.id + '-own'],
        );
        assert.equal(
          (
            await run(
              g.id,
              bearer,
              "update tasks set status='in_progress' where id=$1 returning id",
              [g.id + '-own'],
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await run(g.id, bearer, "update tasks set title='Forbidden' where id=$1 returning id", [
              g.id + '-hidden',
            ])
          ).rowCount,
          0,
        );
        await assert.rejects(
          run(g.id, bearer, "update tasks set title='Forbidden' where id=$1", [g.id + '-own']),
          { code: '42501' },
        );
        await assert.rejects(
          run(g.id, bearer, "update users set role='admin' where id=$1", [g.id + '-member']),
          { code: '42501' },
        );
        await assert.rejects(
          run(
            g.id,
            bearer,
            "insert into sessions(group_id,id,user_id,csrf,expires,assurance,mfa_verified_at) values($1,'forged',$2,'x',now()+interval '1 day','mfa',now())",
            [g.id, g.id + '-admin'],
          ),
          { code: '42501' },
        );
        await assert.rejects(run(g.id, bearer, 'select * from tokens'), { code: '42501' });
        await assert.rejects(run(g.id, bearer, 'select * from platform_mail'), { code: '42501' });
        await assert.rejects(run(g.id, bearer, "select bandarlog_api.push_keys('x','y')"), {
          code: '42501',
        });
        await assert.rejects(run(g.id, bearer, 'select bandarlog_api.claim_platform_mail()'), {
          code: '42501',
        });
        await assert.rejects(run(g.id, hash(tokens.get(g.id + '-admin')!), 'select * from tasks'), {
          code: '42501',
        });
        assert.equal((await run(g.id, bearer, 'select * from sessions')).rowCount, 1);
        await run(g.id, bearer, "select set_config('bandarlog.user_id',$1,true)", [
          g.id + '-admin',
        ]);
        await assert.rejects(run(g.id, bearer, 'set local role bandarlog_group_app'), {
          code: '42501',
        });
        assert.equal((await run(g.id, bearer, 'select * from tasks')).rowCount, 1); // rollback/pool reuse after denial
        await run(
          g.id,
          tokens.get(g.id + '-responsible')!,
          "update tasks set title='Allowed' where id=$1",
          [g.id + '-own'],
        );
        await run(
          g.id,
          tokens.get(g.id + '-admin')!,
          "select bandarlog_api.change_user($1,'coordination',false)",
          [g.id + '-responsible'],
        );
      }),
    );
    const a = groups[0],
      b = groups[1],
      bearer = tokens.get(a.id + '-member')!;
    await assert.rejects(run(b.id, bearer, 'select * from tasks'), { code: '42501' });
    await owner.query('delete from sessions where id=$1', [hash(bearer)]);
    await assert.rejects(run(a.id, bearer, 'select * from tasks'), { code: '42501' });
    const admin = tokens.get(a.id + '-admin')!;
    await owner.query("update users set role='member' where id=$1", [a.id + '-admin']);
    await assert.rejects(
      run(a.id, admin, "select bandarlog_api.change_user($1,'admin',false)", [
        a.id + '-responsible',
      ]),
      { code: '42501' },
    );
    assert.equal(
      (await owner.query('select role from users where id=$1', [a.id + '-responsible'])).rows[0]
        .role,
      'coordination',
    );
    await owner.query('update users set disabled_at=now() where id=$1', [b.id + '-admin']);
    await assert.rejects(run(b.id, tokens.get(b.id + '-admin')!, 'select * from users'), {
      code: '42501',
    });
    const c = await pool.connect();
    try {
      await c.query('set role bandarlog_user_app');
      await assert.rejects(c.query('select * from tasks'), { code: '42501' });
      await c.query('reset role');
    } finally {
      c.release();
    }
  } finally {
    await pool.end();
  }
}
