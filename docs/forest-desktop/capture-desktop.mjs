import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// Capture a static design artifact; this does not exercise application behavior.
const root = path.dirname(new URL(import.meta.url).pathname);
const round = process.argv[2] || 'initial';
const output = path.join(root, `renders-${round}`);
await fs.mkdir(output, { recursive: true });
const source = JSON.parse(await fs.readFile(path.join(root, 'codex/scenes.json'), 'utf8'));
const scenes = Array.isArray(source) ? source : source.scenes;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const records = [];
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const keyScenes = scenes.filter(scene => scene.key || ['D01', 'D02', 'D03', 'D05', 'D07', 'D08', 'D10', 'D23', 'D30', 'D45'].includes(scene.id.toUpperCase()) || /home|commission|invite|profile|task-detail/i.test(scene.id));
for (const scene of scenes) {
  const filename = scene.screen || scene.file || scene.path || `screens/${scene.id}.html`;
  for (const [width, height] of [[1440, 900], [1280, 800], ...(keyScenes.includes(scene) ? [[1024, 768], [1920, 1080]] : [])]) {
    await page.setViewportSize({ width, height });
    const response = await page.goto(`http://127.0.0.1:8096/docs/forest-desktop/codex/${filename}`);
    if (!response?.ok()) throw new Error(`Missing static scene: ${filename}`);
    await page.evaluate(() => document.fonts.ready);
    const name = `${scene.id}-${width}`;
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
    if (keyScenes.includes(scene)) await page.screenshot({ path: path.join(output, `${name}-viewport.png`), animations: 'disabled' });
    const measured = await page.evaluate(() => {
      const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return {
        width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight, title: document.title,
        fontsReady: document.fonts.status,
        images: [...document.images].filter(visible).map(e => ({ source: e.getAttribute('src'), loaded: e.complete && e.naturalWidth > 0 })),
        targets: [...document.querySelectorAll('button, input, select, textarea, a[href], summary')].filter(visible).map(e => ({ tag: e.tagName, label: e.getAttribute('aria-label') || e.textContent.trim() || e.getAttribute('placeholder') || '', ...box(e) })),
        typography: [...new Set([...document.querySelectorAll('p, td, th, label, button, a, small')].filter(visible).map(e => getComputedStyle(e).fontSize))],
        overflow: [...document.querySelectorAll('main, section, article, aside, table, .panel, .drawer, .modal')].filter(visible).filter(e => e.scrollWidth > e.clientWidth + 2).map(e => ({ tag: e.tagName, class: e.className, clientWidth: e.clientWidth, scrollWidth: e.scrollWidth })),
      };
    });
    records.push({ scene: scene.id, file: filename, capture: `renders-${round}/${name}.png`, ...measured });
  }
}
await browser.close();
await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify({ round, recordedAt: new Date().toISOString(), limitations: 'Static prototype geometry only; not app, backend, physical device or full accessibility validation.', records, errors }, null, 2) + '\n');
const summary = { scenes: scenes.length, captures: records.length, pageErrors: errors, horizontalOverflow: records.filter(r => r.documentWidth > r.width).map(r => `${r.scene}:${r.width}`), brokenImages: records.flatMap(r => r.images.filter(i => !i.loaded).map(i => `${r.scene}:${i.source}`)), smallTargets: records.flatMap(r => r.targets.filter(t => t.width < 24 || t.height < 24).map(t => ({ scene: r.scene, width: r.width, ...t }))) };
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, smallTargets: summary.smallTargets.length }, null, 2));
