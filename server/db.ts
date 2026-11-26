import { observePoolErrors } from './pool-errors.js';
import { dispatchSettings } from './dispatch-settings.js';
import { component, validateComponentSecrets } from './components.js';
import { randomBytes, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { drizzle as remoteDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as localMigrate } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { queryLogger, measuredClient } from './metrics.js';
import * as schema from './schema.js';
import { scopedPglite, scopedPool, configureGroupSigning, groupContext } from './group-context.js';
import { globalOperations } from './global-operations.js';
import { mkdir } from 'node:fs/promises';
import { seed } from './seed.js';

export async function connect() {
  validateComponentSecrets();
  const mode = component();
  if (process.env.MIGRATION_DATABASE_URL)
    throw Error('Las credenciales de mantenimiento no deben estar presentes en el runtime HTTP.');
  if (process.env.DATABASE_URL) {
    if (mode !== 'http') configureGroupSigning(process.env.GROUP_CONTEXT_SECRET || '');
    const applicationRole =
      mode === 'http'
        ? 'bandarlog_user_app'
        : mode === 'identity'
          ? 'bandarlog_identity_app'
          : mode === 'delivery'
            ? 'bandarlog_delivery_app'
            : 'bandarlog_group_app';
    const pool = measuredClient(
      observePoolErrors(new pg.Pool({ connectionString: process.env.DATABASE_URL })),
    );
    try {
      const connection = remoteDrizzle(pool, { schema, logger: queryLogger });
      // Fail before listening if a deployment accidentally injects an owner credential.
      const identity = await connection.execute(sql`select current_user as name,
        exists(select 1 from pg_roles r where pg_has_role(session_user,r.oid,'MEMBER')
          and (r.rolname not in (${mode === 'http' ? 'bandarlog_http' : mode === 'identity' ? 'bandarlog_identity' : mode === 'delivery' ? 'bandarlog_delivery' : 'bandarlog_runtime'},${mode === 'http' ? 'bandarlog_user_app' : mode === 'identity' ? 'bandarlog_identity_app' : mode === 'delivery' ? 'bandarlog_delivery_app' : 'bandarlog_group_app'}) or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication or (r.rolname=session_user and r.rolinherit))) as elevated,
        exists(select 1 from pg_class c where c.relnamespace in ('public'::regnamespace,'bandarlog_api'::regnamespace)
          and pg_has_role(session_user,c.relowner,'MEMBER')) or exists(select 1 from pg_database d where d.datname=current_database() and pg_has_role(session_user,d.datdba,'MEMBER')) or exists(select 1 from pg_namespace n where n.nspname in ('public','bandarlog_api') and pg_has_role(session_user,n.nspowner,'MEMBER')) or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','bandarlog_api') and pg_has_role(session_user,p.proowner,'MEMBER')) or has_schema_privilege(${applicationRole},'public','CREATE') or has_schema_privilege(${applicationRole},'bandarlog_api','CREATE') or has_database_privilege(${applicationRole},current_database(),'CREATE') or exists(select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and has_table_privilege(${applicationRole},c.oid,'TRUNCATE,TRIGGER')) or has_schema_privilege(session_user,'public','CREATE') or has_schema_privilege(session_user,'bandarlog_api','CREATE') or has_database_privilege(session_user,current_database(),'CREATE') or exists(select from pg_class c where c.relnamespace in ('public'::regnamespace,'bandarlog_api'::regnamespace) and c.relkind in ('r','v','m','p') and has_table_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as owns_tables`);
      const role = identity.rows[0];
      if (
        role.name !==
          (mode === 'http'
            ? 'bandarlog_http'
            : mode === 'identity'
              ? 'bandarlog_identity'
              : mode === 'delivery'
                ? 'bandarlog_delivery'
                : 'bandarlog_runtime') ||
        role.elevated ||
        role.owns_tables
      )
        throw Error('DATABASE_URL debe usar la identidad runtime sin privilegios administrativos.');
      if (
        mode === 'http' &&
        process.env.NODE_ENV === 'production' &&
        (await connection.execute(sql`select bandarlog_api.mfa_enforced() as enabled`)).rows[0]
          ?.enabled
      )
        throw Error(
          'Aplica la migración de acceso simple antes de arrancar: MFA no debe estar exigido.',
        );
      if (mode !== 'development') {
        const version = (
          await connection.execute(sql`select bandarlog_api.runtime_contract_version() as version`)
        ).rows[0]?.version;
        const evaluationsEnabled = process.env.GROUP_EVALUATIONS_ENABLED === 'true';
        const feedbackEnabled = process.env.PRODUCT_FEEDBACK_ENABLED === 'true';
        const requiredVersion = evaluationsEnabled || feedbackEnabled ? 50 : 43;
        if (typeof version !== 'number' || version < requiredVersion)
          throw Error(
            `El contrato SQL requiere completar las migraciones de mantenimiento hasta ${String(requiredVersion).padStart(4, '0')} antes del arranque.`,
          );
      }
      const db = remoteDrizzle(scopedPool(pool) as pg.Pool, { schema, logger: queryLogger });
      if (mode !== 'http')
        await groupContext.run(
          {
            id: 'runtime-readiness',
            privateId: '',
            name: '',
            colorPrimary: '',
            colorSecondary: '',
            plan: '',
          },
          async () => await db.execute(sql`select bandarlog_api.current_group()`),
        );
      const global = globalOperations(connection, db);
      if (mode !== 'development') {
        const settings = dispatchSettings(process.env, mode === 'delivery'),
          fingerprint = createHash('sha256').update(settings.fingerprint).digest('hex');
        if (mode === 'delivery') await global.registerDispatchKey(settings.id, fingerprint);
        else if ((await global.dispatchKeyFingerprint(settings.id)) !== fingerprint)
          throw Error(
            'La clave pública de envío no coincide con el emisor. Arranca primero el emisor con su clave activa.',
          );
      }
      return { db, global, close: () => pool.end() };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }
  if (mode !== 'development') throw Error('Los componentes separados requieren PostgreSQL.');
  if (process.env.NODE_ENV === 'production')
    throw Error('DATABASE_URL es obligatorio en producción');
  const path = process.env.DATA_DIR || '.data';
  await mkdir(path, { recursive: true });
  const client = measuredClient(new PGlite(`${path}/db`));
  const connection = localDrizzle(client, { schema, logger: queryLogger });
  await localMigrate(connection, { migrationsFolder: 'migrations' });
  await client.query(
    'insert into bandarlog_api.context_key(id,secret) values(true,$1) on conflict(id) do nothing',
    [randomBytes(32).toString('hex')],
  );
  const localSecret = (
    await client.query<{ secret: string }>('select secret from bandarlog_api.context_key where id')
  ).rows[0].secret;
  configureGroupSigning(localSecret);
  // Local development only. No administrative secret or remote fallback.
  await client.query("select set_config('bandarlog.group_id','rosales-702',false)");
  await seed(connection as any);
  await client.exec(`create or replace function bandarlog_api.local_mail_preview() returns setof jsonb
    language sql security definer set search_path=pg_catalog as 'select to_jsonb(m) from public.platform_mail m order by created_at';
    revoke all on function bandarlog_api.local_mail_preview() from public;
    grant execute on function bandarlog_api.local_mail_preview() to bandarlog_runtime;`);
  preview = async () => {
    const result = await client.query<{ value: any }>(
      'select bandarlog_api.local_mail_preview() as value',
    );
    return result.rows.map(({ value }) =>
      Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
          v,
        ]),
      ),
    );
  };
  await client.query("select set_config('bandarlog.group_id','',false)");
  await client.query('set role bandarlog_runtime');
  const db = localDrizzle(scopedPglite(client) as PGlite, { schema, logger: queryLogger });
  return { db, global: globalOperations(connection, db), close: () => client.close() };
}
export type Database = Awaited<ReturnType<typeof connect>>['db'];

let preview: (() => Promise<any[]>) | undefined;
export async function localPlatformPreview() {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || !preview)
    throw Error('Vista local no disponible.');
  return preview();
}
