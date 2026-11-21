# Validación P0

## Resultados locales

Verificado sobre `feat/home-quick-actions`, base `0f857f4` (PR 51), con datos ficticios y almacenamiento local aislado. No se accedió a producción.

- `npm run build`: TypeScript y ambos builds Vite correctos.
- `node --import tsx --test tests/focus.test.ts tests/haptics.test.ts tests/offline-scripts.test.ts tests/tutorial.test.ts`: **13 aprobadas**, sin omisiones.
- Playwright: **113 casos distintos aprobados**, distribuidos en las ejecuciones relevantes de esta tarea:

| Archivo | Casos aprobados |
| --- | ---: |
| `home-quick-actions.spec.ts` | 20 |
| `mobile-v2.spec.ts` | 27 |
| `workflow-fixes.spec.ts` | 9 |
| `role-actions.spec.ts` | 4 |
| `flows.spec.ts` | 16 |
| `forest.spec.ts` | 5 |
| `tutorial.spec.ts` | 10 |
| `security-storage.spec.ts` | 7 |
| `mobile-canopy.spec.ts` | 10 |
| `typography.spec.ts` | 5 |

Comandos de navegador utilizados: `npx playwright test` seguido de los archivos anteriores bajo `tests/browser/`, en tandas. La última tanda focalizada ejecutó `home-quick-actions.spec.ts` completo y el caso `quick consecutive` de `mobile-v2.spec.ts`: **20/20**, tras el ajuste visual final y la corrección de expectativas antiguas. Después se ejecutaron las tres comprobaciones de brisa/copa que incluyen el acceso a Perfil desde el avatar; **3/3**. Finalmente se ejecutó de forma aislada el nuevo caso de dos sesiones independientes: **1/1**, y `tsc --noEmit` volvió a pasar. CI detectó otro selector de Perfil dentro de un recorrido de la copa. Tras adaptarlo al avatar, se ejecutó `mobile-canopy.spec.ts` completo: **10/10**, ampliación motivada por ese fallo concreto. La misma ejecución de CI detectó que tipografía aún esperaba cinco destinos. Se ajustó a cuatro, exigiendo sus etiquetas exactas, y `typography.spec.ts` pasó **5/5** (incluye ambas fuentes offline). No es una ejecución local de la suite completa de la aplicación.

La cobertura se amplió a navegación, roles, tutorial y almacenamiento porque Inicio comparte `MobileTasks`, `taskStatus`, confirmaciones y la cola offline con esos recorridos. Las comprobaciones de CI existentes no se modifican ni se omiten.

Durante el desarrollo se detectó y corrigió una cancelación del arrastre: el cambio de texto podía modificar el ancho intrínseco de una fila flex. La fila de Inicio usa ahora una columna estable y el recorrido real del control. También se actualizaron selectores de pruebas que buscaban el antiguo checkbox en Inicio; los de la pantalla Tareas permanecen. La expectativa antigua de completar una tarea bloqueada se sustituyó por conservar su contador, comprobando `data-value` y no el texto duplicado de la animación accesible.

## Cobertura y límites

Se comprueban umbral antes/después de soltar, toque, arrastre parcial, cancelación, pérdida de captura, cambio de orientación, scroll vertical táctil real mediante CDP, duplicados, guardado lento, 401/403/409, bloqueo/archivo/permisos, cambios encolados, reconexión, reapertura, Deshacer con versión confirmada, celebraciones, métricas y Smart Focus. Además de errores 409 inyectados, dos contextos de navegador independientes comparten un backend simulado con comprobación de versiones: la segunda sesión rechaza tanto el inicio como la finalización obsoletos, recarga el estado y no celebra. No se declara una prueba nueva de dos dispositivos físicos.

Anchos 320, 375, 390, 430, 768 y 1440; alternativa de teclado, nombres accesibles, texto ampliado en los controles nuevos, movimiento reducido y ausencia de vibración. Las comprobaciones de safe areas son de CSS/emulación: el resultado físico en cada iPhone/Android y la lectura completa con VoiceOver/TalkBack siguen pendientes. No se ha probado vibración física. Véase [HAPTICS.md](HAPTICS.md).

La revisión visual independiente identificó el motivo de bloqueo ausente en Inicio desktop. Se añadió y se recapturó; el revisor devolvió **`ship` para esa corrección**, sin regresiones observadas en ella. El detector Impeccable ejecutó una sola pasada regex sobre los cuatro archivos de UI: cero antipatrón, con avisos de dos tonos y texto de 13 px fuera del sistema registrado. Se reutilizaron posteriormente el separador/tono claro existentes y texto de 14 px; no se repitió el detector. Esa pasada no evaluó contraste de página parseada y no constituye una auditoría WCAG completa. El documenter preservó DESIGN.md y actualizó solo el contrato funcional de PRODUCT.md.

## Coste y comportamiento

No hay dependencias, migraciones, endpoints, escrituras periódicas ni timers de polling nuevos. Mover el tirador no consulta la API; cada transición solicitada utiliza la mutación existente. Los metadatos de cola se leen del almacenamiento local y los recibos se obtienen de respuestas ya recibidas. No se midieron latencias reales de Neon ni batería en hardware.

La salida de build de la base PR 51 era JS principal **499,77 kB / 156,05 kB gzip** y CSS **116,32 / 23,30 kB gzip**. La salida final es JS **506,98 / 158,22 kB gzip** y CSS **118,68 / 23,74 kB gzip**: +2,17 kB gzip de JS y +0,44 de CSS. Vite avisa de que el chunk principal supera 500 kB; no se ha ocultado ni cambiado su umbral. El aviso del script clásico `offline-store.js` permanece: se sirve como recurso público, también precacheado por el Service Worker.

## Revisión, publicación y reversión

Esta rama no autoriza fusionar ni desplegar. No requiere configuración, secretos ni migración de base de datos.

Tras aprobación, comprobar los checks obligatorios de la PR y publicar con el procedimiento habitual. El shell importa `offline-store.js?v=9` y el Service Worker renueva la caché pública a v14. Verificar con una cuenta de prueba autorizada Inicio pendiente/en curso, completar/Deshacer, perfil desde las cuatro vistas y sincronización de una operación encolada. No usar datos privados en capturas.

Para revertir, revertir el commit de esta PR y publicar el build anterior por el procedimiento habitual. El Service Worker detecta el cambio de script y renueva su caché; no borrar IndexedDB ni las cookies. La cola conserva el mismo esquema y endpoints: las transiciones ya confirmadas son datos válidos y no deben revertirse masivamente. Comprobar una sincronización pendiente y la navegación anterior después de recargar la PWA. Este rollback está analizado por compatibilidad de código; no se ejecutó un despliegue o rollback productivo.
