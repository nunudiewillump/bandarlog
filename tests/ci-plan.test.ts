import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventory, selectTests, reusableRun } from '../scripts/ci-scope';

test('a landing-only edit selects public flows and asset/API checks, without task or tutorial suites', () => {
  const plan = selectTests([
    'server/public-site.ts',
    'public/landing/arms-v3/monkey-keyboard-poster.webp',
  ]);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.node, ['tests/groups-api.test.ts', 'tests/landing-animation.test.ts']);
  assert.deepEqual(plan.browser, [
    'tests/browser/forest-landing.spec.ts',
    'tests/browser/publication.spec.ts',
    'tests/browser/remembered-entry.spec.ts',
    'tests/browser/typography.spec.ts',
  ]);
});

test('documentation needs no runtime suites while a changed test runs itself', () => {
  const docs = selectTests([
    'README.md',
    'docs/forest-landing/arms-correction.md',
    'artifacts/home.png',
  ]);
  assert.deepEqual([docs.node, docs.browser, docs.full], [[], [], false]);
  const own = selectTests(['tests/browser/access-recovery.spec.ts']);
  assert.deepEqual(own.browser, ['tests/browser/access-recovery.spec.ts']);
  assert.deepEqual(own.node, []);
});

test('database, permissions, dependency, global UI, CI and unmapped changes expand coverage', () => {
  const available = inventory();
  for (const path of [
    'server/schema.ts',
    'server/index.ts',
    'drizzle/0020.sql',
    'server/auth-security.ts',
    'package-lock.json',
    'tests/fixtures/mobile.ts',
    '.github/workflows/checks.yml',
    'scripts/ci-plan.ts',
    'server/new-feature.ts',
    'server/public-site.ts.extra',
    'tests/deleted.test.ts',
  ]) {
    const plan = selectTests([path]);
    assert.equal(plan.full, true, path);
    assert.deepEqual(plan.node, available.node, path);
    assert.deepEqual(plan.browser, available.browser, path);
  }
});

test('global UI changes cover every browser journey without repeating unrelated backend suites', () => {
  for (const path of ['src/main.tsx', 'src/styles.css', 'src/forest.css', 'index.html']) {
    const plan = selectTests([path]);
    assert.equal(plan.full, false);
    assert.deepEqual(plan.node, []);
    assert.deepEqual(plan.browser, inventory().browser);
  }
});

test('combined scopes deduplicate suites; source rig files and offline changes are not treated as docs', () => {
  const plan = selectTests(['src/AuthScreen.tsx', 'server/mail-template.ts', 'src/AuthScreen.tsx']);
  assert.equal(plan.full, false);
  assert.equal(plan.browser.filter((f) => f.endsWith('/access-recovery.spec.ts')).length, 1);
  assert.ok(plan.node.includes('tests/auth-security.test.ts'));
  assert.ok(plan.node.includes('tests/mail-template.test.ts'));
  assert.ok(
    selectTests(['docs/forest-landing/rig/arm-left.webp']).node.includes(
      'tests/landing-animation.test.ts',
    ),
  );
  assert.ok(
    selectTests(['public/sw.js']).browser.includes('tests/browser/remembered-entry.spec.ts'),
  );
});

test('manual/full validation always includes all currently available suites', () => {
  const all = inventory();
  const plan = selectTests([], all, true);
  assert.equal(plan.full, true);
  assert.deepEqual(plan.node, all.node);
  assert.deepEqual(plan.browser, all.browser);
});

test('a missing mapped suite expands coverage instead of silently dropping it', () => {
  const available = inventory();
  available.browser = available.browser.filter((file) => !file.endsWith('/publication.spec.ts'));
  const plan = selectTests(['server/public-site.ts'], available);
  assert.equal(plan.full, true);
  assert.deepEqual(plan.browser, available.browser);
});

test('only successful PR evidence from this repository and exactly the same complete tree is reusable', () => {
  const tree = 'a'.repeat(40);
  const run = {
    id: 17,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/checks.yml',
    head_repository: { full_name: 'owner/repo' },
  };
  const proof = { version: 1, runId: 17, event: 'pull_request', coverageComplete: true, tree };
  assert.equal(reusableRun(run, proof, tree, 'owner/repo'), true);
  for (const patch of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress' },
    { event: 'push' },
    { path: '.github/workflows/performance.yml' },
    { head_repository: { full_name: 'fork/repo' } },
  ])
    assert.equal(reusableRun({ ...run, ...patch }, proof, tree, 'owner/repo'), false);
  for (const patch of [
    { tree: 'b'.repeat(40) },
    { runId: 18 },
    { version: 0 },
    { event: 'push' },
    { coverageComplete: false },
  ])
    assert.equal(reusableRun(run, { ...proof, ...patch }, tree, 'owner/repo'), false);
  assert.equal(reusableRun(run, null, tree, 'owner/repo'), false);
  assert.equal(reusableRun(run, proof, '', 'owner/repo'), false);
});

test('the actual required-check command rejects missing, failed, cancelled and inconsistent jobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bandarlog-ci-final-'));
  try {
    const command = (prepare: string, browser: string, count: string) =>
      spawnSync(process.execPath, ['scripts/ci-finalize.mjs'], {
        env: {
          ...process.env,
          PREPARE_RESULT: prepare,
          BROWSER_RESULT: browser,
          BROWSER_COUNT: count,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        },
        encoding: 'utf8',
      }).status;
    assert.equal(command('success', 'success', '2'), 0);
    assert.equal(command('success', 'skipped', '0'), 0);
    for (const [prepare, browser, count] of [
      ['failure', 'skipped', '0'],
      ['cancelled', 'success', '2'],
      ['skipped', 'skipped', '0'],
      ['success', 'failure', '2'],
      ['success', 'cancelled', '2'],
      ['success', 'skipped', '2'],
      ['success', 'success', ''],
      ['success', 'success', '0'],
      ['success', 'skipped', 'unknown'],
    ])
      assert.notEqual(command(prepare, browser, count), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the required check records the actual Git tree and refuses evidence for different content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bandarlog-ci-evidence-'));
  const script = join(process.cwd(), 'scripts/ci-finalize.mjs');
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    writeFileSync(join(dir, 'app.txt'), 'verified content');
    git('add', 'app.txt');
    git('-c', 'user.name=CI', '-c', 'user.email=ci@example.test', 'commit', '-qm', 'fixture');
    const tree = git('rev-parse', 'HEAD^{tree}');
    const command = (expected: string) =>
      spawnSync(process.execPath, [script], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PREPARE_RESULT: 'success',
          BROWSER_RESULT: 'success',
          BROWSER_COUNT: '2',
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_RUN_ID: '17',
          VERIFIED_TREE: expected,
          GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        },
      });
    const result = command(tree);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'verified-tree.json'), 'utf8')), {
      version: 1,
      tree,
      coverageComplete: true,
      event: 'pull_request',
      runId: 17,
    });
    assert.notEqual(command('b'.repeat(40)).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the actual planner emits valid job outputs and uses full coverage for an invalid comparison', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bandarlog-ci-plan-'));
  try {
    const event = join(dir, 'event.json');
    const output = join(dir, 'outputs');
    const summary = join(dir, 'summary');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const run = (base: string, eventName = 'pull_request') => {
      writeFileSync(event, JSON.stringify({ before: base, pull_request: { base: { sha: base } } }));
      writeFileSync(output, '');
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ci-plan.ts'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: eventName,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_API_URL: 'http://127.0.0.1:1',
          GH_TOKEN: 'unusable-test-token',
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_EVENT_PATH: event,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => {
            const separator = line.indexOf('=');
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );
    };
    const unchanged = run(head);
    assert.deepEqual(JSON.parse(unchanged.node), []);
    assert.deepEqual(JSON.parse(unchanged.browser), []);
    assert.equal(unchanged.browser_count, '0');
    const fallback = run('0'.repeat(40));
    assert.deepEqual(JSON.parse(fallback.node), inventory().node);
    assert.deepEqual(JSON.parse(fallback.browser), inventory().browser);
    const noEvidence = run(head, 'push');
    assert.equal(noEvidence.reused, '');
    assert.deepEqual(JSON.parse(noEvidence.node), inventory().node);
    assert.deepEqual(JSON.parse(noEvidence.browser), inventory().browser);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
