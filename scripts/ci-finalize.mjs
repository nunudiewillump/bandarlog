import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { PREPARE_RESULT, BROWSER_RESULT, BROWSER_COUNT } = process.env;
const ok =
  PREPARE_RESULT === 'success' &&
  /^(0|[1-9][0-9]*)$/.test(BROWSER_COUNT || '') &&
  (BROWSER_COUNT === '0' ? BROWSER_RESULT === 'skipped' : BROWSER_RESULT === 'success');
if (!ok) throw new Error('Hay comprobaciones pendientes, fallidas o canceladas.');

appendFileSync(
  process.env.GITHUB_STEP_SUMMARY,
  process.env.REUSED_RUN
    ? 'Contenido idéntico ya validado: ' + process.env.REUSED_RUN + '\n'
    : 'Todas las comprobaciones del plan han pasado.\n',
);
if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  if (tree !== process.env.VERIFIED_TREE) throw new Error('El contenido ha cambiado.');
  const runId = Number(process.env.GITHUB_RUN_ID);
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error('Ejecución no válida.');
  writeFileSync(
    'verified-tree.json',
    JSON.stringify({
      version: 1,
      tree,
      coverageComplete: true,
      event: 'pull_request',
      runId,
    }),
  );
}
