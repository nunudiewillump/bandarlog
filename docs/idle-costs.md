# Coste en reposo de Bandarlog

## Problema medido (12-11-2026)

Neon Launch, producción `br-dark-breeze-ba7n1frc`: 897 CU-segundos durante la hora completa 12:00–13:00 UTC, casi 0,25 CU continuas. Esa hora incluye pruebas y actividad real; no es una referencia de usuarios inactivos. El mantenimiento cada cinco minutos coincide con la suspensión por defecto de cinco minutos y puede mantener el compute despierto. Además, una pestaña visible repetía /data cada dos minutos aun con SSE conectado.

El suelo de 0,25 CU encendido 720 h equivale a 180 CU-h y unos 19,08 USD/mes de compute a 0,106 USD/CU-h. Esto es una proyección de funcionamiento continuo, no una factura ni un ahorro ya medido. Almacenamiento, historial, backups y el backend Railway son conceptos distintos.

## Cambio

- Colas con ejecución inmediata tras cambios. Si quedan trabajos, se programa su siguiente intento según el plazo persistido; si se vacían, desaparece el temporizador. Una señal recibida durante una entrega provoca otra pasada, sin solapamiento ni pérdida de la señal.
- Recuperación de colas al arrancar y una comprobación pequeña de metadatos cada hora para trabajos introducidos por otro proceso. No recorre todos los grupos sin trabajo. Tras un fallo de base de datos aplica backoff de 1 a 15 minutos.
- Recordatorios al arrancar, en el siguiente cambio de fecha de Madrid y en vencimientos conocidos. Un cambio de usuario adelanta la comprobación como máximo a quince minutos, sin consultar de inmediato. Las transiciones de horario de verano se calculan con el calendario de Madrid. Se conservan las claves de deduplicación.
- Las filas de correo con cinco intentos agotados no provocan bucles de reintento.
- SSE anuncia el intervalo de reconciliación. Por defecto sigue siendo 120 s; con SSE_RECONCILE_SECONDS=0 se suspende el polling solo mientras SSE esté sano. Foco, reconexión, mutaciones y cambios recibidos siguen refrescando. Si falla SSE, vuelve a 15 s. Se incluyen los cambios de autenticación/invitaciones en la difusión por grupo.
- Producción tiene una única réplica, verificada antes de configurar el valor 0. Si se añaden réplicas sin bus de eventos compartido, restablecer SSE_RECONCILE_SECONDS=120 antes de escalar. Las pestañas con código antiguo conservarán su polling hasta recargarse.
- Healthcheck Railway: /api/live no consulta PostgreSQL. /api/health conserva la comprobación de dependencia para diagnóstico. Al arrancar solo se lee un ID para comprobar el seed.
- El límite de escalado del endpoint productivo pasa de 8 a 1 CU, manteniendo mínimo 0,25 y suspensión de 300 s. Limita el coste de los picos; por sí solo no reduce el consumo cuando ya estaba en 0,25.

No hay nuevas dependencias, migraciones, restauraciones ni cambios de proveedor o credenciales. Se mantienen las copias diarias con siete días y el historial actual de **24 horas**, ampliado después de la PR #35 con autorización explícita. Las ramas temporales ya tienen caducidad y están suspendidas.

## Validación y estimaciones

Pruebas dirigidas de API, grupos, correo y preferencias: 46 aprobadas. Cinco pruebas del planificador verifican silencio tras vaciar la cola, plazos, concurrencia, backoff, cancelación y cambios de fecha con DST. Cuatro recorridos de navegador comprueban tareas/permisos/perfil y diez minutos sin polling con SSE sano, actualización por evento, fallback y pausa de páginas ocultas. Se comprueba compilación y diff, además del CI obligatorio.

En un escenario ideal sin usuarios, reintentos, monitores que consulten SQL ni otros procesos, una comprobación horaria con cinco minutos de compute activo produce aproximadamente 15 CU-h/mes, unos 1,59 USD, más comprobaciones de calendario y costes restantes. Una hora de actividad real adicional al día añadiría hasta 7,5 CU-h/mes, unos 0,80 USD, si no coincide con las ventanas ya activas. No es una predicción contractual: debe contrastarse con consumo real y suspensión observada.

Primero se debe comprobar que producción logra suspenderse sin perder avisos. Solo después de medir un periodo representativo se puede decidir si cabe en Free (cuotas y protección a contrastar con el plan vigente). Cambiar ahora a Free puede suspender el servicio al alcanzar una cuota y exige revisar compatibilidad de backups/retención. No se hace automáticamente.

Tarifas verificadas: https://neon.com/pricing y https://docs.railway.com/pricing/plans. La factura y el plan efectivo de Railway no están expuestos por el conector; bajar límites que no se consumen no reduce ese mínimo. Se conserva una réplica y no se provisionan servicios de caché ni bases nuevas.

## Segunda iteración · 13-11-2026

[Implementación, medidas, límites, propuesta de QA y publicación/rollback](neon-iteration-20261113.md). Preparada en PR, todavía sin publicar. La autorización de este plan no incluye despliegue ni cambios productivos. Se conservan 24 h de historial y siete días de copias.
