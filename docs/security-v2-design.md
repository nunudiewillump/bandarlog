# ASVS 5.0 L2 · diseño y verificación en curso

Base inspeccionada: main y Railway `1dd4750604cfd351a378d8e7e3f176012573515e`, despliegue SUCCESS `6280c71e-9645-4434-886e-7808079dff52`. Sin PR abiertas al iniciar. PR36 integrado: mantener driver medido, sesión JOIN, planificación por plazos y coordinador SSE.

## Fronteras y decisiones

1. Navegador: no es autoridad. Cookie HttpOnly contiene bearer aleatorio; CSRF en memoria. Grupos comparten origen: IndexedDB/cachés no son frontera frente a XSS. Offline tiene plazo explícito y no concede permisos al sincronizar.
2. HTTP: nueva identidad SQL sin clave de firma de grupos, secretos OAuth ni proveedores. PostgreSQL verifica el preimage de la sesión mediante SHA256, grupo, vigencia y baja en cada operación. Un hash almacenado, user_id o GUC arbitrario no es prueba de identidad. RLS y controles de cambios sensibles impondrán permisos actuales además de Express.
3. Identidad: proceso separado para prelogin, Google y registro. Valida las pruebas de acceso; recibe sus propias credenciales y secretos. No proporciona una interfaz de firmas por user_id/grupo. El API solo reenvía rutas de autenticación delimitadas, no SQL ni operaciones internas arbitrarias.
4. Emisor/planificador: proceso con credenciales propias y proveedores. HTTP no reclama correo ni obtiene VAPID privada. Contenido sensible cifrado con clave pública; privada solo en emisor. Colas existentes pasan por transición explícita; claims atómicos, leases y reintentos conservados.
5. Mantenimiento: identidad propietaria solo en proceso separado. Roles nuevos aditivos, provisión y retirada de permisos anteriores ensayadas fuera de producción antes de activación.

Una inyección SQL en HTTP debe quedar limitada por sesión y permisos actuales. Una toma de HTTP puede robar sesiones y peticiones que atraviesan ese proceso y actuar como esas personas; no debe poder inventar sesiones no observadas, leer claves de proveedores ni descifrar correos pendientes. Una toma del proceso de identidad compromete su autoridad de autenticación. Una toma del emisor expone contenido pendiente y capacidades de envío; limitar acceso empresarial por permisos SQL. El administrador PostgreSQL continúa siendo autoridad total. No se garantiza aislamiento frente a XSS entre grupos del mismo origen ni frente a administrador/host compartido comprometido; evaluar orígenes/servicios por conjunto de grupos según coste y necesidad.

## Hallazgos iniciales (no son garantías corregidas)

| Riesgo | Condición y alcance | Estado inicial |
| --- | --- | --- |
| Alto: permisos personales solo en Express | SQL con group_app puede operar sobre otras personas/roles del grupo | Pendiente de corrección/verificación SQL |
| Alto: HTTP con firma global | RCE permite contextos de cualquier grupo | Pendiente de separación |
| Alto: correo/VAPID en HTTP | SQL/HTTP privilegiado obtiene contenido de credenciales y claves | Pendiente de separación/cifrado |
| Alto: cola offline y cambio de identidad | Carreras entre ventanas/sync y cuenta diferente; pérdida silenciosa de pendientes | Pendiente de pruebas y corrección |
| Medio: HTML de correo en listado de avisos | Coordinación recibe html que puede incluir tokens aunque body se omite | Pendiente de corrección |
| Medio: SSE después de revocación | Conexión abierta sigue recibiendo señales tras baja/fin de sesión | Pendiente de corrección |

No se declara cumplimiento L2 hasta cerrar la matriz de requisitos aplicables y su evidencia. No se han modificado recursos productivos en este trabajo.
