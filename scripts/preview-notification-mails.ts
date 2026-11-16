import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { renderMail } from '../server/mail-template.js';
import { weeklyMail } from '../server/weekly-mail.js';

// Isolated demonstration data. This script neither starts the scheduler nor sends mail.
const directory = 'artifacts/notification-mails';
const appUrl = 'https://bandarlog.example.test';
const base = `${appUrl}/g/demo/`;
const digest = weeklyMail({
  project: 'Campamento de verano',
  groupName: 'Grupo de demostración',
  appUrl,
  projectUrl: `${base}?project=campamento`,
  taskUrl: (id) => `${base}?task=${id}`,
  at: new Date('2026-11-16T10:00:00Z'),
  commissions: [
    { id: 'cocina', name: 'Cocina' },
    { id: 'rutas', name: 'Rutas' },
  ],
  tasks: [
    {
      id: 'menu',
      title: 'Cerrar el menú y las alergias',
      commissionId: 'cocina',
      status: 'blocked',
      due: '2026-11-14T18:00:00Z',
      blockedReason: 'Faltan dos confirmaciones de las familias.',
    },
    {
      id: 'ruta',
      title: 'Confirmar la ruta y sus alternativas',
      commissionId: 'rutas',
      status: 'pending',
      due: '2026-11-18T18:00:00Z',
    },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `done-${i}`,
      title: 'Tarea terminada',
      commissionId: 'rutas',
      status: 'done',
      due: '2026-11-10T18:00:00Z',
    })),
  ],
});
const reminder = renderMail({
  title: 'Confirmar la ruta y sus alternativas',
  eyebrow: 'Recordatorio · vence en 3 días',
  intro: 'Hola, Álex. Esta tarea sigue pendiente. La fecha límite es el 19 nov 2026, 19:00.',
  appUrl,
  actionLabels: true,
  body: 'Revisa el recorrido, los puntos de agua y una alternativa por si cambia el tiempo.',
  details: [
    { label: 'Grupo', value: 'Grupo de demostración' },
    { label: 'Comisión', value: 'Rutas' },
    { label: 'Proyecto', value: 'Campamento de verano' },
    { label: 'Responsables', value: 'Álex y María' },
    { label: 'Fecha límite', value: '19/11/2026, 19:00' },
    { label: 'Estado', value: 'Pendiente' },
  ],
  actions: [
    { label: 'Ver tarea', url: `${base}?task=ruta` },
    { label: 'Marcar en curso', kind: 'in_progress', url: `${base}?task=ruta&action=in_progress` },
    { label: 'Bloquear tarea', kind: 'blocked', url: `${base}?task=ruta&action=blocked` },
    { label: 'Completar tarea', kind: 'done', url: `${base}?task=ruta&action=done` },
  ],
});
await mkdir(directory, { recursive: true });
for (const [name, source] of Object.entries({
  recordatorio: reminder,
  resumen_semanal: digest.html,
})) {
  let html = source;
  // Embed public assets only in the standalone preview, never in outgoing email.
  for (const match of source.matchAll(/src="https:\/\/bandarlog\.example\.test\/([^"]+)"/g)) {
    const data = await readFile(`public/${match[1]}`);
    html = html.replaceAll(match[0], `src="data:image/png;base64,${data.toString('base64')}"`);
  }
  await writeFile(`${directory}/${name}.html`, html);
}
await writeFile(`${directory}/resumen_semanal.txt`, digest.body);
console.log(`Previews saved to ${directory}`);
