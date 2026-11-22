# Hoja 2D en Inicio y actualización de la PWA

Cambio sobre `99f8094` (PR 53). El tirador incorpora la hoja 2D probada en el prototipo, con nervadura clara y relleno de progreso plano. No hay gradientes, dependencias, nuevos endpoints o cambios en las transiciones. El área táctil sigue siendo de 44 × 44 px; el SVG no intercepta Pointer Events. El tutorial reutiliza el mismo componente. El menú uniforme y fijo de cuatro destinos y la retirada del acceso redundante de Inicio proceden de la PR 53.

Service Worker v15 renueva los recursos públicos. No cambia el esquema IndexedDB, la cola, los recibos, el contexto de grupo o las cookies; no borra trabajo pendiente ni requiere migraciones.

## Verificación local

- `npm run build`: TypeScript y ambos builds Vite correctos.
- `node --import tsx --test tests/offline-scripts.test.ts`: 2/2.
- `E2E_DATA_DIR=.data/leaf-runtime-clean npx playwright test tests/browser/home-quick-actions.spec.ts tests/browser/tutorial.spec.ts`: 31/31.
- `E2E_DATA_DIR=.data/leaf-runtime-clean npx playwright test tests/browser/workflow-fixes.spec.ts --grep 'installed build reads offline'`: 1/1; prueba específica de PWA instalada, lectura offline, cola y sincronización.

Se limita la cobertura local a Inicio, tutorial y la PWA instalada por el componente compartido y la renovación del caché. No se ejecuta la suite completa local ni se alteran workflows obligatorios. Las capturas usan datos ficticios. El detector se ejecutó una vez sobre los dos archivos de UI: cero antipatrones por regex; no constituye una auditoría completa de accesibilidad. No hay nueva prueba física iOS/Android.

## Publicación

La inspección previa encontró que el servicio HTTP `bandarlog` continuaba en la PR 52 y que su origen tenía un commit antiguo fijado. Se publicará después de los checks y la fusión: reconectar exclusivamente ese servicio al repositorio y rama `main`, sin fijar commit, y observar el despliegue hasta `SUCCESS`. Comprobar también el healthcheck, el SVG en el bundle servido, el relleno plano en CSS y el Service Worker v15 públicos. No se modifican los servicios identity/delivery ni variables o bases de datos.

La autorización de esta entrega incluye integrar y aplicar el cambio en Railway. El resultado real del despliegue se registra en la entrega/PR, no se presupone aquí. Una pestaña que ya estuviera abierta necesita recargarse para ejecutar el bundle nuevo.
