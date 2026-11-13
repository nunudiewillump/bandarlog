# Aislamiento, paginación y consumo: despliegue del 12-11-2026

> Documento histórico de PR #34. Estado posterior: PR #35 permite suspensión por planificación; PR #33 ya está integrada con CI aprobada. El historial actual es de 24 h. Véase [segunda iteración](neon-iteration-20261113.md) para métricas y decisiones vigentes.

La revisión se basa en main a2c437f. La copia usada para la primera auditoría estaba atrasada: main ya tenía grupos, RLS y relaciones compuestas. Este cambio conserva ese modelo (una cuenta por grupo, mismo correo permitido en varios grupos), el ámbito de sesión, SSE y almacenamiento offline.

## Cambios

- Filtrar permisos de /data en SQL sin cambiar la visibilidad; conservar transacción de lectura y descarte de asignaciones de usuarios desactivados.
- Agregar resúmenes por comisión en PostgreSQL.
- Fotos: caché de contenido de hasta 256 imágenes, con clave de grupo y huella MD5 de contenido comprobada en cada SELECT. No se cachean permisos ni usuarios; PostgreSQL omite el cuerpo si ya está disponible en la caché. La reconstrucción usa un snapshot de la caché para resistir expulsiones concurrentes. La huella es una comprobación de contenido, no una credencial. Roles, cambios y eliminación de fotos se consultan de nuevo. Autenticación omite la foto salvo en /me. En producción el grupo real tiene 17 usuarios y 212.112 bytes de imágenes; es tamaño almacenado, no egress medido.
- Reutilizar SSE con reconciliación de 120 s, fallback de 15 s y agrupación de ráfagas. Las mutaciones conservan recarga explícita. No hay caché de permisos.
- Actividad reciente: snapshot de 100 entradas; /activity entrega 50 por defecto y un máximo de 100. Cursor por fecha e ID descendentes, con precisión de microsegundos y ámbito de grupo, usuario y filtro. Las pantallas de tarea/comisión permiten cargar el historial anterior. No se recortan las tareas de /data: siguen disponibles para búsqueda, panel y modo offline.
- Notificaciones: paginación keyset. `?page=1` devuelve `{items,nextCursor}`; el contrato array conserva una primera página acotada y X-Next-Cursor. El directorio filtra y limita en SQL, conservando sus 20 resultados y búsqueda por texto literal.
- Registro push por dispositivo, reclamación atómica con lease de 15 minutos y backoff hasta una hora. Los dispositivos que ya aceptaron el mensaje no se reenvían al reintentar los demás. RLS y FK compuesta impiden asociar entregas a otro grupo. Reinicios con resultado incierto pueden repetir una entrega: ningún proveedor ofrece una transacción atómica con Postgres; la etiqueta estable conserva el reemplazo de notificaciones.
- Mantenimiento cada 5 minutos, recordatorios cada 15, exclusión de grupos de QA archivados y sin solapamiento dentro del proceso. El tutorial expira en lecturas y estadísticas. Un recordatorio puede esperar hasta 15 minutos; una entrega pendiente hasta 5 minutos. Los disparados tras mutaciones siguen siendo inmediatos.
- Agregados de consumo en producción (opt-out CONSUMPTION_METRICS=0) o activados con CONSUMPTION_METRICS=1 en desarrollo: sin SQL, IDs ni parámetros. SQL emitido por Drizzle no incluye sentencias internas de triggers ni activación de rol/transacciones del pool. Bytes HTTP no son bytes Neon.

## Recuperación

Código: rama remota backup/before-tenant-security-20261112 (a2c437f). Datos: snapshot Neon snap-royal-night-bac287eb. Rama de ensayo: br-holy-sound-ba330poz. GitHub es copia del código; la instantánea es la copia de los datos.

0018 es aditiva: crea push_deliveries, RLS, FK y dos índices para las páginas. Se ensayó en copia de producción usando el SQL y registro de migración compilados por Drizzle. El despliegue normal aplica el migrador existente. Para rollback de aplicación se puede volver al commit anterior conservando las tablas nuevas; no borrar el registro de migración ni restaurar datos productivos automáticamente. Una restauración puede perder escrituras posteriores a la instantánea y requiere una decisión separada.

## Validación y límites

Cobertura dirigida: grupos y API, paginación con cursores cruzados y fechas coincidentes, diez grupos con reclamaciones push concurrentes, reintento parcial, edición/comentarios y borradores concurrentes. La rama Neon también se probó con diez ámbitos concurrentes bajo el rol real de RLS. Los tests de navegador usan PGlite; las pruebas HTTP productivas usan Neon/node-postgres reales.

Se crearon diez grupos sintéticos etiquetados con plan audit, usuarios example.invalid con notifications=false y weekly=false, proyectos/comisiones y sesiones de QA de dos horas. No se usan cuentas personales ni se envía correo. Al terminar se archivan los grupos de QA y se desactivan usuarios y sesiones. Los registros sintéticos se conservan identificados; no se borra información productiva.

La comparación HTTP usa la misma carga antes/después. Las muestras de network-flow son acotadas y no sustituyen al consumo facturable del mes. No se instala pg_stat_statements, ausente en producción. Deben diferenciarse tiempo de handler, CPU, red backend y egress Neon. No se promete un ahorro del 80 % real sin ventana equivalente suficiente.

No se incluye la PR #33 (móvil), con comprobaciones fallidas. No se cambia de proveedor por defecto: Railway tiene una réplica; Neon conserva aislamiento y copias. Solo una medición persistente de coste/capacidad justificaría migrar. Tampoco se promete que un mantenimiento cada cinco minutos deje suspender Neon: se debe medir compute real y ajustar con los requisitos de recordatorios.
