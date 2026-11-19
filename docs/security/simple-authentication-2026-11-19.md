# Retirada de passkeys solicitada el 19 de noviembre de 2026

El acceso queda en dos alternativas de un solo factor: correo con código recibido por email, o Google. La sesión primaria emitida por esos flujos permite usar la aplicación sin una segunda ceremonia. La biometría web no se ofrece como acceso independiente, porque requiere WebAuthn/passkeys, la tecnología que se ha solicitado retirar.

## Cambios

- Se retiran pantalla obligatoria, ajustes, rutas y dependencias de passkeys. Las rutas antiguas dejan de ser capacidades utilizables; el HTTP no las delega a identidad.
- 0037 desactiva `mfa_enforced`, elimina ese requisito de `actor()` y conserva comprobaciones de bearer, grupo, caducidad, baja y permisos. Revoca permisos de las tablas y funciones de passkeys del rol de identidad. No elimina sesiones, personas ni credenciales históricas.
- Los tres runtimes y el script de cutover exigen contrato 37. El HTTP rechaza una configuración que siga exigiendo MFA. La cuenta HTTP continúa sin secretos de firma, OAuth, correo o mantenimiento.
- Se conservan códigos, límites de intentos, PKCE/nonce/estado, vinculación de identidades, cookies por grupo, CSRF, autenticación reciente para operaciones sensibles, aislamiento SQL y retorno PWA de Google.
- La caché estática del Service Worker sube a v11 para renovar la interfaz retirada. IndexedDB y cambios offline pendientes se conservan.

## Evidencia y límites

Compilación TypeScript/Vite correcta y once pruebas Node específicas correctas. Ocho pruebas completas con PostgreSQL local desechable correctas, sin omisiones: acceso directo tras código y retorno Google, alta/aprobación/activación, grupo A/B, privilegios individuales, pool/rollback, LOGIN de servicios, recuperación desde copia y correo/push/reintentos. Se añaden comprobaciones de ausencia de permisos de lectura/escritura y EXECUTE sobre las credenciales retiradas.

Los trece casos de navegador seleccionados cubren entrada directa por correo y Google simulados, retorno de Google en PWA, formularios de código, cambio de cuenta, sincronización vinculada a identidad, caducidad y limpieza entre pestañas. Los dos casos nuevos de acceso directo pasan tras ajustar su fixture al enlace de Google de navegador y a la respuesta de tutorial. Los once restantes ya pasaban. Se espera además el CI obligatorio de la revisión final. No se consideran correctas pruebas omitidas ni se equipara una simulación con completar un acceso Google real o usar biometría física.

El requisito ASVS L2 V6.3.3 queda bloqueado: ofrecer correo o Google como alternativas no combina factores. La matriz retira la evidencia dependiente de WebAuthn y marca los controles afectados para nueva revisión. No se declara L2 completo.

## Despliegue y recuperación

1. Ensayar 0037 sobre una rama aislada actual de Neon y conservar una copia previa sin compute. No ejecutar la suite de seguridad contra producción.
2. Con mantenimiento independiente, aplicar el migrador sin seed. No cambiar contraseñas, contexto, pepper, Google ni claves de correo por esta retirada.
3. Desplegar los tres componentes con la revisión verificada y contrato 37, conservando sus LOGIN, secretos separados, dominios y URLs privadas. Comprobar readiness y acceso público; confirmar que no existen rutas activas de passkeys.
4. Completar comprobación interactiva de Google y código con una cuenta autorizada. La redirección correcta por sí sola no prueba el login completo.

No volver automáticamente a la revisión que exige MFA: su guard de arranque es incompatible con la configuración simplificada. Un rollback tendría que restaurar explícitamente la política y permisos anteriores o usar una revisión compatible con el acceso simple, sin borrar sesiones ni sobrescribir datos empresariales. La copia previa se conserva para recuperación autorizada, no para sustituir producción de forma automática.
