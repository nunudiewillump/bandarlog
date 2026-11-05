# Corrección de los brazos

El montaje anterior comprimía las piezas de los brazos hasta aproximadamente la mitad de su proporción original. Esa transformación unía visualmente hombros y antebrazos y deformaba las manos.

Se conservan los cuatro recursos originales de la marioneta. El render calcula la altura de cada brazo desde sus dimensiones reales y aplica `xMinYMin meet`, con pivotes de hombro y ángulos de reposo nuevos. Los codos bajan desde el hombro y los antebrazos alcanzan el teclado; las dos manos quedan separadas. Se mantiene el tecleo alterno y el pequeño gesto de pausa. Cara, cuerpo, pañoleta, mesa y duración del ciclo conservan sus recursos y parámetros anteriores.

La animación y el póster corregidos se sirven desde `/landing/arms-v2/`. Así una PWA que conserve los WebP anteriores en su caché solicita una URL nueva, sin borrar su almacenamiento o invalidar sus colas de trabajo. Los archivos anteriores permanecen disponibles para documentos previamente guardados.

La retirada del nombre/contacto repetidos afecta solo a la presentación pública: se elimina el nombre del pie y la identificación repetida de `/presentacion`; «Contacto» lleva a la sección correspondiente de privacidad. Se mantienen nombre y correo una vez en cada página legal y las referencias posteriores enlazan a esa sección. No cambian roles de comisión, cuentas o autorizaciones.

El grupo inicial conserva el ID interno `rosales-702`. El ID privado de entrada se genera en cada base de datos; se consulta en el enlace de Perfil → Configurar grupo. No se sustituye por un ID de pruebas ni se hace público mediante una API nueva.

Verificación acotada: prueba del recurso animado y comparación de regiones protegidas; recorridos públicos de escritorio/móvil, enlaces legales y fallback sin JavaScript; build TypeScript/Vite. No cambia el arranque, la API o el service worker.
