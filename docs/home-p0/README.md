# P0: acciones rápidas de Inicio

Rama `feat/home-quick-actions`. No autoriza fusionar ni desplegar. No hay migraciones, cambios de credenciales o servicios nuevos.

## Recorrido

Inicio muestra tres tareas destacadas: en curso primero, pendientes vencidas después, bloqueadas como atención específica y las demás pendientes por fecha. Smart Focus mantiene sus niveles personales, de equipo, de proyectos y al día. La pantalla Tareas conserva sus filtros, orden y controles originales.

`HomeTaskAction` se utiliza únicamente en las filas de Inicio, su equivalente desktop y la práctica del tutorial. En móvil táctil, una tarea pendiente se inicia al soltar el tirador tras al menos el 83 % del recorrido medido; tocar, arrastrar parcialmente, desplazarse verticalmente, cancelar, perder captura, cambiar orientación o recibir otra versión no escribe nada. Ratón, tablet amplia y teclado disponen de «Empezar tarea». La alternativa accesible tiene nombre específico y no usa un `input range` ni un interruptor oculto.

En curso presenta «Finalizar tarea» con un toque. Bloqueada conserva motivo y detalle; archivada o sin permiso no ofrece escritura. La autorización definitiva sigue en el endpoint existente. No cambian las transiciones de las demás pantallas.

Perfil desaparece solo de la barra inferior móvil: Inicio, Mis tareas, Proyectos, Comisiones. El avatar «Mi perfil» conserva el acceso y el historial de navegación. La navegación lateral desktop permanece igual. Se mantienen Poppins, Bungee y los colores Forest vigentes, según la última confirmación del usuario.

## Confirmación y sincronización

Se reutilizan `taskStatus`, `api`, la cola IndexedDB, los identificadores de mutación y `expectedUpdatedAt`. El bloqueo por tarea empieza antes del primer `await`. El control no hace peticiones al mover el dedo y no añade polling ni conexiones.

Una escritura encolada queda señalada y bloquea la siguiente acción rápida sobre esa tarea. Inicio mantiene una finalización pendiente dentro del trabajo abierto, en vez de mostrar un éxito definitivo. El estado de sincronización utiliza las lecturas y eventos existentes de `SyncStatus`. El almacén devuelve solo IDs y estado confirmado para proyectar ese aviso; no se modifica el esquema IndexedDB.

Al sincronizar, `flush` devuelve el recibo ya recibido y envía metadatos mínimos al cliente del mismo grupo: mutación, tarea, usuario, estado y versión. No se incluyen títulos, descripciones, comentarios, CSRF ni tokens. Otro grupo o la consola de plataforma recibe un aviso genérico sin recibos. La aplicación cruza el recibo con la acción que esa cuenta inició y con la versión cargada antes de ofrecer Deshacer o celebrar. La misma confirmación sirve para guardados online y offline; no hay otro endpoint ni otra cola.

La liana y los pulsos solo se solicitan tras confirmación, nunca al encolar. Las confirmaciones diferidas se recuerdan en memoria: si se cierra la PWA antes del recibo, la cola se conserva y sincroniza, pero no se reproduce después una celebración histórica ni se fabrica Deshacer sin su versión anterior. Tras un descarte o cambio de cuenta no se presenta una confirmación ajena.

Deshacer usa la versión confirmada, tanto para empezar como para finalizar. Un conflicto se conserva como error y no sobrescribe a otro dispositivo. El contenido se recarga compartidamente y se restaura el scroll. El indicador local de guardado aparece tras 450 ms; los resultados se anuncian con la confirmación existente, evitando un segundo aviso en Inicio.

Service Worker v14 e importación de almacén v9 refrescan los recursos públicos. Cookies, contexto de grupo, RLS, autenticación y política de caché privada se mantienen.

## Tutorial

La misión utiliza exactamente el nuevo componente: empezar, finalizar, bloqueo y Deshacer. Explica Perfil desde el avatar y cuatro destinos. Reutiliza las acciones/versiones del tutorial existente; no reinicia progreso guardado, modifica las tareas reales ni añade eventos persistentes. Las pruebas conservan omisión, repetición y celebración única.

## Evidencia y límites

Capturas con datos ficticios en `captures/`: Inicio pendiente, arrastre, en curso, finalización y escritorio. Pruebas y resultados finales constan en la PR. La prueba táctil automatizada usa Chromium con Pointer Events y eventos táctiles de CDP; no equivale a hardware Android/iOS ni a una auditoría completa con VoiceOver/TalkBack. La ampliación de texto se comprueba en los controles nuevos, junto a los anchos 320/375/390/430, tablet y desktop.

[Informe háptico y protocolo físico pendiente](HAPTICS.md). No se declara comprobada vibración real, retorno de cada modelo de dispositivo o lectura asistida física.
