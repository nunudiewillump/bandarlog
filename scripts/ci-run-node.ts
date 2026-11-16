import { spawnSync } from 'node:child_process';
const files: string[] = JSON.parse(process.env.CI_NODE_TESTS || '[]');
if (!files.every((file) => /^tests\/[a-z0-9-]+\.test\.ts$/.test(file)))
  throw new Error('Plan Node no válido');
// PostgreSQL security always runs in its own mandatory job with a disposable service.
const selected = files.filter((file) => file !== 'tests/groups-postgres.test.ts');
if (selected.length) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...selected], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
console.log('No hay pruebas Node afectadas; los tipos y la compilación se comprueban igualmente.');
