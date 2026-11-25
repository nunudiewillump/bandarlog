import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

type Queryable = {
  query: (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export async function exerciseEvaluationTemplateBoundary(
  client: Queryable & { transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T> },
) {
  const groups = ['eval-a', 'eval-b', 'eval-c'];
  const users = [
    { group: groups[0], id: 'coordination-a', role: 'coordination', token: 'a'.repeat(64) },
    { group: groups[0], id: 'member-a', role: 'member', token: 'b'.repeat(64) },
    { group: groups[1], id: 'admin-b', role: 'admin', token: 'c'.repeat(64) },
    { group: groups[2], id: 'admin-c', role: 'admin', token: 'd'.repeat(64) },
  ];
  for (const group of groups)
    await client.query('insert into scout_groups(id,name) values($1,$1)', [group]);
  for (const { group, id, role, token } of users) {
    await client.query(
      "insert into users(group_id,id,name,email,role) values($1,$2,$2,$2 || '@example.test',$3)",
      [group, id, role],
    );
    await client.query(
      "insert into sessions(group_id,id,user_id,csrf,expires,assurance,primary_verified_at) values($1,$2,$3,'synthetic',now()+interval '1 day','primary',now())",
      [group, createHash('sha256').update(token).digest('hex'), id],
    );
  }
  const as = (
    actor: (typeof users)[number],
    query: string,
    params: unknown[] = [],
    group = actor.group,
  ) =>
    client.transaction(async (tx) => {
      await tx.query(
        "select set_config('bandarlog.group_id',$1,true),set_config('bandarlog.session_token',$2,true)",
        [group, actor.token],
      );
      await tx.query('set local session authorization bandarlog_http');
      await tx.query('set local role bandarlog_user_app');
      return tx.query(query, params);
    });
  const insert = "insert into evaluation_templates(id,structure) values('template','{}')";
  await as(users[0], insert);
  await assert.rejects(as(users[1], insert), /row-level security/);
  for (const actor of users.slice(1)) {
    assert.deepEqual((await as(actor, 'select id from evaluation_templates')).rows, []);
    assert.deepEqual(
      (await as(actor, 'select template_id from evaluation_template_versions')).rows,
      [],
    );
  }
  await assert.rejects(
    as(users[2], 'select id from evaluation_templates', [], groups[0]),
    /invalid session context/,
  );
  const publish =
    "insert into evaluation_template_versions(template_id,revision,structure,published_by) values('template',1,$1,$2)";
  await assert.rejects(as(users[0], publish, ['{"forged":true}', users[0].id]), /does not match/);
  await assert.rejects(as(users[0], publish, ['{}', users[1].id]), /row-level security/);
  await as(users[0], publish, ['{}', users[0].id]);
  await assert.rejects(
    as(users[0], "update evaluation_template_versions set structure='{}'"),
    /permission denied/,
  );
  await assert.rejects(
    as(users[0], 'delete from evaluation_template_versions'),
    /permission denied/,
  );
  await assert.rejects(
    client.transaction(async (tx) => {
      await tx.query('set local session authorization bandarlog_identity');
      await tx.query('select * from evaluation_templates');
    }),
    /permission denied/,
  );
}
