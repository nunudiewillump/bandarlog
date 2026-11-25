# Auditoría inicial de Feedback for All

Base revisada: `c5b08f6`, tras la PR #56. El código local coincide con la cabecera remota de main consultada.

| Área | Estado e implicación para P2 |
| --- | --- |
| Aplicación | React 19 y Vite para la PWA y la entrada independiente de administración global. Express 5 valida entradas con Zod y accede mediante Drizzle a PostgreSQL en Neon o PGlite local. Mantener módulos React diferidos y rutas bajo la sesión normal del producto. |
| Autenticación | `server/index.ts` resuelve grupo y sesión, verifica revocación y caducidad, y comprueba CSRF y origen en escrituras. La entrada por correo y Google y la continuidad PWA reutilizan ese contrato. |
| Autorización | `group-context.ts` fija grupo y prueba de sesión por transacción. PostgreSQL deriva actor y membresías y aplica RLS. Las credenciales de HTTP, identidad, entrega y mantenimiento se separan. Para P2, las FK compuestas deben incluir el grupo y el rol HTTP debe poder realizar únicamente las operaciones necesarias. |
| Roles | Grupo: administración, coordinación y miembros. Las comisiones añaden responsables. `platform-admin.ts` usa una sesión y capacidades globales propias. Una capacidad global de feedback no debe conceder acceso a datos internos. |
| Proyectos | `projects.archived` es un indicador anterior a P2, reversible desde el PATCH de proyectos. No guarda cierres ni plazos. P2.2 requiere eventos de ciclo de vida y protecciones de escritura que cubran todas las rutas de tareas. Los proyectos previamente archivados carecen de una fecha fiable de cierre. |
| Tareas y P0 | Tareas, asignaciones, comisiones, actividad y recibos de mutaciones ya tienen flujos de edición. El inicio P0 prioriza acciones rápidas y usa el snapshot del grupo y SSE. Las evaluaciones requieren su propia entrada visual y pueden recuperar contenido al abrirse. |
| P1 y carga de trabajo | `ProjectMap` carga planificación y reuniones en escritorio. Las migraciones 0041 y 0042 incluyen fases, hitos, dependencias, decisiones, seguimientos y actas inmutables al cierre. Existe el módulo `Workload`; las evaluaciones no deben convertirse en mediciones individuales de rendimiento. |
| Notificaciones | `idle-jobs.ts`, `delivery-wake.ts` y entrega separada de correo y push. Las colas se despiertan por evento y recuperan trabajo pendiente. Las campañas pueden calcular elegibilidad bajo demanda y usar esa infraestructura cuando requieran entrega. |
| Adopción | `tutorial.ts`, `usage-presence.ts`, `platform-admin.ts` y migración 0040 ofrecen actividad y métricas agregadas. La fecha de registro y la activación del grupo son conceptos distintos. Antes de programar campañas, validar qué evidencia de activación es fiable para grupos históricos. |
| Diseño | `DESIGN.md`, `PRODUCT.md`, fuentes locales y hojas Forest definen tipografía Poppins/Bungee, paleta, controles y espaciado. `public/ASSETS.md` describe los recursos oficiales. `scout_groups` conserva nombre y los dos colores configurados, que se reutilizan en la pañoleta; validar fidelidad de esta representación antes de exportar. |
| Calidad y despliegue | GitHub Actions selecciona pruebas Node y navegador, compila y ejecuta un trabajo independiente de seguridad con PostgreSQL. Railway usa el build de Vite y `/api/live` como healthcheck sin SQL. Las migraciones se aplican desde un proceso de mantenimiento y el arranque comprueba la versión del contrato. |
| Consumo | `docs/idle-costs.md` documenta suspensión de Neon, SSE con reconciliación configurable, colas bajo demanda y una sola réplica. El primer incremento añade lecturas solo al abrir el gestor. Las cifras de producción históricas no constituyen una medición de P2. |

## Adaptación por fase

- P2.0 usa una plantilla editable con revisiones para concurrencia y versiones publicadas de solo inserción. Una futura evaluación debe referenciar la clave de su versión exacta.
- P2.1 registra asignaciones por alcance resueltas al publicar y limita la lectura del borrador al participante. Para la modalidad anónima, el diseño necesita pruebas que demuestren que el gestor no puede correlacionar asignación y respuesta mediante vistas, metadatos o conteos.
- P2.2 requiere separar el archivo histórico anterior de los eventos nuevos de cierre. Probar atomicidad e idempotencia con los recibos de mutación y con bloqueos de fila.
- P2.3 y P2.5 enlazan conclusiones y tareas respetando ambas autorizaciones, y conservan las revisiones consolidadas.
- P2.4 puede generar el PDF en el cliente bajo demanda con un conjunto de datos autorizado por modalidad. Los anexos identificados necesitan un permiso explícito y auditoría. La exportación anónima requiere supresión y puede quedar restringida.
- P2.6, P2.7 y P2.8 pueden compartir validación y cálculo con el motor, pero las capacidades SQL y HTTP de producto deben permanecer separadas de la gestión del grupo.
