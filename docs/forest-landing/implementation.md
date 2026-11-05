# Portada ilustrada y acceso recordado · Forest Experience

## Dirección

La entrada conserva marca, Poppins local y marca Bungee, crema y verde bosque. El propósito y la acción siguen siendo «Menos lío. Más grupo.», «Proyectos, comisiones y tareas.» y «Entrar a mi grupo». La explicación extensa continúa en `/presentacion`.

La escena al teclado ocupa aproximadamente la mitad izquierda del escritorio. En móvil, texto y acceso preceden a la ilustración a ancho completo. El pie queda al fondo de la ventana con flex y altura mínima, y continúa en el flujo cuando el contenido necesita scroll: no es fijo ni tapa controles.

La copa utiliza exactamente las siluetas `shared/forest-art.ts` y los nervios/colores de `BotanicalCanopy`. Cuatro planos, más grupos de hojas, ramas laterales y fases distintas de balanceo aportan densidad y movimiento. Las flores y bellotas son geometría SVG 2D. No se incorpora follaje generado ni se modifica la copa operativa dentro de la aplicación.

## Animación real del mono

Se sustituye el montaje de dos escenas por una marioneta 2D con piezas originales generadas a partir de la identidad de `public/monkey-wave-2d.png`. Las piezas están en `rig/`: cuerpo/mesa, cabeza y dos brazos. Los colores planos y el contorno siguen el lenguaje de la interfaz; la pañoleta es rosa/morada.

`scripts/render-keyboard-animation.mjs` articula brazos alternos, cabeza, mirada, boca y parpadeos, con la mesa siempre estable. Produce 120 fotogramas a 15 fps para un ciclo de ocho segundos: tecleo, giro con sonrisa y regreso al teclado. Se codifican como un solo WebP animado en 480/768 px; el codificador puede agrupar fotogramas idénticos. No hay fundido entre dos escenas ni dos imágenes superpuestas en el DOM. El render requiere `sharp` y `ffmpeg` únicamente en la máquina que prepara los recursos; producción sirve archivos locales y no instala ni ejecuta FFmpeg.

La imagen estática se muestra desde el HTML. Un pequeño script propio carga y decodifica la animación antes de sustituirla; el acceso no espera a esa descarga. Con movimiento reducido, sin JavaScript, fuera de pantalla o con la pestaña oculta se conserva una ilustración completa y estática. No hay control visible de pausa, por petición del usuario. No se añaden dependencias del cliente, sonido, analítica externa ni generación de imágenes en ejecución. Los recursos de dos poses del PR21 se conservan para compatibilidad con HTML previamente guardado, pero la nueva portada no los utiliza.

Procedencia, hashes, dimensiones y tamaño de los recursos actuales en `artwork.json`.

## Acceso recordado y PWA antigua

`/` comprueba una sesión antigua válida del grupo inicial antes de mostrar la portada y redirige a `/acceso` **en el mismo origen**. Las instalaciones antiguas conservan el ID y scope `/`; su manifiesto utiliza `/acceso` para futuros arranques. Los grupos privados mantienen su URL y scope propios. No cambian IDs, roles, datos ni pertenencias.

Los accesos nuevos y `/api/me` establecen una cookie HttpOnly necesaria de navegación (`bandarlog_entry`), que contiene el ID privado del grupo y un identificador opaco de sesión, sin nombre o correo. La raíz comprueba en servidor el grupo, la cuenta activa y ambas caducidades de la sesión. El indicador no es una credencial válida para la API: el destino sigue requiriendo la cookie de sesión existente. El cierre de sesión revoca la sesión y retira su indicador; una cuenta desactivada o una sesión caducada no se recupera. No hay nuevas tablas, secretos ni migraciones.

Las respuestas de la raíz son privadas, no se almacenan en caché y varían por Cookie. Los enlaces de invitación y acciones con parámetros conservan su flujo. Las páginas legales permanecen públicas incluso con sesión abierta.

El service worker cambia su caché estática a v6 y conserva `/acceso` como shell del grupo inicial. No cambia IndexedDB, la cola de escrituras ni sus nombres. No se borra ni mueve información entre dominios. Hay que mantener el origen antiguo de Railway operativo y en `LEGACY_APP_ORIGINS` mientras existan instalaciones antiguas. Si la sesión expiró, es necesario identificarse de nuevo; las cookies de un dominio no pueden transferirse silenciosamente a otro.

## Comprobaciones específicas

- Build TypeScript/Vite.
- Sesiones: recuperación antigua/privada, aislamiento, expiración inactiva/absoluta, baja de usuario y revocación al cerrar sesión; pruebas criptográficas de autenticación existentes.
- API de grupos: raíz anónima, retorno a grupo activo, cookie HttpOnly, indicador sin capacidad de autenticación, invitaciones y aislamiento.
- PostgreSQL local con un propietario sin superusuario: arranque de producción, dominios nuevo/antiguo y cuenta desactivada.
- Recurso animado: muchos fotogramas reales, ciclo de ocho segundos, movimiento efectivo, mesa estable y póster completo.
- Navegador: composición 320/390/768/1440 px, pie al fondo en ventana alta, acceso/legales sin JavaScript, movimiento reducido y pestaña oculta; reanudación de la PWA inicial y conservación de su cuenta offline; grupos privados y sus cachés; aceptación de invitaciones.

La cobertura se amplía a sesiones, dominios y sincronización porque cambian la selección de entrada y el shell del service worker. No se ejecuta de rutina toda la suite. Las capturas reales están en `artifacts/forest-landing/`; no sustituyen una comprobación en Safari o dispositivos físicos. No se ha fusionado ni desplegado esta revisión.


## Corrección acotada posterior

El montaje actual conserva la proporción nativa de cada brazo y utiliza pivotes de hombro separados. La animación corregida se sirve desde `/landing/arms-v3/`, conservando los archivos anteriores para cachés/documentos existentes. La identidad legal aparece en privacidad y condiciones; el pie y la presentación enlazan a esa información sin repetir nombre o correo. Detalles de la corrección y sus verificaciones en [brazos y datos públicos](arms-correction.md).
