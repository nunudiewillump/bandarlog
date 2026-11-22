# Mapa temporal de proyectos

## Uso

En **Proyectos → Resumen**, a partir de 1024 px, la cronología muestra las comisiones autorizadas y sus tareas. La escala cambia entre días, semanas y meses. El zoom conserva el punto central y **Hoy** lleva a la fecha de Madrid. Las marcas de vencimiento y finalización son eventos independientes. Las bandas se reservan para fases con dos fechas registradas. Una tarea sin fecha válida se puede consultar desde su comisión y el detalle indica que falta ese dato. La ficha completa sigue siendo la de Tareas.

Coordinación y Administración pueden editar la planificación, completar hitos proporcionando la fecha real y registrar dependencias dirigidas. Al seleccionar una tarea se muestran sus relaciones y si la tarea previa sigue pendiente. El mapa muestra fecha prevista y real de los hitos. Las fechas vencidas no cambian su estado.

**Modo reunión** usa la pantalla completa del navegador. Los controles de recorrido centran la comisión y la resaltan mientras permanecen visibles las demás. La agenda distingue decisiones registradas y señales calculadas. Las tareas de seguimiento se crean con responsables individuales y se enlazan a su decisión. El acta se guarda como borrador o se cierra. Al cerrarla se preservan su contenido y los títulos y resoluciones de las referencias tal como se conocían en ese momento.

## Datos y permisos

| Tabla | Relación e índice |
| --- | --- |
| `project_phases` | Proyecto y grupo. Índice por grupo, proyecto y orden. |
| `project_milestones` | Proyecto y grupo, con comisión opcional del mismo proyecto. Índice por grupo, proyecto y fecha prevista. La fecha real presente determina el estado cumplido. |
| `project_dependencies` | Par dirigido único de tareas. Clave primaria por grupo, proyecto, origen y destino. Las referencias de tarea conservan la relación con su proyecto mediante validación SQL. |
| `project_decisions` | Proyecto, autor y responsable opcional del grupo, con comisión opcional del mismo proyecto. Índice por grupo, proyecto y fecha de creación. La resolución y su fecha determinan el estado. |
| `project_minutes` | Proyecto, autor, borrador o cierre, referencias validadas y copia histórica de las referencias al cierre. Índice por grupo, proyecto y fecha de reunión. El trigger impide sobrescribir actas cerradas. |
| `project_followups` | Enlace de una tarea real a la decisión del mismo proyecto. Una tarea solo puede pertenecer a un enlace de seguimiento. Índice por grupo, proyecto y decisión. |

Las migraciones aditivas `0041` y `0042` conservan los proyectos y el historial anteriores. Añaden políticas RLS para el rol de aplicación y para el entorno local compatible. El runtime remoto exige el contrato SQL 42. Las migraciones se aplican mediante el flujo de mantenimiento antes de actualizar el servicio.

`GET /api/projects/:id/planning` y `GET /api/projects/:id/meetings` consultan únicamente el proyecto de la ruta. El servidor aplica el mismo ámbito de comisiones que la instantánea de la aplicación. Los roles de comisión conservan sus permisos de tareas y pueden consultar fases y registros de su ámbito. Coordinación y Administración gestionan planificación, decisiones y actas. Las actas completas se reservan a esos dos roles porque pueden incluir notas y referencias de varias comisiones. Un proyecto archivado conserva sus decisiones y actas, con las mismas condiciones de lectura.

Los dos `POST` usan la validación existente de sesión, CSRF y recibos de mutación. Los cambios se serializan por proyecto y los campos de revisión detectan ediciones obsoletas. La búsqueda recursiva rechaza ciclos antes de insertar una relación. El seguimiento crea tarea, asignaciones, actividad y enlace en una misma transacción y reutiliza el proceso de creación de tareas. Las actas solo aceptan referencias existentes del proyecto.

## Rendimiento y coste

- **Medido en build local.** La cronología, la planificación y las reuniones se sirven en un chunk de escritorio separado. El escenario móvil comprueba que el navegador no solicita el módulo. El módulo de escritorio empaquetado ocupa 31,02 kB de JS y 6,63 kB de CSS (8,59 kB y 2,02 kB gzip, respectivamente). El JS principal pasa de 158,17 a 159,36 kB gzip (+1,19 kB).
- **Medido en Chromium local.** El escenario de 36 comisiones y 720 tareas verifica el montaje con las comisiones plegadas, expansión de 20 tareas, zoom y ausencia de desbordamiento de la página en 1024 px. El mismo escenario comprueba un proyecto sin comisiones. El resultado corresponde al entorno de desarrollo con datos sintéticos.
- **Estimación para Neon y Railway.** Cada carga del Resumen de escritorio añade dos lecturas del ámbito del proyecto. El mapa reutiliza el snapshot para tareas, personas y asignaciones. Las lecturas siguen las actualizaciones de sesión existentes, sin temporizador adicional de red. Fases, hitos, decisiones y actas generan una escritura de entidad por cambio, más el recibo cuando corresponde. Una tarea de seguimiento añade el enlace a las operaciones que ya ejecuta la creación de tareas. El recorrido de dependencias crece con las aristas alcanzables del proyecto. No se han medido latencia, consumo ni planes de ejecución en producción.

## Verificación local

- TypeScript y ambos builds Vite.
- Playwright, 10 pruebas dirigidas en `project-map.spec.ts` y `project-experience.spec.ts`. Incluye Resumen a 390, 1024 y 1440 px, rutas directas, pestañas, historial de tareas, una reunión con persistencia, acta y regreso desde pantalla completa.
- Cinco pruebas de calendario, accesibilidad háptica y migraciones. La prueba de rol SQL con PGlite comprueba aislamiento de grupo y comisión y la inmutabilidad del acta cerrada.
- Una prueba de API con dos grupos comprueba permisos, CSRF, referencias, ciclos, conflictos de edición, seguimiento con responsables y conservación al archivar.
- Las comprobaciones locales se limitaron a los cambios y sus riesgos de regresión. PostgreSQL de producción no se utilizó.

## Capturas de Chromium

[Mapa de escritorio](../../artifacts/project-map/mapa.png) · [Portátil de 1024 px](../../artifacts/project-map/portatil.png) · [Comisión y detalle](../../artifacts/project-map/comision-y-detalle.png) · [Bloqueos](../../artifacts/project-map/bloqueos.png) · [Fases e hitos](../../artifacts/project-map/fases-e-hitos.png) · [Modo reunión](../../artifacts/project-map/modo-reunion.png) · [Agenda](../../artifacts/project-map/agenda.png) · [Registro de decisión](../../artifacts/project-map/registro-decision.png) · [Acta](../../artifacts/project-map/acta.png).
