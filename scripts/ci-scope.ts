import { readdirSync } from 'node:fs';

export type TestPlan = { node: string[]; browser: string[]; full: boolean; reasons: string[] };
const cases = (names: string, browser = false) =>
  names
    .split(' ')
    .filter(Boolean)
    .map((name) => (browser ? 'tests/browser/' + name + '.spec.ts' : 'tests/' + name + '.test.ts'));
const rules: { matches: RegExp; node: string; browser: string }[] = [
  {
    matches:
      /^(server\/(mail[^/]*|resend[^/]*)\.ts|scripts\/(setup-resend\.ts|build-mail-artwork\.mjs)|public\/monkey-(key|wave)-2d\.png)$/,
    node: 'mail mail-template resend resend-api config api forest-auth groups-api',
    browser: 'mail-team access-recovery flows entity-settings publication',
  },
  {
    matches: /^(src\/(AuthScreen|Onboarding|pending-access)\.tsx?|server\/remembered-entry\.ts)$/,
    node: 'client-access auth-security forest-auth remembered-entry',
    browser: 'access-recovery forest flows remembered-entry publication',
  },
  {
    matches:
      /^(src\/(Profile[^/]*|PhotoEditor|DeviceNotifications)\.tsx?|src\/profile-panel\.css|server\/(preferences|photos|push)\.ts)$/,
    node: 'preferences push api',
    browser: 'desktop-implementation forest mobile-v2',
  },
  {
    matches:
      /^(src\/(Task[^/]*|task-people|deadline|Workload|workload|AnimatedCounter)\.tsx?|src\/task-details\.css|server\/task-checklist\.ts)$/,
    node: 'task-checklist task-people deadline workload api',
    browser: 'task-details workflow-fixes mobile-v2 entity-settings role-actions',
  },
  {
    matches:
      /^(shared\/project-types\.ts|server\/project-(input|summaries)\.ts|src\/(EntitySettings|CommissionSettings)\.tsx|src\/(project-experience|entity-settings)\.css)$/,
    node: 'unified-projects project-migration api',
    browser: 'project-experience entity-settings task-details role-actions mobile-v2',
  },
  {
    matches:
      /^(src\/Tutorial[^/]*\.tsx|src\/tutorial\.css|shared\/tutorial\.ts|server\/tutorial\.ts)$/,
    node: 'tutorial tutorial-storage api',
    browser: 'tutorial mobile-v2',
  },
  {
    matches:
      /^(server\/artwork\.ts$|shared\/scout-catalog\.ts$|src\/Artwork\.tsx$|scripts\/(build-artwork-icons\.ts|import-artwork-sheet\.mjs)$|public\/artwork\/)/,
    node: 'artwork scout-catalog',
    browser: 'entity-settings workflow-fixes mobile-v2',
  },
  {
    matches:
      /^(src\/(BotanicalCanopy|ForestHeader|BananaLoader)\.tsx|src\/botanical-canopy\.css|shared\/forest-art\.ts)$/,
    node: '',
    browser: 'desktop-implementation forest mobile-v2 typography forest-landing',
  },
  {
    matches:
      /^(server\/public-site\.ts$|public\/(public-site\.css$|landing-motion\.js$|landing\/)|docs\/forest-landing\/rig\/|scripts\/render-keyboard-animation\.mjs$)/,
    node: 'landing-animation groups-api',
    browser: 'forest-landing publication remembered-entry typography',
  },
  {
    matches: /^(public\/(typography\.css$|public-fonts\/)|src\/desktop-forest\.css$)/,
    node: '',
    browser: 'typography desktop-implementation mobile-v2 forest-landing publication',
  },
  {
    matches:
      /^(public\/(sw\.js|offline[^/]*\.(js|html)|manifest\.webmanifest)|src\/(offline|pwa|SyncStatus|group-location)\.tsx?)$/,
    node: 'offline-scripts client-access groups-api',
    browser: 'remembered-entry publication workflow-fixes project-experience mobile-v2',
  },
  {
    matches: /^src\/(focus|MobileUX|scroll-lock|Select|api)\.tsx?$/,
    node: 'focus client-access task-people',
    browser: 'mobile-v2 workflow-fixes desktop-implementation role-actions task-details',
  },
];

export function inventory(root = '.') {
  return {
    node: readdirSync(root + '/tests')
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => 'tests/' + f)
      .sort(),
    browser: readdirSync(root + '/tests/browser')
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => 'tests/browser/' + f)
      .sort(),
  };
}

export function selectTests(paths: string[], available = inventory(), forceFull = false): TestPlan {
  const node = new Set<string>();
  const browser = new Set<string>();
  const reasons: string[] = [];
  let full = forceFull;
  for (const path of paths) {
    // This regression file is introduced separately; either merge order works.
    if (
      available.browser.includes('tests/browser/mobile-canopy.spec.ts') &&
      ([
        'src/BotanicalCanopy.tsx',
        'src/ForestHeader.tsx',
        'src/botanical-canopy.css',
        'src/ProfileForm.tsx',
        'src/ProfilePanel.tsx',
        'src/MobileUX.tsx',
        'src/pwa.ts',
        'server/preferences.ts',
        'server/public-site.ts',
        'public/public-site.css',
        'public/landing-motion.js',
        'public/typography.css',
        'src/desktop-forest.css',
      ].includes(path) ||
        path.startsWith('public/public-fonts/'))
    )
      browser.add('tests/browser/mobile-canopy.spec.ts');
    if (
      /^(artifacts\/|docs\/(?!forest-landing\/rig\/).*\.(md|json|png|webp)$)/.test(path) ||
      /^(README|PRODUCT|DESIGN|AGENTS)\.md$/.test(path)
    )
      continue;
    if (available.node.includes(path)) {
      node.add(path);
      continue;
    }
    if (available.browser.includes(path)) {
      browser.add(path);
      continue;
    }
    if (
      /^(src\/(main\.tsx|types\.ts|styles\.css|forest\.css|workflow-fixes\.css)|index\.html)$/.test(
        path,
      )
    ) {
      available.browser.forEach((file) => browser.add(file));
      reasons.push('Cobertura de todo el navegador: estructura o estilo global (' + path + ').');
      continue;
    }
    const matched = rules.filter((rule) => rule.matches.test(path));
    if (!matched.length) {
      // Schema/migrations, permissions, dependencies,
      // test infrastructure, deleted tests and unknown files expand coverage.
      full = true;
      reasons.push('Cobertura completa: cambio transversal o sin mapa (' + path + ').');
      continue;
    }
    for (const rule of matched) {
      cases(rule.node).forEach((test) => node.add(test));
      cases(rule.browser, true).forEach((test) => browser.add(test));
    }
  }
  if (
    [...node].some((file) => !available.node.includes(file)) ||
    [...browser].some((file) => !available.browser.includes(file))
  ) {
    full = true;
    reasons.push('El mapa referencia una prueba ausente; se amplía la cobertura.');
  }
  if (forceFull) reasons.push('Validación completa solicitada o main sin evidencia reutilizable.');
  return {
    node: full ? available.node : [...node].filter((f) => available.node.includes(f)).sort(),
    browser: full
      ? available.browser
      : [...browser].filter((f) => available.browser.includes(f)).sort(),
    full,
    reasons: reasons.length
      ? reasons
      : ['Pruebas de las áreas afectadas; compilación y tipos siempre obligatorios.'],
  };
}

export const validTree = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function reusableRun(run: any, proof: any, tree: string, repository: string) {
  return Boolean(
    validTree(tree) &&
    run?.event === 'pull_request' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.path === '.github/workflows/checks.yml' &&
    run.head_repository?.full_name === repository &&
    proof?.version === 1 &&
    proof.runId === run.id &&
    proof.event === 'pull_request' &&
    proof.coverageComplete === true &&
    proof.tree === tree,
  );
}
