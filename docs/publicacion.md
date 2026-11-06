# Bandarlog.app, publicación y grupos

## Qué incorpora el cambio

- Origen público: `https://bandarlog.app`. Sin ID de grupo, `/` informa sobre el servicio. `/presentacion` amplía el propósito y funcionamiento para la revisión de Google sin alargar la portada; `/privacidad` y `/condiciones` son páginas públicas reales, servidas en HTML y legibles sin JavaScript ni sesión.
- `/entrar` pide el ID privado. `/crear-grupo` ofrece solicitud gratuita con aprobación obligatoria: el responsable recibe en `darguinenagimenez@gmail.com` un enlace privado para aprobar o rechazar. Solo tras aprobar se envía al solicitante un enlace de activación de siete días. Abrir cualquiera de los enlaces no crea nada; el POST de activación, con aprobación previa y correo verificado, crea grupo, administrador y sesión de forma atómica. Un enlace consumido no crea grupos duplicados. Hay límites por IP y por correo; no se pide tarjeta.
- `/g/ID-privado/` identifica el espacio. Cada persona necesita además una sesión y los permisos de ese grupo. Un mismo correo puede pertenecer a varios grupos con roles distintos. El ID no es una contraseña, no concede acceso a datos y no debe publicarse en buscadores.
- Perfil → Configurar grupo permite a Administración cambiar nombre y los dos colores de la pañoleta y consultar su enlace. Las invitaciones, los correos de tarea y las notificaciones mantienen el contexto del grupo.
- `/suscripcion-demo` solo ilustra un plan gratuito y un precio ficticio. No existe API de contratación, método de pago, proveedor de cobros ni botón operativo para pagar. El plan real se crea como `free` y no puede cambiarse desde esa página ni con el PATCH de ajustes del grupo.

Responsable publicado, a petición del titular: **Dabi Arguiñena Giménez**, **darguinenagimenez@gmail.com**. No se inventa un domicilio ni se publica el correo privado del grupo como contacto legal. La política describe datos, finalidades, Google, almacenamiento local, conservación y derechos. La portada es breve: título, propósito, entrada y una escena 2D del mono al teclado, con las hojas existentes de Bandarlog. La copa se anima con CSS; el mono utiliza un WebP articulado por fotogramas. No hay pausa visible y se respeta movimiento reducido. La imagen estática aparece antes de cargar la animación. La implementación y los recursos se documentan en [portada ilustrada](forest-landing/implementation.md). La aprobación de Google no la determina el código; las regiones, contratos de proveedores y la base jurídica aplicable a cada organización deben corresponder al uso efectivo.

## Aislamiento y migración

La migración `0015_scout_groups_isolation` añade `group_id`, crea el registro del grupo inicial y asigna a él los datos previos **sin cambiar sus IDs, nombres, relaciones, permisos ni historial**. El ID privado del grupo inicial se genera aleatoriamente en la base: no se guarda en GitHub ni se imprime en logs.

Las tablas de trabajo, usuarios, sesiones, códigos, identidades Google, invitaciones, correos, push, tutorial y recibos de sincronización tienen políticas RLS. Cada consulta o transacción del backend de grupo establece el grupo y un rol `bandarlog_group_app` sin propiedad de tablas; el cliente de datos de grupo falla si falta ese contexto. Las claves foráneas compuestas rechazan vínculos entre grupos. Los índices de correo, desafíos de acceso, identidades Google y suscripciones permiten usar el mismo correo/proveedor en grupos independientes.

El acceso privilegiado `ownerDb` se limita a migraciones, arranque, registro/resolución de grupos, configuración de claves push y actualización validada del grupo actual. No se ofrece una API pública para listar grupos. El primer administrador de un grupo no obtiene permisos sobre otros grupos ni sobre la plataforma. No puede aprobar solicitudes: esa facultad requiere el enlace privado de revisión enviado al responsable. Los tokens de revisión y activación son distintos, se guardan como hashes y no se aceptan intercambiados. La revisión se confirma por POST y una solicitud revisada no se puede reutilizar.

La misma migración separa los correos de creación de grupos de los buzones de los grupos; sus administradores no pueden consultar solicitudes de otras organizaciones. Las claves VAPID se comparten como infraestructura de plataforma; suscripciones y avisos sí están aislados por grupo. Los eventos de actualización solo avisan a ventanas de su grupo. Los trabajos periódicos recorren grupos explícitamente, con bloqueos de envío independientes.

El usuario de despliegue de Neon debe ser propietario de la base y tener permiso para crear y otorgar el rol de aplicación (`CREATEROLE` o provisión equivalente). Se ha verificado con PostgreSQL 17 y un propietario no superusuario. No uses para el servidor una cuenta compartida con otros servicios; guarda `DATABASE_URL` en Railway. Antes de desplegar, conserva una copia/branch de recuperación de Neon. Las migraciones no borran datos; no se han aplicado a producción desde este trabajo.

### Grupo inicial y enlaces antiguos

`/acceso` redirige ahora a `/g/ID/` también para el grupo inicial, conservando los parámetros de los enlaces enviados. La sesión existente sigue siendo válida; las API anteriores continúan como transporte compatible para instalaciones y colas antiguas. No registra personas desconocidas ni concede permisos por conocer esa ruta. Tras entrar, Administración encuentra el nuevo enlace en Perfil → Configurar grupo y lo comparte por los canales privados del grupo.

El cambio de dominio no mueve cookies, permisos push ni IndexedDB entre orígenes. **Sincroniza lo pendiente en el origen antiguo antes de cambiar o desinstalar la PWA.** Se conserva el acceso heredado y su API para que no queden cambios pendientes inaccesibles. Los orígenes antiguos solo se admiten como origen de solicitudes cuando el Host coincide y se trata del grupo inicial; se sigue exigiendo sesión y CSRF. Las páginas públicas y los enlaces anónimos del origen antiguo redirigen al nuevo dominio. No se reenvían formularios o credenciales mediante redirecciones de POST.

Instala de nuevo la PWA desde el enlace del grupo en `bandarlog.app` y vuelve a habilitar las notificaciones del dispositivo si lo deseas. El servidor conserva usuarios y trabajo; no se deben borrar ni importar de nuevo. Las PWAs nuevas tienen manifiesto y ámbito `/g/ID/`, cookie de sesión con ese Path, base IndexedDB y caché separados. Cambiar de grupo no reutiliza el snapshot ni la cola del anterior; sus service workers no eliminan cachés de otros grupos ni guardan páginas públicas como shell privada.

La importación CLI admite `GROUP_ID=<ID-privado>`; si se omite, mantiene el grupo inicial por compatibilidad. Para grupos nuevos, los IDs de importación se derivan también del grupo. No pongas el ID privado en scripts públicos o documentación.

## Railway y dominio

El dominio ya responde con HTTPS desde Railway. En el servicio de la aplicación, **Variables**:

```text
NODE_ENV=production
APP_URL=https://bandarlog.app
LEGACY_APP_ORIGINS=https://bandarlog-production.up.railway.app
MAIL_TRANSPORT=resend
MAIL_FROM=Bandarlog <notifications@bandarlog.app>
RESEND_API_KEY=<clave privada en Railway>
```

Conserva `DATABASE_URL`, `AUTH_CHALLENGE_SECRET` y los demás secretos existentes. Para Resend se requiere `RESEND_API_KEY` y el remitente verificado indicado; las claves `GMAIL_*` quedan como alternativa, sin usarse mientras `MAIL_TRANSPORT=resend`. Activa Resend solamente después de fusionar y desplegar el código compatible. No cambies la URL de Neon por el dominio web. No modifiques `BOOTSTRAP_EMAIL` para recrear usuarios. `.env.production.example` enumera las variables, sin valores privados. El desarrollo y las pruebas conservan sus orígenes locales y bases aisladas.

Si `APP_URL` es `https://bandarlog.app` y no se define `LEGACY_APP_ORIGINS`, se usa automáticamente el antiguo dominio de Railway. Se puede definir vacío para retirar esa compatibilidad cuando todas las instalaciones hayan migrado. No elimines el dominio antiguo antes de sincronizar las instalaciones previas.

Mantén una sola réplica y el servicio activo para ejecutar recordatorios. No cambies el plan de Railway ni contrates servicios para activar esta implementación. Cambiar de dominio no crea un buzón `@bandarlog.app`. Con Resend el remitente `notifications@bandarlog.app` puede enviar sin buzón, tras verificar el dominio; con Gmail `MAIL_FROM` debe ser una cuenta o alias autorizado.

## Google Cloud y Search Console

1. En [Search Console](https://search.google.com/search-console), añade una propiedad de tipo **Dominio** para `bandarlog.app` con la cuenta que gestiona el proyecto OAuth.
2. Google mostrará un registro **TXT** concreto. Añádelo en el panel DNS de `bandarlog.app` en Railway, sin sustituir los registros que conectan la web. El valor no se puede deducir del repositorio. Completa la verificación y espera el plazo de actualización indicado por Google (el rechazo anterior pedía 24 horas).
3. En **Google Auth Platform → Marca**, usa estas URLs, una vez que el código esté desplegado:

| Campo | Valor |
|---|---|
| Página principal de información para Google | `https://bandarlog.app/presentacion` |
| Política de privacidad | `https://bandarlog.app/privacidad` |
| Condiciones | `https://bandarlog.app/condiciones` |
| Dominio autorizado | `bandarlog.app` |

4. En el cliente web de **inicio de sesión**, si se utiliza, registra `https://bandarlog.app` como origen JavaScript y `https://bandarlog.app/api/auth/google/callback` como redirección. No añadas `/g/ID` como origen. El callback es único: el estado de OAuth resuelve el grupo en servidor y verifica navegador, nonce y token. Los permisos de inicio de sesión son `openid email profile`.
5. Si se conserva **Gmail API** como alternativa, su cliente de envío sigue siendo independiente. Solo necesita `https://www.googleapis.com/auth/gmail.send`, autorizado por la cuenta remitente de la plataforma. Los miembros de los grupos no tienen que conceder acceso a sus bandejas. Si se utiliza OAuth Playground para obtenerlo, registra su callback y activa **Use your own OAuth credentials**.
6. Corrige la marca y solicita de nuevo la revisión con las páginas públicas ya accesibles. Revisa **Público → Estado de publicación** y completa el paso a producción que Google permita o requiera. El código no puede verificar la propiedad por ti ni asegurar su aprobación.
7. Solo si se mantiene Gmail API: después de salir del estado de pruebas, autoriza Gmail otra vez y sustituye `GMAIL_REFRESH_TOKEN` en Railway. Publicar no revive un token ya caducado. Mantener el cliente de envío en Testing puede volver a caducar el refresh token a los siete días. No compartas su valor en el chat ni en GitHub.

Los cambios de variables y OAuth externos no se han realizado desde este entorno: no hay herramienta de Railway o Google conectada para administrarlos. No se han añadido registros DNS desconocidos ni inventado una verificación.

## Verificación y límites

`npm run publication:check` comprueba, sin sesión ni envíos, la presentación, privacidad, condiciones, alta, demo, sitemap, robots y healthcheck del dominio. También acepta un origen local como argumento para revisar un despliegue de pruebas. El healthcheck no confirma que Gmail siga autorizado.

Las pruebas específicas cubren solicitud, aprobación o rechazo solo con el enlace enviado al responsable, activación posterior con correo confirmado, origen de formularios, reutilización de enlaces, aislamiento entre grupos, correo compartido con roles distintos, sesiones, referencias cruzadas, datos y métricas, migración conservando IDs y funcionamiento de la PWA por grupo. El escenario real de correos requiere una comprobación autorizada con la cuenta remitente después de actualizar Google. La prueba local PostgreSQL se ejecuta con `TEST_POSTGRES_URL` apuntando exclusivamente a una base de pruebas local dedicada; sin ella se omite de la suite normal.

La demo no genera facturas ni pagos. No hay soporte de facturación real, alta en tiendas de aplicaciones o aprobación automática de Google. El resultado es una PWA instalable y la web pública necesaria para presentar el servicio.

La normalización actual de rutas, recuperación de colas y límites de compatibilidad se detalla en [rendimiento y navegación canónica](mobile-performance-navigation.md). No se modifican IDs ni historiales.
