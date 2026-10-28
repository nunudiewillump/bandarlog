# Forest Experience · revisión independiente de implementación

Fecha: 28 de octubre de 2026. Revisión de fuente y capturas reales con el criterio de `designly:visual-qa`. No se han modificado componentes ni ejecutado pruebas o navegador desde esta revisión.

**Disposición final: `ship` para revisión de la rama/PR, sin despliegue.** La implementación conserva la dirección Codex refinada y cumple la modificación posterior a 2D. Cero hallazgos visuales materiales pendientes en la evidencia inspeccionada. Las recapturas finales de Comisiones, primer acceso y horizontal cierran los tres pendientes del primer pase; no se necesita otra ronda cosmética.

## Contrato aplicado

Base aprobada: `7088637`, documentada en [propuesta-refinada.md](propuesta-refinada.md), [handoff.md](handoff.md) y [implementacion.md](implementacion.md). Se aplica la modificación posterior del usuario: retirar todos los monos 3D estáticos, conservar el logotipo 2D y utilizar una liana nueva y guiños discretos exclusivamente en 2D. La retirada de mascotas de las láminas originales cumple esa modificación; no constituye una falta de fidelidad.

## Evidencia inspeccionada

- Referencias aprobadas `r1-home-390.png` y `r1-commissions-390.png`, dentro de `codex/revision-1/captures`.
- `artifacts/forest-experience`: Inicio y Comisiones a 320/390/430 px, detalle de comisión y perfil a 390 px, comisión al día, confirmación 2D, invitación y aceptación. Se inspeccionaron las recapturas finales de Comisiones con pendientes visibles, `onboarding-375.png`, `landscape-844.png`, `home-landscape-844.png`, `home-landscape-844-scrolled.png` y `login-1440.png`. El equipo confirmó que estas capturas definitivas corresponden a la fuente estable revisada; el formateo posterior de CSS no altera reglas.
- Capturas reales de `artifacts/revision-movil` a 320 y 430 px: Inicio activo, al día y sin asignaciones; comisiones activas/al día; detalle de comisión y pestañas Personas/Actividad; campamento y detalle de proyecto, pestañas Tareas/Personas; personas; perfil y ajustes; formularios de tarea, comisión, campamento e invitación; selector de iconos; editor de foto; vacíos de comisiones, personas, tareas, alertas, campamentos y proyectos. Se inspeccionaron estados con gestión y el perfil vacío de miembro; esto no certifica todos los permisos del backend.
- `artifacts/inicio-1440.png` para la composición de escritorio.
- Fuente: `ForestHeader.tsx`, `forest.css`, `main.tsx`, `MobileUX.tsx`, `AuthScreen.tsx`, `Onboarding.tsx`, `Artwork.tsx`, catálogo compartido, estilos de confirmación y recursos originales de marca/liana. No se ha confundido el generador inicial `build-board.py` con las láminas refinadas aprobadas.

## Resultado visual y fidelidad

La copa mantiene el perfil compacto, los lóbulos asimétricos, la segunda masa oscura y la marca crema de la referencia refinada. La jerarquía de Inicio conduce de título y contador a tres tareas y a la acción para verlas todas. Las listas usan divisores continuos; proyecto/comisión, fecha y estado se distinguen sin recurrir a una mascota grande. A 320 px los contextos y métricas se distribuyen en varias líneas sin cortar información esencial.

Los cuatro destinos inferiores se conservan en las capturas verticales. Sus etiquetas permanecen legibles y los controles principales conservan áreas amplias. La fuente declara controles de 44 px y acciones/campos de 48 px en las superficies móviles revisadas. Esto apoya la preservación del tamaño táctil, pero esta revisión no realiza una medición exhaustiva de cada elemento ni certifica accesibilidad asistida. Las capturas de página completa pueden mostrar la barra fija sobre una fila a la altura del viewport inicial; esa técnica de captura, por sí sola, no demuestra que la última fila sea inaccesible.

Los formularios, detalle de tarea y edición de foto conservan una acción principal reconocible, etiquetas y recuperación/cancelación. El perfil permite leer las opciones de avisos y localizar Guardar. Los estados vacíos utilizan texto y símbolos discretos 2D. En escritorio se mantienen barra lateral, métricas y paneles de trabajo; no se introduce la copa móvil en el resumen de 1440 px.

Los iconos reales de comisión conservan sus trazos verdes, detalles dorados y proporciones. Servicios y Animación usan los originales explícitos del catálogo; `CIcon` representa `iconUrl` y el selector representa el mismo campo. No se observan fragmentos de atlas, deformación por estiramiento ni sustituciones genéricas en las comisiones examinadas. Los iconos del selector son pequeños pero conservan nombre y selección como superficie amplia; no se abre una ronda de ajuste óptico sin un defecto material.

La marca pequeña utiliza `brand-mark.webp`. La liana utiliza exclusivamente `monkey-vine-2d.webp`: ilustración plana, rostro marrón/crema, ojos ovalados, orejas, sonrisa, mechón y pañuelo verde coherentes con la identidad. Se inspeccionó el recurso original transparente y su aparición en `completed-2d.png`. La interacción mano/liana y la silueta son coherentes; no se observa un defecto anatómico crítico. La confirmación es temporal y la fuente oculta el movimiento de la liana con `prefers-reduced-motion`.

El JSX no consume `mascotUrl`, atlas ni monos 3D históricos. La presencia de sus rutas en el catálogo y de selectores CSS antiguos no equivale a renderizarlos. `ArtworkUpload` duplica el icono 2D en el campo heredado `mascot` para compatibilidad; no solicita una segunda ilustración 3D. Esto coincide con [implementation-assets.json](implementation-assets.json) y `public/ASSETS.md`. La ausencia de solicitudes de red de esos originales requeriría la evidencia del navegador; no se deduce únicamente de la búsqueda de fuente.

## Cierre de los pendientes del primer pase

1. **Comisiones: cerrado.** Las capturas finales a 320/390/430 px muestran los pendientes bajo cada nombre y recuperan el contexto de la lista aprobada. Las variantes antiguas sin ese texto no se usan como prueba del estado final. La falta de chevron visible frente a la lámina es una diferencia óptica menor: la fila mantiene su identidad, información y superficie de acción; no justifica reabrir el diseño.
2. **Primer acceso: cerrado.** `onboarding-375.png` muestra nombre, foto opcional, Elegir foto, Hacer foto, Continuar y Ahora no, sin foto, con texto legible y sin recorte de la acción final. La fuente conserva cancelación del editor sin borrar el nombre.
3. **Horizontal: cerrado.** En 844×390 el foco personal y su contador son visibles al entrar; la captura desplazada muestra la tercera tarea y Ver todas mis tareas por encima de la navegación. `landscape-844.png` muestra Servicios y la última fila Staff completas sobre la barra inferior. Se ha comprobado el render posterior a la corrección, sin trasladar a la aplicación las garantías de la propuesta estática.

No hay otro defecto visual material confirmado. Las pequeñas diferencias de envoltura, métricas propias del fixture y copia de botones no rompen la estructura ni la jerarquía aprobadas. No se solicitan retoques adicionales.

## Validación y límites

El agente principal comunica 47 pruebas de aplicación/API y 45 casos funcionales de navegador validados por lotes: 42 de la batería base (una expectativa de texto se actualizó y se verificó de nuevo) y tres nuevos casos de primer acceso a 375 px, recuperación de red y horizontal a 844 px con navegación/scroll. Esos resultados pertenecen a la ejecución del equipo; esta revisión no los ha repetido ni los presenta como mediciones visuales propias.

La disposición `ship` permite entregar una rama/PR revisable, no acredita despliegue. Esta revisión no afirma Google real operativo, retorno OAuth, sesión en PWA instalada, cámara en dispositivos físicos ni accesibilidad asistida completa. La ausencia de mascotas 3D se comprueba en fuente y render; no se ha auditado aquí una traza de todas las solicitudes de red.
