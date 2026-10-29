import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
// Illustrative animation of the approved design, never a proof of an API event.
const frames = '/tmp/bandarlog-desktop-vine-frames';
await fs.mkdir(frames, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8096/docs/forest-desktop/codex/screens/d53.html');
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  const image = document.querySelector('.celebration > img');
  const animation = image.animate([
    { left: '-230px', transform: 'rotate(-30deg)', offset: 0 },
    { left: 'calc(50% - 110px)', transform: 'rotate(12deg)', offset: 0.4 },
    { left: 'calc(65% - 110px)', transform: 'rotate(-10deg)', offset: 0.7 },
    { left: '110%', transform: 'rotate(28deg)', offset: 1 },
  ], { duration: 2200, easing: 'cubic-bezier(0.28,0.1,0.44,1)', fill: 'both' });
  animation.pause();
  window.previewAnimation = animation;
  const label = document.createElement('div');
  label.textContent = 'Prototipo de movimiento · sin conexión a tareas reales';
  label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:6px 12px;background:#103b2d;color:#faf8f2;z-index:100;font:14px Nunito,sans-serif';
  document.body.append(label);
});
const observations = [];
for (let frame = 0; frame <= 30; frame++) {
  const milliseconds = frame / 12 * 1000;
  await page.evaluate(time => { window.previewAnimation.currentTime = time; }, milliseconds);
  await page.screenshot({ path: `${frames}/${String(frame).padStart(3, '0')}.png` });
  if ([0, 6, 12, 18, 24, 30].includes(frame)) observations.push(await page.evaluate(time => {
    const box = document.querySelector('.celebration > img').getBoundingClientRect();
    return { milliseconds: time, x: box.x, right: box.right, width: box.width, viewport: innerWidth };
  }, milliseconds));
}
await browser.close();
await fs.mkdir(new URL('published/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('published/motion-preview.json', import.meta.url), JSON.stringify({
  source: 'codex/screens/d53.html + existing source-observed vine-cross contract',
  frameRate: 12, simulatedDurationMs: 2500, observations,
  limitations: 'Authored deterministic prototype animation. GIF repeats for viewing; this does not prove the app triggers on every completion, actual event timing, reduced-motion behavior, or persisted counters.',
}, null, 2) + '\n');
console.log('Captured 31 illustrative vine frames; encode with ffmpeg to published/liana-2d.gif.');
