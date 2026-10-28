# Estado de revisión · Forest Experience

**Actualización de implementación:** el usuario aprobó la propuesta refinada y ajustó todos los guiños a 2D, incluida la liana. Los recursos 3D de estas láminas quedan sustituidos por esa decisión. Estado actual y comprobaciones: [implementación](implementacion.md).


28 de octubre de 2026. Revisión `forest-experience-20261028`, runtime Codex, metodología Design Arc 0.3.0.

| Paso | Estado y evidencia |
| --- | --- |
| Integraciones | Skills Design Arc, Designly e Impeccable disponibles y leídas en esta sesión. Sin resultado de motor Impeccable: el launcher falló por permisos de caché. |
| Fuentes | Solo guías oficiales, elegido por el usuario. Fuentes y alcance de lectura en README. Sin Mobbin. |
| Objetivo | Confirmado explícitamente por el usuario. |
| Modo | Seguir recomendación, elegido por el usuario para esta revisión. No se guardaron preferencias de perfil. |
| Auditoría | Fuente, pruebas y capturas actuales inspeccionadas. Auth y dirección artística revisados en paralelo mediante agentes de solo lectura siguiendo Designly Director. |
| Dirección | A, copa compacta en flujo normal, seleccionada por el modo elegido. Alternativa y trade-offs documentados. |
| Renderizadores | Codex y Stitch, elegidos por el usuario. La elección se conserva. |
| Acceso Stitch | Verificado mediante MCP oficial por HTTPS: initialize, tools/list y list_projects respondieron correctamente. La cuenta no tenía proyectos. No se muestran datos ajenos. |
| Conexión registrada | El usuario autorizó expresamente el cambio. Registrado en el perfil Codex de este ejecutor el endpoint oficial con cabecera vinculada a `STITCH_API_KEY`. Verificado mediante `codex mcp get stitch --json`, sin mostrar valores secretos. |
| Credencial | Requisito activado por el usuario; entorno revisión 13 con observación actual ready. No se ha leído ni guardado su valor. La cabecera usa la referencia del proceso y el proxy heredado. |
| Generación | Ambas propuestas iniciadas en paralelo con la misma especificación. Proyecto privado Stitch `9157822480698906524`. Codex genera una lámina estática separada; resultados conservados e inspeccionados por separado. |
| Graph assistance | No se ha construido ni utilizado un grafo. No hay identidad de proyecto de Design Arc verificada para validarlo; se sigue el flujo ordinario sin atribuir evidencia al grafo. |
| Veredicto visual inicial | Codex: meets with corrections. Stitch: does not meet. Matrices independientes y comparación en comparacion.md. |
| Rondas de corrección | Una usada, solo Codex, seleccionada por el usuario. Quedan dos del presupuesto compartido; no se necesitan para los hallazgos materiales de esta propuesta. |
| Aprobación visual | Pendiente sobre la propuesta Codex refinada. El usuario eligió platform. Ronda 1: meets direction, quince correcciones resueltas, sin pendientes materiales en la revisión estática. Véase propuesta-refinada.md. |
| Implementación | No iniciada. No cambios en `src`, `server`, `shared`, pruebas, dependencias ni base de datos. |
| Producción | Sin despliegue, cambios de variables ni envío de correos. |

## Evidencia conservada

Capturas actuales revisadas: `artifacts/revision-movil/home-active-390.png`, `commission-clear-390.png` y `profile-active-390.png`. Corresponden al código del PR #8 y datos sintéticos del fixture. Se preservan los archivos y otros resultados de pruebas existentes.

La revisión encontró un fragmento de otro personaje bajo Cocina y duplicaciones de texto, progreso y acceso a tareas. Son hallazgos observados, no una certificación completa de accesibilidad.

## Conexión y siguiente acción

Stitch está conectado por su servidor oficial, usando la referencia segura del entorno y sin guardar su valor. Se verificó una consulta de proyectos vacía y se creó el proyecto privado `9157822480698906524`. Como las herramientas no se recargaron en el catálogo de esta sesión, se utilizó el protocolo MCP oficial por HTTPS con el proxy heredado; no un servicio alternativo.

Ambas propuestas se iniciaron en paralelo. Se conserva la especificación exacta enviada en `common-brief.sent.txt` y su huella en `generation-record.json`. La clave no forma parte de esos archivos. Los cinco recursos oficiales públicos se verificaron contra el repositorio antes de enviarlos como referencias.

La siguiente acción es inspeccionar los dos resultados completos, producir matrices de conformidad independientes y compararlos. Solo entonces se elegirá el alcance de refinamiento. La autorización de conexión no cambia los límites de diseño, implementación ni despliegue.

## Prueba que no aporta una lámina

Siguen pendientes hasta la implementación: medidas reales de contadores/animaciones, renovación y revocación de sesiones, backend Google, códigos, onboarding persistido, teclado/lector de pantalla, colección completa separada, regresión desktop y dispositivos físicos iOS/Android con PWA instalada. No se confunden las futuras pruebas de aplicación con la revisión visual de una propuesta.
