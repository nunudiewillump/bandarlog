# Mapa temporal de proyectos

En **Proyectos → Resumen**, a partir de 1024 px, la cronología muestra las comisiones autorizadas y sus tareas. La escala cambia entre días, semanas y meses. El zoom conserva el punto central y **Hoy** lleva a la fecha de Madrid. El mapa usa la instantánea de tareas, personas y asignaciones del proyecto y abre la ficha habitual de Tareas.

Los marcadores planos distinguen los estados. El círculo ocre identifica una tarea pendiente, el triángulo azul una tarea en curso, el cuadrado rojo con guion una tarea bloqueada y el círculo verde con una marca de verificación una tarea terminada. La raya inferior identifica la fecha de finalización registrada. El mapa representa el vencimiento y la finalización como eventos puntuales. El detalle indica cuándo falta una fecha.

Se retiraron las pantallas y rutas de planificación y reuniones. La migración de mantenimiento `0054` elimina actas, decisiones y enlaces de seguimiento. Las tareas creadas a partir de una decisión siguen siendo tareas ordinarias del proyecto. Las tablas históricas de fases, hitos y dependencias quedan en la base de datos, fuera del flujo de la aplicación.

Por compatibilidad durante el despliegue, se recomienda actualizar el servicio HTTP antes de aplicar `0054`. El binario actualizado puede operar con el esquema anterior mientras se prepara una copia de seguridad.
