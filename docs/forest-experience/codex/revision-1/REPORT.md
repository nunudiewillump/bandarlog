# Codex · ronda de refinamiento 1

Alcance autorizado por el usuario: **platform**. Stitch y su propuesta inicial se mantienen intactos. Se conserva la dirección A y los recursos oficiales. Estado: construcción y comprobación inicial de esta ronda terminadas; **revisión independiente pendiente**. Este informe no es aprobación del usuario ni prueba de implementación.

## Cambios de esta única ronda

- Copa de64px +16px con lóbulos asimétricos más claros y volúmenes discretos dentro de la misma paleta. Marca oficial integrada, wordmark crema y avatar44px.
- Navegación fija a la ventana, áreas seguras y reserva inferior para que la última fila sea accesible. Landscape tiene composición propia y captura de viewport real844×390, además del documento completo y estado desplazado.
- Iconos de las diez comisiones tomados de la selección real del catálogo, incluido Staff con su elección automática. Servicios mantiene su mono independiente original sin recortes de lámina.
- Todas las pestañas, botones, campos, textarea, checkbox y range medidos alcanzan44×44px. Selectores cerrados y abierto diseñados con el lenguaje común; opción seleccionada verde y check.
- F15 tiene un solo encabezado de ronda. F11 representa las siete tareas personales. F26 es el Inicio posterior a omitir la foto, con inicialesAL, sin repetir onboarding.
- F05 muestra una imagen real de prueba tomada de la mascota original, rotulada fuera de la escena; no se inventa una persona. VRETURN muestra el retorno al formulario con Alex conservado.
- Nuevas escenas: nombre vacío, espera de reenvío, desafío agotado, lista de correos abierta y error de línea, error de envío conservando valores, invitación desde proyecto, Scouter en consulta, selector abierto y fotograma anterior de una sola tarea.
- La secuencia VLAST→F07→F08 muestra1→0→equipo y confirmación personal persistente. Los2600ms, interrupción y anuncios accesibles siguen siendo prueba de ejecución futura.
- El tablero utiliza imágenes completas enlazadas a cada HTML, en vez de iframes fijos que cortaban acciones o contenido largo.

## Datos y coherencia

`../dataset.json` exporta el fixture existente `tests/fixtures/mobile.ts` sin modificarlo, con títulos de muestra adaptados únicamente en el documento de diseño. `dataset-reconciliation.json` registra las etapas y asociaciones originales del catálogo.

- Inicial:74tareas =7propias abiertas +30abiertas de equipo +14de otras comisiones del campamento (solo agregado) +23terminadas.
- Filas de las diez comisiones iniciales:37abiertas en total. Tras terminar las siete personales,30abiertas de equipo. Al terminar todas las accesibles de comisión,0abiertas en esas filas y14abiertas del campamento.
- En la etapa campamento:41tareas del campamento,27terminadas y14abiertas,66%. En la etapa inicial:41total/10terminadas/31abiertas,24%.
- Servicios inicial:5total/2terminadas/3abiertas,40%. Ronda inicial:33total/13terminadas/20abiertas,39%.
- Variantes de1y5comisiones también se derivan del fixture correspondiente y no reutilizan sumas arbitrarias de la variante10.
- Fecha de evaluación de ejemplos:28-10-2026. La vencida se rotula Ayer para evitar contradecir una hora futura de hoy. Los estados se identifican como datos sintéticos.

No se afirma que una lámina ejecute el fixture como aplicación ni conceda permisos reales. La autorización de datos y su actualización se probarán en API/browser al implementar.

## Evidencia de esta ronda

43escenas:27principales +16variantes. 251PNG con capturas completas en320/375/390/430; viewport390 de cada escena; login y onboarding768×1024 y1440×1000; viewport horizontal844×390, documento completo y desplazamiento; tres comprobaciones de final de lista a320; tablero completo y cinco láminas por grupos. Las copias `r1-*` facilitan la revisión sin sustituir las capturas con ID de escena.

`measurements.json` contiene187registros. `findings.json` no registra desbordamientos horizontales, imágenes rotas, objetivos inferiores a44px, barra fuera de viewport ni última fila oculta en los tres desplazamientos comprobados. Los objetivos mínimos registrados son44×44px. Es evidencia geométrica del diseño estático, no auditoría exhaustiva de accesibilidad o dispositivos.

Las capturas `*-full.png` amplían el viewport a la altura del contenido manteniendo el mismo ancho para mostrar íntegramente la composición y la barra al pie. **No son evidencia de que todo ese contenido quepa en una pantalla física.** La evidencia de ventana visible es `*-viewport.png`; las horizontales tienen exactamente844×390px. `*-scrolled.png` muestra la barra y final de contenido después de desplazar. El manifiesto diferencia recursos y prueba de implementación pendiente.

Inspección visual propia en una única pasada: cinco láminas que cubren las43escenas; además Inicio, comisiones, lista de correos, editor, onboarding desktop, viewport horizontal y final de lista a320. No se han hecho microcorrecciones después de esta inspección ni se declara un veredicto independiente desde el mismo contexto de construcción.

## Próxima revisión y límites

El revisor independiente debe puntuar los hallazgos iniciales como resueltos, parciales o pendientes usando los nuevos renders y comprobar regresiones. Recursos: `../initial-review.md`, `../INITIAL-QA.md`, `assets-manifest.json`, `dataset-reconciliation.json`, `measurements.json`, `findings.json`, `captures/board-*.png` y capturas individuales.

Continúan pendientes de implementación: API de códigos, Google, renovación, persistencia de onboarding, permisos reales, selección/recorte funcional de foto,el resto del catálogo no presente en estas escenas, foco de diálogos, lector de pantalla, teclado virtual, cronometraje de movimiento, PWA instalada y regresión de la aplicación desktop. Esta ronda solo modifica documentos estáticos de diseño; no cambia `src`, `server`, `shared`, pruebas, dependencias, base de datos ni producción.
