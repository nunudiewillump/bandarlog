import express from 'express';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { publicInfo, publicPaths } from '../shared/public-info.js';
import { BananaArtwork } from '../src/BananaLoader.js';
import { leafPaths } from '../shared/forest-art.js';
import { escapeHtml as esc } from './mail-template.js';

const icon = (component: LucideIcon) =>
  renderToStaticMarkup(createElement(component, { size: 22, 'aria-hidden': true }));
const contact = `<a href="mailto:${publicInfo.contact}">${publicInfo.contact}</a>`;
/** The public forest reuses the application's exact beech/oak silhouettes and veins. */
function botanicalLeaf(shape: 'oak' | 'beech', fill: string, vein = '#88a56e') {
  return `<path d="${leafPaths[shape]}" fill="${fill}"/><path d="M0 0Q3-40 5-76C18-65 27-47 20-29C15-14 6-5 0 0Z" fill="${vein}" opacity=".2"/><path d="${shape === 'oak' ? 'M0 0Q3-40 5-76M2-18L-13-27M3-32L20-42M4-45L-15-54M4-58L16-66' : 'M0 0Q-3-43-3-76M-1-20L-17-33M-2-34L16-46M-3-49L-17-59M-3-59L9-69'}" stroke="${vein}" stroke-width="1.1" fill="none" opacity=".4"/>`;
}
function canopy(landing = false) {
  if (!landing) {
    const leaves = [0, 1, 2]
      .map((depth) =>
        Array.from(
          { length: 22 },
          (_, i) =>
            `<g transform="translate(${i * 70 - 15 + depth * 23} ${-12 + depth * 4}) rotate(${135 + (i % 4) * 27}) scale(${0.7 + depth * 0.14})"><path d="${i % 3 ? leafPaths.beech : leafPaths.oak}" fill="${['#18462f', '#245739', '#326b44'][depth]}"/><path d="M0 0Q3-40 5-76" stroke="#88a56e" stroke-width="1.3" fill="none" opacity=".4"/></g>`,
        ).join(''),
      )
      .join('');
    return `<svg class="public-canopy" viewBox="0 0 1440 130" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${leaves}</svg>`;
  }
  const layers = [0, 1, 2, 3]
    .map((depth) => {
      const clusters = Array.from({ length: 28 }, (_, i) => {
        const x = i * 55 - 30 + depth * 14;
        const y = -17 + depth * 17 + Math.sin(i * 1.7) * 9;
        const leaves = [127, 183, 234]
          .map(
            (angle, j) =>
              `<g transform="translate(${(j - 1) * 8} ${(j % 2) * 4}) rotate(${angle + Math.sin(i * 2.4 + j) * 14}) scale(${0.85 + depth * 0.06 + Math.sin(i + j) * 0.14})">${botanicalLeaf((i + j) % 3 ? 'beech' : 'oak', ['#163f2c', '#245739', '#2b6642', '#3c724a'][depth])}</g>`,
          )
          .join('');
        return `<g transform="translate(${x} ${y})"><g class="public-canopy-twig public-canopy-twig-${i % 4}">${leaves}</g></g>`;
      }).join('');
      return `<g class="public-canopy-plane public-canopy-plane-${depth}">${clusters}</g>`;
    })
    .join('');
  const corners = [-1, 1]
    .map((side) => {
      const leaves = Array.from(
        { length: 7 },
        (_, i) =>
          `<g transform="translate(${i * 36 - 12} ${145 - i * 24}) rotate(${135 + (i % 3) * 32}) scale(${1.18 - i * 0.045})">${botanicalLeaf(i % 2 ? 'beech' : 'oak', i % 2 ? '#2b6642' : '#275d3d')}</g>`,
      ).join('');
      return `<g transform="${side < 0 ? '' : 'translate(1440 0) scale(-1 1)'}"><g class="public-canopy-corner"><path d="M-40 190Q75 52 270-16" fill="none" stroke="#234330" stroke-width="11" stroke-linecap="round"/><path d="M-40 190Q75 52 270-16" fill="none" stroke="#80935b" stroke-opacity=".28" stroke-width="2"/>${leaves}</g></g>`;
    })
    .join('');
  // Small woodland flowers and acorns use the same flat botanical language.
  const flowers = [165, 1260]
    .map(
      (x) =>
        `<g class="public-canopy-flower" transform="translate(${x} 94)"><path d="M0 0Q4-18 16-27" fill="none" stroke="#88a56e" stroke-width="2"/>${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-7" rx="4.5" ry="8" transform="rotate(${r})" fill="#eedcc9"/>`).join('')}<circle r="4" fill="#dba64d"/></g>`,
    )
    .join('');
  const acorns = [73, 1353]
    .map(
      (x) =>
        `<g transform="translate(${x} 135) rotate(-18)"><path d="M0-20Q3-28 7-31" fill="none" stroke="#7e8c58" stroke-width="2"/><path d="M-9-12Q-12 8 0 14Q12 8 9-12Z" fill="#ba8748"/><path d="M-12-12Q0-28 12-12L12-7Q0-12-12-7Z" fill="#6e7040"/><path d="M-4-4Q-6 4-1 8" fill="none" stroke="#dfb879" stroke-width="2"/></g>`,
    )
    .join('');
  return `<svg class="public-canopy ${landing ? 'public-canopy-full' : ''}" viewBox="0 0 1440 ${landing ? '270' : '130'}" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">${layers}${landing ? corners + flowers + acorns : ''}</svg>`;
}
function shell(title: string, path: string, body: string, appUrl: string, description: string) {
  const origin = esc(appUrl);
  const landing = path === '/';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#103b2d"><meta name="description" content="${esc(description)}"><link rel="canonical" href="${origin}${path}"><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="/public-site.css"><title>${esc(title)} · Bandarlog</title></head><body class="public-site${landing ? ' public-landing' : ''}"><a class="public-skip" href="#contenido">Saltar al contenido</a><header class="public-header">${canopy(landing)}<nav aria-label="Principal"><a class="public-brand" href="/"><img src="/brand-mark.webp" alt="" width="36" height="36">Bandarlog</a><a class="public-enter" href="/entrar">Entrar ${icon(ArrowRight)}</a></nav></header>${body}${landing ? '<script src="/landing-motion.js" defer></script>' : ''}<footer class="public-footer"><a class="public-brand" href="/"><img src="/brand-mark.webp" alt="" width="26" height="26">Bandarlog</a><nav aria-label="Información pública"><a href="/presentacion">Sobre Bandarlog</a><a href="/privacidad">Privacidad</a><a href="/condiciones">Condiciones de uso</a><a href="/crear-grupo">Solicitar un grupo</a><a href="/privacidad#contacto">Contacto</a></nav></footer></body></html>`;
}
const introduction = `Bandarlog es una aplicación de coordinación para equipos scouts. Reúne proyectos, comisiones y tareas para que cada persona sepa qué tiene que hacer y el equipo pueda seguir su avance.`;
function home() {
  const falling = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `<span class="public-falling public-falling-${i}" aria-hidden="true">${i === 4 ? renderToStaticMarkup(createElement(BananaArtwork), { identifierPrefix: 'public-banana-' + i }) : `<svg viewBox="-40 -100 90 115">${botanicalLeaf(i % 2 ? 'beech' : 'oak', i % 2 ? '#326b44' : '#527443')}</svg>`}</span>`,
    )
    .join('');
  const monkey = `<picture><source media="(prefers-reduced-motion: reduce)" srcset="/landing/arms-v2/monkey-keyboard-poster.webp"><img class="public-monkey-animation" src="/landing/arms-v2/monkey-keyboard-poster.webp" data-animation-mobile="/landing/arms-v2/monkey-keyboard-animated-480.webp" data-animation="/landing/arms-v2/monkey-keyboard-animated-768.webp" data-poster="/landing/arms-v2/monkey-keyboard-poster.webp" alt="" width="768" height="768" decoding="async" fetchpriority="high"></picture>`;
  return `<main id="contenido" class="public-forest-home"><section class="public-forest-hero" aria-labelledby="public-home-title"><svg class="public-forest-clearing" viewBox="0 0 1440 280" preserveAspectRatio="none" aria-hidden="true"><path d="M0 80Q240-40 590 110T1440 170V280H0Z" fill="#e8ebd9"/><path d="M0 155Q220 70 520 165T1440 210V280H0Z" fill="#f0eddb"/></svg><div class="public-keyboard-scene" role="img" aria-label="El mono Bandarlog organiza el grupo desde su teclado, con su pañoleta rosa y morada.">${monkey}</div><div class="public-forest-copy"><h1 id="public-home-title">Menos lío.<br><span>Más grupo.<svg class="public-title-stroke" viewBox="0 0 520 25" preserveAspectRatio="none" aria-hidden="true"><path d="M6 14Q200-2 512 9L501 20Q245 10 8 23Z" fill="#e7b548"/></svg></span></h1><p>Proyectos, comisiones y tareas scout.</p><a class="public-primary" href="/entrar">Entrar a mi grupo ${icon(ArrowRight)}</a><a class="public-forest-about" href="/presentacion">Conoce Bandarlog ${icon(ArrowRight)}</a></div><div class="public-falling-stage" aria-hidden="true">${falling}</div></section></main>`;
}
function privacy() {
  return `<main id="contenido" class="public-reading"><a class="public-back" href="/presentacion">← Sobre Bandarlog</a><h1>Política de privacidad</h1><p class="public-updated">Actualizada el ${publicInfo.updated}</p><p>Esta política explica el tratamiento de datos en Bandarlog, una herramienta de coordinación para equipos scouts disponible en ${publicInfo.origin}.</p><h2 id="contacto">1. Responsable y contacto</h2><p>El responsable de este servicio es <strong>${esc(publicInfo.responsible)}</strong>. Para consultas, solicitudes sobre tus datos o incidencias de privacidad, escribe a ${contact}.</p><h2>2. Qué datos tratamos</h2><ul><li>Tu nombre, correo electrónico, foto de perfil opcional y preferencias de avisos y apariencia.</li><li>Las invitaciones, roles, pertenencia a proyectos y comisiones, tareas y asignaciones, fechas, pasos de checklist y actualizaciones que se publiquen en ellas. Conservamos el historial de cambios y de finalización.</li><li>Datos de autenticación y seguridad: sesiones, verificadores de códigos y enlaces de acceso, caducidades y controles de reintentos. Los códigos y tokens de acceso se guardan como verificadores criptográficos.</li><li>Datos operativos de los correos: destinatario, asunto, contenido, intentos y estado del envío. Si activas notificaciones del dispositivo, el identificador de suscripción y sus claves técnicas.</li><li>El estado de «Tu primera misión» y sus hitos de uso, sin guardar el texto escrito en esa práctica. Administración consulta estadísticas agregadas del tutorial.</li><li>Información técnica necesaria para servir la web y protegerla, que puede incluir dirección IP, navegador y registros de acceso en la infraestructura de alojamiento.</li></ul><h2>3. Para qué y con qué base</h2><p>Utilizamos estos datos para prestar el servicio que solicitas al aceptar una invitación y entrar en Bandarlog: organizar el trabajo, mostrarlo a las personas autorizadas y comunicar accesos y novedades (artículo 6.1.b del RGPD). La protección del servicio, la trazabilidad y la mejora de la ayuda inicial se apoyan en el interés legítimo de mantener una coordinación segura y usable (artículo 6.1.f).</p><p>La foto y los avisos opcionales se facilitan o activan voluntariamente (artículo 6.1.a). Puedes retirar la foto o modificar los avisos desde tu perfil; las notificaciones del dispositivo requieren además el permiso del navegador. Los mensajes imprescindibles de acceso e invitación permiten prestar el servicio.</p><h2>4. Grupos y acceso por el equipo</h2><p>Cada grupo tiene un identificador privado y datos separados de los demás. El ID identifica el espacio, pero no sustituye la autenticación ni los permisos. Para solicitar un grupo tratamos nombre, correo y colores de pañoleta. La solicitud requiere la aprobación expresa del responsable de Bandarlog. Solo después se envía un enlace al solicitante para verificar su correo y activar el grupo gratuito. El administrador del grupo debe informar a su equipo y disponer de una base válida para los datos que incorpora.</p><p>Los datos de trabajo se muestran según los permisos: Scouters en sus comisiones, Responsables en las comisiones que gestionan y Coordinación y Administración en su ámbito global. Las personas con acceso pueden ver la identidad de los participantes y el historial que corresponda. No se venden datos ni se utilizan para publicidad o decisiones automatizadas con efectos jurídicos.</p><h2>5. Google y Gmail</h2><p>Gmail API se utiliza para enviar los correos de Bandarlog desde una cuenta remitente autorizada con el permiso <code>gmail.send</code>. No leemos su bandeja ni solicitamos acceso a los correos de las personas invitadas. La autorización privada de envío se mantiene en la configuración del servidor.</p><p>Si está habilitado «Continuar con Google», se solicitan únicamente identidad básica y correo (<code>openid email profile</code>) para verificar el acceso. Ese inicio de sesión no concede permisos de Gmail. La autorización de Google se puede retirar desde la cuenta de Google.</p><p>El uso y la transferencia de información recibida de las API de Google cumplirán la <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos de Usuario de los Servicios API de Google</a>, incluidos los requisitos de Uso Limitado.</p><h2>6. Proveedores y transferencias</h2><p>Railway aloja la aplicación; Neon proporciona la base de datos PostgreSQL; Google presta el envío de Gmail y, cuando se activa, la autenticación. Las notificaciones usan el proveedor push de tu navegador. Estos servicios reciben los datos necesarios para su función.</p><p>Los proveedores pueden tratar datos fuera del Espacio Económico Europeo. Cuando corresponda, el responsable debe disponer de las garantías aplicables del RGPD, incluidas las cláusulas contractuales tipo y las condiciones de los proveedores. Puedes solicitar información sobre las regiones contratadas y las garantías al <a href="#contacto">contacto del responsable</a>.</p><h2>7. Conservación y bajas</h2><p>Conservamos la información de proyectos y tareas mientras sea necesaria para la coordinación y su historial. Archivar un proyecto o dar de baja una cuenta no elimina automáticamente sus tareas, asignaciones o actividad. La baja revoca el acceso, las sesiones y los avisos pendientes. Las solicitudes de grupos y las copias de sus correos guardadas en el servidor se depuran a los 30 días; esto no borra los mensajes de las cuentas de correo destinatarias. Las solicitudes de supresión se revisan para eliminar o anonimizar los datos que ya no sean necesarios, respetando las obligaciones legales y los derechos de otras personas.</p><p>Los códigos de acceso caducan a los diez minutos. Las sesiones tienen límites de treinta días de inactividad y noventa días absolutos. Esos límites revocan el acceso y no equivalen a una eliminación automática de todos los registros. Las copias de seguridad y los registros técnicos dependen de los plazos de la infraestructura contratada.</p><h2>8. Cookies y almacenamiento local</h2><p>Usamos una cookie de sesión necesaria y un indicador del último acceso que permite volver a un grupo con sesión vigente. El indicador no contiene nombre ni correo y no permite autenticarse ni amplía permisos. Ambas cookies están protegidas mediante HTTPS y no son accesibles a JavaScript; caducan con la sesión. La PWA guarda recursos y, para usuarios autenticados, información de trabajo y cambios pendientes en el dispositivo mediante IndexedDB para funcionar sin cobertura. No utilizamos cookies publicitarias ni servicios externos de analítica.</p><p>El almacenamiento pertenece a cada dominio y dispositivo. Cerrar sesión elimina el acceso local al trabajo; borrar los datos del sitio puede eliminar cambios aún no sincronizados. Antes de cambiar de dominio o desinstalar la PWA, sincroniza los cambios pendientes.</p><h2>9. Tus derechos</h2><p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación y, cuando proceda, portabilidad, escribiendo al <a href="#contacto">contacto del responsable</a>. Indica la cuenta afectada y el derecho que deseas ejercer, sin enviar contraseñas ni códigos de acceso. Podemos pedir la información mínima necesaria para verificar tu identidad.</p><p>También puedes presentar una reclamación ante la <a href="https://www.aepd.es/">Agencia Española de Protección de Datos</a>. Retirar un consentimiento no afecta a la licitud del tratamiento anterior.</p><h2>10. Uso responsable y cambios</h2><p>Bandarlog está orientado al equipo que organiza las actividades. No publiques datos de salud, documentación identificativa u otros datos sensibles de participantes en las tareas. Las personas que introduzcan datos de terceros deben disponer de una base válida y respetar las instrucciones de su organización.</p><p>Los cambios de esta política se reflejarán en su fecha de actualización. Si afectan sustancialmente al uso de tus datos, se informará al equipo por los medios disponibles.</p></main>`;
}
function terms() {
  return `<main id="contenido" class="public-reading"><a class="public-back" href="/presentacion">← Sobre Bandarlog</a><h1>Condiciones de uso</h1><p class="public-updated">Actualizadas el ${publicInfo.updated}</p><h2>Titular y finalidad</h2><p>Bandarlog está gestionado por ${esc(publicInfo.responsible)}. Contacto: ${contact}. Es una herramienta para coordinar proyectos, comisiones y tareas de equipos scouts; cada grupo dispone de un espacio independiente.</p><h2>Acceso y permisos</h2><p>El acceso requiere una invitación y la confirmación del correo o un método de autenticación habilitado. No compartas códigos, enlaces de acceso ni sesiones. Tus acciones dependen de los permisos concedidos por Administración y por tu comisión. El equipo puede revocar el acceso cuando deje de corresponder.</p><h2>Contenido y uso adecuado</h2><p>Publica únicamente información necesaria para la coordinación y que tengas derecho a compartir. Respeta al equipo y la confidencialidad de los datos. No utilices Bandarlog para introducir contenido ilícito, acceder a información ajena o eludir las medidas de seguridad.</p><h2>Disponibilidad y trabajo sin cobertura</h2><p>La aplicación depende de servicios de alojamiento, red, correo y notificaciones. Puede haber interrupciones y retrasos. Los cambios compatibles guardados sin conexión requieren sincronización; comprueba su estado antes de borrar los datos del sitio o cambiar de dispositivo. No uses los avisos de Bandarlog como único canal para emergencias.</p><h2>Privacidad y consultas</h2><p>El tratamiento de información personal se explica en la <a href="/privacidad">política de privacidad</a>. Para una incidencia de acceso, una solicitud sobre tu información o una consulta sobre estas condiciones, escribe al <a href="/privacidad#contacto">contacto del responsable</a>.</p></main>`;
}
export function renderApprovalPage(
  appUrl: string,
  request?: {
    groupName: string;
    name: string;
    email: string;
    approvedAt?: unknown;
    rejectedAt?: unknown;
    consumedAt?: unknown;
  } | null,
  token = '',
  message = '',
) {
  const pending = request && !request.approvedAt && !request.rejectedAt && !request.consumedAt;
  const body = `<main id="contenido" class="public-reading"><h1>Revisar solicitud de grupo</h1>${message ? `<p class="public-message" role="status">${esc(message)}</p>` : ''}${request ? `<h2>${esc(request.groupName)}</h2><p>Solicitante: ${esc(request.name)}<br>Correo: ${esc(request.email)}</p>${pending ? `<form class="public-form" method="post" action="/aprobar-grupo"><input type="hidden" name="token" value="${esc(token)}"><p>El grupo no existe todavía. Aprobar enviará un enlace de activación al solicitante.</p><button class="public-primary" name="decision" value="approve">Aprobar solicitud</button><button class="public-secondary" name="decision" value="reject">Rechazar solicitud</button></form>` : '<p>Esta solicitud ya se revisó.</p>'}` : message ? '' : '<p>El enlace no es válido o ha caducado.</p>'}</main>`;
  return shell(
    'Revisar solicitud',
    '/aprobar-grupo',
    body,
    appUrl,
    'Revisión privada de una solicitud de grupo.',
  );
}
export function renderPublicForm(path: string, appUrl: string, message = '', token = '') {
  let title = 'Entrar a tu grupo',
    content = `<p>Introduce el ID privado que te ha facilitado tu grupo. Cada persona entra después con su correo autorizado.</p><form class="public-form" method="get" action="/entrar"><label>ID de grupo<input name="id" required pattern="[a-f0-9]{32}" autocomplete="off" spellcheck="false"></label><button class="public-primary">Continuar ${icon(ArrowRight)}</button></form><p><a href="/crear-grupo">Solicitar un grupo</a></p><p class="public-access-note">Si ya utilizabas Bandarlog antes de la apertura a otros grupos: <a href="/acceso">acceso del grupo inicial</a>.</p>`;
  if (path === '/crear-grupo') {
    title = 'Solicitar un grupo';
    content = `<p>El acceso es gratuito y requiere aprobación del responsable. Si se autoriza tu solicitud, recibirás un enlace para confirmar tu correo y activar el grupo.</p><form class="public-form" action="/crear-grupo" method="post"><label>Nombre del grupo<input name="groupName" required minlength="2" maxlength="100" autocomplete="organization"></label><label>Tu nombre<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><label>Tu correo<input name="email" type="email" required autocomplete="email"></label><fieldset class="public-colors"><legend>Colores de la pañoleta</legend><label>Primer color<input name="colorPrimary" type="color" value="#d75a9e"></label><label>Segundo color<input name="colorSecondary" type="color" value="#7b3d93"></label></fieldset><label class="public-check"><input type="checkbox" name="terms" value="accepted" required><span>Acepto las <a href="/condiciones">condiciones de uso</a> y he leído la <a href="/privacidad">política de privacidad</a>.</span></label><button class="public-primary">Enviar solicitud ${icon(ArrowRight)}</button><p class="public-access-note">No se crea ninguna cuenta hasta recibir aprobación. No se solicita tarjeta.</p></form>`;
  } else if (path === '/confirmar-grupo') {
    title = 'Confirma la creación del grupo';
    content = token
      ? `<p>Al continuar se creará el grupo y entrarás como su primer administrador.</p><form class="public-form" method="post" action="/confirmar-grupo"><input type="hidden" name="token" value="${esc(token)}"><button class="public-primary">Confirmar y crear mi grupo ${icon(ArrowRight)}</button></form>`
      : `<p><a href="/crear-grupo">Solicitar un enlace nuevo</a></p>`;
  } else if (path === '/suscripcion-demo') {
    title = 'Suscripción de ejemplo';
    content = `<span class="public-billing-label">Demostración · No se realizan cobros</span><p>Esta página muestra cómo podría verse una suscripción. Los grupos se crean gratis y esta demostración no cambia su plan, no guarda datos de pago y no puede contratarse.</p><section class="public-plans"><article class="public-plan"><h2>Grupo gratuito</h2><strong>0 €</strong><p>Proyectos, comisiones, tareas, miembros y avisos. Es el plan que se asigna al crear un grupo.</p><button disabled>Plan gratuito</button></article><article class="public-plan"><h2>Plan de ejemplo</h2><strong>9 € / mes</strong><p>Precio ficticio para visualizar la interfaz. No es una oferta comercial ni añade funciones al grupo.</p><button disabled>No disponible para contratar</button></article></section><h2>Próxima factura</h2><p>No hay facturas, cargos programados ni método de pago asociado. No se conecta con ningún proveedor de cobros.</p>`;
  }
  return shell(
    title,
    path,
    `<main id="contenido" class="public-reading"><a class="public-back" href="/presentacion">← Sobre Bandarlog</a><h1>${title}</h1>${message ? `<p class="public-message" role="status">${esc(message)}</p>` : ''}${content}</main>`,
    appUrl,
    title,
  );
}
export function renderPublicHome(appUrl: string) {
  return shell('Tu grupo scout en marcha', '/', home(), appUrl, introduction);
}
function information() {
  return `<main id="contenido" class="public-reading"><a class="public-back" href="/">← Inicio</a><h1>Qué es Bandarlog</h1><p>${introduction}</p><h2>Proyectos, comisiones y tareas</h2><ul><li>Organizar proyectos y campamentos con sus fechas, miembros y progreso.</li><li>Repartir el trabajo entre comisiones con responsables y permisos propios.</li><li>Crear tareas, asignarlas, añadir pasos opcionales, publicar actualizaciones y registrar su finalización.</li></ul><h2>Un espacio para cada grupo</h2><p>Cada grupo utiliza un ID privado y sus personas deben entrar con una cuenta autorizada. Los datos y permisos de grupos distintos están separados. La solicitud de un grupo es gratuita y requiere aprobación previa del responsable de Bandarlog.</p><h2>Correo y notificaciones</h2><p>La aplicación envía invitaciones, códigos de acceso y los avisos de tareas elegidos por cada persona. Usa Gmail API para enviar desde una cuenta remitente autorizada; no lee las bandejas de los miembros ni les pide permisos de Gmail. El inicio de sesión con Google, cuando se habilita, solo verifica la identidad.</p><p>Bandarlog es una PWA instalable en móvil y escritorio, con consulta guardada y sincronización de cambios compatibles al recuperar la cobertura.</p><p><a href="/privacidad">Política de privacidad</a> · <a href="/condiciones">Condiciones de uso</a></p><a class="public-primary" href="/entrar">Entrar a mi grupo ${icon(ArrowRight)}</a></main>`;
}
export function renderPublicPage(path: (typeof publicPaths)[number], appUrl: string) {
  if (path === '/privacidad')
    return shell(
      'Política de privacidad',
      path,
      privacy(),
      appUrl,
      'Responsable, datos, finalidades, Google, conservación y derechos en Bandarlog.',
    );
  if (path === '/condiciones')
    return shell(
      'Condiciones de uso',
      path,
      terms(),
      appUrl,
      'Titular, acceso y condiciones de uso de Bandarlog para equipos scouts.',
    );
  return shell('Proyectos y tareas para equipos scouts', path, information(), appUrl, introduction);
}
export function publicSite(appUrl: string) {
  const router = express.Router();
  router.use(['/crear-grupo', '/entrar', '/suscripcion-demo'], (_q, r, next) => {
    r.set('Referrer-Policy', 'same-origin');
    next();
  });
  for (const path of ['/crear-grupo', '/entrar', '/suscripcion-demo'])
    router.get(path, (q, r) => {
      if (path === '/entrar' && typeof q.query.id === 'string' && /^[a-f0-9]{32}$/.test(q.query.id))
        return r.redirect(303, '/g/' + q.query.id + '/');
      if (path === '/suscripcion-demo') r.set('X-Robots-Tag', 'noindex');
      r.type('html').send(renderPublicForm(path, appUrl));
    });
  router.get('/public-site.css', (_q, r) =>
    r.sendFile('public/public-site.css', { root: process.cwd() }),
  );
  router.use(
    '/public-fonts',
    express.static('public/public-fonts', { index: false, maxAge: '1d' }),
  );
  for (const path of publicPaths)
    router.get(path, (_q, r) => {
      r.set('Cache-Control', 'public, max-age=300')
        .type('html')
        .send(renderPublicPage(path, appUrl));
    });
  router.get('/robots.txt', (_q, r) =>
    r
      .type('text')
      .send(
        `User-agent: *\nDisallow: /api/\nDisallow: /g/\nDisallow: /confirmar-grupo\nDisallow: /aprobar-grupo\nDisallow: /suscripcion-demo\nDisallow: /*?*\nSitemap: ${appUrl}/sitemap.xml\n`,
      ),
  );
  router.get('/sitemap.xml', (_q, r) =>
    r
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPaths.map((path) => `<url><loc>${esc(appUrl + path)}</loc></url>`).join('')}</urlset>`,
      ),
  );
  return router;
}
