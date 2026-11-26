# Historial y resultados de evaluaciones

**Proyectos → Plantillas de evaluación → Opciones de plantillas → Histórico y resultados** abre una lista paginada para Coordinación y Administración, con filtros por proyecto y estado. El histórico se vincula al grupo y conserva el título, el plazo y la versión publicada de cada evaluación.

Una vez vencido el plazo, la ficha muestra participación, respuestas omitidas y frecuencias de las preguntas cerradas, además de la media de escalas y NPS. Para texto abierto y fechas muestra cuántas personas respondieron. La ficha no incluye el texto original, fechas de respuestas ni identidades. Coordinación y Administración pueden guardar conclusiones separadas de las respuestas. La revisión impide sobrescribir una edición más reciente.

## Tareas de mejora

Cuando haya conclusiones guardadas, **Acciones de mejora → Crear tarea** abre el formulario de tareas de Bandarlog. Coordinación o Administración elige el proyecto, la comisión, los responsables y el plazo. Se reutilizan los permisos, las notificaciones y la actividad de creación de tareas. El título y la descripción se introducen en el formulario para evitar copiar conclusiones privadas a una comisión sin decisión explícita.

La migración 0046 guarda el vínculo entre evaluación, revisión de conclusión y tarea. La creación y su vínculo se guardan en una transacción. El desplegable del resultado permite abrir las tareas autorizadas y refrescar la lista. La ficha de la tarea enlaza al resultado de origen para Coordinación y Administración, previa comprobación de ambos permisos.

## Informe agregado en PDF

**Opciones del informe → Vista previa y PDF** prepara el resultado de una evaluación vencida para impresión A4. La vista aplica los colores de la pañoleta configurada, las fuentes locales y el logotipo del producto. Incluye participación, recuentos, conclusiones guardadas y acciones vinculadas. El navegador ofrece imprimir o guardar PDF. El informe no contiene identificadores, borradores ni respuestas individuales. No se almacenan copias en Neon.

[Informe de ejemplo con datos ficticios](../../artifacts/feedback-for-all/evaluacion-ejemplo.pdf) · [Plantilla en blanco de ejemplo](../../artifacts/feedback-for-all/plantilla-en-blanco-ejemplo.pdf)

Desde el menú de una plantilla, **Imprimir plantilla en blanco** exporta sus secciones, preguntas y opciones, con espacio para las respuestas.

## Datos y permisos

La migración 0045 agrega `group_evaluation_conclusions` y una función SQL de agregación. La función comprueba identidad, grupo y plazo antes de leer las asignaciones. La API sigue paginando el histórico y calcula resultados solo al abrir una ficha. El agregado usa la clave de grupo y evaluación existente y requiere un máximo funcional de 100 participantes por evaluación. La migración no cambia las asignaciones, los borradores ni las versiones publicadas.

Con la función de evaluaciones activada, el runtime requiere contrato 46. Para validar este incremento, aplicar la migración en un entorno aislado con el proceso de mantenimiento. Desactivar el flag retira el acceso y conserva las conclusiones. El código anterior puede volver a arrancar con el esquema aditivo. Las migraciones 0044, 0045 y 0046 ya constan en Neon de producción. La aplicación de esquema es independiente de la activación de la función.

## Alcance de P2

| Fase | Estado tras este incremento |
| --- | --- |
| P2.0–P2.1 | Plantillas, asignación individual identificada y respuesta desde Inicio. Siguen pendientes el anonimato, la respuesta colectiva y las asignaciones y estados adicionales. |
| P2.2 | Cierre con o sin evaluación y reapertura de 15 días. Pendientes cierre por comisión o mixto y revisiones de un nuevo cierre. |
| P2.3 | Parcial. Resultados agregados de evaluaciones vencidas y conclusiones editables y creación de tareas vinculadas. Pendientes consolidación versionada, y comparativas. |
| P2.4 | Parcial. PDF agregado, plantilla en blanco y ejemplos ficticios. Pendientes anexos, exportación individual y memoria conjunta. |
| P2.5 | Parcial. Histórico paginado por grupo. Filtros por proyecto y estado. Pendientes vínculo a comisión y comparativas. |
| P2.6–P2.8 | Pendientes campañas, Product Insights, soporte y feedback espontáneo. |

Quedan pendientes la revisión visual en dispositivos físicos y las mediciones de consumo en Neon y Railway.

## Modalidades, recordatorios y documentos (0050)

La respuesta identificada sigue siendo la opción inicial. Una evaluación colectiva asigna un único representante. Al cerrar un proyecto puede seleccionarse una comisión del proyecto, lo que restringe la selección a sus miembros. La interfaz permite una comisión por cierre.

El envío anónimo separa el cuestionario final del registro de participación. La asignación conserva el estado de entrega y el texto libre puede contener información identificativa introducida por la persona. El agregado exige cinco envíos y omite preguntas respondidas por menos de cinco personas. Las distribuciones requieren al menos dos categorías publicables, con cinco respuestas por categoría.

Desde el histórico se pueden seleccionar entre dos y ocho evaluaciones vencidas para preparar una memoria conjunta. Administración del grupo puede solicitar por separado el anexo de respuestas finales identificadas, con registro de acceso. Los anexos quedan excluidos de las evaluaciones anónimas y de las memorias conjuntas.

Durante el plazo, Coordinación y Administración pueden pedir un recordatorio desde las opciones de la evaluación. Se encola como máximo uno por participante pendiente, con preferencias de notificación activas en el momento de encolarlo. Tras aplicar la 0050, el contrato SQL requerido es 50 cuando se activa cualquiera de los flags de evaluaciones o feedback de producto.

### Comparaciones y consolidaciones versionadas

Selecciona de dos a ocho evaluaciones cerradas en el histórico. El menú permite comparar participación, revisar estadísticas de preguntas si la plantilla y su versión coinciden, y guardar o recuperar una versión consolidada. Una consolidación guarda los agregados y las conclusiones del momento. Las correcciones posteriores generan otra versión y los anexos individuales quedan fuera.
