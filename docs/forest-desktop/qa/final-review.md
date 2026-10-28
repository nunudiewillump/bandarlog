# Revisión independiente · propuesta desktop final

**Veredicto: `meets direction`. Cero desajustes materiales pendientes tras dos rondas de corrección.** La propuesta está lista para revisión visual del usuario; este veredicto no autoriza implementación, merge ni despliegue.

Se reinspeccionó el conjunto completo de 78 escenas en las trece hojas de contacto de `renders-round2/`, además de leer la fuente, el contrato de roles y los datos sintéticos. Se ampliaron a resolución completa D08 a 1280, D19 a 1440, D73 a 1280, D77 a 1440 y D78 a 1280. El agente principal revisó además inicio, al día, perfil, finalización y acceso. No se afirma inspección píxel a píxel de cada estado en cada ancho. La [matriz final](final-matrix.json) contiene una fila por escena con requisito, procedencia, observación, clasificación y evidencia.

La composición mantiene identidad Forest, una jerarquía orientada al trabajo y contexto según el rol. La copa utiliza las dos geometrías del móvil; los archivos de marca y las fuentes coinciden con los originales. No se referencian recursos 3D. El [control de recursos](asset-audit.json) registra esta comprobación independiente.

## Correcciones verificadas

Las prioridades son más compactas y las comisiones dejan de repetirse en dos bloques para Scouter y Responsable. El mini-panel de Responsable permite ver tareas en el primer viewport. Las ocho filas de Servicios —seis abiertas y dos terminadas— coinciden con el resumen 2/8. Los filtros de terminadas y alertas representan los estados que anuncian; las incidencias del proyecto anual conservan su contexto.

El perfil conserva nombre, foto, correo de solo lectura, interruptor general de avisos, creación, actualizaciones, días editables, vencimiento, recordatorio semanal de vencidas y resumen de Coordinación. Acceso y primer acceso usan una estructura independiente, sin identidad ni navegación privada antes de entrar.

Las cifras al día, las tareas ajenas y la instantánea posterior a completar se han reconciliado. El selector de iconos identifica una comisión sin asociación automática. Los nombres normales de comisión y los iconos navideños se mantienen dentro de Campamento de Navidad; el proyecto anual utiliza iconos generales. El proyecto anual tiene sus pestañas y las invitaciones mantienen el destino anual en entrada y resultado.

Se conservan errores recuperables, valores introducidos, cancelación, foto con recorte, espera con banana, confirmaciones y Deshacer. No se añaden chat, inventario, asistencia ni ampliaciones de permisos.

## Geometría y límites

Las mediciones finales incluyen 176 casos: todas las escenas a 1440×900 y 1280×800, más diez escenas clave a 1024×768 y 1920×1080. Registran cero errores de página, imágenes rotas, desbordamientos de documento y objetivos individuales menores de 24 px; las fuentes están cargadas. Las casillas de 24 px tienen etiquetas amplias y algunos campos de búsqueda de 42 px están dentro de un área de 44 px. Estas mediciones no equivalen a certificación completa de accesibilidad, teclado, zoom o dispositivos físicos.

Persisten dos detalles menores de copia: falta un espacio entre mes y año en la cabecera y algún singular/plural de las filas es mejorable. No cambian el contenido requerido ni el recorrido y no justifican otra ronda de pulido visual.

## Liana y movimiento

La instrucción más reciente del usuario es vinculante: el mono 2D cruza de lado a lado en cada finalización guardada. D53 y D54 conservan la liana, el texto «Tarea completada» y Deshacer. La variante de menor movimiento retira rotaciones accesorias y conserva el cruce.

Las escenas muestran el estado posterior: seis tareas personales abiertas, Servicios 3/8 y campamento 19/40. La tarea completada ya no aparece como bloqueada entre las prioridades. Una imagen o un GIF de trayectoria solo muestran la intención visual. El disparo después de guardar, el recorrido real completo, el reinicio ante finalizaciones consecutivas, los tiempos, el foco y Deshacer persistido siguen requiriendo pruebas de aplicación. Los valores 2,2 s y 2,5 s proceden del CSS vigente, no de una medición de la propuesta.

La banana mantiene contorno verde, amarillo y tres manchas marrones; no representa un porcentaje medido. Se evita movimiento decorativo adicional. Las respuestas de API, permisos de servidor, persistencia, recorte funcional, anuncios asistidos y comportamiento de la PWA no se han probado con este tablero estático.
