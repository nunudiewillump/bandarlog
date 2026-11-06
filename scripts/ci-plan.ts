import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectTests, reusableRun, validTree } from './ci-scope';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
const repository = process.env.GITHUB_REPOSITORY!;
const tree = git('rev-parse', 'HEAD^{tree}');
const apiOrigin = process.env.GITHUB_API_URL || 'https://api.github.com';

async function api(path: string) {
  const response = await fetch(apiOrigin + '/repos/' + repository + '/' + path, {
    headers: {
      Authorization: 'Bearer ' + process.env.GH_TOKEN,
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('GitHub respondió ' + response.status);
  return response.json();
}

async function findVerifiedTree() {
  const { workflow_runs: runs } = await api(
    'actions/workflows/checks.yml/runs?event=pull_request&status=success&per_page=20',
  );
  for (const run of runs) {
    if (
      run.head_repository?.full_name !== repository ||
      run.path !== '.github/workflows/checks.yml'
    )
      continue;
    const { artifacts } = await api('actions/runs/' + run.id + '/artifacts?name=ci-verified-tree');
    const artifact = artifacts.find(
      (a: any) => a.name === 'ci-verified-tree' && !a.expired && a.size_in_bytes < 65536,
    );
    if (!artifact) continue;
    const response = await fetch(
      apiOrigin + '/repos/' + repository + '/actions/artifacts/' + artifact.id + '/zip',
      {
        headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) continue;
    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.length > 65536) continue;
    const folder = mkdtempSync(join(tmpdir(), 'bandarlog-ci-proof-'));
    try {
      const path = join(folder, 'proof.zip');
      writeFileSync(path, archive);
      const proof = JSON.parse(
        execFileSync('unzip', ['-p', path, 'verified-tree.json'], {
          encoding: 'utf8',
          maxBuffer: 65536,
        }),
      );
      if (reusableRun(run, proof, tree, repository)) return run.html_url as string;
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
  return '';
}

let reused = '';
if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main') {
  try {
    reused = await findVerifiedTree();
  } catch (error) {
    console.log(
      'No se puede demostrar una validación previa; se ejecutará la cobertura completa.',
      String(error),
    );
  }
}
const base =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ? event.pull_request.base.sha : event.before;
let paths: string[] = [];
let full = process.env.GITHUB_EVENT_NAME !== 'pull_request';
try {
  if (!validTree(base)) throw new Error('Sin base de comparación válida');
  paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
} catch {
  full = true;
}
const plan = reused
  ? { node: [], browser: [], full: false, reasons: ['Contenido idéntico ya verificado: ' + reused] }
  : selectTests(paths, undefined, full);
const output = {
  node: JSON.stringify(plan.node),
  browser: JSON.stringify(plan.browser),
  browser_count: String(plan.browser.length),
  tree,
  reused,
};
for (const [key, value] of Object.entries(output))
  appendFileSync(process.env.GITHUB_OUTPUT!, key + '=' + value + '\n');
const summary =
  '## Plan de comprobaciones\n\n' +
  plan.reasons.join('\n\n') +
  '\n\n- Node: ' +
  plan.node.length +
  ' archivos.\n- Navegador: ' +
  plan.browser.length +
  ' archivos.\n- Tipos y compilación: obligatorios.\n- Árbol Git: ' +
  tree +
  '.\n\n' +
  [...plan.node, ...plan.browser].map((f) => '- ' + f).join('\n') +
  '\n';
appendFileSync(process.env.GITHUB_STEP_SUMMARY!, summary);
console.log(summary);
