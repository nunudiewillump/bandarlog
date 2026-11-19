# Administración independiente: seguridad y operación

## Identidad y permisos

La identidad de plataforma vive en `bandarlog_api.platform_admins`, sin relación ni clave foránea hacia `users` o `scout_groups`. El correo autorizado se provisiona por mantenimiento; después debe demostrar acceso al correo mediante código o mediante Google verificado. No se heredan permisos de coordinación o administración de un grupo. Borrar el grupo o su usuario no revoca la identidad de plataforma, tampoco después de reiniciar los servicios. Revocarla requiere una operación explícita de mantenimiento.

La entrada `/plataforma` no aparece en la navegación ordinaria. Conocerla no concede autorización. La sesión utiliza su propia cookie HttpOnly/Secure/SameSite=Strict, sin almacenamiento web, con 30 minutos de inactividad y ocho horas absolutas. Decidir solicitudes o enviar una prueba exige autenticación de los últimos 15 minutos, CSRF y origen correcto. Cerrar administración no cierra las sesiones de grupo.

| Identidad PostgreSQL | Capacidad nueva | Límites |
| --- | --- | --- |
| HTTP | Presencia derivada del actor autenticado, mediante rol de usuario existente | Sin lectura global ni emisión de identidad de plataforma |
| Identidad | Protocolo cerrado de autenticación y capacidades de plataforma | Sesión independiente vigente para cada lectura; acciones sensibles firmadas y recientes; sin acceso directo a tablas privadas |
| Entrega | Purga acotada y entrega ya existente | Sin aprovisionamiento, lectura del panel o emisión de sesiones |
| Mantenimiento | Migraciones, alta/revocación y comienzo de medición | Credenciales independientes, solo ejecución puntual |

Las funciones SECURITY DEFINER fijan `search_path=pg_catalog`, cualifican las tablas y revocan EXECUTE público. No aceptan SQL arbitrario. La firma del protocolo de identidad liga acción, cuerpo exacto y caducidad, reutilizando su autoridad separada existente; HTTP no recibe esa clave. La decisión bloquea la solicitud, audita y encola una sola notificación en la misma transacción. Una repetición idéntica es idempotente; una decisión contradictoria falla. Los enlaces de revisión anteriores comparten el mismo estado. El panel nunca entrega tokens de aprobación o activación al navegador.

## Datos y coste

El bundle de la PWA conserva su archivo y tamaño; el panel se construye aparte y no se carga desde la navegación de grupo. Sus datos son `no-store` y se excluyen del Service Worker. No hay polling ni nuevas conexiones por petición.

Presencia: grupo/cuenta/fecha Madrid, deduplicada por día. La lectura inicial de `/me` o `/data` integra el registro en la consulta existente; accesos calientes no añaden viajes SQL. Las mutaciones registran presencia en el trigger de actividad. Un fallo al insertar telemetría no invalida la autenticación. Los accesos emitidos guardan método y hash de sesión, sin token, IP ni dispositivo. Los rechazos se agregan con dos contadores en memoria, sin correos ni códigos. Presencia y accesos se purgan por lotes tras 90 días usando el mantenimiento horario existente; las decisiones y la auditoría se conservan para trazabilidad, sin permiso de borrado para runtime.

Los agregados consultan metadatos, nunca cuerpos de tareas/comentarios. Unidades: cuenta y grupo; una misma persona en dos grupos cuenta dos veces. La cobertura empieza explícitamente después del despliegue; periodos incompletos muestran `—`. DAU de hoy es parcial. La vista de solicitudes muestra datos de contacto solo al administrador autorizado.

El semanal conserva audiencia, preferencias y deduplicación. Calcula una vez por proyecto y reutiliza el resultado para los destinatarios. Distingue finalizaciones de la última semana del total acumulado y evita proyectos sin atención ni novedades. No modifica ni publica automáticamente plantillas externas de Resend.

## Despliegue propuesto (requiere aprobación)

No se han modificado producción, secretos ni identidades reales durante esta implementación. Utilizar un trabajo puntual con el mismo commit y credenciales de mantenimiento; no añadirlas a HTTP, identidad o entrega. No se requieren roles LOGIN ni secretos nuevos. Los tres servicios existentes conservan sus identidades y separación de secretos. Google reutiliza el callback ya registrado; el acceso por correo sigue disponible.

1. Verificar checks del PR, respaldo y capacidad de restauración. Ensayar estas instrucciones en PostgreSQL aislado y después en una rama de prueba con el esquema real. No usar las pruebas destructivas del repositorio contra Neon productivo.
2. Ejecutar migraciones aditivas 0039/0040 desde mantenimiento, antes de actualizar servicios. Para aplicar solo migraciones, sin reejecutar seed: `node --import tsx --input-type=module -e "const {connectMaintenance}=await import('./server/maintenance-db.ts'); const connection=await connectMaintenance(); await connection.close();"`. La variable `MIGRATION_DATABASE_URL` debe existir únicamente en ese trabajo y no imprimirse. No utilizar `db:migrate` si se pretende mantener eliminado el grupo heredado: ese comando incluye seed.
3. Comprobar contrato 40 y grants antes del rollout. La versión anterior puede seguir funcionando con las columnas aditivas; sesiones antiguas sin método siguen siendo válidas. El arranque nuevo requiere contrato 40. Desplegar identidad, entrega y finalmente HTTP con los secretos específicos de cada componente, conservando sus URLs y healthchecks. HTTP no ejecuta migraciones ni seed en producción.
4. En el trabajo de mantenimiento, establecer privadamente `PLATFORM_ADMIN_EMAIL` con la cuenta inicial autorizada y opcionalmente `PLATFORM_ADMIN_NAME`. No guardarlos en archivos versionados ni pegarlos en comandos compartidos. Ejecutar `node --import tsx scripts/security/platform-admin.ts` para dry-run; confirmar `applied:false` y `groupDependency:false`. Ejecutar el mismo comando con `--apply` para persistir el alta. El script no consulta ni crea un usuario de grupo y no imprime el correo.
5. Iniciar medición tras completar los tres servicios: `node --import tsx scripts/security/platform-admin.ts --start-metrics`, primero dry-run; repetir con `--apply`. La operación es idempotente. No reconstruye presencia histórica ni presenta métricas previas como completas.
6. Verificar healthchecks, acceso ordinario por correo/Google, sesión de Rosales, acceso independiente a `/plataforma`, rechazo sin sesión, siete vistas, cierre separado y una solicitud ficticia en pruebas. La prueba de correo se envía solo a la dirección del administrador, mediante acción explícita. La comprobación con la cuenta real y proveedores reales queda pendiente de activación aprobada.
7. Retirar variables del trabajo puntual y conservar únicamente la evidencia sin secretos. No mantener una consola SQL administrativa dentro de los servicios HTTP.

## Revocación y rollback

- Revocación independiente: con las variables privadas de mantenimiento, `node --import tsx scripts/security/platform-admin.ts --revoke` (dry-run) y luego `--revoke --apply`. Deshabilita la identidad y elimina sus códigos/sesiones; cada capacidad vuelve a comprobar `enabled`. No toca usuarios ni grupos. Volver a provisionar permite demostrar de nuevo la identidad.
- Problema del panel: revocar acceso y restaurar el binario anterior coordinadamente. Dejar 0039/0040 y sus datos; no ejecutar DOWN destructivo ni borrar auditoría. Las columnas nuevas son aditivas y el trigger acepta emisores antiguos sin `auth_method`. Detener la recogida al volver al binario anterior deja un hueco de cobertura: no presentar después ese intervalo como completo.
- La versión anterior exige la existencia del grupo heredado al arrancar. Si ese grupo se hubiera eliminado posteriormente, no restaurar ese binario sin corregir antes esa dependencia mediante un parche; no recrear datos reales como efecto lateral del rollback.
- Un fallo de migración exige revertir su transacción o restaurar el entorno de ensayo; no quitar funciones o roles manualmente mientras un binario nuevo los utiliza. No se cambia FORCE RLS ni ownership de tablas existentes.

## Verificación y límites

PostgreSQL 17 local desechable: nueve pruebas obligatorias correctas, sin omisiones, incluidas aislamiento de roles, concurrencia, rollback/reutilización de pool, alta real de grupo, entrega y administración independiente. Esta última elimina usuario y grupos antes del arranque, valida correo y Google con proveedor sintético, reinicia servicios y comprueba la sesión; verifica revocación, expiración, CSRF, firma, ausencia de cuerpos privados y decisiones concurrentes. No demuestra disponibilidad real de Google/Resend, métricas p95 de producción ni comportamiento en iPhone físico.

No se afirma ASVS L2 completo: correo o Google siguen siendo un solo factor por decisión del producto. Una toma completa de identidad y su firma, del propietario de PostgreSQL o del origen del navegador puede comprometer la plataforma. La cookie separada, CSP, CSRF y expiración reducen riesgo, pero no hacen al mismo origen inmune a XSS. La administración puede leer los agregados y contactos expresamente autorizados; no es aislamiento absoluto frente a un servidor compartido comprometido.
