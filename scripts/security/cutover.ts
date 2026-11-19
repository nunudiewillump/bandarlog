import pg from 'pg';
const admin = process.env.MIGRATION_DATABASE_URL;
if (!admin) throw Error('Falta MIGRATION_DATABASE_URL.');
let phase = 'preflight';
const apply = process.argv.includes('--cutover'),
  maintenance = new pg.Pool({ connectionString: admin });
const normalize = (url: URL) =>
  url.hostname.replace('-pooler.', '.') + ':' + (url.port || '5432') + url.pathname;
const expected = {
  http: 'bandarlog_user_app',
  identity: 'bandarlog_identity_app',
  delivery: 'bandarlog_delivery_app',
};
try {
  const contract = (
    await maintenance.query('select bandarlog_api.runtime_contract_version() as version')
  ).rows[0]?.version;
  if (typeof contract !== 'number' || contract < 37)
    throw Error('Completa las migraciones hasta 0037 antes de retirar credenciales.');
  for (const [mode, appRole] of Object.entries(expected)) {
    const value = process.env[mode.toUpperCase() + '_DATABASE_URL'];
    if (!value) throw Error('Falta la conexión independiente de ' + mode + '.');
    const url = new URL(value);
    if (url.username !== 'bandarlog_' + mode || normalize(url) !== normalize(new URL(admin)))
      throw Error('Identidad o destino de conexión incorrecto: ' + mode + '.');
    const c = new pg.Client({ connectionString: value });
    await c.connect();
    try {
      const role = (
        await c.query(
          `select current_user as name,pg_has_role(session_user,$1,'MEMBER') as assigned,exists(select from pg_roles r where pg_has_role(session_user,r.oid,'MEMBER') and (r.rolname not in ($1,$2) or r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication)) as elevated`,
          [appRole, 'bandarlog_' + mode],
        )
      ).rows[0];
      if (!role.assigned || role.elevated) throw Error('Privilegios incorrectos en ' + mode + '.');
      if (
        (await c.query("select pg_has_role(session_user,'bandarlog_group_app','MEMBER') as legacy"))
          .rows[0].legacy
      )
        throw Error('Membresía heredada en ' + mode + '.');
    } finally {
      await c.end();
    }
  }
  if (
    (
      await maintenance.query(
        'select mfa_enforced from bandarlog_api.security_configuration where id',
      )
    ).rows[0]?.mfa_enforced
  )
    throw Error('Aplica la migración de acceso simple: MFA no debe estar exigido.');
  if (apply) {
    phase = 'retire';
    const c = await maintenance.connect();
    try {
      await c.query('begin');
      await c.query(
        "select pg_advisory_xact_lock(hashtextextended('bandarlog-security-cutover',0))",
      );
      const grants = (
        await c.query(
          "select g.rolname as grantor from pg_auth_members m join pg_roles g on g.oid=m.grantor where m.roleid='bandarlog_group_app'::regrole and m.member='bandarlog_runtime'::regrole",
        )
      ).rows;
      // PG16+ tracks memberships per grantor: removing only the current grantor's
      // grant can leave an effective membership behind. RESTRICT fails safely if
      // an unexpected delegated dependency needs separate operator review.
      for (const grant of grants) {
        const statement = (
          await c.query(
            "select format('REVOKE bandarlog_group_app FROM bandarlog_runtime GRANTED BY %I RESTRICT', $1::text) as command",
            [grant.grantor],
          )
        ).rows[0].command;
        await c.query(statement);
      }
      await c.query(
        'revoke execute on all functions in schema bandarlog_api from bandarlog_runtime',
      );
      await c.query('revoke usage on schema bandarlog_api from bandarlog_runtime');
      await c.query('alter role bandarlog_runtime nologin');
      await c.query('commit');
    } catch {
      await c.query('rollback');
      throw Error('No se pudo retirar el runtime antiguo; revisa la transición.');
    } finally {
      c.release();
    }
    await maintenance.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where usename='bandarlog_runtime' and pid<>pg_backend_pid()",
    );
    phase = 'disconnect';
    // Termination requests are asynchronous; wait for the backend to disappear.
    for (let attempt = 0; attempt < 50; attempt++) {
      await maintenance.query('select pg_stat_clear_snapshot()');
      const remaining = (
        await maintenance.query(
          "select count(*)::integer n from pg_stat_activity where usename='bandarlog_runtime'",
        )
      ).rows[0].n;
      if (!remaining) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    phase = 'verify';
    const old = (
      await maintenance.query(
        "select rolcanlogin,pg_has_role('bandarlog_runtime','bandarlog_group_app','MEMBER') as member from pg_roles where rolname='bandarlog_runtime'",
      )
    ).rows[0];
    if (
      old.rolcanlogin ||
      old.member ||
      (
        await maintenance.query(
          "select count(*)::integer n from pg_stat_activity where usename='bandarlog_runtime'",
        )
      ).rows[0].n
    )
      throw Error(
        'La retirada del runtime anterior no está completa. Mantén detenido el servicio antiguo.',
      );
  }
  console.info({ event: apply ? 'security.cutover.complete' : 'security.cutover.preflight.ok' });
} catch (error: any) {
  process.exitCode = 1;
  console.error({
    event: 'security.cutover.failed',
    phase,
    code: /^[A-Z0-9]{5}$/.test(error?.code || '') ? error.code : 'CHECK',
  });
  console.error(
    'La comprobación o transición no ha terminado. No se muestran conexiones ni secretos. Revisa el plan operativo antes de continuar.',
  );
} finally {
  await maintenance.end();
}
