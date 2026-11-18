# Activación productiva del 18 de noviembre de 2026

El usuario autorizó la transición y el despliegue de los últimos cambios. Está activa la revisión `cd96ba1e414fabbebb1b578c3d65ecf8c1918a7a` (PR #43). Este registro complementa el plan de `operations-draft.md`; no certifica cumplimiento ASVS L2 completo.

## Incidente y recuperación previa

La fusión activó el despliegue automático antes de preparar roles, migraciones y secretos por componente. El HTTP rechazó correctamente `RESEND_API_KEY`, pero el servicio quedó caído. Se redesplegó primero `be1eb6a` con autorización, comprobando SUCCESS y healthchecks 200. El CI verde validaba el código; no demostraba preparación de la infraestructura productiva. Debió comprobarse esa preparación antes de fusionar.

## Preparación y ensayo ejecutados

- Se creó `security-cutover-rehearsal-20261118` (`br-broad-heart-barbwyqp`) desde producción y se aplicaron allí 0022–0036. No se usó producción como destino de `TEST_POSTGRES_URL` ni se ejecutó la suite de seguridad contra ella.
- Se comprobaron contrato 36, conservación de los recuentos de tareas/personas/grupos, membresías limitadas y ausencia de BYPASSRLS/propiedad en los nuevos roles.
- Entrega e identidad arrancaron primero contra esa rama con la revisión definitiva, sin dominios públicos y con entrega pausada. El ensayo detectó un ID de Google innecesario en entrega; se retiró de ese componente.
- Un ensayo adicional arrancó HTTP, identidad y entrega en modo productivo contra la rama de ensayo. Verificó denegación de datos sin sesión, configuración y redirección de Google, rechazo de wake sin autorización, solicitud/aprobación/activación de un grupo ficticio y respuesta 428 al intentar acceder a datos antes de completar MFA. No envió correo externo. Fue necesario corregir dos expectativas del comprobador: las redirecciones relativas son válidas y el requisito MFA devuelve 428.
- Los scripts existentes de preflight, cifrado y cutover se ejecutaron allí con autenticación real de los tres LOGIN y del propietario. Los 47 mensajes fallidos copiados se cifraron sin reiniciar intentos; se retiró el LOGIN heredado de la rama.

El entorno de ejecución no permite TCP PostgreSQL ni SSH directos. Para mantenimiento se usó temporalmente el driver WebSocket de Neon sobre WSS con certificados verificados, a través del proxy autorizado del entorno y hacia el endpoint directo. Este adaptador fue exclusivo del operador: no cambió el driver desplegado ni introdujo dependencias o credenciales administrativas en HTTP, identidad o entrega. La clave SSH temporal registrada durante el diagnóstico se retiró al terminar.

## Transición productiva ejecutada

1. Se detuvo el monolito anterior para impedir nuevos trabajos y escrituras durante la transición.
2. Se tomó una copia final mediante rama sin compute: `before-security-cutover-final-20261118` (`br-shy-haze-ba8wloj3`). Se conserva además la copia previa `br-winter-night-balal570`. No se restauró ni sobrescribió producción.
3. Se aplicaron las migraciones versionadas mediante el migrador Drizzle, sin seed. Recuentos antes/después: 88 tareas, 31 personas y 12 grupos. Hay 37 entradas de migración (0000–0036), contrato 36. Estos recuentos no son una comparación exhaustiva de cada campo.
4. Se habilitaron `bandarlog_http`, `bandarlog_identity` y `bandarlog_delivery` con contraseñas independientes, NOINHERIT y sus únicas membresías previstas. MFA quedó habilitado en la configuración SQL. Se conservaron el contexto, pepper y credenciales OAuth existentes.
5. Se generó un sobre RSA-3072/AES-256-GCM. Solo entrega recibió el keyring privado. Entrega arrancó primero, pausada, contra producción y registró la pública; después arrancó identidad.
6. Se ejecutaron dry-run y aplicación de `seal-existing-mail.ts`: 47 notificaciones fallidas cifradas, conservando estado/intentos; no había correo pendiente. Se verificó que las 47 podían descifrarse con el keyring registrado. No se reintentaron manualmente.
7. `cutover.ts --cutover` completó la retirada del LOGIN anterior: membresía y capacidades heredadas retiradas, NOLOGIN y conexiones terminadas. No se asignaron privilegios adicionales para sortear verificaciones.
8. Se arrancó HTTP con su LOGIN propio y sin secretos de proveedores, firma de grupos, emisión de credenciales o mantenimiento. El dominio canónico sigue siendo `https://bandarlog.app`.
9. Tras comprobar HTTP y el proxy de identidad, se retiró la pausa de entrega. Los tres servicios quedaron en SUCCESS, con una réplica operativa cada uno.

Las revisiones de los tres servicios quedaron fijadas al commit probado. Un push a `main` no debe introducir otra revisión hasta actualizar explícitamente esa selección. No se ha añadido otro cron, otra base productiva ni un servicio permanente de mantenimiento.

## Resultado comprobado

| Componente                | Despliegue final                       | Estado observado                                          |
| ------------------------- | -------------------------------------- | --------------------------------------------------------- |
| HTTP                      | `ada94d04-adbd-4920-8849-3342f7eb8eb8` | SUCCESS; healthcheck público 200                          |
| Identidad, privado        | `9cd9d033-93db-4e7f-bbb4-baf08e14e6a0` | SUCCESS; proxy de autenticación responde                  |
| Entrega, privado y activo | `4ff75e2b-6133-48be-818d-e12f4a1706d0` | SUCCESS; sin errores operativos en la muestra de arranque |

En el dominio público: `/api/live` 200, `/api/health` 200, `/api/data` 401 sin sesión, `/api/auth/config` 200 con Google habilitado, `/crear-grupo` 200, `/acceso` 200 siguiendo su redirección compatible y `/sw.js` 200. El inicio de Google devuelve 302 hacia `accounts.google.com`. No se completó una autenticación con una cuenta real ni una ceremonia biométrica física durante estas comprobaciones.

La lectura posterior de configuración confirma URLs TLS `verify-full`, LOGIN separados, ausencia de `MIGRATION_DATABASE_URL` en todos los servicios y ausencia de secretos privilegiados en HTTP. Identidad carece de proveedores y privada de correo; entrega carece del pepper y secreto OAuth de acceso. Las públicas coinciden y entrega tiene `DELIVERY_PAUSED=0`. Las contraseñas, tokens, claves y URLs de conexión no forman parte de este registro.

## Recuperación y tareas pendientes

Después del cifrado y de retirar el LOGIN anterior, redesplegar `be1eb6a` ya no es un rollback compatible. Mantener la revisión nueva y corregir hacia delante; una restauración o downgrade requiere un procedimiento específico autorizado que preserve las escrituras posteriores. Las ramas de recuperación no deben sustituir producción automáticamente. La rama de ensayo tiene autosuspensión; las copias finales se crearon sin compute. Su retirada requiere revisar la ventana de recuperación.

La privada de correo y las demás credenciales deben conservarse en el gestor de secretos del operador y en su copia de recuperación. Los ficheros locales de mantenimiento se guardaron fuera del repositorio con permisos restringidos; no equivalen a una copia externa de recuperación ensayada.

Siguen pendientes la verificación de todos los requisitos ASVS, almacenamiento privado offline, retirada de enlaces query heredados, retención/purga y recuperación independiente de claves, rendimiento con la carga real y ensayos de Google/passkeys en dispositivos físicos. La activación no resuelve la limitación RSA-2048 del proveedor Google ni las consecuencias de comprometer un host/origen compartido. No se declara L2 completo.
