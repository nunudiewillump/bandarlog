import assert from 'node:assert/strict';
import pg from 'pg';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash, createPublicKey } from 'node:crypto';
import { openMail } from '../../server/dispatch-envelope';
const execFile = promisify(callback);
export async function exerciseMaintenance(owner: pg.Pool, url: string) {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.match(parsed.pathname, /^\/bandarlog_(?:asvs_[a-z0-9_]+|security_test)$/);
  const destination = join(tmpdir(), 'bandarlog-synthetic-keys-' + randomUUID());
  const run = (script: string, args: string[] = [], extra: NodeJS.ProcessEnv = {}) =>
    execFile(process.execPath, ['--import', 'tsx', script, ...args], {
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        MIGRATION_DATABASE_URL: url,
        SECURITY_KEY_OUTPUT_DIR: destination,
        ...extra,
      },
      timeout: 30000,
    });
  const runtime = (name: string) => {
    const u = new URL(url);
    u.username = 'bandarlog_' + name;
    u.password = '';
    return u.toString();
  };
  const original = (
    await owner.query("select rolcanlogin from pg_roles where rolname='bandarlog_runtime'")
  ).rows[0];
  const grants = (
    await owner.query(
      `select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='bandarlog_api' and a.grantee='bandarlog_runtime'::regrole and a.privilege_type='EXECUTE'`,
    )
  ).rows;
  const priorSchema = (
    await owner.query(
      "select has_schema_privilege('bandarlog_runtime','bandarlog_api','USAGE') as allowed",
    )
  ).rows[0].allowed;
  const priorMember = (
    await owner.query(
      "select pg_has_role('bandarlog_runtime','bandarlog_group_app','MEMBER') as allowed",
    )
  ).rows[0].allowed;
  const memberships = (
    await owner.query(
      "select g.rolname as grantor,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles g on g.oid=m.grantor where m.roleid='bandarlog_group_app'::regrole and m.member='bandarlog_runtime'::regrole",
    )
  ).rows;
  const extraGrantor = 'synthetic_cutover_' + randomUUID().replaceAll('-', '');
  let active: pg.Client | undefined;
  try {
    await run('scripts/security/generate-dispatch-keys.ts');
    assert.equal((await stat(destination)).mode & 0o777, 0o700);
    for (const file of ['public.pem', 'private-keyring.json', 'key-id.txt'])
      assert.equal((await stat(join(destination, file))).mode & 0o777, 0o600);
    const publicKey = await readFile(join(destination, 'public.pem'), 'utf8'),
      keys = JSON.parse(await readFile(join(destination, 'private-keyring.json'), 'utf8')),
      id = await readFile(join(destination, 'key-id.txt'), 'utf8');
    await assert.rejects(run('scripts/security/generate-dispatch-keys.ts')); // Exclusive creation; no overwrite.
    const keyEnv = { DISPATCH_PUBLIC_KEY: publicKey, DISPATCH_KEY_ID: id };
    await assert.rejects(run('scripts/security/seal-existing-mail.ts', [], keyEnv));
    await owner.query(
      'insert into bandarlog_api.dispatch_key_registry(id,fingerprint) values($1,$2)',
      [
        id,
        createHash('sha256')
          .update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' }))
          .digest('hex'),
      ],
    );
    const mailId = randomUUID(),
      platformId = randomUUID(),
      content = {
        subject: 'Synthetic security',
        body: 'synthetic credential content',
        html: '<p>synthetic credential content</p>',
      };
    await owner.query(
      "insert into notifications(group_id,id,dedupe,email,subject,body,html,status,created_at) values('rosales-702',$1,$1,'synthetic@example.test',$2,$3,$4,'pending',now())",
      [mailId, content.subject, content.body, content.html],
    );
    await owner.query(
      "insert into platform_mail(id,dedupe,email,subject,body,html,status,created_at) values($1,$1,'synthetic@example.test',$2,$3,$4,'pending',now())",
      [platformId, content.subject, content.body, content.html],
    );
    await run('scripts/security/seal-existing-mail.ts', [], keyEnv);
    assert.equal(
      (await owner.query('select body from notifications where id=$1', [mailId])).rows[0].body,
      content.body,
    );
    await run('scripts/security/seal-existing-mail.ts', ['--apply'], keyEnv);
    const first = (await owner.query('select body from notifications where id=$1', [mailId]))
      .rows[0].body;
    assert.deepEqual(openMail(first, keys), content);
    assert.deepEqual(
      openMail(
        (await owner.query('select body from platform_mail where id=$1', [platformId])).rows[0]
          .body,
        keys,
      ),
      content,
    );
    await run('scripts/security/seal-existing-mail.ts', ['--apply'], keyEnv);
    assert.equal(
      (await owner.query('select body from notifications where id=$1', [mailId])).rows[0].body,
      first,
    );
    const connections = {
      HTTP_DATABASE_URL: runtime('http'),
      IDENTITY_DATABASE_URL: runtime('identity'),
      DELIVERY_DATABASE_URL: runtime('delivery'),
    };
    await run('scripts/security/cutover.ts', [], connections);
    await owner.query('grant bandarlog_group_app to bandarlog_http');
    await assert.rejects(run('scripts/security/cutover.ts', [], connections));
    await owner.query('revoke bandarlog_group_app from bandarlog_http');
    active = new pg.Client({ connectionString: runtime('runtime') });
    active.on('error', () => {});
    await active.connect();
    await owner.query('create role ' + extraGrantor + ' nologin');
    await owner.query('grant bandarlog_group_app to ' + extraGrantor + ' with admin option');
    await owner.query('grant bandarlog_group_app to bandarlog_runtime granted by ' + extraGrantor);
    await run('scripts/security/cutover.ts', ['--cutover'], connections);
    const after = (
      await owner.query(
        "select rolcanlogin,pg_has_role('bandarlog_runtime','bandarlog_group_app','MEMBER') as member from pg_roles where rolname='bandarlog_runtime'",
      )
    ).rows[0];
    assert.equal(after.rolcanlogin, false);
    assert.equal(after.member, false);
    await assert.rejects(active.query('select 1'));
    const disabled = new pg.Client({ connectionString: runtime('runtime') });
    try {
      await assert.rejects(disabled.connect(), { code: '28000' });
    } finally {
      await disabled.end().catch(() => {});
    }
    assert.equal(
      (await owner.query('select body from notifications where id=$1', [mailId])).rows[0].body,
      first,
    );
  } finally {
    await active?.end().catch(() => {});
    await owner.query('revoke bandarlog_group_app from bandarlog_http');
    for (const membership of memberships)
      for (const [option, value] of [
        ['ADMIN', membership.admin_option],
        ['INHERIT', membership.inherit_option],
        ['SET', membership.set_option],
      ]) {
        const statement = (
          await owner.query(
            "select format('GRANT bandarlog_group_app TO bandarlog_runtime WITH %s %s GRANTED BY %I',$1::text,$2::text,$3::text) as command",
            [option, String(value), membership.grantor],
          )
        ).rows[0].command;
        await owner.query(statement);
      }
    await owner.query('drop role if exists ' + extraGrantor);
    if (priorSchema) await owner.query('grant usage on schema bandarlog_api to bandarlog_runtime');
    for (const grant of grants)
      await owner.query('grant execute on function ' + grant.signature + ' to bandarlog_runtime');
    await owner.query(
      'alter role bandarlog_runtime ' + (original.rolcanlogin ? 'login' : 'nologin'),
    );
    await rm(destination, { recursive: true, force: true });
  }
  // The test restores only the old ACL/LOGIN it saved; no data rollback or key removal.
  assert.equal(
    (
      await owner.query(
        "select pg_has_role('bandarlog_runtime','bandarlog_group_app','MEMBER') as allowed",
      )
    ).rows[0].allowed,
    priorMember,
  );
}
