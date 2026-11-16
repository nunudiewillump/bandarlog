# Aislamiento multigrupo y credenciales runtime

Estado: propuesta implementada para revisión; **no aplicada a producción**. Base: `origin/main` b42acb8. No se han cambiado recursos ni secretos de Neon/Railway ni datos productivos.

## Diagnóstico e inventario anterior

El mismo LOGIN propietario alimentaba `db` y `ownerDb`. `SET LOCAL ROLE` reducía los privilegios solo durante las consultas de `db`; `ownerDb`, `RESET ROLE` o un error de enrutamiento recuperaban al propietario. RLS no protege de su propietario. Una segunda conexión lógica de TypeScript no era una frontera.

Inventario sobre el código de esa revisión (los números de línea dejan de ser válidos al modificarlo):

| Lugar anterior | Uso | Clase | Sustitución |
|---|---|---|---|
| `server/db.ts:connect` | Migraciones al arrancar y exposición del propietario | C/E | `maintenance-db.ts`, comando independiente |
| `server/index.ts` arranque | Seed y Rosales | C/B | Seed administrativo; resolución específica `legacy` |
| `index.ts:queuePlatform/deliverPlatformNow/platformJobs` | Correo global, reclamación, reintentos | B | Capacidades de cola con lotes, leases y finalización |
| `index.ts` configuración `/api/group` | Cambiar el propio grupo | A/E | Función que verifica sesión administrativa vigente y contexto firmado |
| `index.ts:activeGroups/recoveryJobs` | Enumerar metadatos de grupos con jobs | C | Función que devuelve grupos activos o con trabajo pendiente |
| `index.ts` health | `select 1` como propietario | E | Mismo pool runtime |
| `groups.ts` registro/revisión/activación | Alta de grupo y primer administrador | B | Funciones vinculadas a hashes de tokens y transacciones atómicas |
| `groups.ts:groupResolver` | Resolver URL privada | B | Resolución exacta; no autentica al usuario |
| `remembered-entry.ts` | Navegación por sesión existente | B | Lookup vinculado a sesión, grupo, caducidad y usuario habilitado |
| `index.ts` callback Google | Encontrar grupo del estado OAuth | B | Lookup exacto por estado vigente; la validación de navegador/nonce/token se conserva en el flujo scoped |
| `push.ts` tercer argumento | Leer/crear claves VAPID compartidas | B | Función insert-if-absent; no permite reemplazar claves |
| `server/import.ts` CLI | Importación con contexto | C | Credenciales separadas de mantenimiento |
| `index.ts` endpoint dev de correo | Previsualización global | D | Solo PGlite local, nunca disponible en runtime remoto |

No se encontró otro pool remoto del servidor fuera de `db.ts`. El único propietario remoto pasa a estar en `maintenance-db.ts`; su variable no se admite en HTTP. Las consultas globales que antes recibían el ORM propietario ahora son métodos de capacidades; la restricción efectiva está en PostgreSQL, no en esos métodos.

`scout_groups`, `group_registrations`, `platform_mail` y `push_keys` permanecen sin RLS deliberadamente: el runtime no tiene permisos directos sobre ellas. Se accede mediante funciones enumeradas. La nueva tabla `bandarlog_api.context_key` tampoco concede lectura al runtime. Las tablas con `group_id` mantienen RLS y sus relaciones compuestas. No se activa FORCE RLS: los definers y las migraciones deben poder realizar sus operaciones acotadas como propietario.

## Arquitectura y garantías

* Un pool remoto, LOGIN `bandarlog_runtime`, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE y NOREPLICATION. Solo puede asumir `bandarlog_group_app`, que tampoco posee tablas. El arranque comprueba el LOGIN, atributos de sus membresías y propiedad de tablas.
* El HTTP rechaza `MIGRATION_DATABASE_URL`. No migra ni hace seed sobre PostgreSQL remoto. Tampoco utiliza un fallback a credenciales administrativas. `/api/live` conserva su comportamiento y el arranque verifica el contexto firmado antes de escuchar.
* El rol de migración posee tablas y funciones. Sus secretos existen únicamente en el entorno administrativo temporal, jamás como variables compartidas del servicio HTTP, de build o de un entorno heredado por él.
* Los definers tienen `search_path=pg_catalog`, referencias de tablas cualificadas, `EXECUTE` revocado de PUBLIC y concesiones específicas. No reciben SQL, nombres de tablas, grupos de destino para crear administradores ni órdenes de cambio de rol. El SQL dinámico solo existe en DDL de migración/rollback, con identificadores del catálogo y `%I`.
* La creación usa un token de revisión y otro de activación independientes, hashes SHA256, bloqueo de fila, caducidad, consumo único y alta atómica de grupo/administrador/sesión. El lookup de revisión **no devuelve el hash de activación**. Los destinatarios y dedupe del correo se derivan en PostgreSQL, no de un destinatario elegido por el caller. La cuota usa advisory lock por correo, evitando el lock global anterior.
* Configurar un grupo exige un hash de sesión vigente de un administrador habilitado del grupo firmado. No acepta un grupo de destino. La protección de origen, sesión, CSRF y roles de Express permanece vigente.
* Los trabajos conservan AsyncLocalStorage por grupo. La recuperación enumera solo metadatos y después procesa cada grupo con RLS. La cola global reclama hasta 50 mensajes atómicamente con SKIP LOCKED y lease de 15 minutos; el proveedor conserva la misma clave de idempotencia.

### Por qué firmar el contexto

Los GUC personalizados de PostgreSQL permiten `set_config` al propio runtime. Limitar el LOGIN y mantener una política basada únicamente en `group_id` habría permitido elegir otro grupo mediante SQL arbitrario.

El servidor firma `group_id + LF + deadline` con HMAC-SHA256 y `GROUP_CONTEXT_SECRET` (32 bytes, hexadecimal). Activa grupo, firma y deadline en **una sola consulta** y con ámbito LOCAL de transacción. PostgreSQL verifica la firma con una clave inaccesible al runtime SQL, y exige un deadline de hasta cinco minutos. La implementación HMAC RFC 2104 usa SHA256 del núcleo de PostgreSQL, sin instalar extensiones. La política usa una subconsulta no correlacionada para verificar una vez por sentencia, no por fila. Cambiar solo el grupo o ampliar el deadline invalida la prueba.

AsyncLocalStorage sigue aislando la ejecución asíncrona. Las consultas lazy de Drizzle deben ejecutarse/esperarse dentro de su callback. `BEGIN`, contexto y cambio al rol reducido preceden a la consulta; COMMIT/ROLLBACK eliminan los GUC y el rol LOCAL. Si falla el rollback o se devuelve una transacción abierta, se descarta la conexión; no se recicla. Los defaults nuevos ya no asignan Rosales ante ausencia de contexto. Los datos históricos no se reescriben. Las fixtures que insertan datos históricos ahora establecen explícitamente Rosales.

La firma dura cinco minutos desde la activación de la transacción. Una transacción excepcionalmente larga puede fallar de forma segura al caducar; no se renueva una prueba dentro de una transacción abierta. Revisar ese límite si se introduce un nuevo batch largo.

## Matriz de permisos

| Identidad | Tablas tenant | Tablas globales | Capacidades | DDL/propiedad/SET ROLE |
|---|---|---|---|---|
| LOGIN runtime | Sin acceso directo; mediante `SET LOCAL ROLE bandarlog_group_app` | Ningún acceso directo | Funciones globales enumeradas y verificación del contexto | Sin DDL público, propiedad ni roles privilegiados |
| `bandarlog_group_app` NOLOGIN | SELECT/INSERT/UPDATE/DELETE bajo RLS firmada y FKs | Ninguno | `current_group`, `update_group` | Solo rol reducido; no propietario |
| Propietario de funciones/migrador | Mantenimiento global | Mantenimiento global y clave de firma | Provisionamiento/migraciones | Credencial independiente; nunca en HTTP |
| PUBLIC | Sin nuevas concesiones de datos | Ninguna concesión nueva | Sin EXECUTE de los nuevos definers | CREATE en `public` revocado |

Los roles preexistentes inesperados, grants a PUBLIC o funciones de terceros deben auditarse en una rama de staging antes del despliegue: el repositorio no demuestra el estado actual de producción. El arranque detecta identidades elevadas, pero no pretende sustituir la revisión de todos los grants de una instalación modificada fuera de migraciones.

## Provisionamiento y transición exacta (operador; requiere aprobación)

1. Preparar una rama **schema-only** aislada de Neon o PostgreSQL 17 desechable. No copiar datos personales para las pruebas de seguridad. Verificar el rol propietario, propiedad de las tablas, membresías y ausencia de grants de lectura global a PUBLIC. El migrador necesita crear roles o que un administrador provisione las mismas concesiones previamente. Neon requiere revisar sus restricciones de administración de roles; no se han probado estas operaciones en Neon productivo.
2. Construir el commit del PR con `npm ci --include=dev && npm run build`. Guardar la imagen/revisión anterior y el nombre de la variable administrativa en el gestor de secretos; no exportarla a logs ni adjuntarla al PR.
3. En un entorno administrativo temporal y privado cargar la URL **directa, no pooled**, como `MIGRATION_DATABASE_URL`; `NODE_ENV=production`. Solo en primera instalación vacía, cargar `BOOTSTRAP_EMAIL`. Ejecutar `npm run db:migrate`. Esta orden migra y realiza seed dentro de contexto explícito Rosales. No recrea usuarios en una instalación con usuarios.
4. Los roles runtime deben crearse mediante **SQL de esta migración**, nunca con el alta predeterminada de roles en la consola/API/CLI de Neon: esta puede conceder `neon_superuser` y BYPASSRLS. La comprobación de arranque rechaza esa membresía. Crear en el gestor de secretos una contraseña nueva para `bandarlog_runtime` y un secreto independiente de 32 bytes hexadecimales para `GROUP_CONTEXT_SECRET`. No usar las constantes de pruebas. Desde `psql` administrativo, ejecutar `ALTER ROLE bandarlog_runtime LOGIN;` y `\password bandarlog_runtime` (entrada interactiva sin poner la contraseña en SQL ni shell history). No otorgar ADMIN OPTION sobre roles al runtime. La migración reproduce los permisos; no almacena contraseñas.
5. Cargar temporalmente el secreto de contexto en el entorno administrativo junto a `MIGRATION_DATABASE_URL` y ejecutar `npm run db:provision-context`. Solo imprime éxito/error. No imprimir el valor con `echo`, comandos de variables o argumentos de CLI. Guardar ese mismo secreto en las variables **exclusivas del servicio HTTP** de Railway. Eliminarlo del proceso administrativo al terminar. El migrador puede administrarlo; el LOGIN runtime SQL no puede leerlo.
6. Crear la URL pooled de Neon para ese LOGIN usando el gestor de secretos; mantener verificación TLS y el mismo proyecto/base. En staging configurar `DATABASE_URL` con esa URL y `GROUP_CONTEXT_SECRET` con la clave provisionada. No incluir `MIGRATION_DATABASE_URL`, URL owner ni contraseña owner en variables compartidas de Railway, Dockerfile, build ni configuración versionada. No modificar los secretos de Resend, sesiones, OAuth ni VAPID existentes.
7. **La activación de las políticas firmadas no admite solapamiento con la versión antigua.** Ensayar los pasos en staging y reservar una ventana breve de mantenimiento aprobada: drenar/parar todas las réplicas HTTP antiguas y sus jobs; aplicar migración y provisionamiento; cambiar las dos variables runtime; arrancar la nueva revisión. No afirmar cero downtime. El healthcheck de Railway es `/api/live`; comprobar también `/api/health`, una sesión Rosales existente y una sesión de un grupo ficticio. Confirmar que no quedan réplicas antiguas ni jobs duplicados. No ejecutar migración automáticamente en `npm start` ni como predeploy con secretos heredados por HTTP.
8. Validar en staging y luego, con aprobación, los checks de roles y el login: la identidad owner debe ser rechazada por el nuevo HTTP; una clave incorrecta también. Revisar cookies Rosales y `/g/...`, magic links, códigos, invitación, callback Google y configuración del grupo. La prueba externa de Google requiere las credenciales y un navegador del operador; no sustituirla por un resultado simulado.
9. Retirar la variable owner de los servicios permanentes y conservarla únicamente en el gestor de mantenimiento con acceso restringido. Revocar/rotar su antiguo secreto es una acción productiva separada, aprobada por el operador. No introducir un servicio permanente adicional.

Los pasos 3–6 se ensayan primero en staging. En producción se ejecutan después del drenado del paso 7. No aplicar 0019 mientras la versión antigua continúa atendiendo tráfico.

### Rollback

En staging se ejecutan y prueban `scripts/security/rollback-0019.sql` y `scripts/security/resume-0019.sql`; no borran filas, roles ni funciones. No editar el journal de Drizzle.

Para volver a la versión antigua: detener las nuevas réplicas y jobs; con `MIGRATION_DATABASE_URL` ejecutar `psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/rollback-0019.sql`; restaurar la revisión y su URL anterior desde el gestor de secretos; arrancar y comprobar salud y sesión Rosales. La shell solo expande la variable: no activar tracing ni registrar argumentos del proceso. Usar un servicio `PGSERVICE`/`.pgpass` privado si la plataforma registra argv. Este rollback **reintroduce conscientemente la debilidad anterior**, requiere aprobación y debe ser temporal.

Para retomar el hardening tras ese rollback: drenar la versión antigua, ejecutar `resume-0019.sql` con el migrador y restaurar URL runtime y clave de contexto. No repetir manualmente el journal ni regenerar las claves VAPID. Si solo falla un cambio posterior compatible con la nueva frontera, preferir volver a una revisión que ya use runtime limitado.

## Pruebas, evidencia y límites

La lista de comandos y resultados finales se registra en el PR. `tests/groups-postgres.test.ts` exige `TEST_POSTGRES_URL`, solo acepta localhost y migra una base desechable. No contiene skip por ausencia de esa variable. CI ejecuta siempre un job PostgreSQL 17 y el check final rechaza que falte, falle, se cancele o se omita; las pruebas seleccionadas Node no lo duplican.

| Requisito | Cobertura implementada |
|---|---|
| Privacidad anónima y cookie A en B | HTTP real con PostgreSQL |
| Lectura/escritura entre grupos y admin A/B | HTTP y SQL runtime real |
| Referencias cruzadas y falta de contexto | SQL y FKs reales; fixtures PGlite adicionales |
| Concurrencia, rollback y pool | PostgreSQL A/B concurrentes y pruebas de descarte con errores de conexión simulados |
| Roles y SQL arbitrario | Rechazo owner al arrancar, SET ROLE, tablas globales, clave de firma, alteración del GUC y clave incorrecta |
| Correo/push concurrentes | Outboxes A/B y push con sender simulado, sin envíos externos; prueba adicional de diez grupos/reintentos |
| OAuth | Estado ligado a grupo en PostgreSQL; firma/nonce/audiencia y flujos con proveedor simulado en pruebas existentes |
| Magic links, códigos e invitaciones | Pruebas existentes de autenticación y API; el proveedor externo real no se invoca |
| Perfil/grupo, Rosales, rutas antiguas | HTTP PostgreSQL y migraciones históricas |
| Nuevo grupo y delegación | Solicitud/revisión/activación HTTP real, doble consumo denegado y sesión administrativa; sesión delegada falsificada denegada |
| Fallos y reversión | Error SQL, rollback, reutilización y scripts down/resume ejecutados en base desechable |
| PWA/offline/deep links | Sin cambios de frontend; scopes de manifest y redirecciones cubiertos por pruebas de grupos. No equivale a certificar todos los navegadores/offline |

No hay medición de latencia/Compute Hours en Neon antes/después. Se conserva el pool y el número de round trips de activación; se añade HMAC en Node y verificación SQL por sentencia. Hay una comprobación adicional de readiness al arrancar, no un sondeo periódico. La cuota de registro evita el bloqueo de toda la tabla. No se introduce cron adicional, almacenamiento de PII en métricas ni conexiones nuevas por petición. Un benchmark representativo en staging sigue pendiente.

## Modelo de amenazas y riesgos residuales

Se cubren usos accidentales del ORM sin contexto, recuperación indebida del rol owner, errores de reciclado del pool y SQL que intente sustituir el grupo sin una prueba válida. La URL privada nunca autentica por sí sola; los endpoints privados siguen exigiendo sesión y permisos de usuario.

**No existe aislamiento absoluto si se toma el proceso Node compartido.** Quien ejecute código en él puede leer la clave de firma, firmar otros contextos, usar capacidades de plataforma, claves VAPID y secretos de proveedores. También puede provocar denegación de servicio al conjunto de grupos. La separación de credenciales protege el esquema y evita recuperar el propietario; no crea un sandbox por tenant. Un SQL arbitrario en un grupo todavía puede operar sobre las filas de ese grupo con los permisos del rol de grupo: la autorización individual sigue en Express. Las capacidades globales exponen los metadatos necesarios para jobs y permiten reclamar correo global pendiente, que contiene tokens de registro; esto es una capacidad sensible delimitada, no confidencial frente a una toma del runtime o una inyección que invoque dicha capacidad. No otorga acceso SQL directo a los datos privados de otro grupo.

Las funciones nuevas son parte de la superficie de confianza. Cambios en ellas requieren revisión de privilegios y pruebas reales. La firma no sustituye la autorización de sesión. No se añaden garantías de entrega exactamente una vez para todos los proveedores: los reintentos tras fallos ambiguos conservan los límites e idempotencia del proveedor. Los IDs de suscripciones en el historial de entregas siguen siendo snapshots sin FK al dispositivo, permitiendo su eliminación; el outbox y usuario conservan las restricciones por grupo.

Se preservan datos y compatibilidad Rosales. Los tests que antes se omitían escondían dos expectativas antiguas de redirección (`/acceso` y navegación raíz); se han actualizado al comportamiento ya presente en main, sin cambiar esas rutas.


Referencias oficiales consultadas: [roles en Neon](https://neon.com/docs/manage/roles), [pooling transaccional](https://neon.com/docs/connect/connection-pooling). Solo se utiliza SET LOCAL dentro de transacciones explícitas en el pool; el mantenimiento usa conexión directa.

### Resultados locales de esta revisión

* `npm run build`: correcto (TypeScript y Vite); advertencia preexistente sobre el script clásico `offline-store.js`.
* Selección de 19 archivos Node, `--test-concurrency=3`: **50/50**, cero omitidas. Se amplió a autenticación, correo y migraciones históricas porque cambia la frontera de todas sus consultas y los defaults.
* `TEST_POSTGRES_URL=<base local desechable> node --import tsx --test tests/groups-postgres.test.ts`: **3/3**, cero omitidas, PostgreSQL 17. Se repitió sobre una base recién creada para ejecutar la cadena de migraciones completa, no reutilizar una migración anterior editada.
* Sin `TEST_POSTGRES_URL`: salida 1 y fallo explícito, comprobado.
* Migración y seed con propietario PostgreSQL no superusuario (`CREATEROLE`, administrador de las membresías necesarias): ejecutados con éxito en otra base desechable.
* Tras conservar la clave local entre arranques, se repitieron únicamente importación y grupos API: **6/6**.
* No se ha ejecutado aquí la suite Playwright, un login real con Google, una operación productiva ni un benchmark de Neon. Los checks de GitHub posteriores a publicar el PR son evidencia independiente y no se presuponen aprobados.
