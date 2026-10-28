# Invitaciones, fotos y revisión móvil

## Acceso desde el primer correo

El enlace anterior se extraía de una frase terminada en punto. El botón incluía ese punto en el dominio y Railway respondía `404 Application not found`. Tanto las invitaciones individuales y por lista como los reenvíos colocan ahora la URL en una línea independiente.

El primer correo contiene un enlace personal de aceptación. Al abrirlo aparece **Aceptar invitación y entrar**: una única confirmación en la web crea la sesión y aplica las invitaciones vigentes, sin solicitar un segundo correo. También funciona cuando el navegador tenía iniciada otra cuenta; solo cambia a la persona invitada después de confirmar.

El enlace se guarda como hash, está vinculado a la invitación y caduca con ella, a los siete días. El identificador de la invitación forma parte del token completo cuyo hash se comprueba: eliminarlo o cambiarlo invalida el enlace. Una invitación revocada no autentica, incluso si esa persona ya existe o tiene otras invitaciones. La aceptación y la gestión bloquean las filas durante su transacción para conservar el estado ante operaciones concurrentes. Abrir o recargar la página por GET no consume el enlace ni crea la cuenta; solo lo hace el POST de confirmación.

Las cuentas existentes conservan el acceso habitual mediante su correo. Los roles y destinos siguen siendo los de cada invitación; no se concede acceso a Railway, Google ni a comisiones ajenas. No requiere migraciones de base de datos.

**Tras publicar la corrección, hay que reenviar las invitaciones pendientes desde Personas.** Los mensajes ya entregados no pueden cambiarse: conservan el enlace anterior terminado en punto y el flujo antiguo.

## Foto con recorte circular

El error de lectura de JPEG procedía de la vista previa `blob:`, bloqueada por la política de imágenes de producción (`img-src 'self' data:`). Ahora se lee localmente con FileReader y se usa una URL `data:`, sin relajar esa política.

El editor permite arrastrar, acercar, alejar y centrar el recorte circular, con controles de teclado y cancelación. Acepta originales JPG, PNG, WebP o AVIF de hasta 30 MB y prepara un avatar de 256 × 256, comprimido en WebP o JPEG antes de enviarlo. El original no se sube al servidor. **Guardar foto** la aplica directamente y actualiza los avatares; no obliga a guardar después todo el formulario. Cambiar o quitar la foto no modifica nombre ni preferencias. Las fotos siguen almacenándose en la base de datos.

La prueba usa un JPEG válido de más de 5 MB bajo la política real de imágenes, mueve el recorte, comprueba el píxel elegido en la imagen persistida y verifica que las preferencias se conservan. También prueba cancelación y archivos dañados. No se añade una librería de edición de imágenes.

## Pantallas móviles

Se revisan Inicio, Mis tareas, Comisiones, proyectos anuales, campamentos, detalle de proyecto, detalle de comisión y sus pestañas, Personas, Perfil, Ajustes y Alertas. También el detalle de tarea, los formularios de tarea, comisión, campamento e invitación y el catálogo de ilustraciones.

La revisión cubre 320, 390 y 430 px, con tareas activas y con todo terminado. Hay escenarios adicionales de cuenta sin contenido a 320 y 430 px. Se mantienen el movimiento reducido, la navegación inferior, los permisos y los recorridos de escritorio.

- **Todo al día:** mascota, cifras reales del trabajo terminado, comisiones al día y dos tareas recientes, sin proponer obligaciones nuevas. Una cuenta sin asignaciones recibe un estado distinto, sin estadísticas inventadas.
- **Listas vacías:** ilustración, título y explicación del contenido que aparecerá; no quedan paneles sin contexto.
- **Personas:** columnas adaptadas al móvil para que nombre y correo no se compriman al lado del selector de rol.
- **Comisiones:** mascota visible en la cabecera, controles táctiles y resumen compacto al terminar todas las tareas. Los ceros dejan de ocupar tarjetas y distintivos innecesarios.
- **Campamentos:** resumen del avance sin duplicar las métricas de coordinación, nombres de proyecto sin repetición en cada fila y configuración de ilustraciones en un desplegable.
- **Perfil y formularios:** selector de foto propio, textos legibles, controles de tamaño cómodo y recorte que cabe a 320 px. Mis tareas presenta primero su título y después las cifras.

## Capturas de revisión

| Pantalla | Captura |
| --- | --- |
| Aceptar invitación en móvil | [Invitación](../artifacts/invitaciones/aceptar.png) |
| Editor de foto, 320 px | [Recorte](../artifacts/revision-movil/editor-foto-320.png) |
| Inicio con pendientes | [Inicio](../artifacts/revision-movil/home-active-390.png) |
| Inicio con todo terminado | [Todo al día](../artifacts/revision-movil/home-clear-390.png) |
| Mis tareas | [Tareas](../artifacts/revision-movil/tasks-active-390.png) |
| Comisiones | [Comisiones](../artifacts/revision-movil/commissions-active-390.png) |
| Comisión terminada | [Comisión](../artifacts/revision-movil/commission-clear-390.png) |
| Campamento terminado | [Campamento](../artifacts/revision-movil/project-clear-390.png) |
| Personas | [Personas](../artifacts/revision-movil/people-active-390.png) |
| Perfil | [Perfil](../artifacts/revision-movil/profile-active-390.png) |
| Cuenta nueva sin comisiones | [Sin comisiones](../artifacts/revision-movil/empty-commissions-320.png) |
| Formulario de invitación | [Invitar](../artifacts/revision-movil/form-people-active-390.png) |
| Catálogo móvil | [Ilustraciones](../artifacts/revision-movil/artwork-active-390.png) |

La batería incluye 36 pruebas de aplicación y 42 de navegador. La batería completa genera el resto de capturas en el artefacto de CI. Las comprobaciones se realizan con datos aislados y Chromium, sin enviar correos externos ni modificar datos de producción. La comprobación pública del fallo original fue de solo lectura. No se han probado dispositivos físicos ni todos los formatos y cámaras existentes.
