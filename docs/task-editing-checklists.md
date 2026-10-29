# Edición de tareas y pasos opcionales

Una tarea permite editar título, descripción, fecha límite y responsables desde el lápiz del detalle. La lectura es el estado inicial; Guardar cambios y Cancelar solo aparecen al editar. El borrador conserva la versión con la que se abrió: si otra persona modifica la tarea, el guardado devuelve un conflicto y mantiene lo escrito para revisarlo. Los campos sin cambios conservan su valor original, incluida la hora de vencimiento de tareas antiguas.

La sección Pasos aparece al añadir una checklist. No hay pasos obligatorios y la lista no impide completar ni reabrir la tarea. Su estado no cambia automáticamente al completar la tarea. Los textos pueden tener hasta 240 caracteres y cada tarea admite hasta 100 pasos, con identificadores estables y orden de creación.

| Acción | Scouter asignado | Responsable de esa comisión | Coordinación / Administración |
| --- | --- | --- | --- |
| Editar título, descripción, fecha y responsables | No | Sí | Sí |
| Añadir, editar o eliminar pasos | No | Sí | Sí |
| Marcar o desmarcar pasos | Sí | Sí | Sí |
| Consultar la lista | Según acceso a la comisión | Sí | Sí |

Un Scouter no asignado solo consulta las tareas que su pertenencia a la comisión le permite ver. Los controles sin permiso se ocultan; el servidor valida de nuevo cada operación. Las tareas borradas o pertenecientes a proyectos archivados no admiten cambios. Marcar pasos de una tarea terminada no la reabre.

El formulario reutiliza los campos Forest, la fecha sin hora, las acciones de gestión al final del detalle y los controles táctiles de al menos 44 px. La checklist usa un único menú por paso para sus acciones de gestión y un formulario breve al añadir o editar. Los cambios de pasos quedan en Actividad reciente sin enviar un correo por cada casilla marcada; la edición del contenido mantiene los avisos de actualización existentes.

## Datos y sincronización

La migración `0010_nosy_black_tarantula` añade `tasks.checklist` como JSONB no nulo con valor predeterminado `[]`. Conserva tareas, textos, fechas, asignaciones, estados e historial existentes. No añade dependencias ni variables de entorno.

Las operaciones de pasos usan el mismo PATCH, bloqueo de tarea, control de versión y recibos transaccionales que las demás modificaciones. La cola offline proyecta los cambios de contenido y checklist y conserva las dependencias al sincronizar. El service worker pasa a v4 y el script compartido tiene una URL versionada para evitar cargar la proyección antigua desde una instalación previa de la PWA.

No se incorporan adjuntos, archivos, almacenamiento externo ni un nuevo flujo de creación de tareas.

## Validación

Las pruebas cubren conservación de una tarea anterior a la migración, permisos por ámbito, edición completa y parcial, validación, conflictos, CRUD de pasos, reintentos idempotentes, límite de pasos y finalización con pasos pendientes. Los recorridos de navegador comprueban móvil de 320/390 px y escritorio, cancelación, borrador ante conflicto, lectura del Scouter no asignado y cambios encadenados sin cobertura. Las capturas de `artifacts/task-details` contienen datos ficticios. El PR registra la ejecución vigente de build y tests.
