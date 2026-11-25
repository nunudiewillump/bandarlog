# Primer incremento de Feedback for All

La auditoría y las decisiones de integración están en [auditoria.md](auditoria.md).

## P2.0 · Plantillas

Con `EVALUATION_TEMPLATES_ENABLED=true`, Coordinación y Administración de grupo abren **Proyectos → Plantillas de evaluación**. Pueden crear, guardar, duplicar, archivar, restaurar, importar y exportar estructuras JSON. El editor admite secciones, descripciones, preguntas obligatorias y opcionales, orden de preguntas dentro de cada sección y los diez tipos solicitados. El listado y el historial cargan hasta 30 filas por página. La importación y las descargas usan exclusivamente el esquema de estructura, sin datos de cuenta, grupo ni participación.

**Publicar versión** conserva una copia exacta del borrador guardado. Editar o archivar después mantiene la copia consultable y exportable. La revisión se incrementa al guardar cambios o modificar el estado de archivo. Por eso es posible que la secuencia de versiones publicadas tenga saltos. El guardado con una revisión obsoleta se rechaza. Un bloqueo de fila serializa publicación, edición y archivo, y la restricción de unicidad deduplica la publicación concurrente de una revisión.

## Datos y permisos

| Relación | Datos y protecciones |
| --- | --- |
| `evaluation_templates` | Borrador JSONB, revisión y estado de archivo. Clave primaria por grupo y plantilla. |
| `evaluation_template_versions` | Copia JSONB, revisión, hora de publicación del servidor y autor. Clave primaria por grupo, plantilla y revisión. Claves externas compuestas hacia el borrador y la cuenta publicadora. El rol HTTP solo puede insertar versiones que coincidan con el borrador activo y cuya autoría corresponda a la sesión. Carece de permisos para actualizarlas o borrarlas. |

La API usa la sesión y CSRF existentes, los permisos de roles de grupo, validación Zod compartida y un límite por cuenta. PostgreSQL aplica RLS con la identidad de sesión. Los procesos de identidad y entrega carecen de acceso directo. El entorno de desarrollo mantiene el contexto de grupo firmado y aplica el control de rol adicional en Express. No se añadió ninguna dependencia.

## Instalación y vuelta atrás

1. En un entorno aislado, aplicar `npm run db:migrate` con la identidad de mantenimiento y una conexión directa cuando se use Neon. La migración aditiva 0043 crea las dos tablas y eleva el contrato SQL a 43. No reescribe datos existentes.
2. Compilar con `npm run build` y actualizar los componentes utilizando su configuración de runtime actual. Verificar `/api/live` y la disponibilidad del contrato SQL antes de habilitar el editor.
3. Activar el flag en el proceso HTTP aislado y comprobar Proyectos con una cuenta de Coordinación de prueba. Para producción se requiere la revisión solicitada.
4. Para retirar el editor, desactivar el flag y reiniciar HTTP. Para revertir la aplicación, volver al build anterior con el esquema aditivo conservado. El código anterior acepta un contrato superior a 42. Conservar las tablas preserva borradores y versiones para una reactivación posterior.

## Rendimiento e infraestructura

| Build local | Base | Incremento |
| --- | ---: | ---: |
| JS inicial minificado | 509,24 kB | 509,87 kB |
| JS inicial gzip | 159,27 kB | 159,46 kB |
| JS del editor gzip | — | 27,99 kB bajo demanda |
| CSS del editor gzip | — | 0,43 kB bajo demanda |
| JS de administración global gzip | 6,90 kB | 6,90 kB |

Cada página de listado agrega una consulta acotada al contenido, además de la sesión existente. Los borradores y versiones se recuperan al solicitarlos. Una edición o publicación ejecuta un bloqueo del borrador y una escritura dentro de la misma transacción. Los dos índices de claves primarias sirven a los accesos por grupo y a la paginación. Neon añade almacenamiento proporcional a las estructuras guardadas y sus versiones. Railway ejecuta el mismo proceso HTTP sin servicios, tareas programadas ni temporizadores nuevos. En PostgreSQL 17 local, con 30 grupos y 400 plantillas ficticias por grupo, el listado de 31 filas usó la clave primaria con condición por grupo y ejecutó en 1,38 ms (caché caliente). Quedan pendientes medidas antes y después de latencia HTTP, CPU, memoria, transferencia y consumo en Neon y Railway.

## Cobertura y límites

- **P2.0 parcial.** Editor y versionado de plantillas verificables. Quedan por implementar evaluaciones, asignaciones, borradores de respuesta, modalidades colectivas y garantías de anonimato.
- **P2.1–P2.3 pendientes.** Experiencia del participante y de Inicio, cierre y reapertura transaccionales, resultados, conclusiones y creación de tareas.
- **P2.4–P2.5 pendientes.** PDF, anexos autorizados, ejemplos con datos ficticios, memoria y comparativas históricas.
- **P2.6–P2.8 pendientes.** Campañas y recurrencia, SUS y NPS, métricas de Product Insights, soporte y feedback espontáneo.
- Las pruebas SQL se ejecutaron en PGlite y PostgreSQL 17 con el rol HTTP y sesiones sintéticas. La prueba de navegador del editor usa API simulada. Las pruebas HTTP separadas ejercitan la persistencia y permisos con PGlite. Quedan pendientes Safari, PWA instalada, Android físico y tecnologías de asistencia.

## Verificación

- Nueve pruebas dirigidas en `evaluation-templates.test.ts`, `groups-api.test.ts` y `project-migration.test.ts`. Se incluyó la migración de proyectos por el cambio de contrato SQL y para comprobar el historial existente.
- Tres pruebas en PostgreSQL 17 local. Se verificaron plantillas, identidad SQL por actor y reutilización de conexiones entre grupos.
- Cuatro recorridos dirigidos en Chromium para el editor y la regresión de creación y navegación de proyectos. La primera ejecución falló por una discrepancia de rol en el fixture del editor y un timeout en creación móvil. Se corrigió el fixture y ambos recorridos pasaron con servidores aislados. El editor volvió a pasar tras el ajuste de espaciado.
- Pasaron TypeScript, ambos builds de Vite y `git diff --check`. Vite conserva dos avisos de la base sobre el script offline y el tamaño del chunk inicial.
- Capturas con datos ficticios en [móvil](../../artifacts/feedback-for-all/plantillas-movil.png) y [escritorio](../../artifacts/feedback-for-all/plantillas-escritorio.png).
