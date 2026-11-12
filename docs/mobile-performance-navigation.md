# Rendimiento móvil y navegación canónica

## Renderizado, orientación y scroll

La copa móvil utiliza una imagen WebP sin pérdida en tres densidades (1×, 2× y 3×), generada desde el mismo componente SVG: conserva siluetas, nervios, sombras y rellenos. El recorte cubre los anchos móviles vertical y horizontal. La brisa se compone sobre una sola capa y los dos pequeños rellenos del rótulo se mantienen. El escritorio conserva el vector y su interacción de cursor.

El SVG original sigue disponible hasta que la imagen esté cargada, y permanece como alternativa si falla la descarga. No se espera a la imagen para mostrar la aplicación. Los componentes de la copa y su dibujo se memoizan; el cambio de orientación no recrea sus nodos ni reinicia todos sus estilos y temporizadores. Las imágenes tienen nombres derivados del contenido; los recursos con hash usan caché inmutable en producción.

Regeneración de los recursos:

```sh
node --import tsx scripts/build-mobile-canopy.ts
```

Se ocultan las barras de scroll móviles sin ocultar overflow ni sustituir el desplazamiento nativo. Los navegadores que soportan `touch-action` ya no reciben listeners globales bloqueantes en cada `touchmove`; se conservan la restricción de zoom de la PWA y los eventos de gesto de Safari. Los navegadores antiguos mantienen la alternativa anterior. La cabecera permanece fija como una pieza y no se reintroduce el rebote exterior.

El fondo operativo móvil permanece crema durante el arranque y las dimensiones intermedias de una rotación. La pantalla de carga existe antes de ejecutar React, con la banana original, y las fuentes de los títulos y botones se precargan. Se evita el blur de pantalla completa en los modales móviles. La barra nativa conserva el tema verde oscuro.

## Procesamiento y datos

- Los datos comienzan a solicitarse en cuanto se verifica la sesión, en paralelo con un healthcheck lento. La interfaz sigue esperando el resultado de salud y autorización antes de presentar información privada.
- Las consultas de estado, snapshots y trabajos pendientes de IndexedDB son transacciones readonly. No reescriben el snapshot completo ni abren otra conexión en cada lectura; se conserva la recuperación ante cierre o cambio de versión.
- Las escrituras de la cola siguen siendo transaccionales y conservan bloqueo, versiones esperadas, recibos idempotentes y CSRF.
- Los listados reutilizan índices de proyectos, comisiones, responsables y tareas. Los resúmenes conservan los agregados SQL incorporados en `main` por el PR #34: no se vuelven a descargar todas las tareas para calcularlos en JavaScript. Se mantienen las consultas acotadas y la reutilización de avatares con permisos revalidados; no se añade caché de autorización ni de respuestas privadas de API.

## Un solo acceso para todos los grupos

El acceso canónico es `/g/ID/`, incluido Rosales. La raíz con una sesión válida recuerda ese destino; `/acceso` y las consultas antiguas en `/` redirigen conservando token, tarea, acción y contexto. Los enlaces nuevos de correo, notificaciones, catálogo privado y manifiestos apuntan al grupo correspondiente. La página pública no ofrece una entrada especial al grupo inicial.

La navegación interna conserva el prefijo del grupo, registra cambios de sección en el historial y resuelve atrás/adelante, contexto de proyecto/comisión y retorno desde una tarea con su scroll. Se normalizan los nombres de vistas anteriores. No se modifica ningún ID de grupo, usuario, tarea o proyecto, ni su historial.

### Compatibilidad temporal, fuera del flujo funcional

Las API antiguas se mantienen para instalaciones previas y sincronización pendiente; no se redirigen sus POST. El grupo inicial conserva temporalmente su cookie raíz compatible. Las cookies del resto de grupos mantienen su Path privado. Cerrar sesión revoca la sesión y limpia las cookies compatibles del grupo inicial.

El script del ámbito canónico identifica desde el servidor si corresponde al grupo inicial. Solo después de verificar `/api/me` puede recuperar el snapshot y los cambios pendientes de la antigua base local de ese mismo usuario. Se conserva la base canónica si ya existía. Los trabajos se copian sin cambiar sus IDs, se deduplican y se ordenan por fecha; después se retiran únicamente los IDs copiados de la cola antigua. Se toman ambos bloqueos siempre en el mismo orden. Si una interrupción deja una copia repetida, los recibos del servidor impiden repetir su efecto.

No se importan trabajos de otra cuenta ni se ejecuta esta recuperación para otros grupos. El código genérico antiguo no fuerza un namespace distinto a las instalaciones privadas anteriores. Al salir se limpia también el snapshot compatible del mismo usuario, sin borrar el de otra cuenta. Los desafíos de acceso aún vigentes se recuperan en la misma transición, sin guardar el código introducido.

Los service workers, cachés y snapshots necesarios para las instalaciones anteriores no se eliminan de forma indiscriminada. La nueva caché conserva recursos públicos por hash y no guarda respuestas de API. `Vary: Origin` de un recurso público no invalida su copia precargada; esa excepción no se aplica a respuestas privadas. La instalación raíz conserva su identidad de manifiesto, pero su destino de arranque se vuelve canónico. El cierre de esta compatibilidad requiere haber migrado las instalaciones y colas antiguas; no forma parte de esta fase.

## Verificación y medición

La verificación inicial aprobó 44 casos distintos Node/API y 34 recorridos de navegador seleccionados. La integración posterior con `main` y la corrección de CI se detallan a continuación. Se amplía la cobertura a permisos, separación entre grupos, correo, historial y sincronización porque cambian navegación, sesión y almacenamiento compartidos. No se ejecuta manualmente toda la suite ni se modifica la política de CI.

Se compara la versión anterior con esta implementación usando el mismo fixture, seis cambios de orientación y una ralentización de CPU de 4× en Chromium. Las medidas incluyen el protocolo de automatización y dos frames; son una comparación local, no una promesa de latencia en dispositivos físicos o en Neon/Railway. Evidencia en `artifacts/performance/orientation-before.json` y `orientation-after.json`; las capturas comparan el SVG y la versión precalculada.

| Medida (seis giros, CPU 4×)    |     Antes |   Después |
| ------------------------------ | --------: | --------: |
| Trabajo JavaScript             |   5.65 ms |   3.53 ms |
| Layout                         |  30.04 ms |  24.83 ms |
| Recálculo de estilos           | 155.11 ms |  63.24 ms |
| Tiempo de tareas del renderer  | 890.88 ms | 770.29 ms |
| Mediana de cambio + dos frames | 168.64 ms | 147.46 ms |

No se cambian variables de producción, dependencias, esquema de base de datos ni servicios externos. Queda comprobar el acabado y los gestos en Safari y Android instalados sobre hardware real.

## Integración del PR #33 con la base de datos actual

La integración parte de `main` en `5147217932841a6efdb776a40422ea35775b9dc3`, después de los PR #34 y #35, e incorpora la rama del PR #33 mediante un merge normal. No se reemplaza `main` por el contenido de la rama antigua ni se reescribe su historial.

Los conflictos en `/api/data` se resuelven conservando los filtros SQL de `main`. `server/project-summaries.ts` queda idéntico a `main`, con agregación en PostgreSQL; se retira la prueba de la implementación JavaScript sustituida. También permanecen idénticos las migraciones, su journal, esquema, conexión de base de datos, entregas push, planificador, seed, paginación, reutilización de avatares, healthcheck de Railway y componente de actividad paginada. El cliente conserva el intervalo SSE anunciado por el servidor, incluido el valor cero para suspender el polling sano.

Los tres checks fallidos eran dos fallos de prueba y el guard final que los resume. La prueba de catálogo aún esperaba una URL raíz: ahora verifica el ID de grupo correcto y la carga efectiva de la imagen. El checklist del tutorial esperaba al servidor para reflejar el cambio; ahora responde inmediatamente, bloquea operaciones simultáneas y restaura el estado confirmado si falla el guardado. Una prueba retiene la respuesta y simula un error 503 antes de confirmar el segundo intento. No se relajan los checks ni se añaden reintentos para ocultar fallos.

Validación de esta integración: 30 casos distintos Node/API y 39 recorridos de navegador aprobados, TypeScript/Vite y `git diff --check`. Se amplía por el riesgo concreto de modificar rutas, sesiones y almacenamiento compartido: aislamiento push entre diez grupos y migraciones completas sobre PGlite, historial paginado con cursor reutilizado entre ruta antigua y canónica, agregados autorizados, idempotencia offline, permisos, tutorial, SSE sin polling, orientación y sesiones de PWA existentes. No se repite manualmente la suite completa ni se cambia la selección de CI. Los cambios se suben al PR existente mediante avance rápido, sin force push. La base de datos real no se restaura, migra ni reconfigura en esta integración.
