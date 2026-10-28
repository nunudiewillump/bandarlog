# Estado de revisión · Forest Experience

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
| Acceso Stitch | No verificado: no hay herramientas Stitch expuestas en la sesión. No se pudo ejecutar `list_projects`; no se atribuye acceso a un manifiesto de plugin. |
| Conexión registrada | El usuario autorizó expresamente el cambio. Registrado en el perfil Codex de este ejecutor el endpoint oficial con cabecera vinculada a `STITCH_API_KEY`. Verificado mediante `codex mcp get stitch --json`, sin mostrar valores secretos. |
| Credencial | No disponible en el proceso actual. Guardado requisito de secreto personal `STITCH_API_KEY`, limitado a `stitch.googleapis.com`, en el borrador del entorno. El guardado está confirmado; requiere entrada segura de clave y publicar el entorno. No está aplicado ni implica una conexión verificada. |
| Generación | No iniciada. Ambas propuestas deben comenzar en paralelo desde `stitch-brief.md` cuando Stitch esté verificado. No se reemplaza el camino elegido por una propuesta solo Codex. |
| Graph assistance | No se ha construido ni utilizado un grafo. No hay identidad de proyecto de Design Arc verificada para validarlo; se sigue el flujo ordinario sin atribuir evidencia al grafo. |
| Veredicto visual | Pendiente: no hay nuevas pantallas renderizadas que permitan emitir uno de los tres veredictos. |
| Rondas de corrección | Cero usadas. |
| Aprobación visual | Pendiente. El modo elegido exige presentar la propuesta antes de implementar. |
| Implementación | No iniciada. No cambios en `src`, `server`, `shared`, pruebas, dependencias ni base de datos. |
| Producción | Sin despliegue, cambios de variables ni envío de correos. |

## Evidencia conservada

Capturas actuales revisadas: `artifacts/revision-movil/home-active-390.png`, `commission-clear-390.png` y `profile-active-390.png`. Corresponden al código del PR #8 y datos sintéticos del fixture. Se preservan los archivos y otros resultados de pruebas existentes.

La revisión encontró un fragmento de otro personaje bajo Cocina y duplicaciones de texto, progreso y acceso a tareas. Son hallazgos observados, no una certificación completa de accesibilidad.

## Bloqueo y siguiente acción

Stitch permite crear mockups editables en un lienzo visual. Para el camino emparejado elegido falta activar la credencial y comprobar una llamada de lectura. El perfil del ejecutor ya contiene la configuración autorizada y solo referencia `STITCH_API_KEY`: nunca guardar la clave en el repositorio, archivos del proyecto, chat o estado de Design Arc. Esto no modifica el perfil del ordenador personal del usuario ni garantiza que las herramientas se recarguen en una sesión ya abierta.

La clave se crea en https://stitch.withgoogle.com/ → foto de perfil → Stitch settings → API key → Create key. Debe introducirse únicamente mediante la interfaz segura de secretos de la configuración de este entorno, en `STITCH_API_KEY`. Revisar y guardar los cambios, y publicar el entorno para activarlos. Después, redescubrir herramientas y verificar `list_projects` antes de generar. Si las herramientas no se recargan en la sesión actual, informar del límite; no improvisar archivos de secretos.

Tras verificar la conexión, empezar las dos propuestas con la misma especificación sin repetir auditoría, objetivo ni elección de renderizadores. Si no se puede conectar, continuar solo con Codex requiere elección explícita del usuario.

## Prueba que no aporta una lámina

Siguen pendientes hasta la implementación: medidas reales de contadores/animaciones, renovación y revocación de sesiones, backend Google, códigos, onboarding persistido, teclado/lector de pantalla, colección completa separada, regresión desktop y dispositivos físicos iOS/Android con PWA instalada. No se confunden las futuras pruebas de aplicación con la revisión visual de una propuesta.
