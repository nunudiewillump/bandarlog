# P0.2 · From Hello to Adoption

## Incorporación

- La evidencia de fundación procede de `foundingAdmin`, que el alta asigna a la cuenta fundadora. Un rol de administración por sí solo no concede esa condición. La instrumentación de nuevas altas y promociones comienza con la migración 0057. Los grupos anteriores conservan sus historiales y su acceso desde Perfil.
- La bienvenida conserva su versión, sus siete pasos y sus recursos. La elección de explorar no inicia una guía. Preparar y repetir son acciones explícitas. La primera elección se conserva, y las posteriores se registran con el identificador de mutación para que un reintento no duplique el recuento.
- Inicio prioriza una invitación de aprendizaje. La guía abierta deja disponible el contenido de Inicio. La guía incompleta se puede continuar. Una omisión se mantiene entre sesiones, y Perfil permite abrir la experiencia voluntariamente con los permisos actuales.
- Una cuenta con gestión global recibe la guía si su alta o promoción la hace elegible. El paso de Coordinación a Administración conserva el resultado previo. El tutorial práctico sigue disponible en Perfil. Sus invitaciones existentes se conservan y las nuevas se reservan a quienes no tienen permisos de gestión global.

## Medición y privacidad

El criterio de activación vive en `bandarlog_api.adoption_group_ready`: al menos un proyecto, una comisión vigente, dos cuentas activas y una tarea real vigente completada. Los disparadores observan cambios en tablas de trabajo real. La práctica modifica exclusivamente el historial del tutorial y nunca entra en esas tablas. El primer hito de cada tipo se almacena una vez por grupo.

La migración registra como evidencia histórica los grupos que ya cumplen el criterio, con fecha de activación desconocida. Esos grupos cuentan en la señal general y quedan fuera de la mediana fechada. Las cohortes de 7, 14 y 30 días usan grupos con seguimiento desde el alta y excluyen los que aún no han tenido tiempo de alcanzar la ventana. El embudo guiado exige el orden de las etapas y tiene un denominador distinto al total de activación. El filtro de alta selecciona una cohorte, no las fechas de emisión de cada evento. El filtro de rol en rendimiento usa el rol actual.

Las exposiciones nuevas se registran al alcanzar el umbral de visibilidad. Los tiempos de finalización usan registros que tienen inicio y fin en orden. Los abandonos de bienvenida y guía se identifican a partir de 24 horas sin finalizar u omitir, con la actividad disponible. Los resultados anteriores sin fecha se indican aparte. Las experiencias cuentan personas únicas y las elecciones posteriores, eventos.

El estado se obtiene de la sesión de grupo y el actor de PostgreSQL. La tabla vive en el esquema privado, tiene RLS y carece de acceso directo desde HTTP e Identidad. Identidad invoca el agregado mediante la sesión independiente de plataforma. El resultado contiene recuentos y duraciones, sin textos de tareas ni identificadores de cuentas. El proxy añade solo la ruta concreta de agregados.

## Operación y coste

Aplicar la migración 0057 con el procedimiento de mantenimiento de Neon antes de desplegar los servicios HTTP e Identidad. Ambos deben usar el commit que incorpora la ruta de Product Insights. Este PR no aplica la migración ni publica el cambio.

La consulta de Product Insights se carga bajo demanda, sin polling. El flujo de lectura de bienvenida realiza dos consultas de dominio por carga en lugar de una. Los cambios de progreso hacen escrituras pequeñas por acción, y el registro de hitos usa claves únicas y una comprobación de activación por transición relevante. La migración toma una instantánea aditiva de la evidencia histórica sin reescribir los historiales anteriores. No se modifica la respuesta de Inicio.

La huella por evento depende del tamaño de los identificadores y de PostgreSQL. El coste de producción en Neon, la concurrencia sostenida bajo carga real y la PWA instalada en dispositivos físicos quedan pendientes de medición. Las pruebas de cambio de dispositivo usan perfiles de navegador separados y consultan la misma persistencia de servidor.

La compilación de esta rama mide 158,98 kB gzip para el JavaScript principal, 4,17 kB gzip para el JavaScript diferido de bienvenida y 12,21 kB gzip para el JavaScript de plataforma. Son tamaños completos de los paquetes resultantes.

## Capturas

Capturas de la interfaz ejecutada en Chromium. Product Insights usa datos de prueba para mostrar los recuentos y denominadores. Las consultas y permisos sobre datos reales de prueba se comprueban por separado en PostgreSQL.

| Experiencia | Escritorio | Móvil |
| --- | --- | --- |
| Decisión al final de la bienvenida | [1440 px](captures/bienvenida-escritorio.webp) | [390 px](captures/bienvenida-movil.webp) |
| Tarjeta de preparación en Inicio | [Preparar mi grupo](captures/preparar-mi-grupo.webp) | |
| Guía de administración | [1440 px](captures/guia-escritorio.webp) | [390 px](captures/guia-movil.webp) |
| Tu primera misión | | [320 px](captures/mision-movil.webp) |
| Product Insights | [1440 px](captures/product-insights-escritorio.webp) | [390 px](captures/product-insights-movil.webp) |
