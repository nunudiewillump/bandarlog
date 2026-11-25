# Responder desde Inicio

Con `GROUP_EVALUATIONS_ENABLED=true`, Inicio ofrece **Mis evaluaciones** a la sesión de grupo. La lista y el editor se cargan al abrir ese acceso. Las evaluaciones se consultan en la API de asignaciones propias y se muestran con su estado. No se incorporan a los contadores ni a la lista de tareas.

El editor abre la versión publicada y recupera el borrador del participante. Identifica el carácter de la respuesta, muestra el plazo en hora de Madrid y permite navegar por las secciones. Se pueden guardar respuestas parciales desde **Opciones**. **Enviar** valida toda la evaluación, lleva a la sección con el primer error y pide confirmación antes del envío definitivo. Tras el envío o el vencimiento, la evaluación queda accesible para lectura.

La interfaz usa el contrato de la migración 0044. La creación y asignación siguen disponibles por API. Las modalidades anónima y colectiva, el cierre desde Proyectos y la consulta de resultados por Coordinación quedan pendientes.
