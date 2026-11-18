# Evidencia local y límites · 16 de noviembre de 2026

Rama `security/session-capabilities`. Base confirmada mediante `git fetch origin main`: `1dd4750604cfd351a378d8e7e3f176012573515e`. Sin otras PR abiertas al comprobarlo. No se ha desplegado esta rama ni se han alterado datos, roles o secretos productivos.

## Comprobaciones ejecutadas

- `npm run build`: TypeScript estricto y Vite correctos tras las nuevas capacidades de revocación.
- `tests/groups-postgres.test.ts`, PostgreSQL 17 desechable, con URL de pruebas obligatoria: siete pruebas correctas, cero omitidas. Incluye diez grupos y LOGIN HTTP real, privilegios individuales, suplantación mediante hash/GUC, SQL sin contexto, errores/rollback/pool, fronteras de identidad y envío, flujo de alta/aprobación/activación y MFA, cookies por grupo, retorno PWA concurrente, recuperación MFA concurrente y de uso único, permisos de revocación de sesiones y referencia compuesta al proyecto padre.
- Mantenimiento: generación exclusiva de claves con permisos 0700/0600, transición seca/aplicada/idempotente de correo en ambas colas, rechazo de pública no registrada y de membresías adicionales, retirada del LOGIN anterior con varios grantors y terminación de una conexión activa. Ensayado en PostgreSQL local con rol administrativo del laboratorio; faltan credenciales SCRAM y permisos administrativos efectivos de Neon.
- Restauración: `pg_dump`/`pg_restore` de datos sintéticos en otra base desechable; comparación de datos empresariales e historial y prueba del LOGIN limitado en la restauración. No se ha restaurado una copia productiva.
- `tests/browser/passkeys.spec.ts` y `tests/browser/security-storage.spec.ts`: nueve pruebas correctas. Autenticador virtual con UV y verificación real de su firma, CSP, instalación del Service Worker, exclusión de credenciales/API de Cache Storage, cambio de identidad, cuarentena de pendientes, sincronización asociada al usuario, caducidad y logout entre pestañas.
- Pruebas Node de configuración, criptografía de sobre, WebAuthn, entrada recordada y autenticación: diez correctas. Prueba adicional de eventos: correcta; no registra URL, parámetros, cookies, códigos, correo ni IDs sin seudonimizar.
- `npm audit --omit=dev --json`: cero vulnerabilidades informadas en dependencias productivas al ejecutarlo. Esto no demuestra ausencia de vulnerabilidades.

La regresión Node ampliada ejecutó 163 casos: 128 correctos y 35 fallos. Los 34 casos de API/cuentas afectados reutilizaban la cookie del administrador para simular otros navegadores; la rotación correcta de sesión invalidaba esa cookie. Se separaron las cookies de los navegadores de prueba y los 34 casos pasan. El caso restante configuraba el proveedor en el HTTP; se adaptó al emisor y pasa. Una ejecución posterior de los 18 casos afectados de autenticación, Google, correo, enlaces, almacenamiento y eventos también pasa. CI del commit `2f34724` confirmó 157 pruebas Node correctas y el job PostgreSQL de seis casos correcto, sin omisiones. Ese primer CI señaló regresiones de navegador que se corrigieron después; la comprobación del último commit sigue siendo obligatoria. No se consideran correctas pruebas omitidas ni se infieren garantías de producción a partir de ensayos locales.

## Pendientes que impiden declarar L2

1. Revisión y evidencia por requisito de la matriz ASVS: los controles no comprobados conservan estado pendiente.
2. Decisión de almacenamiento privado offline para V14.3.3. Actualmente hay datos sensibles persistentes, aunque se hayan corregido aislamiento de colas, caducidad y limpieza.
3. Los nuevos enlaces productivos usan fragmentos y cuerpos POST, comprobados en navegador y PostgreSQL. Cerrar la compatibilidad temporal de enlaces query anteriores antes de declarar completo V14.2.1; no basta `no-store`/`no-referrer`.
4. Completar ensayos del cambio de secretos, transición de correo, retirada del runtime anterior y rollback coordinado. Los scripts son herramientas de preparación, no prueba de que se haya hecho en producción.
5. Retención/purga de contenido sensible de correo y comportamiento operativo ante pérdida de una clave de descifrado; revisión de capacidad y rendimiento con los componentes realmente separados.
6. Ensayos de Google real y passkeys en iPhone/Android/dispositivo anterior. El iPhone confirmado previamente por el usuario validaba el retorno OAuth anterior; no valida esta implementación nueva de MFA.
7. Google publica actualmente firmas RS256 con claves RSA-2048: la consulta pública guardada en `evidence/google-jwks-strength-2026-11-16.json` confirma esta limitación frente al mínimo de 128 bits de V11.2.3. Se conserva Google como SFA junto a passkey con UV; no se declara satisfecha literalmente esa exigencia.
8. Verificación de configuración externa: TLS, aislamiento privado y secretos en Railway, roles efectivos en Neon tras activación, acceso/retención de logs, copias y recuperación. No se asumen comprobados por existir código o documentación del proveedor.

## Modelo de amenazas

Una inyección SQL en HTTP se limita a la sesión cuyo bearer se posee y a sus permisos actuales. La API no conoce la clave HMAC global, el secreto OAuth, las claves privadas de correo/VAPID ni credenciales de mantenimiento. Comprometer el proceso HTTP permite observar sesiones y solicitudes que lo atraviesan y actuar como esas personas. Comprometer identidad permite emitir credenciales; comprometer envío expone correo pendiente y capacidades de entrega. Un propietario PostgreSQL o administrador del host sigue siendo autoridad total.

Los grupos comparten origen: XSS puede actuar con los permisos de las sesiones accesibles a ese origen y leer datos persistentes del navegador. Los nombres de cookies/IndexedDB no equivalen a separación de origen. La separación por procesos reduce secretos accesibles ante una toma parcial; no garantiza aislamiento absoluto frente a una toma del servidor compartido. RLS tampoco impone cuotas de CPU/memoria ni aislamiento total de disponibilidad. Se comprobó que el LOGIN comparte EXECUTE de las funciones PostgreSQL de cancelación/terminación: falta revisar y ensayar su alcance entre conexiones del mismo LOGIN; no se declara ese límite mitigado.

## Actualización del 17 de noviembre

- Siete pruebas PostgreSQL correctas, incluida la nueva prueba de mantenimiento. Ensayo adicional de mantenimiento tras validar el puerto/destino: correcto.
- Quince pruebas Node específicas correctas de configuración, eventos, pool, acceso y scripts offline. La ausencia de `NODE_ENV` con una URL remota ya no selecciona silenciosamente el runtime integrado; los componentes separados exigen entorno explícito.
- Catorce casos de navegador específicos correctos tras corregir las regresiones detectadas por CI: invitación por fragmento y recarga, cambio de cuenta con rotación de sesión, referencia de formularios limitada al origen, alta y sincronización offline en grupo instalado, edición/checklist offline, recuperación de pendientes y cambios entre pestañas.
- Las lecturas locales vigentes vuelven a ser readonly; solo una expiración requiere escribir. La caché admite exclusivamente `/me` y `/data`, evitando devolver un snapshot como respuesta de otro endpoint.
- El entorno Vite marca exclusivamente el HTML público de la PWA como hace Express productivo; no se amplía la caché a APIs o páginas personalizadas. Los mensajes de sesión caducada se retiran al recuperar acceso sin ocultar cambios fallidos pendientes.

No se suman pruebas repetidas como si fueran casos distintos. La primera ejecución CI no fue completamente correcta: señaló regresiones reales de navegador. Las correcciones se publican para una nueva verificación obligatoria, sin fusionar ni desplegar.

La revisión posterior retiró DELETE físico de proyectos, comisiones y tareas mediante 0036: scouter y administración no pueden usar ese atajo SQL; el borrado lógico autorizado sigue funcionando. El arranque y el cutover rechazan un contrato SQL anterior a 0036, sin retirar credenciales. Estas condiciones se ensayan con el LOGIN real.

## Actualización del 18 de noviembre

- Compilación TypeScript/Vite correcta. Once pruebas específicas de pool, correo y cifrado correctas, sin omisiones.
- Ocho pruebas PostgreSQL correctas, sin omisiones, en una base local desechable. La nueva prueba arranca el proceso real de envío con LOGIN propio, claves sintéticas y proveedores interceptados: no envía mensajes externos. Comprueba correo y push simultáneos de dos grupos, contenido y destinatarios, leases activos/caducados, confirmación con lease incorrecto, backoff, reinicio del proceso, recibos e idempotencia. Solo se reintenta el dispositivo fallido. No demuestra el comportamiento del proveedor real ni garantiza entrega exactamente una vez ante cualquier fallo externo.
- Un ensayo termina una conexión ociosa del LOGIN HTTP en el laboratorio: el pool registra exclusivamente fecha/código y la siguiente consulta conserva el LOGIN limitado. Se evita que el error ocioso termine el proceso o exponga el objeto cliente con credenciales. No añade consultas periódicas.
- El envío global descifra una vez por mensaje, en lugar de tres veces para asunto/texto/HTML; la prueba comprueba los tres campos. No hay medición de latencia o coste productivo.
- El CI del commit anterior `8c141c1` completó sus 28 comprobaciones correctamente. Las adiciones de esta sección requieren su propio CI; ese resultado anterior no las valida.

No se han modificado tutoriales, cuentas, datos ni recursos productivos. Siguen pendientes los bloqueos L2 enumerados arriba.

## Activación autorizada del 18 de noviembre

Se ejecutó la transición de infraestructura tras el ensayo en una rama aislada de Neon. El resultado y sus límites se registran en [deployment-2026-11-18.md](deployment-2026-11-18.md). Las afirmaciones anteriores de ausencia de cambios productivos describen las fases previas a esa autorización. La activación no implica cumplimiento L2 completo.
