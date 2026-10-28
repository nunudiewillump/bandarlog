# Forest Experience · implementación

Base visual aprobada: propuesta Codex refinada, commit `7088637`. El usuario aprobó esa versión y después ajustó la identidad: eliminar monos 3D estáticos, conservar la marca pequeña y permitir guiños discretos **solo en 2D**, incluida la liana. Esa decisión sustituye los recursos 3D de las láminas anteriores; no se implementa ni mezcla el diseño de Stitch.

## Cambios

- Cabecera móvil con la geometría de copa aprobada, marca crema, avatar y áreas seguras. Cuatro destinos inferiores estables, listas continuas, contextos de proyecto, iconos asociados y selectores de la interfaz.
- Inicio conserva Smart Focus, hasta tres tareas destacadas, contadores, pausa de última tarea, Deshacer y permisos existentes. Retira saludos, subtítulos repetidos y grandes mascotas estáticas.
- Se retiran del acceso, estados vacíos, comisiones y selector las imágenes 3D y la representación de sprites. No es necesario recortar y exportar 338 mascotas que ya no se usan. Se mantienen los IDs y datos históricos del catálogo para compatibilidad; se muestran los iconos y se permite ampliar el catálogo con un único icono.
- La confirmación de tarea utiliza `public/monkey-vine-2d.webp`, una ilustración original nueva basada en el logotipo. Mantiene el texto Tarea completada y respeta movimiento reducido. No hay decoración animada de forma continua.
- Primer acceso para nuevas cuentas con nombre obligatorio y foto opcional. Reutiliza el editor de recorte/compresión y permite seleccionar archivo o cámara cuando el navegador lo admita. La marca de finalización se persiste en servidor; los perfiles ya existentes se conservan como configurados.
- Entrada por código dentro de la PWA: seis cifras, diez minutos, cinco intentos, espera de reenvío y límite persistido por correo. Verificador HMAC ligado al desafío y al destinatario, consumo transaccional, respuestas genéricas y autorización por usuario/invitación vigente.
- Se mantienen enlaces anteriores y aceptación directa de invitaciones. Los accesos no conceden roles ni comisiones adicionales.
- Google Login opcional, OIDC con backend: PKCE, state ligado al navegador, nonce, firma, audiencia, emisor y caducidad. Identidad por sub. Los correos externos no autoritativos requieren código en esa misma dirección antes de vincularse.
- Sesión opaca con hash, cookie HttpOnly/Secure/Lax, renovación controlada, límite absoluto, CSRF y revocación al salir. Se diferencian los fallos de red de una sesión caducada.

## Migración y configuración

`0007_forest_access` añade la marca de onboarding, datos de sesión, desafíos de código y estados/identidades Google. Conserva perfiles e invitaciones y marca solo los usuarios existentes como configurados. Las cuentas creadas posteriormente deben completar su nombre.

**Nueva variable obligatoria antes de desplegar:** `AUTH_CHALLENGE_SECRET`, privada, aleatoria y estable, con al menos32 caracteres. La producción la valida antes de migrar. No se han cambiado valores reales de Railway.

Google solo se muestra cuando están configuradas conjuntamente `GOOGLE_LOGIN_CLIENT_ID` y `GOOGLE_LOGIN_CLIENT_SECRET`, de un cliente web separado de Gmail. Callback exacto: `${APP_URL}/api/auth/google/callback`; scopes `openid email profile`. El correo sigue utilizando el transporte existente. Configuración completa: [despliegue](../despliegue.md).

`STITCH_API_KEY` es una credencial de la herramienta de diseño; no pertenece a la aplicación ni a Railway.

## Verificación

Compilación TypeScript/Vite y47 pruebas de aplicación/API aprobadas en la primera integración. Los 42 recorridos de navegador anteriores y las tres nuevas pruebas Forest se han comprobado por lotes; la ejecución conjunta final de 45 se verificará en CI. La revisión visual independiente da ship para la rama/PR, sin hallazgos materiales pendientes.

Las pruebas nuevas verifican códigos, intentos y consumo concurrente, invitaciones revocadas, alcance de la persona invitada, onboarding obligatorio y persistido, CSRF, cookie/logout, migración compatible y validación criptográfica de tokens Google con claves de prueba. La revisión independiente de los cambios de autenticación no encontró defectos materiales confirmados.

## Límites concretos

No se ha probado una cuenta Google real ni se han configurado sus credenciales. Falta comprobar el retorno OAuth y la sesión en PWA instalada con dispositivos físicos iOS/Android. Las pruebas locales de imágenes, teclado y viewport no certifican todos los formatos de cámara o tecnologías de asistencia.

La renovación como máximo diaria hace que el objetivo de treinta días de inactividad pueda acortarse casi un día. Si caduca el ticket temporal de vinculación Google antes de verificar un código posterior, el código permite entrar por correo y la vinculación debe repetirse desde Google. Ninguno de estos límites amplía acceso ni reutiliza credenciales del transporte Gmail.

No se han enviado correos externos, modificado datos de producción ni desplegado la rama.
