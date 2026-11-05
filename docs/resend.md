# Correo transaccional con Resend

Resend utiliza HTTPS y funciona en Railway Free, Trial y Hobby. Sustituye el transporte de envío; conserva los usuarios, grupos, avisos, preferencias y plantillas Forest Experience. El inicio de sesión con Google es independiente.

## Dominio y permisos

Dominio elegido: **bandarlog.app**, sin subdominio de remitente. Remitente previsto: **Bandarlog <notifications@bandarlog.app>**. No se necesita un buzón para enviar desde esa dirección. Resend no recibe respuestas: configura `MAIL_REPLY_TO` con un buzón que controles si quieres recibirlas.

La preparación sigue [la guía oficial](https://resend.com/setup.md): acceso de configuración privado, dominio, DNS aprobado, plantilla publicada y clave de aplicación restringida. No pegues claves en el chat ni las incluyas en GitHub.

1. Autoriza Resend mediante su MCP OAuth o configura una clave de acceso completo **Agent setup** únicamente en el entorno privado del operador como `RESEND_API_KEY`. Esa clave no va a Railway. En el entorno de Codex, el campo privado de configuración se llama `RESEND_SETUP_API_KEY` y se vincula a `RESEND_API_KEY` solo para `api.resend.com`; guardar un borrador no lo activa: hay que publicar la configuración del entorno.
2. Ejecuta `npm run mail:setup -- domain`. Reutiliza un dominio existente o crea el elegido en **eu-west-1**, con seguimiento de aperturas/clics y recepción desactivados. La región de un dominio creado no se puede cambiar. El comando muestra los registros reales que Resend exige; **no escribe DNS**. Revisa y aprueba los registros antes de añadirlos en el proveedor DNS del dominio. No sustituyas los MX de recepción del dominio principal ni crees un segundo SPF en un mismo nombre. Conserva un DMARC existente.
3. Ejecuta `npm run mail:setup -- verify` y después `npm run mail:setup -- status` hasta que el dominio esté `verified`. La propagación puede tardar. `verify` solicita una comprobación a Resend, no modifica los registros DNS.
4. Ejecuta `npm run mail:setup -- template`. Publica la plantilla **bandarlog-transactional-v1** si no existe y comprueba sus 50 variables exactas. La aplicación no necesita permisos de administración de plantillas. El diseño compartido se aloja en Resend; el contenido dinámico se divide en bloques para respetar el límite de 2.000 caracteres por variable, sin truncarlo. No cambies los nombres ni el número de variables. La plantilla es opcional durante la transición: sin `RESEND_TEMPLATE_ID`, los despliegues existentes siguen enviando su HTML sin requerir esta preparación. El generador local se conserva para Gmail, SMTP, previsualización y futuras revisiones del diseño.
5. Con el dominio verificado, ejecuta una sola vez `npm run mail:setup -- app-key`. Crea una clave **sending_access** limitada a ese dominio. Guarda su valor en un archivo temporal fuera del repositorio, en una carpeta privada y con permisos `0600`; muestra únicamente su ID y la ruta privada. Introduce el valor mediante el panel privado de Railway y elimina el archivo temporal. Si no se puede guardar, el comando revoca la clave recién creada. Conserva el ID para revocarla cuando corresponda. El comando no despliega ni cambia la configuración de Railway.

Los comandos usan `RESEND_DOMAIN=bandarlog.app` y `APP_URL=https://bandarlog.app` por defecto. Si se cambia el dominio, hay que revisar también el remitente. No ejecutes `app-key` repetidamente: cada ejecución crea una clave nueva. Elimina la clave Agent setup al terminar si ya no es necesaria.

## Variables de Railway

Estas son todas las variables del transporte Resend; los secretos de sesión y base de datos existentes se mantienen:

| Variable             | Valor                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `MAIL_TRANSPORT`     | `resend`                                                                 |
| `MAIL_FROM`          | `Bandarlog <notifications@bandarlog.app>`                                |
| `RESEND_API_KEY`     | Clave privada de **solo envío**, restringida a `bandarlog.app`           |
| `RESEND_TEMPLATE_ID` | Opcional, después de publicarla: ID o alias `bandarlog-transactional-v1` |
| `MAIL_REPLY_TO`      | Opcional: buzón real para respuestas                                     |
| `APP_URL`            | `https://bandarlog.app`                                                  |

También se requieren `NODE_ENV=production`, `DATABASE_URL` y `AUTH_CHALLENGE_SECRET`, ya utilizados por la aplicación. `BOOTSTRAP_EMAIL` solo se usa en una base nueva. No alteres los datos de Neon ni regeneres el secreto de sesión durante este cambio. Los `GMAIL_*` y `SMTP_*` no son necesarios con Resend. `GOOGLE_LOGIN_CLIENT_ID` y `GOOGLE_LOGIN_CLIENT_SECRET`, si están habilitados, se conservan para iniciar sesión. Tener únicamente `RESEND_API_KEY` nunca activa el envío automáticamente.

## Validación y funcionamiento

Después de autorizar el despliegue y configurar las variables:

- Comprueba `/api/health`: `mail: resend` confirma el transporte, **no la entrega**.
- Solicita un código de acceso desde Bandarlog con tu propia cuenta autorizada. Comprueba el mensaje en tu buzón y el estado **delivered** en Resend. Revisa que las variables estén resueltas y las imágenes se carguen. Prueba también una invitación y un aviso de tarea con destinatarios propios o de prueba.
- Con un mensaje de prueba, repetir el mismo envío con la misma clave de idempotencia dentro de 24 horas debe devolver el mismo ID. Las pruebas automatizadas comprueban el uso del SDK y las claves con un servidor local simulado; no certifican esta deduplicación ni la entrega real de Resend.
- Los registros del servidor contienen únicamente evento, proveedor, ID de mensaje o estado HTTP; no incluyen cuerpos, destinatarios ni claves. En la base, `provider_message_id` permite localizar el mensaje en Resend. `sent` significa **aceptado**, no necesariamente entregado al buzón. Consulta allí bloqueos, rebotes y cuota disponible. No se añaden webhooks ni campañas.

La migración añade únicamente columnas anulables de seguimiento a las dos colas existentes. No convierte correos `preview` en envíos. Los mensajes antiguos conservan su HTML; los nuevos usan la plantilla publicada si se configura. Sin ella se mantiene el envío HTML. Los mensajes excepcionalmente grandes usan su HTML completo directamente para no perder contenido.

Cada fila conserva una clave de idempotencia estable. Se reintentan fallos de red, HTTP 429 y 5xx con espera exponencial (base 15 segundos), respetando `Retry-After`, hasta cinco intentos. El procesador periódico revisa la cola cada minuto, así que la espera efectiva puede ser mayor. Los demás errores 4xx se detienen; un conflicto temporal de solicitudes idempotentes concurrentes también puede reintentarse. Un error definitivo se revisa en Resend antes de generar otro acceso. El plazo de los códigos de acceso permanece en diez minutos.

Una caída del proceso puede dejar una fila en `sending`, como con los transportes anteriores. Antes de recuperarla, verifica el estado del proveedor y la antigüedad: Resend conserva la deduplicación 24 horas. No se reenvía automáticamente una fila antigua ni se garantiza exactamente un envío después de ese plazo. Las cuotas y límites del plan de Resend siguen aplicando; no se contratan servicios de pago automáticamente.

Pruebas relevantes: `node --import tsx --test tests/resend.test.ts tests/resend-api.test.ts tests/mail.test.ts tests/config.test.ts`. Son aisladas y no envían correo real. Las páginas públicas informan del proveedor de correo; no se añaden estadísticas externas.
