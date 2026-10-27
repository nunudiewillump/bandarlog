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
