# Política de autenticación · 19 de noviembre de 2026

El usuario ha solicitado retirar passkeys y volver al acceso simple. Se admiten dos alternativas: correo con el código recibido por email, o Google. No se utiliza contraseña fija ni se exige un segundo factor después del primer acceso verificado.

## Acceso y retirada de passkeys

La sesión emitida tras verificar correo o Google permite acceder directamente al grupo autorizado. También se conserva la activación de grupos, las invitaciones y la compatibilidad de sesiones existentes. Los permisos individuales, el grupo, la vigencia y la baja de la cuenta se verifican en PostgreSQL en cada consulta de usuario.

Se retiran registro, autenticación, recuperación y ajustes de passkeys, sus rutas y dependencias WebAuthn. La migración 0037 desactiva la exigencia MFA, conserva las tablas históricas sin conceder lectura/escritura o ejecución de sus funciones a identidad y mantiene las sesiones existentes. No se eliminan personas ni credenciales históricas. Las cookies antiguas sin ámbito de grupo siguen requiriendo entrar de nuevo con correo o Google para obtener una cookie moderna.

La biometría para autenticar una web utiliza WebAuthn/passkeys. Al retirar esa tecnología no se ofrece un acceso biométrico independiente de la web. La protección biométrica del teléfono o del gestor de sesiones del sistema es una función distinta; no se presenta como factor verificado por Bandarlog.

## Correo, Google y sesiones

- Código de seis cifras generado con CSPRNG, ligado al reto y grupo, de un uso, con plazo de diez minutos; PBKDF2-HMAC-SHA-256 de 600.000 iteraciones, sal por reto y pepper privado. No se confirma si una cuenta existe al solicitar acceso.
- Límites por IP: 120 solicitudes cada quince minutos; por destinatario/grupo: un código por minuto y cinco solicitudes cada quince minutos; máximo cinco intentos fallidos por reto. El bloqueo de un reto no deshabilita permanentemente la cuenta.
- Google: PKCE, estado y cookie por flujo, nonce y comprobación de firma, emisor, audiencia y caducidad. Vinculación por identidad estable; cuando Google no garantiza el dominio de correo, se exige verificarlo por email. El retorno PWA mantiene ticket efímero, de uso único, ligado al secreto del navegador iniciador.
- Bearer de sesión aleatorio de 256 bits, hash en servidor y cookie `__Host-` Secure/HttpOnly/SameSite=Lax por grupo, sin Domain y con Path=/. El indicador de navegación nunca autentica.
- Inactividad de treinta días y máximo absoluto de noventa días; la renovación no extiende el absoluto. Cada login o reautenticación rota el bearer del navegador y revoca el anterior. Las sesiones paralelas pueden consultarse y revocarse; las operaciones sensibles mantienen la exigencia de autenticación reciente y CSRF. Administración puede revocar sesiones solo dentro de su grupo.

Google y Bandarlog conservan ciclos de sesión independientes. Salir de uno no revoca las sesiones del otro. Se conserva la separación de procesos y secretos entre HTTP, identidad y entrega; la cuenta SQL del HTTP no puede convertirse en propietario ni omitir RLS.

## ASVS y límites

Las dos alternativas son factores únicos, no una combinación de factores. La retirada solicitada impide declarar cumplido ASVS 5.0 L2 V6.3.3; el control queda bloqueado explícitamente en la matriz. No se declara NIST AAL2 ni L2 completo. Los plazos de sesión, el almacenamiento privado offline y los demás pendientes documentados requieren revisión independiente.

La firma RSA-2048 publicada por Google continúa por debajo del mínimo literal de 128 bits de V11.2.3. Retirar passkeys no resuelve esa limitación ni los riesgos de un origen/host compartido. La biometría física y el acceso completo a una cuenta Google real necesitan comprobación interactiva; las pruebas sintéticas no los sustituyen.
