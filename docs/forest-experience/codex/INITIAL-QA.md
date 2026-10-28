# Codex · propuesta inicial

Veredicto de revisión inicial: **meets with corrections**. Esta es evidencia de una propuesta estática, no de implementación, autorización visual ni accesibilidad certificada. Se conserva sin refinamiento hasta comparar ambos renderizadores y elegir el alcance de corrección.

## Archivos y alcance

- `index.html`: tablero con 27 estados F01–F27 y cuatro variantes (sin Google, una/cinco comisiones y esquema de áreas seguras).
- `screens/`: HTML estático de cada escena, sin JavaScript, autenticación, endpoints ni acciones reales.
- `captures/board-1-9.png`, `board-10-18.png`, `board-19-27.png`: láminas de revisión; cada marco tiene scroll si su escena es más alta que 820px. Las capturas individuales muestran el contenido completo.
- 56 capturas: todos los estados y variantes a390px; escenas densas a320/375/430; login768/1440; orientación844×390; tablero completo y tres láminas parciales.
- `measurements.json`: dimensiones de todas las capturas, imágenes cargadas, tamaños de botones y fuente mínima.
- `contrast.json`: ratios WCAG de las combinaciones principales usadas.
- `assets-manifest.json`: procedencia, referencias y límites de recursos de esta propuesta, independiente de Stitch.

Capturas verificadas visualmente: tres láminas que cubren F01–F27, F06 a320, F13 a390 completo, F14 a390, F18 a320, F01 a768 y1440, F06 a844 y esquema seguro a320. El resto de variantes tiene comprobación geométrica/de carga automatizada; no se afirma inspección visual individual de cada archivo.

## Medidas

- 31 escenas generadas y renderizadas, de ellas27 principales.
- Cero desbordamiento horizontal de página en las dimensiones capturadas.
- Cero imágenes rotas en los 31 estados a390px.
- Tipografía mínima 12px; cuerpo/campos16px, contexto14px, navegación12px.
- Un botón incumple el objetivo de44px de ancho: pestaña «Tareas» enF14, 43.5625×45px. Se registra como corrección, no se oculta por redondeo.
- Contrastes calculados: crema/bosque9.22:1, tinta/crema12.21:1, texto secundario/crema5.74:1, error/crema6.58:1, aviso/crema6.45:1 y contorno de completar/crema4.59:1.
- No animaciones ni solicitudes de datos en la propuesta. Los timings, interrupciones, progreso, sesiones y permisos siguen siendo contratos pendientes de implementación.

## Matriz de conformidad inicial

| Estado | Evidencia observada | Clasificación | Siguiente acción |
| --- | --- | --- | --- |
| F01 | Copa, marca oficial, correo y Google. VarianteV01 omite Google. | match | Conservar; Google real pendiente de configuración y backend. |
| F02 | Un campo de código, cambio de correo, caducidad y reenvío. | match | Añadir semántica inputmode/autocomplete y estado de espera en implementación. |
| F03 | Aceptar invitación y entrar, destino y rol de ejemplo. | match | Conservar compatibilidad de enlace e invitación real. |
| F04 | Nombre, foto opcional y Continuar; omitir solo foto. | match | Servidor valida nombre y marca persistida. |
| F05 | Recorte circular y controles; iniciales ocupan la vista previa, sin foto real seleccionada. | repairable drift | Mostrar una imagen de prueba explícita seleccionada en el editor, sin inventar personas; probar recorte real en implementación. |
| F06 | Tres tareas, contexto calendario/tienda,7pendientes, dos incidencias y un acceso al resto. | match | Conservar estructura; sustituir ejemplos por datos reales. |
| F07 | Mono original de liana, estado final0, texto de tarea y Deshacer. | runtime proof | Medir transición1→0 y pausa2.6s; esta imagen no prueba tiempo. |
| F08 | Confirmación personal persistente y tareas del equipo con candado, sin edición ajena. | match | Mantener alcance backend. |
| F09 | Agregado autorizado del campamento y acceso al resumen. | match | No revelar tareas/personas de comisiones ocultas. |
| F10 | Estado tranquilo, mono original e historial sintético rotulado externamente. | match | Historial de producción solo con datos reales. |
| F11 | Lista única por vencimiento, contexto visible, filtro progresivo. | match | Completar listado real y navegación persistente durante scroll. |
| F12 | Contexto, responsables, descripción, estado, actividad y acciones propias. | match | Prueba de permisos y foco modal pendiente. |
| F13 | Diez comisiones agrupadas y legibles, todas en captura individual. | repairable drift | La navegación está en flujo y queda bajo el primer viewport en listas largas; fijarla de forma estable sin tapar la última fila. |
| F14 | Mascota independiente sin fragmentos, un avance y acciones de Responsable. | repairable drift | Dar a pestañaTareas al menos44px de ancho. |
| F15 | Proyectos y avance; el grupo Ronda26/27 aparece dos veces. | repairable drift | Quitar el segundo encabezado de grupo redundante. |
| F16 | Campamentos, +Nuevo campamento, Navidad sin nombres navideños de comisiones. | match | Mantener activación de colección por proyecto. |
| F17 | Seguimiento con incidencias y comisiones, sin grid de cinco KPI. | match | Validar permisos de coordinación en backend. |
| F18 | Personas legibles a320, invitación con destino contextual, roles. | repairable drift | Diseñar escena de lista de correos completa (ahora solo pestaña); reutilizar selector de diseño en vez del select nativo de muestra. Mantener barra visible durante scroll. |
| F19 | Nombre/foto/avisos/cerrar sesión. | match | Avisos configurables conservan lógica existente. |
| F20 | Formulario con dato preservado y error de fecha. | repairable drift | Sustituir selector nativo de muestra por diseño común, revisar fecha localizada y acciones con teclado virtual. |
| F21 | Cuenta vacía sin cifras ni trabajo fabricado. | match | Conservar. |
| F22 | Banana original estática con tres manchas, texto de carga. | match | Integrar componente existente y movimiento reducido. |
| F23 | Red y reintento diferenciados de acceso. | match | Probar error de red y mutación no confirmada. |
| F24 | Acceso tras caducar la sesión. | runtime proof | Renovación, límites y reapertura se prueban en API/dispositivo. |
| F25 | Error de código, corrección y reenvío. | match | Añadir escenas de intentos agotados y espera de reenvío en refinamiento. |
| F26 | Foto omitida, nombre e iniciales, Continuar. | match | Persistencia de onboarding es prueba de servidor. |
| F27 | Google cancelado con alternativa por código. | match | Retorno OAuth en dispositivos reales pendiente. |
| Copa/áreas seguras | Superficie bosque y borde orgánico compacto, marca sin cápsula, avatar44px; VSAFE simula44/34px. | match | Notch/DynamicIsland reales no se acreditan con simulación. |
| 320/375/390/430 | Capturas medidas sin desbordamiento. | match | Teclado, zoom y lectores pendientes de implementación. |
| Tablet/desktop | Login nuevo a768 y1440. Aplicación desktop no modificada. | runtime proof | Capturar referencia de aplicación desktop/tablet durante implementación y comprobar regresión. |
| Landscape | Captura844×390 no tiene desbordamiento horizontal, pero hereda min-height820 y la barra queda fuera del viewport inicial. | repairable drift | Adaptar alto mínimo y barra de navegación sin usar breakpoint de desktop solo por ancho. |
| Catálogo338 | Se utilizan originales individuales existentes en esta propuesta; no atlas. | runtime proof | Exportar y revisar colección completa después de aprobación. No se declara corregida globalmente. |
| Controles y teclado | Botones semánticos de muestra, focos CSS definidos; no hay lógica ni acciones. | runtime proof | Aplicación necesita foco de diálogos, navegación y pruebas de tecnologías asistivas. |

## Límites

No se han modificado `src/`, `server/`, `shared/`, pruebas ni dependencias. No se publican pantallas ni datos reales. Las escenas demuestran composición, no Google funcionando, renovación de sesión, código seguro, invitaciones enviadas ni aprobación del usuario. La copa conserva la dirección compacta; su reconocimiento inequívoco como copa de árbol debe valorarse en la comparación visual con el usuario.
