import pg from 'pg';
import { z } from 'zod';
// Operator-only. Read identities from private environment, never print emails or URLs.
const url = process.env.MIGRATION_DATABASE_URL;
const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
const apply = process.argv.includes('--apply'),
  revoke = process.argv.includes('--revoke'),
  start = process.argv.includes('--start-metrics');
if (!url || (!start && (!email || !z.email().safeParse(email).success)))
  throw Error('Se requiere conexión de mantenimiento y cuenta de plataforma.');
if (start && revoke) throw Error('Selecciona una sola operación.');
const pool = new pg.Pool({ connectionString: url, max: 1 });
pool.on('error', () => console.error('Error en conexión de mantenimiento.'));
try {
  const c = await pool.connect();
  try {
    const contract = (await c.query('select bandarlog_api.runtime_contract_version() version'))
      .rows[0].version;
    if (contract < 40) throw Error('Se requiere contrato 40.');
    await c.query('begin');
    await c.query("set local lock_timeout='5s'");
    if (start)
      await c.query(
        'update bandarlog_api.platform_metrics_configuration set started_at=coalesce(started_at,statement_timestamp()) where id',
      );
    else if (revoke) {
      await c.query('update bandarlog_api.platform_admins set enabled=false where email=$1', [
        email,
      ]);
      await c.query(
        'delete from bandarlog_api.platform_codes where admin_id in(select id from bandarlog_api.platform_admins where email=$1)',
        [email],
      );
      await c.query(
        'delete from bandarlog_api.platform_sessions where admin_id in(select id from bandarlog_api.platform_admins where email=$1)',
        [email],
      );
    } else {
      const name = (process.env.PLATFORM_ADMIN_NAME || 'Administración').trim().slice(0, 100);
      await c.query(
        'insert into bandarlog_api.platform_admins(email,name) values($1,$2) on conflict(email) do update set enabled=true,name=excluded.name',
        [email, name],
      );
    }
    await c.query(apply ? 'commit' : 'rollback');
    console.log(
      JSON.stringify({
        operation: start ? 'metrics.start' : revoke ? 'platform.revoke' : 'platform.provision',
        applied: apply,
        groupDependency: false,
      }),
    );
  } finally {
    c.release();
  }
} catch {
  console.error('No se pudo completar el aprovisionamiento independiente.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
