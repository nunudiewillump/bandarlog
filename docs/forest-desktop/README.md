# Forest Experience · Desktop

Revisión de diseño separada de la propuesta móvil aprobada. Objetivo confirmado: adaptar todas las superficies desktop a las directrices core de móvil, con foco por rol, identidad Forest y recursos exclusivamente2D. Solo diseño; implementación y despliegue requieren autorización posterior.

## Evidencia actual

Base65dc0a0. Aplicación ejecutada en puertos locales3196/5196 con base aislada `.data/desktop-design`, correo preview y personas ficticias example.test. Siete capturas1440×1000 en `before/`: inicio, tareas, comisiones, comisión, proyecto, personas y perfil. Sin desbordamiento horizontal en esas capturas. No se generaliza a otros tamaños.

Observado en capturas y fuente: inicio con cinco métricas y donut duplicando estados; mini-panel de comisión muy alto antes de las tareas; tarjetas de comisión con cero vencidas coloreado en rojo. Lectura independiente: ausencia de vacío desktop en comisiones, texto vacío de proyectos compartido con campamentos, Ajustes/perfil duplicados, restos CSS de reserva de mascotas y CTA de nueva tarea sin condicionamiento visual por rol. La autorización de servidor se conserva.

## Dirección recomendada y seleccionada

**Forest operativo con foco y contexto por rol.** Lateral estable y compacto; marca/copa2D sin hero decorativo; crema, Nunito y verde vigentes. Inicio prioriza trabajo propio → equipo autorizado → resumen autorizado → al día. Coordinación mantiene avance y atención global al lado, sin duplicar donut/indicadores. Tareas y comisiones usan filas comparables, contexto visible y panel lateral de detalle. El panel de Responsable se compacta para permitir ver tareas en el primer viewport. Perfil y avisos forman un destino coherente conservando rutas existentes. Se muestran acciones solo con permiso real.

Alternativa A: trasladar literalmente las tarjetas móviles a columnas. Familiaridad máxima, pero mala comparación entre comisiones y mayor recorrido vertical. Alternativa B: conservar el dashboard actual y aplicar tokens Forest. Menor cambio, pero mantiene duplicidad y falta de Smart Focus. El modo seguir recomendación selecciona la dirección recomendada sin nueva parada.

## Inventario del tablero

1. Inicio: Coordinación con incidencias; Responsable; Scouter; propias al día/equipo activo; todo al día; instalación sin datos.
2. Tareas/alertas: listado amplio, filtros, sin resultados, sin tareas, vencida/bloqueada/completada y solo lectura. Detalle con comentarios, editar, bloqueo, eliminación confirmada, error/conflicto y recuperación.
3. Comisiones: agrupación por proyecto,1/5/10, sin datos, sin tareas, al día, Navidad según campamento. Detalle Responsable/Scouter y pestañas tareas/personas/actividad.
4. Proyectos y campamentos: listados separados, vacíos específicos, resumen/comisiones/tareas/personas, archivado/restaurar y contexto largo.
5. Personas: grupo/proyecto/comisión, roles, invitaciones pendientes/aceptadas/caducadas/revocadas; un correo/lista, destino contextual fijo, errores/duplicados y resultado.
6. Formularios: tarea, comisión3pasos, miembros, proyecto/campamento, icono solo si asociación permite; validar, guardar, cancelar y recuperar.
7. Perfil: nombre, foto/recorte/cancelar/fallo, avisos, guardar/error y salida. Acceso/onboarding Forest existentes se conservan.
8. Globales: carga banana, red/error/reintento, guardado, confirmación/deshacer y liana2D cruzando de lado a lado en cada finalización confirmada.

Viewports de propuesta:1440×900 y1280×800; controles1024×768 y1920×1080. Datos ficticios coherentes entre pantallas; nunca datos del grupo. No añadir chat, inventario, asistencia, gamificación, acceso a tareas ocultas ni funciones nuevas.

## Directrices oficiales consultadas el28deoctubrede2026

W3C/WAI, páginas recuperadas HTTP200 y texto inspeccionado, extractos en `evidence/`:

- [Teclado](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): toda acción debe tener equivalente de teclado; pendiente prueba real de foco y diálogo.
- [Foco no oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): lateral, cabeceras y paneles no deben tapar el control enfocado.
- [Objetivos mínimos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):24px o excepción/espaciado permitido. Objetivo de producto44px para acciones principales y entradas, sin afirmar que44sea obligación universal desktop.
- [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):320CSSpx equivalentes al ampliar; excepción de tablas bidimensionales no autoriza desbordamiento del resto de página. Pendiente runtime con zoom.
- [Mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): guardado, resultados y errores perceptibles por tecnologías de apoyo sin mover foco innecesariamente.

La jerarquía Forest, eliminar donut redundante y la composición por rol son juicio de producto basado en el contrato existente, no mandatos W3C. Sin benchmarks ni evidencia de productos externos. Las guías core móviles se adaptan a ratón/teclado desktop.

## Movimiento y límites

Se conserva la liana2D vigente tras guardado real: CSS observa2.2s de cruce y2.5s de etiqueta, sin nueva medición temporal. Enmienda expresa posterior del usuario: la liana2D cruza de lado a lado siempre, en cada finalización guardada. No se sustituye por una imagen estática. La variante de menor movimiento conserva el cruce y elimina balanceos/rotaciones accesorios; esto es decisión de producto y exige cambiar el comportamiento CSS vigente en una implementación posterior. Confirmación/Deshacer se conservan. Banana existente para espera, sin porcentaje inventado. Sin secuencias de entrada ni decoración animada nueva. Verificación de ejecución, teclado, zoom, lector de pantalla y permisos se reserva a implementación; el tablero no puede probar backend.

## Estado

Objetivo confirmado. Dirección seleccionada según seguir recomendación. Renderizador elegido por el usuario: solo Codex. Propuesta de 78 escenas revisada de forma independiente: meets direction; cero pendientes materiales. Dos rondas conjuntas de corrección. Aprobación visual del usuario pendiente, ni cambiado código de aplicación, variables o producción.

Fuentes complementarias inspeccionadas (HTTP200): [tablas semánticas](https://www.w3.org/WAI/tutorials/tables/), [patrón de diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [errores identificados en texto](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) y [movimiento por interacción](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). El último criterio es AAA: se usa como orientación de confort, no como afirmación de certificación. Foco retenido/restaurado en diálogo, encabezados de tabla y errores asociados a campos requieren prueba funcional posterior.

## Entrega para revisión

[Propuesta y pantallas](propuesta.md) · [Revisión independiente final](qa/final-review.md) · [Matriz de 78 estados](qa/final-matrix.json) · [Recursos auditados](qa/asset-audit.json) · [Handoff propuesto](handoff-propuesto.md).

Mediciones finales:176casos y216capturas al contar variantes de viewport; cero errores de página, desbordamiento horizontal o imágenes rotas. Los resultados describen el prototipo estático. El código de aplicación permanece idéntico a65dc0a0.
