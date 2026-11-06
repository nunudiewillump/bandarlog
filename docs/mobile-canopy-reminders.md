# Identidad, copa móvil y recordatorios

## Cambios

- Se amplía el mono del logotipo en la aplicación, el acceso, la barra lateral y las páginas públicas, conservando Bungee y el recurso 2D original. No se modifica el mono al teclado ni sus brazos.
- La cabecera móvil permanece anclada arriba, incluidas las hojas. Su posición sticky conserva el espacio inicial y deja pasar el contenido bajo el borde. Se respetan móvil vertical, landscape y áreas seguras laterales.
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

La franja plana tenía dos causas: el body añadía un segundo inset y un pseudo-elemento opaco cubría la zona superior. Ahora el follaje empieza en y=0 y solo los controles reservan safe-area-inset-top. El fondo de la PWA instalada es verde oscuro, mientras las superficies de la aplicación conservan sus colores.

Se mantienen viewport-fit=cover, las capacidades de web app, el título, el icono de inicio y apple-mobile-web-app-status-bar-style=black-translucent. En Android se conserva theme-color y el mismo verde del manifiesto. No se fuerza fullscreen: deben seguir visibles las notificaciones y los controles del sistema.

La guía solicitada de ITNEXT devolvió HTTP 403 al acceso automatizado. Se contrastaron los mecanismos con:

- [Metadatos oficiales de Safari](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html): black-translucent permite pintar detrás de la barra.
- [Theme color](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color): color sugerido para la interfaz del navegador/sistema.
- [Modos de presentación de Chrome](https://developer.chrome.com/docs/capabilities/display-override): conservar la presentación instalada sin ocultar el sistema.

Los navegadores no detectan la cercanía de un dedo suspendido: la respuesta se activa al tocar o deslizar, y puede seguir un lápiz que emita eventos de proximidad. La barra nativa y el blanco de sus iconos los controla el sistema. Algunas versiones de Android mantienen una barra opaca; el color se integra, pero una web no puede dibujar hojas dentro de una región que el navegador no exponga.

Las capturas con 47px/24px son simulaciones de áreas seguras en Chromium, no capturas de la barra nativa de iOS o Android. Queda comprobar el acabado de los iconos del sistema en PWAs instaladas en dispositivos físicos. No se eliminan sesiones, IndexedDB o cambios pendientes.

### Corrección del borde superior tras PR29

La captura de un iPhone instalado mostró que seguía apareciendo una franja uniforme sobre la copa. Comprobar que el contenedor empezaba en y=0 no demostraba que las hojas se dibujasen detrás de la barra nativa.

En móvil, la decoración del header de la aplicación se ancla ahora con `position: fixed; top: 0` al viewport, independiente de la caja sticky que reserva el espacio de los controles. Un `use` SVG reutiliza la capa frontal original, desplazada hacia arriba, para que la parte superior tenga hojas visibles, con sus mismas siluetas, nervios y movimiento. No se añaden imágenes, librerías ni otro gradiente. En escritorio esta capa superior permanece oculta y se conserva la posición anterior. La preferencia de apariencia sigue retirando todo el follaje.

Se conservan las dos condiciones documentadas por Apple: `black-translucent` para presentar contenido detrás de la barra y `viewport-fit=cover` para extender el viewport. Solo los controles reservan el inset; no se desplaza el body ni se ocultan las notificaciones del sistema. Referencia adicional: [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

Las pruebas verifican también la posición fija, la variación de color de las hojas renderizadas dentro del área segura simulada, los controles accesibles y el scroll táctil. Esto no sustituye una comprobación de la PWA instalada en un iPhone: queda confirmar allí el resultado antes de decidir si hace falta la alternativa del gradiente. La guía de ITNEXT sigue devolviendo HTTP 403. No se borran instalaciones, sesiones o datos para forzar la actualización.

## Verificación acotada

- Cuatro pruebas de preferencias: valores anteriores, independencia, finalización, opt-out y día de Madrid cruzando el horario de verano.
- Tres casos API: recordatorios anteriores, guardado del perfil y nuevo flujo diario.
- Veintisiete recorridos de navegador seleccionados: identidad y estados a 320/1024/1440, proyectos centrados, toque, brisa, preferencias, simulaciones de PWA, páginas públicas, landscape, scroll durante completar/deshacer, y conservación de tipografía.
- TypeScript/Vite y revisión visual de móvil/escritorio. Se amplía la selección de recorridos porque cambian estilos globales y la posición de la cabecera; no se ejecuta manualmente toda la suite.

La revisión mecánica conserva advertencias previas sobre tamaños fuera de escala y un borde lateral de una sección pública que este encargo no modifica. Capturas nuevas en artifacts/mobile-canopy/. Sin merge ni despliegue.
