# Propuesta estática desktop · Codex

73 estados materiales, generados por `generate-board.py`, indexados por familia en `index.html` y definidos en `scenes.json`. El registro de cada escena contiene `id`, `title`, `family`, `states`, `role` y `file` (ruta relativa al directorio codex). Tamaño principal previsto1440×900 y1280×800; variantes1024×768 y1920×1080 se capturan y validan por el integrador. Los recuentos son de escenas, no de capturas verificadas.

## Decisiones

Identidad Forest existente: Nunito Sans400/600/800 local; crema; verde bosque; geometría exacta de las dos copas SVG del componente móvil adaptada a una cabecera compacta. Lateral estable claro, selección verde, trabajo de lectura al frente. No hay3D. Los iconos de Navidad se asocian al campamento; las comisiones mantienen nombres normales.

Inicio da prioridad a las tareas propias; después equipo y contexto autorizado. Coordinación conserva resumen de proyectos sin donut ni cinco tarjetas repetidas. La comisión Responsable muestra un resumen compacto que deja las tareas en el primer viewport. Tablas semánticas, formularios con etiquetas y controles principales44px. Selección verde, ceros neutros y texto de estados aparte del color. Modales para creación, edición y confirmaciones existentes; detalle lateral para tareas.

Datos ficticios: `dataset.json` fija una escena activa a28octubre2026,19:00Europe/Madrid. Campamento40tareas=18terminadas+22abiertas; proyecto anual10=7+3; global50=25+25. Las variaciones al día, instalación vacía y errores son fixtures independientes, no estados simultáneos. `assets-manifest.json` registra recursos y procedencia. Los controles no ejecutan APIs ni simulan guardado real; los enlaces solo conducen a documentos estáticos.

## Movimiento y cambio vinculante

Última indicación del usuario: la liana2D debe cruzar de lado a lado tras cada finalización guardada, también en la variante de movimiento reducido. D53/D54 muestran un fotograma representativo. En reducido se propone evitar giro y balanceo adicionales, conservando el cruce. Esta decisión reemplaza el ocultamiento de la liana de la implementación vigente; requiere implementación futura, no hay cambio en `src`.

Banana: contorno verde, amarillo y tres manchas marrones, fotograma estático del loader existente. No se representa porcentaje real. No hay entradas decorativas ni animaciones nuevas de páginas. Los tiempos de cruce2.2s y etiqueta2.5s proceden de fuente vigente, no de medición del tablero.

## Límites y estado

Primera propuesta completa, corregida en una ronda conjunta, pendiente de reinspección renderizada. El integrador captura y la revisión independiente inspecciona salida renderizada antes de aprobar. No se afirma cumplimiento WCAG, accesibilidad asistida, teclado de diálogos funcionales, zoom real, permisos de servidor, autenticación, persistencia, guardado, red, envío de correos o movimiento a partir del tablero. No hay modificación de aplicación, dependencias, variables ni producción.


## Ronda conjunta1 · cambios aplicados

Q01: tareas destacadas compactadas con persona y acción en columna derecha; eliminada la duplicación de comisiones para Scouter/Responsable. Q02: tabla de Servicios con datos propios; siete tareas personales, trabajo de equipo no asignado a AM; detalle de lectura solo de otra persona; pendientes, terminadas, alertas y vacío0/0 coherentes. D53/D54usan snapshot posterior al guardado: seis personales abiertas, Servicios3/8, campamento19/40 y global26/50; la tarea completada desaparece de pendientes y bajan sus incidencias.

Q03: correo mostrado solo lectura, preferencias reales completas y días editables7,3; fotosAVIFincluidas,30MBmáximo de entrada con compresión. Q04: acceso/código/onboarding en cabecera Forest pública sin navegación ni identidad privada. Q05: al día global explícito50tareas/8comisiones. Q06: iconos generales para contexto anual; fixture de diez comisiones declarado variante independiente. Q07: selector de icono identifica comisión sin asociación «Equipo de acogida», sin desbloquear nombres conocidos.

Q08: perfil de cabecera44px; títulos de tabla44px; checkbox24px dentro de etiqueta44px; herramientas de tabla en dos filas deliberadas, sin fecha huérfana; espacios naturales en textos y fecha; eliminado el segundo contador de avance en resumen de comisión. Añadido D73: proyecto anual con iconos generales,2comisiones,10tareas,7terminadas,3abiertas,1vencida y1bloqueada; los enlaces anuales conservan ese contexto. Scouter conserva enlaces a su variante de comisión.

D53/D54conservan la liana2D en ambas variantes según la última decisión del usuario. El tablero solo enseña un fotograma; el cruce real y su activación tras cada guardado siguen siendo prueba de implementación pendiente.

Esta nota registra cambios de fuente, no prueba que estén corregidos visualmente. Captura y revisión independiente deben reinspeccionar todos los estados después de esta ronda. No se ha capturado ni declarado cumplimiento automático desde el generador.
