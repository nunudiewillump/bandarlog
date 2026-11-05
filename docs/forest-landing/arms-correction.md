# Corrección de los brazos

El montaje original comprimía las piezas de los brazos. La revisión v2 recuperaba sus proporciones, pero anclaba ambos brazos cerca del cuello y superponía los dos sobre el torso: tapaba la pañoleta y producía una unión incorrecta en los hombros.

La revisión v3 conserva las cuatro piezas originales y su proporción natural. Sitúa los pivotes en los hombros, por debajo del cuello, y coloca el brazo lejano detrás del torso. El brazo cercano queda delante del cuerpo, con el codo más bajo y la mano en el teclado. Los ángulos de reposo separan las dos manos durante el tecleo y la pausa con sonrisa. No se modifica la cara, el cuerpo, la pañoleta, el mobiliario ni la duración del ciclo.

La animación y el póster corregidos se sirven desde `/landing/arms-v3/`. Así una PWA que conserve WebP anteriores solicita una URL nueva, sin borrar su almacenamiento ni sus colas. Los archivos anteriores permanecen disponibles para documentos previamente guardados. La prueba de regresión comprueba que la pañoleta rosa y morada permanece visible en distintas poses de ambas resoluciones; la unión de los hombros y las manos se revisa también en la hoja de poses `artifacts/forest-landing/arms-v3-poses.png`.

Los textos de presentación, las descripciones públicas y los metadatos hablan de grupos y equipos. Se retira «scout» de esas definiciones, conservando los nombres de roles, las identidades de los grupos, el catálogo y la pañoleta.

La retirada del nombre/contacto repetidos afecta solo a la presentación pública: se elimina el nombre del pie y la identificación repetida de `/presentacion`; «Contacto» lleva a la sección correspondiente de privacidad. Se mantienen nombre y correo una vez en cada página legal y las referencias posteriores enlazan a esa sección. No cambian roles de comisión, cuentas o autorizaciones.

El grupo inicial conserva el ID interno `rosales-702`. El ID privado de entrada se genera en cada base de datos; se consulta en el enlace de Perfil → Configurar grupo. No se sustituye por un ID de pruebas ni se hace público mediante una API nueva.

Verificación acotada: prueba del recurso animado y comparación de regiones protegidas; recorridos públicos de escritorio/móvil, enlaces legales y fallback sin JavaScript; build TypeScript/Vite. No cambia el arranque, la API o el service worker.
