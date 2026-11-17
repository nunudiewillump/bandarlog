import { createHash } from 'node:crypto';
import pg from 'pg';
import { sealMail } from '../../server/dispatch-envelope';
import { dispatchSettings } from '../../server/dispatch-settings';
// Maintenance-only; default is a count-only dry run. Stop the former sender first.
if (!process.env.MIGRATION_DATABASE_URL)
  throw Error('Falta MIGRATION_DATABASE_URL de mantenimiento.');
const { id, fingerprint } = dispatchSettings(process.env),
  apply = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
try {
  const expected = (
    await pool.query('select fingerprint from bandarlog_api.dispatch_key_registry where id=$1', [
      id,
    ])
  ).rows[0]?.fingerprint;
  if (expected !== createHash('sha256').update(fingerprint).digest('hex'))
    throw Error('Registra y verifica la clave pública del emisor antes de la transición.');
  let total = 0;
  for (const table of ['notifications', 'platform_mail']) {
    const count = Number(
      (
        await pool.query(
          `select count(*)::integer as n from public.${table} where status in ('pending','pending_v2','sending','failed') and body<>'' and body not like 'bandarlog-sealed-v1:%' and body not like 'task-event-v1:%' and body not like 'invitation-event-v1:%'`,
        )
      ).rows[0].n,
    );
    total += count;
    if (!apply) continue;
    let remaining = true;
    while (remaining) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const rows = (
          await c.query(
            `select id,subject,body,html from public.${table} where status in ('pending','pending_v2','sending','failed') and body<>'' and body not like 'bandarlog-sealed-v1:%' and body not like 'task-event-v1:%' and body not like 'invitation-event-v1:%' order by created_at limit 50 for update skip locked`,
          )
        ).rows;
        remaining = rows.length > 0;
        for (const row of rows) {
          const body = sealMail(
            { subject: row.subject, body: row.body, html: row.html },
            process.env.DISPATCH_PUBLIC_KEY!,
            id,
          );
          await c.query(`update public.${table} set body=$1,html='' where id=$2`, [body, row.id]);
        }
        await c.query('commit');
      } catch {
        await c.query('rollback');
        throw Error('No se pudo cifrar un lote; se ha revertido ese lote.');
      } finally {
        c.release();
      }
    }
  }
  console.info({
    event: apply ? 'dispatch.transition.sealed' : 'dispatch.transition.dry_run',
    messages: total,
  });
} catch {
  process.exitCode = 1;
  console.error(
    'No se pudo completar la transición. No se muestran cuerpos, destinatarios ni credenciales.',
  );
} finally {
  await pool.end();
}
