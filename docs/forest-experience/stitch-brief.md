# Especificación común · Codex y Stitch

Estado: preparada, no enviada. El usuario seleccionó ambos renderizadores. Stitch no expone herramientas en esta sesión y su acceso no está verificado. No se ha iniciado ninguno de los dos renderizadores: deben recibir esta misma especificación y comenzar en paralelo una vez verificada la conexión.

## Resultado solicitado

Una propuesta coherente de **Bandarlog Forest Experience**, PWA para trabajo scout voluntario. Idioma español. Modo de uso operativo, adulto, tranquilo y rápido. No es una red social ni un dashboard de KPI. No implementar APIs, navegación funcional, autenticación ni datos reales para la propuesta: pantallas y tablero estáticos, con controles semánticos cuando el formato lo permita.

La fuente de requisitos es `README.md` de esta carpeta. Esta especificación no reduce sus estados, permisos, contratos de movimiento ni criterios de accesibilidad. Datos de diseño exclusivamente sintéticos, identificados fuera de las pantallas.

## Identidad bloqueada

- Verde `#124D38`, profundo `#103B2D`, crema `#FAF8F2`, Nunito Sans.
- Copa de árbol compacta: 64 px de contenido, 16 px de silueta orgánica inferior y área segura superior. Marca oficial y avatar en flujo normal. Fondo verde, palabra Bandarlog crema. Sin cápsula blanca alrededor de la marca.
- Una lista continua de tareas con divisores. Un foco principal por pantalla. Nada de cinco KPI decorativos, tarjetas anidadas, blur, degradados, hojas en movimiento ni frases motivacionales.
- Navegación: Inicio | Mis tareas | Comisiones | Perfil; 68 px más área segura inferior, etiquetas de 12 px, objetivos de 44 px mínimo.
- Márgenes de 16 px en 320/375 y 20 px en 390/430. Texto de campos 16 px, títulos de pantalla 26/30, contexto 14/20. No bloquear zoom.
- Logo y monos originales: no inventar reemplazos. Las fuentes están en `public/brand-mark.webp`, `public/monkey.webp`, `public/monkey-vine.webp`, `public/artwork/mascots/servicios.webp`, `public/artwork/mascots/animacion.webp`, con procedencia en `public/ASSETS.md`. No enviar el resto del repositorio ni datos privados al servicio.
- Los monos son secundarios, transparentes, sin recortes de orejas, manos, colas ni accesorios; sin fragmentos de otro personaje. Si el servicio no puede importar un recurso requerido, registrar el bloqueo en vez de sustituirlo.

## Escenas y estados obligatorios

Generar el tablero completo F01–F27 definido en `README.md`: entrada, código, invitación, identidad inicial, editor de foto, cuatro niveles Smart Focus, última tarea, tareas, detalle, comisiones, comisión, proyectos, campamentos, coordinación, personas, perfil, formulario, vacío, carga, red, sesión caducada, código erróneo, omitir foto y cancelar Google. Los estados de cancelación y recuperación deben conservar el camino de vuelta, no quedar solo descritos en notas.

El tablero principal mostrará cada escena a 390 px de ancho. Añadir la cabecera y los recorridos densos a 320/375/430, una composición tablet de 768 y referencia desktop de 1440. Añadir estado de orientación horizontal de 844×390 y esquema de áreas seguras. Esas imágenes no demuestran una prueba de dispositivo real.

El primer acceso dice exactamente **¿Cómo te llamamos?**. Nombre obligatorio prellenado y editable, foto opcional, Continuar. «Ahora no» solo omite foto; no permite nombre vacío. Reutilizar el editor circular existente en el diseño.

El acceso por correo usa un campo único para un código, no seis casillas separadas. Google se presenta solo en una escena rotulada externamente «Google configurado» y se omite en la escena sin configuración. No sugerir que ya funciona en producción.

Inicio tiene como máximo tres tareas destacadas y un acceso al resto. El escenario de estrés contiene diez comisiones y 74 tareas accesibles: siete propias abiertas, treinta abiertas de su equipo, catorce de otras comisiones solo agregadas en el campamento y veintitrés terminadas. No enseñar simultáneamente los tres niveles. Preparar además variantes de una y cinco comisiones.

Contexto por fila: calendario + nombre de ronda + comisión, o tienda + campamento + comisión. Arena y verde acompañan texto/icono, no son la única señal. Lista personal ordenada por vencimiento, sin pestañas obligatorias para separar tipos de proyecto.

Comisiones agrupadas por proyecto: Material, Infraestructura, Botiquín, Animación y Electricidad en la ronda; Cocina, Menú, Logística, Servicios y Staff en el campamento. Campamento de Navidad selecciona la colección estacional por proyecto y conserva nombres normales de comisiones.

Scouter ve controles de completar solo para tareas propias. Responsable gestiona su comisión. Coordinación conserva alcance global autorizado. El acceso Google o por código no concede permisos nuevos. No introducir ayuda social, chat, rankings, gamificación ni obligaciones inventadas.

## Movimiento y accesibilidad

Conservar M01–M05 de `README.md`. Contadores de 350 ms, satisfacción actual de 2600 ms y feedback existente de tarea son decisiones del producto inspeccionadas en código, no datos derivados de benchmarks. El tablero solo representa inicio/fin y secuencia; no demuestra tiempos, easing, interrupción o rendimiento. Con movimiento reducido, conservar resultado y Deshacer sin desplazamiento no esencial. La copa no se anima.

Contraste mínimo para texto normal 4.5:1 y para controles esenciales 3:1. Foco visible y no oculto por barras. Filas y textos largos envuelven a 320 px. Las acciones inferiores deben permanecer accesibles con teclado virtual. No convertir controles/texto en una imagen única como solución de implementación.

## Salida y comparación

Cada renderizador devuelve identificadores exactos, dimensiones, escenas cubiertas, recursos utilizados y limitaciones. Mantener manifiestos separados con ID de recurso, procedencia, destino, formato, variante, exportación, referencia futura de implementación y estado de prueba móvil/desktop.

Validar Codex y Stitch por separado contra estos requisitos antes de comparar. No juzgar uno tomando el otro como autoridad. Informar veredicto por renderizador: `meets direction`, `meets with corrections` o `does not meet`. La propuesta emparejada comparte un máximo de tres rondas de corrección. Antes de corregir, el usuario seleccionará el alcance de refinamiento tras ver las diferencias.

No mezclar archivos de ambos renderizadores sin aprobación explícita de un diseño híbrido con selección de elementos. No sustituir silenciosamente imágenes requeridas o recursos exportados. No declarar el diseño aprobado ni la aplicación implementada a partir de esta solicitud.
