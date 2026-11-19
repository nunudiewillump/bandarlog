# Operación y transición · plan de referencia

La transición fue autorizada y ejecutada el 18 de noviembre de 2026: véase [el registro de activación](deployment-2026-11-18.md). Los pasos siguientes documentan el procedimiento; no autorizan repetir cambios productivos ni declaran cerrados los pendientes ASVS. No introducir variables administrativas compartidas en Railway.

## Matriz de identidades

| Componente            | LOGIN y rol de aplicación                       | Capacidades                                                                                                            | Exclusiones                                                                                                       |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| HTTP público          | `bandarlog_http` → `bandarlog_user_app`         | Recursos permitidos al actor; perfil propio; metadatos acotados; eventos/invitaciones delegados; revocación autorizada | Sin firma de grupos, emisión de credenciales, propietarios, correo global, VAPID privada ni SQL arbitrario global |
| Identidad privado     | `bandarlog_identity` → `bandarlog_identity_app` | Correo/Google, tokens de un uso, passkeys, registro y revisión con pruebas específicas                                 | Sin proveedores de envío, clave de descifrado, avatares, contenido empresarial general ni mantenimiento           |
| Entrega privado       | `bandarlog_delivery` → `bandarlog_delivery_app` | Proyecciones necesarias para avisos/resúmenes, colas, leases y claves de push                                          | Sin leer sesiones, retos, identidades Google ni modificar personas/roles                                          |
| Mantenimiento puntual | Propietario independiente                       | Migración, provisión, respaldo/restauración, transición de colas                                                       | Nunca presente en ninguno de los tres procesos anteriores                                                         |

Los LOGIN son NOINHERIT y no tienen BYPASSRLS, propiedad, CREATE ROLE/DB, replicación ni membresías adicionales. El proceso asume únicamente su rol de aplicación con `SET LOCAL ROLE`. El arranque comprueba identidad, membresías, propiedad y permisos DDL/directos indebidos. Las funciones delegadas usan objetos cualificados, `search_path=pg_catalog` y EXECUTE explícito; CI inspecciona que las SECURITY DEFINER no admitan ejecución PUBLIC.

`scout_groups`, `group_registrations`, `platform_mail`, `push_keys` y las tablas privadas de configuración/auditoría no se abren mediante SELECT a HTTP. Se accede mediante capacidades concretas. La resolución de un ID privado y el indicador de entrada solo sirven para navegación; no conceden autenticación.

## Secretos y variables por servicio de Railway

Misma revisión y `npm start` para los tres servicios, `NODE_ENV=production`, mismo `APP_URL` HTTPS canónico y `LEGACY_APP_ORIGINS` revisado. Mantener el retorno OAuth exacto `APP_URL/api/auth/google/callback`. El proceso escucha IPv4/IPv6 y expone `/api/health` y `/api/live`.

| Variable                                 | HTTP                      | Identidad               | Entrega                | Mantenimiento                                       |
| ---------------------------------------- | ------------------------- | ----------------------- | ---------------------- | --------------------------------------------------- |
| `APP_COMPONENT`                          | `http`                    | `identity`              | `delivery`             | no necesario                                        |
| `DATABASE_URL`                           | LOGIN HTTP                | LOGIN identidad         | LOGIN entrega          | prohibida como sustituto del secreto administrativo |
| `MIGRATION_DATABASE_URL`                 | prohibida                 | prohibida               | prohibida              | propietario                                         |
| `GROUP_CONTEXT_SECRET`                   | prohibida                 | firma de ámbito/emisión | firma de ámbito        | provisión puntual                                   |
| `AUTH_CHALLENGE_SECRET`                  | prohibida                 | pepper estable          | prohibida              | respaldo controlado                                 |
| `GOOGLE_LOGIN_CLIENT_ID`                 | público, opcional para UI | ID público              | ausente                | no                                                  |
| `GOOGLE_LOGIN_CLIENT_SECRET`             | prohibida                 | secreto OAuth           | prohibida              | no                                                  |
| `DISPATCH_PUBLIC_KEY`, `DISPATCH_KEY_ID` | pública                   | pública                 | pública                | transición                                          |
| `DISPATCH_PRIVATE_KEYS`                  | prohibida                 | prohibida               | keyring privado        | solo recuperación/transición autorizada             |
| `DELIVERY_WAKE_TOKEN`                    | despertar emisor          | despertar emisor        | validar llamada        | no                                                  |
| `IDENTITY_URL`                           | origen privado identidad  | no                      | no                     | no                                                  |
| `DELIVERY_URL`                           | origen privado entrega    | origen privado entrega  | no                     | no                                                  |
| Resend/SMTP/Gmail y VAPID privada        | prohibidos                | prohibidos              | exclusivamente entrega | respaldo                                            |

`IDENTITY_URL` y `DELIVERY_URL` deben ser orígenes de la red privada `.railway.internal` sin ruta, usuario, fragmento ni query. No asignar dominio público a esos servicios. El HTTP tiene proxy de rutas cerrado; la llamada de despertar exige token y no acepta SQL, destinatarios o cuerpos de correo. La red privada y sus políticas deben comprobarse en Railway antes de activar. No añadir un cron externo: el emisor conserva el planificador existente, plazos Madrid, recuperación horaria y timers por trabajo.

Para Neon, usar URLs propias de cada LOGIN, TLS `sslmode=verify-full` y pooling. Provisionar mediante una conexión administrativa directa, nunca mediante el HTTP ni cambiando roles existentes indiscriminadamente. Las migraciones crean roles NOLOGIN aditivos; un operador debe habilitar LOGIN y asignar contraseñas independientes con el gestor de secretos/entrada protegida de `psql` (`\password`), sin valores en terminal compartida, argumentos CLI, SQL versionado o logs. Mantener NOINHERIT y la única membresía definida por la migración.

## Secuencia que debe ensayarse en PostgreSQL desechable

1. Registrar revisión anterior, versión de PostgreSQL, ACL efectivas, configuración por servicio, copia restaurable y estado de colas. Usar únicamente datos sintéticos para ensayos. No usar `TEST_POSTGRES_URL` productiva.
2. Ejecutar `npm ci` y `npm run build`. Inyectar `MIGRATION_DATABASE_URL` solo en el job puntual y ejecutar `npm run db:migrate`. El servidor remoto no ejecuta migraciones ni seed en el arranque. HTTP, identidad, entrega y preflight exigen el contrato SQL mínimo 0037; con migración parcial no deben escuchar ni retirar el LOGIN anterior. La API no tiene DELETE físico de proyectos, comisiones ni tareas: conserva archivo/borrado lógico e historial. El seed de primera instalación productiva requiere `BOOTSTRAP_EMAIL`; no sustituir usuarios históricos.
3. Mantener la clave de contexto y pepper actuales durante la transición; cambiar el pepper invalidaría códigos pendientes. Para instalación nueva, provisionar la clave mediante `npm run db:provision-context` desde mantenimiento. Nunca imprimirla.
4. Generar el sobre de correo con `SECURITY_KEY_OUTPUT_DIR` apuntando a un directorio nuevo, protegido y fuera del repositorio: `node --import tsx scripts/security/generate-dispatch-keys.ts`. Hace falta clave privada RSA de al menos 3072 bits, copia de recuperación cifrada y distribución pública a los emisores de mensajes. Solo entrega puede descifrar.
5. Preparar los tres LOGIN y variables anteriores. Arrancar entrega con `DELIVERY_PAUSED=1`: registra la huella pública y prepara VAPID sin entregar trabajo. Después identidad; HTTP comprueba esa huella y exige el contrato 0037 con `mfa_enforced=false`, conforme a la política de acceso simple solicitada el 19 de noviembre.
6. Planificar ventana de mantenimiento para detener el monolito anterior antes de cifrar colas y cambiar credenciales. Con mantenimiento y clave pública: ejecutar `node --import tsx scripts/security/seal-existing-mail.ts` (solo recuento) y después, únicamente con autorización, añadir `--apply`. Los lotes son transaccionales y se pueden repetir; no eliminar mensajes pendientes.
7. Aplicar 0037 mediante mantenimiento para retirar la exigencia MFA y preparar el HTTP nuevo y ejecutar `node --import tsx scripts/security/cutover.ts` con las tres URLs de LOGIN más la administrativa. El modo por defecto comprueba; `--cutover` retira membresía/ejecución/LOGIN del runtime antiguo y termina sus conexiones. La retirada considera todas las concesiones por grantor (PostgreSQL 16+). Si el administrador no puede actuar por algún grantor o existen dependencias inesperadas, falla y mantiene bloqueada la activación; no concede roles adicionales para forzarla. La ejecución productiva del 18 de noviembre está registrada en `deployment-2026-11-18.md`.
8. Activar el HTTP en el mismo dominio y quitar la pausa de entrega. Verificar healthcheck, reautenticación de Rosales, grupo sintético autorizado, Google + passkey, correo/push, pendientes, SSE y ausencia de secretos indebidos en los procesos. La comprobación con usuarios reales necesita consentimiento operativo.
9. Retirar variables antiguas por servicio; comprobar que no sobreviven como variables compartidas. Los enlaces de query emitidos previamente siguen admitidos para compatibilidad; su ventana de siete días en altas/revisiones debe cerrarse antes de declarar satisfecha la ausencia de tokens en URL.

Los scripts se ensayaron inicialmente con datos sintéticos: claves protegidas/exclusivas, registro de pública, cifrado idempotente, preflight, retirada de varios grantors y cierre efectivo de conexiones. La autenticación de los LOGIN, los permisos efectivos del administrador Neon y la transición concreta se comprobaron durante la activación autorizada del 18 de noviembre. Siguen pendientes recuperación/rotación independiente de claves y downgrade de aplicación; no se dan por superados por haber pasado RLS.

## Rotación, recuperación y rollback

Usar un ID de clave distinto en cada rotación. El emisor debe conservar las privadas anteriores hasta que no quede contenido retenido con esos IDs; distribuir primero el nuevo keyring privado, después la clave pública e ID a identidad/HTTP. La huella evita reutilizar un ID con otra pública. Guardar una copia cifrada con acceso limitado y probar su recuperación. Actualmente falta completar el tratamiento operativo de claves ausentes y la purga de contenido: es un bloqueo de publicación.

Las migraciones nuevas no eliminan datos empresariales y el FK de proyecto padre es NOT VALID: protege escrituras nuevas sin modificar referencias históricas. Antes de `VALIDATE CONSTRAINT`, mantenimiento debe revisar huérfanos históricos; no corregirlos automáticamente.

Antes de la retirada del LOGIN antiguo y del cifrado de colas, el código anterior conserva su arquitectura y sus ACL; esa es la frontera de retorno sencilla. Después no es seguro desplegar `main` antiguo sin coordinación: no conoce el sobre cifrado ni MFA y reinstalaría privilegios más amplios. La respuesta predeterminada es mantener servicios pausados, preservar datos y corregir hacia delante, o volver a una versión ensayada que conserve las fronteras nuevas. Restaurar datos productivos, reabrir el LOGIN antiguo o descifrar colas para un downgrade requiere autorización expresa y un ensayo específico, todavía pendiente. La prueba de rollback de políticas existente no prueba por sí sola este rollback de aplicación/secretos.

## Registros y coste

La aplicación emite eventos estructurados UTC con operación, estado, componente y etiquetas irreversibles de actor/grupo cuando están disponibles; no URL, cookies, códigos, parámetros SQL ni cuerpos. PostgreSQL conserva auditoría restringida de cambios de rol, baja, factores y revocación. Quedan pendientes retención, purga, control de acceso y transporte externo de logs; no se asumen configurados por usar Railway.

Son dos procesos privados adicionales al HTTP, no dos bases ni dos cron nuevos. Cada uno mantiene su pool; memoria/CPU y máximo total de conexiones aumentan y deben medirse con la configuración de Railway antes de estimar dinero. Los cambios de PR36 siguen presentes (driver medido, JOIN de sesión, revisión de snapshots/SSE y trabajo por plazos). No se afirma mejora de latencia ni reducción de Compute Hours sin un benchmark con los componentes nuevos; el benchmark previo que usa el runtime integrado no demuestra el rendimiento de esta arquitectura.

## Cambio de acceso simple solicitado el 19 de noviembre

La migración 0037 es aditiva y no borra sesiones ni credenciales históricas. Debe aplicarse con mantenimiento antes de desplegar esta revisión, porque los tres runtimes exigen contrato 37. Retira la exigencia MFA y revoca las capacidades de passkeys de identidad; conserva los límites de grupo y actor. Desplegar identidad y HTTP con la revisión comprobada, actualizar también entrega por el contrato de arranque y comprobar correo/código, retorno Google, cookies por grupo, permisos y PWA. Mantener las claves de contexto, pepper, OAuth y correo actuales. Volver a una versión que exige MFA no es un rollback de configuración compatible: necesitaría reabrir una funcionalidad retirada explícitamente.
