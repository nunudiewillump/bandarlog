# Cierre sin evaluación y reapertura

Con `GROUP_EVALUATIONS_ENABLED=true`, Coordinación y Administración pueden cerrar un proyecto desde su menú de ajustes. El cierre conserva tareas e historial y aplica las restricciones de escritura existentes para proyectos archivados. Los ajustes muestran el vencimiento de la reapertura en hora de Madrid. El plazo es de 15 días desde el último cierre, medido por el reloj de PostgreSQL.

La migración 0047 registra eventos inmutables para el runtime, con autor, fecha y tipo. Un bloqueo por proyecto serializa las transiciones. Los triggers validan el plazo y sincronizan cada evento con el estado del proyecto dentro de la misma transacción. La ruta anterior no puede cambiar el estado de los proyectos que ya tienen eventos. Los proyectos archivados antes de este flujo conservan la restauración anterior, ya que no se conoce su fecha de cierre.

El código requiere contrato 47 cuando se habilita el flag. Aplicar la migración desde el proceso de mantenimiento en un entorno aislado antes de habilitar el flujo. No se necesita un job que archive los proyectos al vencer el plazo.

El cierre que crea evaluaciones, la pausa y reactivación de evaluaciones asociadas, y las revisiones posteriores siguen pendientes.
