import * as s from './schema.js';
import type { Database } from './db.js';
export async function seed(storage: Database) {
  await storage.transaction(async (db: any) => {
    if ((await db.select().from(s.users)).length) return;
    if (process.env.NODE_ENV === 'production') {
      const email = process.env.BOOTSTRAP_EMAIL;
      if (!email) throw new Error('BOOTSTRAP_EMAIL es obligatorio para la primera instalación');
      await db
        .insert(s.users)
        .values({ id: 'admin', name: 'Coordinación', email: email.toLowerCase(), role: 'admin' });
      return;
    }
    await db.insert(s.users).values([
      { id: 'alex', name: 'Álex Martín', email: 'alex@example.test', role: 'admin' },
      { id: 'laura', name: 'Laura Martín', email: 'laura@example.test', role: 'member' },
      { id: 'carlos', name: 'Carlos López', email: 'carlos@example.test', role: 'member' },
      { id: 'ana', name: 'Ana García', email: 'ana@example.test', role: 'member' },
      { id: 'miguel', name: 'Miguel Santos', email: 'miguel@example.test', role: 'member' },
    ]);
    const year = new Date().getFullYear();
    await db.insert(s.projects).values([
      {
        id: 'ronda',
        name: `Ronda solar ${year}–${year + 1}`,
        type: 'ronda',
        starts: `${year}-09-01`,
        ends: `${year + 1}-08-31`,
      },
      {
        id: 'camp',
        name: `Campamento de verano ${year + 1}`,
        type: 'camp',
        parentId: 'ronda',
        starts: `${year + 1}-07-15`,
        ends: `${year + 1}-07-30`,
      },
    ]);
    const cs = [
      ['cocina', 'Cocina', 'camp', 'chef'],
      ['logistica', 'Logística', 'ronda', 'tent'],
      ['comunicacion', 'Comunicación', 'ronda', 'megaphone'],
      ['animacion', 'Animación', 'camp', 'drama'],
      ['infraestructura', 'Infraestructura', 'camp', 'tools'],
      ['salud', 'Salud', 'camp', 'heart'],
    ];
    for (const [id, name, projectId, icon] of cs) {
      await db.insert(s.commissions).values({
        id,
        name,
        projectId,
        icon,
        description: `Todo lo necesario para ${name.toLowerCase()}. Nos organizamos para avanzar juntos.`,
      });
      for (const userId of ['alex', 'laura', 'carlos', 'ana'])
        await db.insert(s.members).values({
          id: `${id}-${userId}`,
          commissionId: id,
          userId,
          role: userId === 'laura' ? 'responsible' : 'scouter',
        });
    }
    const titles = [
      'Revisar listado de material',
      'Preparar menú semanal',
      'Definir necesidades de gas',
      'Comprar material de cocina',
      'Organizar turnos de cocina',
      'Revisar normativas sanitarias',
      'Confirmar presupuesto',
      'Contactar con proveedores',
      'Diseño de carteles',
      'Reunión con monitores',
      'Preparar juegos de bienvenida',
      'Comprobar botiquines',
      'Revisar montaje de tiendas',
      'Organizar transporte',
      'Enviar información a familias',
      'Cerrar lista de participantes',
      'Revisar alergias',
      'Reservar espacio de acampada',
    ];
    for (let i = 0; i < titles.length; i++) {
      const commissionId = i < 6 ? 'cocina' : cs[(i - 5) % 6][0];
      const status = ['pending', 'pending', 'in_progress', 'done', 'pending', 'blocked'][i % 6];
      const due = new Date(Date.now() + ((i % 8) - 2) * 86400000);
      due.setUTCHours(12, 0, 0, 0);
      const id = `task-${i}`;
      await db.insert(s.tasks).values({
        id,
        commissionId,
        title: titles[i],
        description:
          'Revisar y completar los detalles con el equipo. Compartir las novedades con la comisión para que todos tengamos la información al día.',
        due: due.toISOString(),
        status,
        blockedReason: status === 'blocked' ? 'Pendiente de confirmación del proveedor' : null,
        completedBy: status === 'done' ? 'laura' : null,
        completedAt: status === 'done' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      });
      for (const userId of ['alex', i % 2 ? 'carlos' : 'laura'])
        await db.insert(s.assignments).values({ id: `${id}-${userId}`, taskId: id, userId });
      await db.insert(s.activity).values({
        id: `activity-${i}`,
        taskId: id,
        userId: 'laura',
        kind: 'created',
        body: 'Ha creado la tarea y asignado responsables.',
        createdAt: new Date().toISOString(),
      });
    }
  });
}
