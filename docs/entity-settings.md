# Ajustes en cabecera

Proyecto, comisión y tarea reúnen sus ajustes en un engranaje de 44×44 px situado a la derecha de la tarjeta de título. El menú usa un popover nativo por encima de las superficies que desplazan; permite cierre exterior y con Escape. Los formularios empiezan cerrados y solo se abren al elegir editar. Las acciones principales de trabajo (crear tarea, añadir personas, completar, bloquear) conservan su ubicación.

Proyecto reúne tipo, colección y archivo/restauración. Comisión permite editar nombre/descripción y eliminar, con confirmación explícita; la selección manual de icono solo aparece cuando no hay asociación automática por nombre. Al renombrar se reutiliza inmediatamente la asociación del catálogo, incluida la colección del proyecto. Tarea reúne edición completa y eliminación; su checklist conserva el comportamiento opcional.

El servidor comprueba que la comisión existe, no está eliminada y pertenece a un proyecto activo, además del permiso de Responsable de esa comisión o coordinación/administración. El formulario envía la versión de nombre/descripción que abrió y detecta cambios concurrentes. La eliminación es lógica: conserva comisión, tareas, miembros, asignaciones y actividad en la base de datos, pero deja de incluirlos en listados, agregados y nuevos recordatorios. Cancela las invitaciones pendientes de la comisión. Los enlaces antiguos y las escrituras sobre una comisión eliminada se rechazan. Puede volver a utilizarse su nombre en una nueva comisión. La migración 0012 incorpora únicamente los campos de eliminación y ajusta el índice de nombres activos.

La copa usa un intervalo aleatorio de 17–50 segundos. Por caída: 75 % una hoja, 15 % dos hojas y 10 % un plátano. Las hojas reutilizan los mismos trazados que la copa y el plátano comparte exactamente el SVG del indicador de carga, con relleno completo y tres manchas. Un único lote puede estar activo entre las cabeceras móvil/escritorio. No intercepta pulsaciones y se detiene al ocultar la copa, usar movimiento reducido o dejar de ser visible la cabecera.

La pañoleta del perfil utiliza una silueta completa con cuello, pliegues y extremos anudados, con franjas rosas y moradas también en el nudo.

Los correos comparten una cabecera con el mono 2D saludando, pañoleta rosa/morada y fondo transparente. Se sirve como PNG público de unos 16 KB (`public/monkey-wave-2d.png`), con tamaño explícito y texto alternativo para los clientes que bloquean imágenes. No requiere generación de imágenes en cada envío ni cambia los enlaces de acceso o tarea.
