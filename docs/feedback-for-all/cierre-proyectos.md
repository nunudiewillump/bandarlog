# Cierre sin evaluación y reapertura

Con `GROUP_EVALUATIONS_ENABLED=true`, Coordinación y Administración pueden cerrar un proyecto desde su menú de ajustes. El cierre conserva tareas e historial y aplica las restricciones de escritura existentes para proyectos archivados. Los ajustes muestran el vencimiento de la reapertura en hora de Madrid. El plazo es de 15 días desde el último cierre, medido por el reloj de PostgreSQL.

La migración 0047 registra eventos inmutables para el runtime, con autor, fecha y tipo. Un bloqueo por proyecto serializa las transiciones. Los triggers validan el plazo y sincronizan cada evento con el estado del proyecto dentro de la misma transacción. La ruta anterior no puede cambiar el estado de los proyectos que ya tienen eventos. Los proyectos archivados antes de este flujo conservan la restauración anterior, ya que no se conoce su fecha de cierre.

El código requiere contrato 47 cuando se habilita el flag. Aplicar la migración desde el proceso de mantenimiento en un entorno aislado antes de habilitar el flujo. No se necesita un job que archive los proyectos al vencer el plazo.

## Cerrar y evaluar

Si los dos flags de P2 están activos, **Cerrar y evaluar** abre el selector de plantillas. Coordinación o Administración elige una versión publicada y los participantes. El plazo inicial se propone a siete días y se puede cambiar. El cierre del proyecto y la publicación se confirman en una transacción. Si falla la publicación se revierte el cierre.

La migración 0048 agrega un vínculo opcional al proyecto. Al reabrir, las evaluaciones vinculadas y todavía dentro de plazo se muestran como pausadas y PostgreSQL rechaza sus escrituras. Cerrar otra vez reactiva las que aún están dentro del plazo original y conserva los borradores y envíos existentes. El tiempo de pausa no prorroga el plazo. Las evaluaciones independientes mantienen su comportamiento anterior.

Con este cambio el flag requiere contrato 48. Quedan pendientes el cierre por comisión o mixto, la actualización de asignaciones y plazos al cerrar de nuevo y las revisiones consolidadas.

El selector de ámbito conserva una lista propia de participantes para el proyecto completo y para cada comisión. Si se seleccionan varios ámbitos, se publica una evaluación por ámbito en la misma transacción que el cierre. El formulario usa la misma plantilla, modalidad y plazo para toda la operación. El servidor vuelve a validar cada lista y revierte la operación completa si alguna falla. La API anterior de un solo ámbito sigue disponible.

### Revisiones y plazos

Los ajustes del proyecto muestran los últimos cierres y reaperturas, con las evaluaciones de cada cierre registrado a partir de la 0052. Las evaluaciones anteriores conservan su vínculo con el proyecto; no se atribuyen retroactivamente a un cierre concreto. Coordinación puede cambiar un plazo vigente desde el histórico, incluso mientras el proyecto esté reabierto. Debe indicar el motivo. Un cambio desactualizado se rechaza y los plazos vencidos se conservan.
