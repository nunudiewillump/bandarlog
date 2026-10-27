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

Solicita acceso con `alex@example.test` (administración) o `laura@example.test` (miembro, coordinadora de las comisiones demostrativas). Pulsa **Bandeja de desarrollo**, **Abrir enlace de prueba** y confirma el inicio de sesión. Los enlaces caducan a los 15 minutos, son de un solo uso y no autentican por GET. La bandeja local expone mensajes deliberadamente y nunca existe en producción. No utilices datos personales reales en desarrollo.

## Comprobaciones

```sh
npm run build     # TypeScript y compilación
npm test          # API e importación, bases aisladas temporales
npm run test:e2e  # servidores aislados 3100/5174 y recorridos Chromium
```

Playwright usa `/usr/bin/chromium` en este entorno; para otro equipo, ajusta `executablePath` o instala los navegadores de Playwright. Las capturas de las pantallas están en `artifacts/`. Ninguna prueba envía mensajes externos. Los ensayos del navegador usan `.data/e2e`, separada de la base de desarrollo.

## Producción: Railway y Neon

`railway.toml` contiene build, arranque y healthcheck. `npm start` ejecuta migraciones y sirve la API y `dist` desde un solo proceso. Configura en Railway:

| Variable | Uso |
|---|---|
| `NODE_ENV=production` | Impide usar datos demo, PGlite y bandeja local |
| `APP_URL` | Origen público HTTPS, sin rutas; usado por correos y validación de origen |
| `DATABASE_URL` | URL PostgreSQL de Neon con verificación TLS (`sslmode=verify-full`) |
| `BOOTSTRAP_EMAIL` | Primer administrador; solo se usa si no hay usuarios |
| `SMTP_HOST`, `SMTP_PORT` | Servidor de correo: 587 con STARTTLS obligatorio, o 465 con TLS |
| `SMTP_USER`, `SMTP_PASS` | Autenticación del proveedor; contraseña guardada como secreto |
| `MAIL_FROM` | Nombre y correo de remitente autorizado |
| `PORT` | Railway lo proporciona |

No se ha desplegado en Railway ni validado una conexión real a Neon o SMTP. Conserva copias de seguridad de la base. Ejecuta una sola réplica inicialmente; la limitación de intentos de acceso reside en memoria del proceso. Para varias réplicas se necesita un almacén compartido para esa limitación. El administrador inicial puede crear proyectos, gestionar comisiones y designar roles globales desde Personas; no puede retirar su propio rol. Un coordinador de comisión tiene permisos locales, sin acceder a proyectos ajenos.

## Correo del grupo

Remitente previsto: **Bandarlog <scoutsrosalesdelcanal@gmail.com>**.

Para Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=scoutsrosalesdelcanal@gmail.com`, `MAIL_FROM=Bandarlog <scoutsrosalesdelcanal@gmail.com>`. Activa verificación en dos pasos en Google y crea una contraseña de aplicación para `SMTP_PASS`; no uses la contraseña habitual ni la incluyas en Git, chat o capturas. La disponibilidad de contraseñas de aplicación depende de las políticas de la cuenta. Configúrala en los secretos/variables privadas del alojamiento. El alojamiento debe permitir conexiones SMTP salientes; ciertos planes pueden restringirlas. No se ha comprobado el acceso a esa cuenta ni se ha enviado correo desde ella.

El proceso comprueba vencimientos cada minuto y genera el resumen por proyecto una vez por semana (a partir del lunes, en la primera ejecución disponible). Las fechas se presentan en Europe/Madrid y las fechas límite se guardan como instantes UTC. Los formularios indican cuando usan la zona horaria del dispositivo. Los eventos tienen claves de deduplicación; cada mensaje se reclama antes de enviarse, con un máximo de cinco intentos y Message-ID estable. Una caída durante un envío puede dejar un mensaje en `sending`: requiere revisión del registro antes de reenviarlo, porque SMTP no garantiza exactamente un envío ante respuestas ambiguas. Sin SMTP los mensajes quedan en `preview`, no se consideran enviados ni se mandan automáticamente al configurar después un proveedor.

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
