# Autenticación y sesiones · objetivo ASVS 5.0 L2

Estado: implementado y ensayado localmente; no activado en producción. La matriz ASVS es el registro de verificación, no un certificado.

## Rutas y fuerza de autenticación

Google OIDC y correo (código o enlace de diez minutos, uso único) son vías alternativas de primer factor. Google se trata siempre como autenticación de un solo factor: no se infiere MFA de una sesión Google, del correo verificado ni de la existencia de biometría en ese proveedor. Sujeto e identidad están vinculados en PostgreSQL; state, navegador iniciador, PKCE, nonce, firma, emisor y audiencia se comprueban antes de emitir sesión.

Después se requiere una passkey con presencia y verificación del usuario obligatorias. La biometría o PIN se comprueban en el autenticador; Bandarlog no recibe ni guarda esos datos. Se permiten autenticadores compatibles, incluidos los flujos de otro dispositivo que ofrezca el navegador. La compatibilidad concreta de QR/Bluetooth, iCloud y Google Password Manager requiere ensayos en dispositivos reales; no se garantiza a partir del autenticador virtual de Chromium.

Una sesión de primer factor no puede leer `/data`, mutar recursos, conectarse a los datos SSE ni usar las capacidades personales SQL. El alta/activación tampoco equivale a autenticación reciente: exige primer factor fresco antes de registrar la primera passkey. Las cuentas que ya tienen passkeys no pueden sustituirlas con solo un correo o una sesión Google. No hay cuentas de demostración en el arranque productivo ni contraseñas estáticas de acceso.

## Alta, recuperación y cambios sensibles

Primer registro de passkey: primer factor verificado en los diez minutos anteriores. Passkeys adicionales, retirada de una passkey y renovación de recuperación: MFA verificada en los quince minutos anteriores. No se puede retirar la última passkey. Cada reto dura cinco minutos y se asocia a sesión, grupo, usuario, propósito, RP y origen. Una verificación consume el reto; errores de firma no lo convierten en reutilizable.

Si está disponible la passkey anterior, el usuario puede utilizar ese dispositivo o un autenticador sincronizado compatible. Como recuperación independiente se generan diez códigos de 128 bits, mostrados una vez; se guardan exclusivamente sus hashes SHA-256. No son hashes que el usuario tenga que calcular. Cada código requiere además primer factor fresco, solo puede consumirse una vez y se sustituye al renovar el conjunto. No hay preguntas secretas, restablecimiento automático por administradores ni bypass de MFA mediante invitación. La pérdida simultánea de todos los autenticadores y códigos bloquea el acceso: cualquier recuperación excepcional requiere un procedimiento de identificación aprobado, aún pendiente de definición, y nunca se debe resolver con SQL improvisado.

Se auditan los cambios de factores y se encolan avisos de seguridad al correo del actor. Los avisos no contienen códigos, claves ni el secreto de recuperación. Las personas pueden consultar y cerrar sus sesiones, incluida la opción de cerrar las demás tras un cambio de factores. Administración puede revocar sesiones de personas de su grupo o del grupo completo, con autenticación reciente y auditoría; no puede hacerlo en otro grupo.

## Límites, abuso y caducidad

- Por IP: 120 solicitudes de autenticación cada quince minutos; lecturas de configuración/estado/listado no consumen esa cuota. El margen permite redes compartidas de grupos scouts. Es un freno adicional, no la única defensa.
- Por destinatario y grupo: un código por minuto y cinco solicitudes cada quince minutos, serializadas en PostgreSQL; máximo cinco intentos fallidos por reto. La respuesta no confirma si existe la cuenta. Bloquear un reto no deshabilita permanentemente una cuenta.
- Por sesión: cinco retos activos de passkey, con plazo de cinco minutos. La prueba criptográfica es obligatoria; conocer el ID del reto no basta.
- Códigos de seis cifras: CSPRNG, PBKDF2-HMAC-SHA-256 de 600.000 iteraciones, sal derivada de un reto aleatorio y pepper privado. Solo se admiten verificadores anteriores para retos no caducados durante la transición.
- Sesión: bearer aleatorio de 256 bits, hash en servidor, cookie `__Host-` Secure/HttpOnly/SameSite=Lax, nombre distinto por grupo, sin Domain y Path=/. Google usa cookies independientes por flujo; el indicador de navegación nunca autentica.
- Inactividad: treinta días. Absoluto: noventa días. Renovar actividad no extiende el absoluto. Todo login/reauthentificación rota el bearer y revoca el anterior del mismo navegador. Otras sesiones permanecen disponibles hasta caducidad o revocación explícita.

Se permiten sesiones paralelas sin un máximo numérico fijo, para dispositivos de uso intermitente; se muestran todas las vigentes y pueden revocarse. Esto implica retención y tamaño de listado que deben vigilarse. Los límites por IP, destinatario y reto reducen abuso, sin sustituir una política futura de capacidad.

Los plazos de treinta/noventa días exceden las recomendaciones NIST para AAL2. Se conservan por el uso scout intermitente y la persistencia de la PWA. Las compensaciones son passkeys con UV, revocación en servidor, comprobación de baja/permisos actuales, CSRF y reautenticación de quince minutos en operaciones sensibles. No se declara cumplimiento NIST AAL2; la aceptación del riesgo y de estos plazos debe revisarse antes de declarar verificado ASVS V7.1.1. La persistencia de datos privados offline continúa pendiente de decisión y no se presenta como V14.3.3 cumplido.

Google y Bandarlog tienen ciclos de sesión independientes: salir de Bandarlog no cierra Google; cerrar Google no revoca las sesiones ya emitidas por Bandarlog. El límite absoluto propio exige una nueva interacción. No se ofrece SSO silencioso ni se confía en `auth_time` no recibido. El ticket de retorno de la PWA es efímero, de uso único y exige el secreto del navegador iniciador; no es una sesión.
