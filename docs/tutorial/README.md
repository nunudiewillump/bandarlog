# Tu primera misión

## Descubrimiento e integración

Tras guardar nombre y foto opcional, Inicio ofrece «Tu primera misión», duración estimada 2–3 minutos, Empezar y Omitir. Todos los usuarios, incluidos los ya creados antes de esta entrega, parten sin eventos: no se migra ningún usuario a «visto». La primera aparición se registra cuando al menos el 50 % de la invitación entra en el viewport con la pestaña visible, descontando el área ocupada por la navegación inferior. Verla de nuevo no duplica el evento; la invitación permanece hasta omitir o completar, según el encargo de descubrimiento. La primera apertura desde Ayuda también cuenta como visualización efectiva.

La misión vive en `view=tutorial`, con Inicio seleccionado en la navegación y la sesión/PWA actuales. Es una pantalla de práctica, sin recorridos forzados ni modal explicativo. Reutiliza `TaskChecklist` con un adaptador de cambio explícito, insignias, estilos de detalle/actividad, botones y el indicador de carga. Checklist, actualización y cambios de estado son opcionales: se puede completar directamente. Perfil → Ayuda → Repetir tutorial permite retomarlo o empezar una nueva práctica, incluso después de omitirlo o completarlo. La repetición explícita reinicia solo la tarea simulada y sus dos casillas; los hitos analíticos iniciales permanecen.

## Aislamiento y datos mínimos

La simulación no forma parte de `/api/data` ni utiliza endpoints de tareas, comentarios, comisiones, miembros, notificaciones o actividad. Incluso un enlace de tutorial con parámetros de una tarea real no abre ese detalle ni su acción. El título, comisión, responsable y pasos son constantes ficticias del cliente. Las actualizaciones se mantienen únicamente en la memoria de la pantalla: no se envía su texto, no se conserva al recargar ni se publica al equipo. La API rechaza campos adicionales como contenido, destinatarios, identificadores de otros usuarios o fechas suministradas por el cliente.

La migración 0013 crea `tutorial_progress` y su referencia al usuario; no modifica filas existentes. Una fila por usuario guarda los primeros instantes de cada evento, estado simulado, estado anterior para Deshacer, dos booleanos de checklist, versión y última actividad. Las escrituras reutilizan los recibos técnicos de idempotencia existentes, sin contenido escrito. Los bloqueos por fila y la versión rechazan cambios concurrentes; los reintentos con el mismo ID de mutación devuelven el resultado anterior. La API siempre obtiene el usuario de la sesión y aplica CSRF. Las estadísticas solo se entregan a `admin`, sin nombres, correos ni filas individuales.

Las acciones del tutorial no emiten el SSE de cambios de datos reales. El mantenimiento de abandono es independiente del envío de recordatorios: un fallo de analítica no impide ejecutar las notificaciones ordinarias. No hay proveedores externos de analítica ni dependencias nuevas. Se requiere conexión para guardar el progreso; un fallo no simula un guardado ni entra en la cola de mutaciones de tareas.

## Eventos y definiciones

Cada nombre conserva su primer instante por persona, no un registro ilimitado de clics:

- `tutorial_shown`: primera visualización efectiva o apertura/omisión explícita que demuestra exposición. Un GET no cuenta como visualización.
- `tutorial_started`: primera apertura; no se reinicia al recargar.
- `tutorial_skipped`: omisión explícita antes de haber completado alguna vez. Cerrar la pantalla o navegar no es omitir.
- `tutorial_completed`: primera finalización; no exige usar otras funciones.
- `tutorial_reopened`: primera apertura posterior a un inicio u omisión previos.
- `tutorial_abandoned`: primera detección de 24 horas de inactividad desde la última interacción de alguien que lo inició sin completar ni omitir.
- `tutorial_checklist_used`, `tutorial_update_published`, `tutorial_task_completed`, `tutorial_undo_used`: primeras utilizaciones, sin texto ni valores personales.

La inactividad se revisa cada minuto y al consultar el progreso o las estadísticas. La fecha del evento de abandono es la de detección; puede ser posterior al umbral si el servidor estuvo detenido. Una persona que nunca abrió no abandona. Una omisión no se transforma en abandono. El abandono histórico se conserva si la persona regresa, pero «abandono actual» se calcula con la última actividad y no incluye a quienes ya completaron u omitieron. Las cifras de inicio/omisión/finalización son conjuntos de personas únicas que pueden solaparse: alguien puede omitir y completar más tarde. No deben sumarse como estados excluyentes.

Tasas de inicio, omisión y finalización = personas con el hito / personas que lo vieron × 100. Finalización entre iniciados = personas que lo completaron / personas que lo iniciaron × 100. Denominador cero devuelve 0 %. La mediana usa el tiempo de calendario entre primer inicio y primera finalización de cada persona que completó; **incluye pausas y reaperturas**, no mide tiempo activo. Sin finalizaciones se muestra «Sin finalizaciones».

Completar marca un hito de aprendizaje permanente. Deshacer revierte solo el estado de la tarea simulada; no borra el hito, vuelve a mostrar la invitación ni reduce el embudo. No hay nuevos hitos de finalización en las repeticiones.

## Celebración y accesibilidad

`public/monkey-trumpeter-2d.webp` es una ilustración original del mono Bandarlog con pañoleta rosa/morada y trompeta dorada, optimizada a unos 29 KB. La animación CSS dura dos segundos: leve balanceo y tres notas SVG. No reproduce sonido ni confeti, no utiliza 3D ni dependencias de animación. «¡Ya estás listo!» y «Tu primera misión está completada» se anuncian mediante una región de estado. Puede cerrarse o continuar inmediatamente y desaparece automáticamente en unos 2,3 segundos. Respeta movimiento reducido con ilustración y notas estáticas. La navegación inferior queda libre mediante el área segura.

Solo la primera transición de finalización del tutorial autoriza la celebración. No se hidrata desde el estado guardado, no se dispara al cargar una misión terminada, al repetirla, al deshacer y completar de nuevo ni al finalizar tareas ordinarias. No se utiliza la animación global de tareas para esta misión.

## Verificación

Las pruebas cubren aislamiento de datos y correo, persistencia, permisos/CSRF, contenido rechazado, recibos y conflictos de versión, usuarios existentes, onboarding previo, visualización efectiva, omisión, repetición, finalización opcional, Deshacer, tasas/mediana, abandono real en base de datos, móvil de 320 px y áreas seguras, movimiento reducido, enlace con parámetros de tarea real y celebración separada de la de tareas ordinarias. Las capturas de `artifacts/tutorial` usan datos de prueba.
