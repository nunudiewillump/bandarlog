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
- Los listados reutilizan índices de proyectos, comisiones, responsables y tareas. Los resúmenes de proyecto se agregan en una pasada, manteniendo el orden, fechas, estados y alcance autorizado. No se introduce caché de autorización ni de respuestas privadas de API.

## Un solo acceso para todos los grupos

El acceso canónico es `/g/ID/`, incluido Rosales. La raíz con una sesión válida recuerda ese destino; `/acceso` y las consultas antiguas en `/` redirigen conservando token, tarea, acción y contexto. Los enlaces nuevos de correo, notificaciones, catálogo privado y manifiestos apuntan al grupo correspondiente. La página pública no ofrece una entrada especial al grupo inicial.

La navegación interna conserva el prefijo del grupo, registra cambios de sección en el historial y resuelve atrás/adelante, contexto de proyecto/comisión y retorno desde una tarea con su scroll. Se normalizan los nombres de vistas anteriores. No se modifica ningún ID de grupo, usuario, tarea o proyecto, ni su historial.

### Compatibilidad temporal, fuera del flujo funcional

Las API antiguas se mantienen para instalaciones previas y sincronización pendiente; no se redirigen sus POST. El grupo inicial conserva temporalmente su cookie raíz compatible. Las cookies del resto de grupos mantienen su Path privado. Cerrar sesión revoca la sesión y limpia las cookies compatibles del grupo inicial.

El script del ámbito canónico identifica desde el servidor si corresponde al grupo inicial. Solo después de verificar `/api/me` puede recuperar el snapshot y los cambios pendientes de la antigua base local de ese mismo usuario. Se conserva la base canónica si ya existía. Los trabajos se copian sin cambiar sus IDs, se deduplican y se ordenan por fecha; después se retiran únicamente los IDs copiados de la cola antigua. Se toman ambos bloqueos siempre en el mismo orden. Si una interrupción deja una copia repetida, los recibos del servidor impiden repetir su efecto.

No se importan trabajos de otra cuenta ni se ejecuta esta recuperación para otros grupos. El código genérico antiguo no fuerza un namespace distinto a las instalaciones privadas anteriores. Al salir se limpia también el snapshot compatible del mismo usuario, sin borrar el de otra cuenta. Los desafíos de acceso aún vigentes se recuperan en la misma transición, sin guardar el código introducido.

Los service workers, cachés y snapshots necesarios para las instalaciones anteriores no se eliminan de forma indiscriminada. La nueva caché conserva recursos públicos por hash y no guarda respuestas de API. `Vary: Origin` de un recurso público no invalida su copia precargada; esa excepción no se aplica a respuestas privadas. La instalación raíz conserva su identidad de manifiesto, pero su destino de arranque se vuelve canónico. El cierre de esta compatibilidad requiere haber migrado las instalaciones y colas antiguas; no forma parte de esta fase.

## Verificación y medición

Se han aprobado 44 casos distintos Node/API y 33 recorridos de navegador seleccionados. Se amplía la cobertura a permisos, separación entre grupos, correo, historial y sincronización porque cambian navegación, sesión y almacenamiento compartidos. No se ejecuta manualmente toda la suite ni se modifica la política de CI.

Se compara la versión anterior con esta implementación usando el mismo fixture, seis cambios de orientación y una ralentización de CPU de 4× en Chromium. Las medidas incluyen el protocolo de automatización y dos frames; son una comparación local, no una promesa de latencia en dispositivos físicos o en Neon/Railway. Evidencia en `artifacts/performance/orientation-before.json` y `orientation-after.json`; las capturas comparan el SVG y la versión precalculada.

| Medida (seis giros, CPU 4×)    |     Antes |   Después |
| ------------------------------ | --------: | --------: |
| Trabajo JavaScript             |   5.65 ms |   3.53 ms |
| Layout                         |  30.04 ms |  24.83 ms |
| Recálculo de estilos           | 155.11 ms |  63.24 ms |
| Tiempo de tareas del renderer  | 890.88 ms | 770.29 ms |
| Mediana de cambio + dos frames | 168.64 ms | 147.46 ms |

No se cambian variables de producción, dependencias, esquema de base de datos ni servicios externos. Queda comprobar el acabado y los gestos en Safari y Android instalados sobre hardware real.
