# Configurar Neon y Railway

El repositorio está preparado; no contiene credenciales de producción. No se ha creado ningún proyecto en las cuentas del grupo ni desplegado la aplicación mediante este entorno. Haz los pasos de cuenta desde sus paneles y guarda todos los valores privados directamente en Railway, nunca en GitHub ni en el chat.

## 1. Neon

1. En [Neon Console](https://console.neon.tech/), crea un proyecto `bandarlog` en una región europea, por ejemplo AWS Frankfurt.
2. Conserva la rama principal y la base de datos predeterminada, o crea una llamada `bandarlog`.
3. Abre **Connect**, selecciona la base y el rol correctos y copia la URL PostgreSQL. Para una sola réplica puedes usar la conexión directa; no confundas la URL del panel web con la cadena que empieza por `postgresql://`.
4. Al guardarla en Railway como `DATABASE_URL`, usa `sslmode=verify-full` (si la URL trae `sslmode=require`, sustituye solamente ese valor). Conserva los demás parámetros.

La primera ejecución crea las tablas con las migraciones de Drizzle y el administrador indicado en `BOOTSTRAP_EMAIL`. En producción no se crean usuarios ni tareas de demostración. No ejecutes importaciones de hojas ni semillas de desarrollo contra la base real.

## 2. Correo en Railway Free, Trial o Hobby

[Railway bloquea SMTP en estos planes](https://docs.railway.com/reference/outbound-networking). La contraseña de aplicación de Gmail solo sirve para SMTP y no resuelve ese bloqueo. La aplicación admite Gmail API por HTTPS, manteniendo el remitente del grupo, sin leer su bandeja de entrada.

Para configurarla, entra en Google Cloud con una cuenta administrada por el grupo:

1. Crea o selecciona un proyecto y habilita **Gmail API** en **APIs y servicios → Biblioteca**.
2. Configura **Google Auth Platform / pantalla de consentimiento OAuth**. Para una cuenta Gmail personal, el público es externo. Indica el nombre Bandarlog y añade el correo remitente como usuario de prueba mientras configuras el acceso.
3. Crea un cliente OAuth de tipo **Aplicación web**. Para obtener el primer token con la herramienta oficial de Google, añade exactamente `https://developers.google.com/oauthplayground` como URI de redirección autorizada.
4. Abre [OAuth Playground](https://developers.google.com/oauthplayground/), abre sus ajustes y activa **Use your own OAuth credentials**. Introduce allí el identificador y el secreto de ese cliente. Los secretos se introducen en Google, no en documentación pública.
5. Autoriza únicamente el alcance `https://www.googleapis.com/auth/gmail.send`, iniciando sesión con la cuenta que enviará los mensajes. Intercambia el código de autorización por los tokens.
6. Guarda el **refresh token** en `GMAIL_REFRESH_TOKEN` de Railway. Guarda también `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET`. No copies el access token temporal: la aplicación lo renueva automáticamente.
7. Revisa la publicación y las condiciones de la pantalla de consentimiento antes de uso continuado: con una aplicación externa en estado **Testing**, Google limita habitualmente los refresh tokens a siete días. La publicación del consentimiento, sus advertencias y cualquier verificación exigida se gestionan en Google; el código no elimina estos requisitos.

El correo de `MAIL_FROM` debe coincidir con la cuenta autorizada o un alias que Gmail permita usar. Configura `MAIL_TRANSPORT=gmail_api`. No hacen falta `SMTP_HOST`, `SMTP_USER` ni `SMTP_PASS` en este modo.

Si se utiliza Railway Pro o superior, puedes elegir `MAIL_TRANSPORT=smtp`, con las variables SMTP descritas en el README. No cambies de plan de pago sin revisar sus condiciones y costes.

## 3. Railway

1. En [Railway](https://railway.com/dashboard), crea un proyecto y añade un servicio desde el repositorio GitHub `nunudiewillump/bandarlog`, rama `main`. Autoriza a Railway solo el acceso necesario a ese repositorio.
2. La raíz del servicio es la raíz del repositorio. `railway.toml` define la compilación, `npm start` y el healthcheck `/api/health`; Node 24 está fijado en `.node-version` y `engines`.
3. En **Settings → Networking → Public Networking**, genera un dominio público. Guarda su origen completo `https://...up.railway.app` como `APP_URL` (sin rutas). No publiques ese dominio como listo antes de terminar las comprobaciones.
4. En **Variables**, introduce la configuración siguiente. Los valores entre `<...>` se sustituyen allí; no se guardan en archivos del repositorio.

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `<origen HTTPS generado por Railway>` |
| `DATABASE_URL` | `<URL PostgreSQL privada de Neon con sslmode=verify-full>` |
| `BOOTSTRAP_EMAIL` | `<correo del primer administrador>` |
| `AUTH_CHALLENGE_SECRET` | `<secreto privado aleatorio estable de al menos 32 caracteres>` |
| `MAIL_TRANSPORT` | `gmail_api` |
| `MAIL_FROM` | `Bandarlog <correo-remitente-autorizado>` |
| `GMAIL_CLIENT_ID` | `<cliente OAuth de Google>` |
| `GMAIL_CLIENT_SECRET` | `<secreto OAuth>` |
| `GMAIL_REFRESH_TOKEN` | `<refresh token de la cuenta remitente>` |

Railway proporciona `PORT`: no lo fijes al puerto local del desarrollo. Deja una sola réplica. Desactiva el modo de suspensión automática/Serverless si está habilitado para que el proceso pueda ejecutar los recordatorios aun sin visitas; los costes dependen del plan contratado.

5. Aplica las variables y despliega. Si Railway intentó arrancar antes de tener todas las variables, corrígelas y vuelve a desplegar: la aplicación rechaza una configuración incompleta **antes** de crear tablas o el administrador.

## 4. Verificación

- El despliegue debe superar el healthcheck y el dominio debe mostrar la pantalla de acceso de Bandarlog, sin bandeja de desarrollo.
- `GET /api/health` debe indicar `ok: true`, `database: postgresql` y `mail: gmail_api`. Esto confirma el arranque y la base, pero no certifica por sí solo la autorización del correo.
- Solicita el código usando el correo de `BOOTSTRAP_EMAIL`, verifica su recepción real e introdúcelo dentro de Bandarlog. Completa nombre y foto opcional si es una cuenta nueva. No compartas códigos ni enlaces de acceso.
- Crea una ronda solar, una comisión y una tarea con una fecha futura; comprueba el correo de asignación y que sus enlaces solo modifican datos tras autenticar y confirmar.
- Recarga la aplicación y comprueba la persistencia. Las tablas se pueden consultar en Neon sin exportar datos privados al chat.
- Si falla el correo, verifica que Gmail API está habilitada, que el token pertenece al cliente OAuth configurado, que el alcance autorizado incluye `gmail.send` y que no ha caducado el consentimiento de prueba.

Los valores secretos pueden reemplazarse en Railway sin editar ni volver a publicarlos en GitHub. Las pruebas locales de Gmail usan respuestas simuladas y no sustituyen la comprobación con la cuenta real. La ruta node-postgres se ha comprobado contra PostgreSQL 17 local; la conexión concreta a Neon requiere completar estos pasos.

## Invitaciones y fotos

Las personas invitadas entran desde el primer correo, pulsando «Aceptar invitación y entrar». No necesitan cuenta ni acceso al panel de Railway, ni autorizar Google. Tras actualizar una instalación anterior, reenvía las invitaciones pendientes: los correos antiguos conservan el punto erróneo al final del dominio y no se modifican al desplegar.

La subida de fotos usa vistas previas `data:` compatibles con la política de imágenes de producción. El recorte y la compresión suceden antes del envío; no es necesario ampliar la política de seguridad para permitir `blob:`. Consulta la [revisión móvil y del acceso](revision-movil-y-acceso.md).

## Forest Experience: nuevas variables y Google opcional

Antes de desplegar esta versión, añade **AUTH_CHALLENGE_SECRET** a los secretos de Railway: valor aleatorio estable de al menos 32 caracteres. La configuración de producción lo valida antes de migrar. No reutilices una contraseña, el token de Stitch o una credencial de Gmail; no lo guardes en GitHub ni en el chat. El acceso por código usa el transporte de correo ya configurado.

Google Login es opcional. Para activarlo, crea un cliente OAuth **web** propio para iniciar sesión, separado del cliente de envío de Gmail. Registra exactamente `${APP_URL}/api/auth/google/callback` como URI de redirección autorizada y añade **GOOGLE_LOGIN_CLIENT_ID** y **GOOGLE_LOGIN_CLIENT_SECRET** conjuntamente en Railway. Scopes mínimos: `openid email profile`. Mantén los usuarios de prueba y el estado de publicación/consentimiento que corresponda a ese cliente. No se solicitan permisos Gmail, refresh tokens Google ni acceso offline para mantener la sesión de Bandarlog.

Sin esas dos variables se oculta Google y el código sigue disponible. Un correo Google ajeno a Gmail/Workspace puede requerir confirmar propiedad mediante el código enviado a esa misma dirección antes de vincularlo. No hay registro abierto: se exige usuario existente o invitación vigente. La identidad se conserva por `sub`, no por un email mutable.

La migración conserva usuarios e invitaciones, marca como configurados los perfiles existentes y deja los nuevos pendientes de nombre/foto. Las sesiones existentes mantienen su caducidad previa hasta su renovación válida. Las sesiones nuevas usan cookie HttpOnly/Secure/Lax, treinta días de inactividad y noventa días absolutos, con renovación como máximo diaria. Por ese intervalo una sesión puede vencer hasta casi un día antes del objetivo de treinta días desde la última actividad.

Las pruebas locales validan códigos, verificadores JWT y permisos con datos aislados. El intercambio real con Google y el retorno entre navegador externo y PWA instalada requieren prueba en Safari iOS, Chrome iOS y Android después de configurar el cliente. No se da por probado compartir cookies entre esos contextos: el código dentro de la PWA es la alternativa disponible. `STITCH_API_KEY` pertenece a las herramientas de diseño y **no** debe añadirse a Railway.

## Escritorio y copa botánica

Esta enmienda no añade secretos, variables de entorno ni migraciones. La preferencia forestEffects se guarda en el perfil existente. Tema y fondo de la PWA son #103b2d; se conserva viewport-fit=cover y el espacio seguro superior. La pantalla sin conexión comparte esos metadatos y el caché estático cambia a v2 para renovarla, manteniendo la exclusión de API y escrituras. La apariencia de la barra de estado en iOS/Android físicos se verifica después de una instalación real; las capturas de navegador no la certifican.
