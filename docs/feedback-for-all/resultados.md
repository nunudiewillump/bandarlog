# Historial y resultados de evaluaciones

**Proyectos → Plantillas de evaluación → Opciones de plantillas → Histórico y resultados** abre una lista paginada para Coordinación y Administración. El histórico se vincula al grupo y conserva el título, el plazo y la versión publicada de cada evaluación.

Una vez vencido el plazo, la ficha muestra participación, respuestas omitidas y frecuencias de las preguntas cerradas, además de la media de escalas y NPS. Para texto abierto y fechas muestra cuántas personas respondieron. La ficha no incluye el texto original, fechas de respuestas ni identidades. Coordinación y Administración pueden guardar conclusiones separadas de las respuestas. La revisión impide sobrescribir una edición más reciente.

## Datos y permisos

La migración 0045 agrega `group_evaluation_conclusions` y una función SQL de agregación. La función comprueba identidad, grupo y plazo antes de leer las asignaciones. La API sigue paginando el histórico y calcula resultados solo al abrir una ficha. El agregado usa la clave de grupo y evaluación existente y requiere un máximo funcional de 100 participantes por evaluación. La migración no cambia las asignaciones, los borradores ni las versiones publicadas.

Con la función de evaluaciones activada, el runtime requiere contrato 45. Para validar este incremento, aplicar la migración en un entorno aislado con el proceso de mantenimiento. Desactivar el flag retira el acceso y conserva las conclusiones. El código anterior puede volver a arrancar con el esquema aditivo. No se modificó producción.

## Alcance de P2

| Fase | Estado tras este incremento |
| --- | --- |
| P2.0–P2.1 | Plantillas, asignación individual identificada y respuesta desde Inicio. Siguen pendientes el anonimato, la respuesta colectiva y las asignaciones y estados adicionales. |
| P2.2 | Pendiente. Cerrar y evaluar, reapertura de 15 días y revisiones de un nuevo cierre. |
| P2.3 | Parcial. Resultados agregados de evaluaciones vencidas y conclusiones editables. Pendientes consolidación versionada, comparativas y conversión en tareas. |
| P2.4 | Pendiente. Exportación PDF, anexos, memoria conjunta y ejemplos ficticios. |
| P2.5 | Parcial. Histórico paginado por grupo. Pendientes vínculo al proyecto o comisión, filtros y comparativas. |
| P2.6–P2.8 | Pendientes campañas, Product Insights, soporte y feedback espontáneo. |

Quedan pendientes la revisión visual en dispositivos físicos y las mediciones de consumo en Neon y Railway.
