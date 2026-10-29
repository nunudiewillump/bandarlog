# Revisión independiente · propuesta desktop inicial

**Veredicto: `meets with corrections`.** La dirección Forest se reconoce y la composición mantiene el trabajo en primer plano. El resultado aún requiere una corrección conjunta de fidelidad de producto y densidad antes de pedir aprobación visual.

Se revisaron las doce hojas de contacto que abarcan D01–D72, el código de generación y los contratos de producto. Se inspeccionaron además a resolución completa D02, D03, D05, D08, D13, D30, D45 y D58, incluido D03 a 1024 px. Esta revisión no equivale a una inspección píxel a píxel de todos los anchos de cada escena. La matriz completa de requisitos, observaciones, clasificación, acción y referencias está en [initial-matrix.json](initial-matrix.json).

La geometría registrada comprende 164 casos: las 72 escenas a 1440×900 y 1280×800, más diez escenas a 1024×768 y 1920×1080. No registra errores de página, imágenes rotas, desbordamiento de documento ni contenedores desbordados. Las 210 observaciones de objetivos pequeños corresponden a enlaces de título de 22 px de alto y casillas de 19 px; no se convierten en una afirmación de incumplimiento de WCAG sin medir la separación o el área de sus etiquetas. Sí se recomienda ampliar los objetivos principales a 44 px.

## Corrección conjunta

- Compactar las filas prioritarias para que la atención de Coordinación aparezca antes, eliminar la repetición de las mismas comisiones en dos lugares y ordenar filtros en una fila donde quepan.
- Reconciliar los fixtures: Servicios no puede mostrar tareas de otras comisiones sin contexto; la vista personal al día no debe seguir mostrando asignaciones propias abiertas; las vistas terminadas y de alertas deben corresponder al filtro; una comisión sin tareas no puede indicar 8/8 terminadas; la tarea ajena de solo lectura no debe asignarse al usuario actual; completar debe actualizar la escena y sus contadores.
- Conservar las posibilidades reales del perfil: correo de solo lectura, interruptor general, avisos de actualizaciones, días de antelación editables y resumen de Coordinación.
- Separar acceso y primer acceso de la estructura privada: no mostrar la identidad ni navegación de una persona ya autenticada antes de entrar.
- Corregir el alcance de las cifras al día, utilizar iconos generales fuera del campamento navideño, identificar el destino sin asociación del selector de iconos y añadir un detalle del proyecto anual que no abra el campamento.
- Restaurar espacios de la copia y singular/plural; ampliar el acceso al perfil y los objetivos principales; evitar la duplicación del mismo avance en la franja compacta.

Las imágenes reales de D54 ya incluyen la liana 2D y D65 ya retira los controles de comentarios. Las observaciones anteriores de fuente sobre esos dos puntos no se conservan como defectos del render inicial.

## Movimiento y prueba pendiente

El usuario exige el cruce lateral de la liana 2D en cada finalización guardada. D53 y D54 lo representan con un fotograma y confirmación con Deshacer. La variante de menor movimiento conserva el cruce y retira rotaciones accesorias. Una imagen estática no demuestra disparo tras guardado, reinicio ante dos finalizaciones seguidas, recorrido completo ni temporización. Los valores 2,2 s y 2,5 s provienen del CSS vigente y se etiquetan como observación de fuente, no medición de esta propuesta.

La banana mantiene contorno verde, relleno amarillo y tres manchas marrones. Su fotograma tampoco demuestra tiempo real de espera o porcentaje de una operación.

No se han probado API, permisos de servidor, persistencia, foco de diálogos, lector de pantalla, ampliación real ni dispositivos físicos. Son pruebas posteriores de implementación; no justifican repetir el render para intentar demostrarlas. No hay autorización de implementación ni despliegue en esta revisión.
