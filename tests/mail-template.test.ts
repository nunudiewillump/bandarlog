import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMail } from '../server/mail-template';
test('Bandarlog email HTML escapes untrusted values, preserves text and renders usable secure buttons', () => {
  const html = renderMail({
    title: '<script>alert(1)</script>',
    body: 'Detalles <img src=x onerror=alert(1)>',
    appUrl: 'https://bandarlog.example.org',
    details: [{ label: 'Comisión', value: 'Cocina & logística' }],
    actions: [
      { label: 'Abrir tarea', url: 'https://bandarlog.example.org/?task=1&action=done' },
      { label: 'Invalid', url: 'javascript:alert(1)' },
    ],
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('Cocina &amp; logística'));
  assert.ok(html.includes('?task=1&amp;action=done'));
  assert.ok(html.includes('Abrir tarea'));
  assert.ok(html.includes('Bandarlog'));
});

test('every branded email includes the lightweight public waving mascot and remains readable without images', async () => {
  const { default: sharp } = await import('sharp');
  const { readFile } = await import('node:fs/promises');
  const asset = await readFile('public/monkey-wave-2d.png');
  const image = await sharp(asset).metadata();
  assert.equal(image.format, 'png');
  assert.equal(image.hasAlpha, true);
  assert.ok(image.height! <= 240 && asset.length < 50000);
  for (const title of [
    'Tu enlace de acceso',
    'Te invitan a Bandarlog',
    'Nueva asignación',
    'Recordatorio de tarea',
    'Resumen semanal',
  ]) {
    const html = renderMail({
      title,
      body: 'Consulta tus tareas.',
      appUrl: 'https://bandarlog.example.org',
      actions: [{ label: 'Entrar', url: 'https://bandarlog.example.org/' }],
    });
    assert.ok(html.includes('src="https://bandarlog.example.org/monkey-wave-2d.png"'));
    assert.ok(html.includes('alt="Un mono de Bandarlog saludando"'));
    assert.ok(html.includes('width="84" height="96"'));
    assert.ok(html.includes('<h1'));
    assert.ok(html.includes('Consulta tus tareas.'));
    assert.ok(html.includes('>Entrar</a>'));
  }
});

test('task email actions use labeled PNG icons in one row beneath the primary link, with grass beneath', () => {
  const html = renderMail({
    title: 'Nueva tarea',
    body: 'Descripción',
    appUrl: 'https://bandarlog.example.org',
    actions: [
      { label: 'Ver tarea', url: 'https://bandarlog.example.org/?task=1' },
      {
        label: 'Marcar en curso',
        kind: 'in_progress',
        url: 'https://bandarlog.example.org/?task=1&action=in_progress',
      },
      {
        label: 'Completar tarea',
        kind: 'done',
        url: 'https://bandarlog.example.org/?task=1&action=done',
      },
      {
        label: 'Bloquear tarea',
        kind: 'blocked',
        url: 'https://bandarlog.example.org/?task=1&action=blocked',
      },
    ],
  });
  assert.equal((html.match(/data-mail-action=/g) || []).length, 3);
  assert.ok(html.indexOf('>Ver tarea</a>') < html.indexOf('data-mail-action='));
  assert.ok(
    html.indexOf('data-mail-action="in_progress"') < html.indexOf('data-mail-action="blocked"'),
  );
  assert.ok(html.indexOf('data-mail-action="blocked"') < html.indexOf('data-mail-action="done"'));
  assert.ok(html.indexOf('data-mail-action="done"') < html.indexOf('/mail-grass.png'));
  for (const label of ['Marcar en curso', 'Completar tarea', 'Bloquear tarea'])
    assert.ok(html.includes(`alt="${label}"`));
  for (const color of ['#276cae', '#f7c948', '#124d38'])
    assert.ok(html.includes('background:' + color));
});
