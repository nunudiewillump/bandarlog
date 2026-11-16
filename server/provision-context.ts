import pg from 'pg';
// Operator-only command. Values are read from the environment, never command arguments or output.
if (
  !process.env.MIGRATION_DATABASE_URL ||
  !/^[a-f0-9]{64}$/.test(process.env.GROUP_CONTEXT_SECRET || '')
)
  throw Error('Se requieren MIGRATION_DATABASE_URL y GROUP_CONTEXT_SECRET (32 bytes hex).');
const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
try {
  await pool.query(
    'insert into bandarlog_api.context_key(id,secret) values(true,$1) on conflict(id) do update set secret=excluded.secret',
    [process.env.GROUP_CONTEXT_SECRET],
  );
  console.info('Clave de contexto provisionada.');
} catch {
  process.exitCode = 1;
  console.error('No se pudo provisionar la clave de contexto; revisa migraciones y permisos.');
} finally {
  await pool.end();
}
