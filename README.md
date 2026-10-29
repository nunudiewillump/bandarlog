# Bandarlog

PWA de comisiones y seguimiento de tareas de un grupo scout. React + TypeScript + Vite, API Express, Drizzle y PostgreSQL. Cada instalación representa un único grupo; los miembros solo acceden a sus comisiones, y administración/coordinación supervisan el grupo completo.

## Desarrollo

Node 24 (`.node-version`).

```sh
npm ci --cache /workspace/.npm-cache
npm run dev       # API en 3001, migraciones automáticas y datos demostrativos
npm run dev:web   # otra terminal: interfaz Vite en 5173
```

Sin `DATABASE_URL`, PGlite ejecuta PostgreSQL y guarda los datos en `.data/db`. No hay datos reales ni conexión a Google Sheets. Los proyectos y tareas de demostración se crean solo en bases de desarrollo vacías, en una transacción.

Solicita acceso con `alex@example.test` (administración) o `laura@example.test` (Scouter a nivel de grupo y Responsable de las comisiones demostrativas). Pulsa **Recibir código**, abre **Bandeja de desarrollo → Actualizar correos de prueba** e introduce el código de seis cifras en Bandarlog. Los códigos caducan a los diez minutos y admiten cinco intentos. Los enlaces anteriores siguen funcionando: caducan a los quince minutos, son de un solo uso y no autentican por GET. La bandeja local expone mensajes deliberadamente y nunca existe en producción. No utilices datos personales reales en desarrollo.

## Comprobaciones

```sh
npm run build     # TypeScript y compilación
npm test          # API e importación, bases aisladas temporales
npm run test:e2e  # servidores aislados 3100/5174 y recorridos Chromium
```

Playwright usa `/usr/bin/chromium` en este entorno; para otro equipo, ajusta `executablePath` o instala los navegadores de Playwright. Las capturas de las pantallas están en `artifacts/`. Ninguna prueba envía mensajes externos. Los ensayos del navegador usan `.data/e2e`, separada de la base de desarrollo.

## Producción: Railway y Neon

Pasos de configuración: [Despliegue en Neon y Railway](docs/despliegue.md). Railway Free, Trial y Hobby no admiten SMTP; para mantener un remitente Gmail utiliza `MAIL_TRANSPORT=gmail_api`.

`railway.toml` contiene build, arranque y healthcheck. `npm start` ejecuta migraciones y sirve la API y `dist` desde un solo proceso. Configura en Railway:

| Variable | Uso |
|---|---|
| `NODE_ENV=production` | Impide usar datos demo, PGlite y bandeja local |
| `APP_URL` | Origen público HTTPS, sin rutas; usado por correos y validación de origen |
| `DATABASE_URL` | URL PostgreSQL de Neon con verificación TLS (`sslmode=verify-full`) |
| `BOOTSTRAP_EMAIL` | Primer administrador; solo se usa si no hay usuarios |
| `AUTH_CHALLENGE_SECRET` | **Obligatorio nuevo:** secreto privado estable y aleatorio de al menos 32 caracteres para verificar códigos |
| `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET` | Opcionales y conjuntos; cliente web independiente para iniciar sesión con Google |
| `MAIL_TRANSPORT` | `gmail_api` para Gmail por HTTPS; `smtp` solo si el alojamiento lo permite |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Credenciales OAuth privadas si se usa Gmail API |
| `SMTP_HOST`, `SMTP_PORT` | Servidor de correo: 587 con STARTTLS obligatorio, o 465 con TLS |
| `SMTP_USER`, `SMTP_PASS` | Autenticación del proveedor; contraseña guardada como secreto |
| `MAIL_FROM` | Nombre y correo de remitente autorizado |
| `PORT` | Railway lo proporciona |

Las pruebas de este cambio son locales y aisladas; no validan la configuración externa concreta de Google, Neon o del proveedor de correo. Conserva copias de seguridad de la base. Ejecuta una sola réplica inicialmente; la limitación de intentos de acceso reside en memoria del proceso. Para varias réplicas se necesita un almacén compartido para esa limitación. El administrador inicial puede crear proyectos, gestionar comisiones y designar roles globales desde Personas; no puede retirar su propio rol. Un Responsable de comisión tiene permisos locales, sin acceder a comisiones ajenas.

## Correo del grupo

Remitente previsto: **Bandarlog <XXXX@correodegrupo.com>**.

Para Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=grupo@example.org`, `MAIL_FROM=Bandarlog <grupo@example.org>`. Activa verificación en dos pasos en Google y crea una contraseña de aplicación para `SMTP_PASS`; no uses la contraseña habitual ni la incluyas en Git, chat o capturas. La disponibilidad de contraseñas de aplicación depende de las políticas de la cuenta. Configúrala en los secretos/variables privadas del alojamiento. Railway solo permite SMTP en el plan Pro o superior. En Free, Trial y Hobby hay que usar `MAIL_TRANSPORT=gmail_api` con OAuth; una contraseña de aplicación no sirve para la API. No se ha comprobado el acceso a esa cuenta ni se ha enviado correo desde ella.

El proceso comprueba vencimientos cada minuto y genera el resumen por proyecto una vez por semana (a partir del lunes, en la primera ejecución disponible). La API de Gmail compone mensajes MIME y renueva el token OAuth mediante HTTPS; nunca consulta la bandeja de entrada. Las fechas se presentan en Europe/Madrid y las fechas límite se guardan como instantes UTC. Los formularios indican cuando usan la zona horaria del dispositivo. Los eventos tienen claves de deduplicación; cada mensaje se reclama antes de enviarse, con un máximo de cinco intentos y Message-ID estable. Una caída durante un envío puede dejar un mensaje en `sending`: requiere revisión del registro antes de reenviarlo, porque SMTP no garantiza exactamente un envío ante respuestas ambiguas. Sin SMTP los mensajes quedan en `preview`, no se consideran enviados ni se mandan automáticamente al configurar después un proveedor.

Los correos de tarea incluyen enlaces con contexto. Abrirlos no modifica datos: se requiere sesión, permiso y confirmación por POST/PATCH. La autenticación conserva la tarea y acción solicitadas. Preferencias de avisos y resumen en Perfil.

## Importación desde el sistema anterior

Prepara un archivo JSON normalizado a partir de una exportación autorizada de las hojas. Se importan usuarios, proyectos, comisiones, membresías y tareas. No se conecta al sistema anterior ni modifica sus hojas.

```sh
npm run import -- examples/import.json          # simulación sin escrituras de registros
npm run import -- examples/import.json --apply  # importar explícitamente a la BD seleccionada
```

`examples/import.json` documenta el formato. Usa identificadores de origen estables y referencias explícitas; no se adivinan usuarios ni estados. Los cuatro estados son `pending`, `in_progress`, `blocked` y `done`. Las tareas terminadas requieren autor y fecha de finalización; las bloqueadas, un motivo. Fechas ISO con desplazamiento horario. El informe señala referencias incompletas y conflictos. La importación es transaccional e idempotente para el mismo contenido; no sobrescribe cambios posteriores. No envía notificaciones al importar. El adaptador automático de columnas específicas de Google Sheets y la importación de su historial de observaciones quedan pendientes de una exportación real y su esquema.

## Seguridad y alcance

Sesión HttpOnly, Secure en producción y SameSite; tokens almacenados como hash, expiración, CSRF y comprobación de origen. Autorización en cada operación y aislamiento de lecturas por membresía. Responsables obligatorios, membresías y finalización protegidos también por restricciones y triggers diferidos de PostgreSQL. Reasignación y cambios de membresía transaccionales. La retirada de miembros exige reasignar antes todas sus tareas para conservar la integridad.

El service worker cachea recursos estáticos y una página de desconexión; no guarda respuestas privadas de la API ni simula escrituras sin conexión. Manifest e iconos de 192/512 px incluidos. La instalación en dispositivos reales requiere servir mediante HTTPS; no se ha probado en iPhone físico ni se certifica todavía el cumplimiento completo WCAG 2.2 AA. Se han preparado foco visible, formularios etiquetados, teclado, diálogo con foco contenido y movimiento reducido.

Los avatares usan iniciales. Las mascotas son recursos propios; el mockup es la referencia de composición y colores, con adaptaciones al contenido real. No hay inventario, chat, gamificación ni conexión con servicios ajenos al alcance.

## Personas, invitaciones y roles

Desde **Personas → Invitar personas**, Coordinación y Administración pueden enviar invitaciones al grupo o a una comisión, introduciendo un correo o una lista separada por comas, punto y coma o saltos de línea (hasta 100 direcciones únicas por envío). Los Responsables invitan únicamente a las comisiones que gestionan. Se muestran las direcciones preparadas y las omitidas por duplicidad o por tener ya acceso. El primer correo permite aceptar la invitación y entrar con el correo invitado, sin solicitar otro enlace. Caduca a los siete días y deja de servir al revocarse o utilizarse. Una invitación al grupo no da acceso a ninguna comisión hasta que se añada a la persona a ella.

| Rol | Alcance y permisos |
|---|---|
| Scouter | Ve todas las tareas de sus comisiones; cambia estados y comenta solo las que tiene asignadas. |
| Responsable | Dentro de su comisión crea tareas, reasigna personas, ajusta fechas, comenta, cambia cualquier estado y elimina tareas. Tiene un panel con progreso, bloqueos y vencimientos filtrables. |
| Coordinación | Acceso global por encima de proyectos y comisiones; gestiona proyectos, comisiones, personas e invitaciones. |
| Administración | Incluye Coordinación y permite gestionar los roles globales. |

La eliminación de una tarea la retira de listados, métricas y recordatorios, pero conserva su historial, autor y fecha de eliminación. La migración convierte las membresías anteriores a Scouter/Responsable sin recrear personas ni perder las invitaciones pendientes. Para compatibilidad, las entradas de importación y la API siguen admitiendo los nombres técnicos anteriores de rol.

Los correos de acceso, invitaciones, tareas, actualizaciones, recordatorios y resúmenes comparten una plantilla HTML de Bandarlog: marca, crema, verde bosque, tarjetas y botones. Conservan una alternativa de texto. Los enlaces contextuales requieren autenticación y confirmación; no cambian una tarea mediante GET. Puedes previsualizarlos desde Ajustes en desarrollo. Las capturas `artifacts/correo-tarea.png` y `artifacts/correo-invitacion.png` documentan el diseño; la compatibilidad visual con clientes reales de correo requiere comprobarla tras configurar el proveedor.

## Perfil, avisos e ilustraciones

Cada persona puede editar nombre y foto en Perfil. El editor permite mover y ampliar el recorte circular, acepta originales de hasta 30 MB y comprime el resultado antes de enviarlo. La foto se guarda directamente sin modificar el nombre ni los avisos. Las fotos se normalizan a WebP; se guardan en PostgreSQL, sin depender del disco efímero de Railway. Los avisos de tareas se pueden configurar por persona. Por defecto: creación/asignación, siete y tres días antes, vencimiento y un aviso semanal mientras permanezca vencida; también se pueden activar o desactivar las actualizaciones. El calendario de avisos previos usa los días de Europe/Madrid y los eventos tienen claves por persona, tarea y fecha para evitar duplicados. No se envían avisos de tareas terminadas, eliminadas ni de proyectos archivados.

Las invitaciones abiertas desde una comisión o proyecto fijan ese destino. Una invitación al proyecto añade a su lista de personas y no concede automáticamente acceso a todas sus comisiones. Los selectores, radios, barras de desplazamiento y estados de carga comparten el estilo de la interfaz. La animación de tarea completada respeta la preferencia de movimiento reducido y solo aparece tras confirmar el guardado.

Las comisiones reciben automáticamente los iconos del catálogo local: 302 scouts y 36 adicionales de Navidad. Se conservan sus IDs y las asociaciones por nombre/proyecto. «Campamento de Navidad» activa la colección estacional sin cambiar los nombres normales de las comisiones. Los nombres asociados bloquean «Elegir icono»; para los demás se puede elegir un icono o volver a automático. Coordinación puede ampliar el catálogo subiendo un icono, guardado en la base de datos.

La interfaz Forest Experience retira los monos 3D estáticos. Conserva el pequeño mono 2D del logotipo y usa una nueva ilustración 2D para la liana al completar tareas. Los originales del catálogo se conservan por compatibilidad, pero no se cargan en las vistas ni en el selector. No se necesita Colab, trabajador IA, túneles ni credenciales de generación en producción. `ARTWORK_WORKER_URL` y `ARTWORK_WORKER_TOKEN` siguen sin utilizarse.

Para ampliar las colecciones incluidas por código, añade entradas a `shared/scout-catalog.ts`, sus ilustraciones y sus iconos. Los identificadores existentes y sus posiciones en las hojas deben mantenerse estables. Los archivos de `public/artwork/mascots` contienen hojas de seis ilustraciones originales y parejas adicionales en archivos individuales. Se conservan como fuentes históricas; no se muestran en la interfaz actual. No son poses recoloreadas.

La [revisión móvil y del acceso](docs/revision-movil-y-acceso.md) documenta las invitaciones directas, la corrección del error de lectura de JPEG y las capturas con tareas activas, todo al día y cuentas sin contenido.

## Forest Experience y acceso

El móvil usa copa de árbol, listas continuas, iconos originales y cuatro destinos estables. Se mantienen Smart Focus, permisos, completar/Deshacer y la experiencia operativa desktop. El primer acceso de las cuentas nuevas pide nombre obligatorio y foto opcional; se registra en servidor y no vuelve a mostrarse. La migración respeta perfiles e invitaciones anteriores.

El acceso por código permanece dentro de la PWA. La sesión local admite hasta treinta días de inactividad y noventa días absolutos, con renovación controlada y revocación al cerrar sesión. Google es opcional, se prepara mediante OIDC verificado en backend y no usa las credenciales de Gmail. Configuración y límites de prueba: [Forest Experience implementado](docs/forest-experience/implementacion.md).

## Forest en desktop y móvil

Inicio prioriza tareas según el rol; las comisiones se agrupan por proyecto y el panel de Responsable es compacto. La copa botánica comparte las hojas de la caída ocasional, responde al cursor y se puede ocultar en Perfil → Preferencias → Mostrar copa y hojas. La elección se guarda para la cuenta.

Perfil abre como información personal y del grupo Rosales del Canal 702; Editar perfil activa el formulario. Los avisos se configuran por separado. La PWA usa #103b2d en su tema y zona superior segura. Esta versión no necesita variables ni migraciones adicionales. Evidencia y límites: [implementación desktop](docs/forest-desktop/implementacion.md).
