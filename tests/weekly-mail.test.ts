import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyMail } from '../server/weekly-mail';
import { resendVariables } from '../server/resend-template';

const at = new Date('2026-11-16T10:00:00Z');
const input = {
  project: 'Campamento & rutas',
  groupName: 'Grupo de prueba',
  appUrl: 'https://bandarlog.example.test',
  projectUrl: 'https://bandarlog.example.test/g/demo/?project=p',
  taskUrl: (id: string) => `https://bandarlog.example.test/g/demo/?task=${id}`,
  commissions: [{ id: 'c', name: 'Cocina' }],
  at,
};
const task = (id: string, status: string, due: string) => ({
  id,
  title: `Tarea ${id}`,
  commissionId: 'c',
  status,
  due,
});
test('weekly digest counts overlapping deadlines, prioritizes actionable work once, and bounds its size', () => {
  const result = weeklyMail({
    ...input,
    tasks: [
      task('done', 'done', '2026-11-01T00:00:00Z'),
      {
        ...task('blocked', 'blocked', '2026-11-10T10:00:00Z'),
        blockedReason: '<img src=x onerror=alert(1)>',
      },
      task('overdue', 'pending', '2026-11-15T10:00:00Z'),
      task('soon', 'in_progress', '2026-11-23T22:59:00Z'),
      task('later', 'pending', '2026-11-23T23:00:00Z'),
      ...Array.from({ length: 5 }, (_, i) => task(`extra-${i}`, 'pending', '2026-11-20T10:00:00Z')),
    ],
  });
  assert.match(result.body, /Vencidas: 2/);
  assert.match(result.body, /En curso: 1/);
  assert.match(result.body, /próximos 7 días: 6/);
  assert.match(result.body, /3 tareas más requieren atención/);
  assert.equal((result.body.match(/Tarea blocked/g) || []).length, 1);
  assert.ok(result.body.indexOf('Tarea blocked') < result.body.indexOf('Tarea overdue'));
  assert.ok(!result.body.includes('Tarea later'));
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!result.html.includes('<img src=x'));
  assert.match(result.html, /Campamento &amp; rutas/);
  assert.match(result.html, /10%/);
  // Content survives the existing published Resend shell, without republishing it.
  const variables = resendVariables('Resumen semanal', result.body, result.html)!;
  const content = Object.keys(variables)
    .filter((k) => k.startsWith('CONTENT_'))
    .sort()
    .map((k) => variables[k])
    .join('');
  assert.match(content, /Progreso total del proyecto/);
  assert.match(content, /Necesita atención/);
  assert.match(content, /Ver proyecto/);
});
test('empty and completed projects have distinct honest summaries', () => {
  const empty = weeklyMail({ ...input, tasks: [] });
  assert.match(empty.html, /todavía no tiene tareas/);
  assert.match(empty.html, /Sin tareas/);
  assert.ok(!empty.html.includes('>100%</'));
  const completed = weeklyMail({ ...input, tasks: [task('done', 'done', '2026-11-01T00:00:00Z')] });
  assert.match(completed.html, /Todas las tareas del proyecto están terminadas/);
  assert.match(completed.html, />100%</);
  assert.ok(!completed.body.includes('?task=done'));
});
test('upcoming deadlines use Madrid calendar days over daylight-saving changes', () => {
  const result = weeklyMail({
    ...input,
    at: new Date('2026-10-19T10:00:00Z'),
    tasks: [
      task('in', 'pending', '2026-10-26T22:59:00Z'),
      task('out', 'pending', '2026-10-26T23:00:00Z'),
    ],
  });
  assert.match(result.body, /próximos 7 días: 1/);
  assert.match(result.body, /Tarea in/);
  assert.ok(!result.body.includes('Tarea out'));
});

test('weekly progress uses real completion dates and avoids empty or unchanged non-actionable digests', () => {
  const old = weeklyMail({ ...input, tasks: [task('old', 'done', '2026-11-01T00:00:00Z')] });
  assert.equal(old.shouldSend, false);
  const recent = weeklyMail({
    ...input,
    tasks: [
      { ...task('recent', 'done', '2026-11-01T00:00:00Z'), completedAt: '2026-11-15T10:00:00Z' },
    ],
  });
  assert.equal(recent.shouldSend, true);
  assert.match(recent.body, /1 tareas terminadas esta semana/);
  assert.ok(
    recent.html.indexOf('Necesita atención') < recent.html.indexOf('Lo que habéis sacado adelante'),
  );
  const future = weeklyMail({
    ...input,
    tasks: [
      { ...task('future', 'done', '2026-11-01T00:00:00Z'), completedAt: '2026-11-17T10:00:00Z' },
    ],
  });
  assert.equal(future.shouldSend, false);
  assert.equal(weeklyMail({ ...input, tasks: [] }).shouldSend, false);
});
