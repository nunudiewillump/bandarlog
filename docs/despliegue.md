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
- Solicita el primer enlace usando el correo de `BOOTSTRAP_EMAIL`. Verifica la recepción real y confirma el acceso. No compartas el enlace: contiene un token temporal.
- Crea una ronda solar, una comisión y una tarea con una fecha futura; comprueba el correo de asignación y que sus enlaces solo modifican datos tras autenticar y confirmar.
- Recarga la aplicación y comprueba la persistencia. Las tablas se pueden consultar en Neon sin exportar datos privados al chat.
- Si falla el correo, verifica que Gmail API está habilitada, que el token pertenece al cliente OAuth configurado, que el alcance autorizado incluye `gmail.send` y que no ha caducado el consentimiento de prueba.

Los valores secretos pueden reemplazarse en Railway sin editar ni volver a publicarlos en GitHub. Las pruebas locales de Gmail usan respuestas simuladas y no sustituyen la comprobación con la cuenta real. La ruta node-postgres se ha comprobado contra PostgreSQL 17 local; la conexión concreta a Neon requiere completar estos pasos.
