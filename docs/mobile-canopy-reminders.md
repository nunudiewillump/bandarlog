# Identidad, copa móvil y recordatorios

## Cambios

- Se amplía el mono del logotipo en la aplicación, el acceso, la barra lateral y las páginas públicas, conservando Bungee y el recurso 2D original. No se modifica el mono al teclado ni sus brazos.
- La cabecera móvil permanece anclada arriba, incluidas las hojas. La cabecera completa tiene posición fija; un espacio en el flujo conserva su altura inicial y deja pasar el contenido bajo el borde. Se respetan móvil vertical, landscape y áreas seguras laterales.
- El toque y el deslizamiento cercanos mueven las ramas, también en la portada. La interacción usa eventos pasivos y un único requestAnimationFrame por actualización; no impide el scroll ni mueve los controles.
- Una brisa de unos 2,4 segundos se activa cada 15 segundos. Se respeta movimiento reducido, visibilidad y la preferencia de apariencia. Las caídas conservan 17–50 segundos y sus probabilidades anteriores.
- Las etiquetas de Pendiente y Terminada conservan el mismo fondo, tinta, peso, radio y padding en móvil y escritorio. La fecha vencida mantiene su aviso propio.
- El icono de las tarjetas de proyecto se centra en su superficie en móvil. La hoja auxiliar se oculta, igual que en escritorio.
- Las scrollbars comparten pista clara y tirador verde bosque en aplicación y web pública.

## Recordatorio diario

Perfil → Preferencias → Configurar avisos incorpora «Un recordatorio diario mientras siga vencida». Está desactivado por defecto y se guarda en el JSON de preferencias existente, con validación booleana en backend. No requiere migración ni altera preferencias guardadas.

Diario y semanal son independientes por decisión expresa del usuario. Si ambos están activos, pueden llegar los dos tipos de aviso el día correspondiente. Desactivar todos los avisos impide ambos; las tareas terminadas, proyectos archivados y asignaciones retiradas siguen quedando fuera según las reglas vigentes.

El planificador utiliza la fecha de Europe/Madrid y sus cambios de horario. La clave diaria distingue tarea, destinatario y día, sin depender de la fecha límite: editar una tarea que sigue vencida no genera un segundo aviso diario. Los avisos anteriores conservan su identidad por fecha límite. El mantenimiento existente comprueba las tareas cada minuto; no se añade una hora de envío configurable. Cada correo y notificación push usa las plantillas y permisos actuales.

Las pruebas de API verifican persistencia, rechazo de tipos inválidos, independencia, reprocesamiento, edición de fechas y opt-out con datos aislados y correo preview.

## Notch y sistemas móviles

La cabecera móvil completa (hojas, nombre y foto) se fija al viewport. Un contenedor reserva exactamente la altura de los controles, el área segura y el margen inferior, manteniendo la posición inicial del contenido. La decoración es absoluta dentro de esa misma cabecera: no puede separarse de los controles al tirar de la página. La PWA móvil instalada usa `overscroll-behavior-y: none` en la raíz y el body para evitar el rebote exterior, sin bloquear el scroll normal, cancelar gestos táctiles ni ocultar overflow.

En el dispositivo iOS de referencia sigue apareciendo una barra nativa opaca. Se aplica la alternativa aprobada: la copa empieza con el verde exacto `#103b2d` y deja aparecer progresivamente las hojas mediante un gradiente. No se afirma que el contenido web alcance una región nativa que el sistema no exponga.

El follaje móvil reutiliza las hojas originales en una capa desplazada horizontalmente que rellena los huecos. Se retiran el fondo rectangular de la cabecera con hojas y su respaldo plano SVG, para que no asomen bloques verdes por debajo de la silueta. La cabecera sin efectos conserva un fondo sólido. El escritorio mantiene sus capas, geometría y fondos anteriores.

Se mantienen viewport-fit=cover, las capacidades de web app, el título, el icono de inicio y apple-mobile-web-app-status-bar-style=black-translucent. En Android se conserva theme-color y el mismo verde del manifiesto. No se fuerza fullscreen: deben seguir visibles las notificaciones y los controles del sistema.

La guía solicitada de ITNEXT devolvió HTTP 403 al acceso automatizado. Se contrastaron los mecanismos con:

- [Metadatos oficiales de Safari](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html): black-translucent permite pintar detrás de la barra.
- [Theme color](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color): color sugerido para la interfaz del navegador/sistema.
- [Modos de presentación de Chrome](https://developer.chrome.com/docs/capabilities/display-override): conservar la presentación instalada sin ocultar el sistema.

Los navegadores no detectan la cercanía de un dedo suspendido: la respuesta se activa al tocar o deslizar, y puede seguir un lápiz que emita eventos de proximidad. La barra nativa y el blanco de sus iconos los controla el sistema. Algunas versiones de Android mantienen una barra opaca; el color se integra, pero una web no puede dibujar hojas dentro de una región que el navegador no exponga.

Las capturas con 47px/24px son simulaciones de áreas seguras en Chromium, no capturas de la barra nativa de iOS o Android. Queda comprobar el acabado de los iconos del sistema en PWAs instaladas en dispositivos físicos. No se eliminan sesiones, IndexedDB o cambios pendientes.

Las pruebas móviles incluyen arrastre descendente desde el inicio, subida normal, controles accesibles, tamaño del espacio reservado y ausencia de bloqueo del body. Se comprueba que el borde superior renderizado coincide con el verde de la barra y que aparecen píxeles de follaje tras la transición, excluyendo el color crema del contenido. Se cubren insets simulados de 47px, 24px y 0px; este último comprueba también el caso sin área segura expuesta. Las capturas son de datos ficticios y no reproducen la barra nativa del dispositivo.

La implementación sigue los metadatos de Apple y [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/). La guía de ITNEXT sigue devolviendo HTTP 403. Queda confirmar el resultado final y el rebote en la PWA instalada de iOS; no se requiere borrar sesiones ni reinstalar para los cambios de CSS.

## Verificación acotada

- Cuatro pruebas de preferencias: valores anteriores, independencia, finalización, opt-out y día de Madrid cruzando el horario de verano.
- Tres casos API: recordatorios anteriores, guardado del perfil y nuevo flujo diario.
- Veintisiete recorridos de navegador seleccionados: identidad y estados a 320/1024/1440, proyectos centrados, toque, brisa, preferencias, simulaciones de PWA, páginas públicas, landscape, scroll durante completar/deshacer, y conservación de tipografía.
- TypeScript/Vite y revisión visual de móvil/escritorio. Se amplía la selección de recorridos porque cambian estilos globales y la posición de la cabecera; no se ejecuta manualmente toda la suite.

La revisión mecánica conserva advertencias previas sobre tamaños fuera de escala y un borde lateral de una sección pública que este encargo no modifica. Capturas nuevas en artifacts/mobile-canopy/. Sin merge ni despliegue.

## Verificación de cabecera fija y transición

Se ejecutan los recorridos específicos de copa y PWA, más regresiones seleccionadas de acceso, primer perfil, apariencia, móvil horizontal y scroll al completar/deshacer. Se amplía esa selección porque ForestHeader es compartido por la aplicación, el acceso y el onboarding. No se ejecuta manualmente toda la suite. La comprobación del rebote nativo de WebKit en un iPhone físico sigue pendiente; los gestos CDP validan el comportamiento del navegador de prueba.
