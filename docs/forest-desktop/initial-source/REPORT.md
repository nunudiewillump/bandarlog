# Propuesta estática desktop · Codex

72 estados materiales, generados por `generate-board.py`, indexados por familia en `index.html` y definidos en `scenes.json`. El registro de cada escena contiene `id`, `title`, `family`, `states`, `role` y `file` (ruta relativa al directorio codex). Tamaño principal previsto1440×900 y1280×800; variantes1024×768 y1920×1080 se capturan y validan por el integrador. Los recuentos son de escenas, no de capturas verificadas.

## Decisiones

Identidad Forest existente: Nunito Sans400/600/800 local; crema; verde bosque; geometría exacta de las dos copas SVG del componente móvil adaptada a una cabecera compacta. Lateral estable claro, selección verde, trabajo de lectura al frente. No hay3D. Los iconos de Navidad se asocian al campamento; las comisiones mantienen nombres normales.

Inicio da prioridad a las tareas propias; después equipo y contexto autorizado. Coordinación conserva resumen de proyectos sin donut ni cinco tarjetas repetidas. La comisión Responsable muestra un resumen compacto que deja las tareas en el primer viewport. Tablas semánticas, formularios con etiquetas y controles principales44px. Selección verde, ceros neutros y texto de estados aparte del color. Modales para creación, edición y confirmaciones existentes; detalle lateral para tareas.

Datos ficticios: `dataset.json` fija una escena activa a28octubre2026,19:00Europe/Madrid. Campamento40tareas=18terminadas+22abiertas; proyecto anual10=7+3; global50=25+25. Las variaciones al día, instalación vacía y errores son fixtures independientes, no estados simultáneos. `assets-manifest.json` registra recursos y procedencia. Los controles no ejecutan APIs ni simulan guardado real; los enlaces solo conducen a documentos estáticos.

## Movimiento y cambio vinculante

Última indicación del usuario: la liana2D debe cruzar de lado a lado tras cada finalización guardada, también en la variante de movimiento reducido. D53/D54 muestran un fotograma representativo. En reducido se propone evitar giro y balanceo adicionales, conservando el cruce. Esta decisión reemplaza el ocultamiento de la liana de la implementación vigente; requiere implementación futura, no hay cambio en `src`.

Banana: contorno verde, amarillo y tres manchas marrones, fotograma estático del loader existente. No se representa porcentaje real. No hay entradas decorativas ni animaciones nuevas de páginas. Los tiempos de cruce2.2s y etiqueta2.5s proceden de fuente vigente, no de medición del tablero.

## Límites y estado

Primera propuesta completa, todavía sin veredicto. El integrador captura y la revisión independiente inspecciona salida renderizada antes de aprobar. No se afirma cumplimiento WCAG, accesibilidad asistida, teclado de diálogos funcionales, zoom real, permisos de servidor, autenticación, persistencia, guardado, red, envío de correos o movimiento a partir del tablero. No hay modificación de aplicación, dependencias, variables ni producción.
