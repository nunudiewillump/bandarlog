# Proyectos independientes

Bandarlog tiene una única sección Proyectos en móvil y escritorio. Cada proyecto tiene nombre, fechas y una clasificación opcional: General, Campamento, Evento u Otro. La clasificación identifica y filtra; todas las opciones tienen exactamente las mismas comisiones, personas, tareas, progreso, iconos y archivo, con los permisos existentes.

Los proyectos nuevos de la interfaz se crean sin padre. El formulario ya no solicita un proyecto anual, tampoco al elegir Campamento. La colección de ilustraciones conserva su selección y la asociación automática de Navidad por nombre; no depende de una jerarquía anual.

## Compatibilidad y datos

La migración 0011 amplía la restricción de tipo y fija General como valor predeterminado. No reescribe filas existentes ni cambia IDs, nombres, fechas, tipos históricos, referencias, membresías, tareas, checklists o actividad. El tipo histórico `ronda` se presenta y filtra como General. La API sigue aceptándolo para que los clientes y las importaciones anteriores puedan repetirse sin conflictos artificiales.

`parentId` se conserva como referencia histórica sin efectos funcionales ni herencia de permisos. Los clientes antiguos pueden seguir enviándolo, si la referencia existe. Nunca es obligatorio ni aparece en el nuevo formulario; un padre archivado no condiciona la creación o el funcionamiento del proyecto independiente. La importación ordena esas referencias históricas para cumplir las claves foráneas y rechaza referencias desconocidas o circulares; no ordena ni valida por tipo.

La API acepta `type` omitido o nulo como General, además de `general`, `camp`, `event`, `other` y el alias histórico `ronda`. La actualización de tipo no cambia las relaciones existentes. Las fechas mantienen la validación común a todos los proyectos.

`/api/data` entrega `projectSummaries` para todos los proyectos autorizados. Se mantiene `campSummaries` con los resúmenes de tipo Campamento para clientes anteriores. Los agregados no permiten consultar ni modificar tareas de comisiones ajenas; la autorización sigue comprobándose por comisión y asignación.

Las URLs antiguas `view=camps` y `view=rounds` abren la sección única `view=projects`, conservando los parámetros de tarea, comisión y proyecto. No hay pantallas de campamentos separadas ni rutas de creación específicas por tipo. La navegación móvil añade Proyectos como destino visible junto con Inicio, Mis tareas, Comisiones y Perfil.

## Forest y PWA

En escritorio el lienzo vuelve al verde oscuro `#103b2d`. Encabezados, paneles, listas, tarjetas de proyecto y comisión, perfil, pestañas y estados vacíos conservan papel blanco `#fffefa` y tinta oscura `#24352b`. Los enlaces que están directamente sobre el verde usan texto claro. En móvil se conserva el lienzo crema.

El bloqueo del zoom de página se aplica únicamente cuando coinciden la PWA instalada y el tamaño móvil de Forest, incluida la orientación horizontal de teléfono. No modifica el zoom de escritorio ni del navegador móvil normal. Al salir de ese ámbito se restaura el viewport original. Los gestos de un dedo y los controles propios de recorte de foto siguen disponibles. Las pruebas verifican la lógica de instalación, viewport y cancelación de gestos en navegador; no representan una comprobación en todos los dispositivos físicos.

## Validación e integración

Esta entrega comparte el mismo PR con la edición completa de tareas y la checklist opcional, sin adjuntos. No añade ni duplica cambios de roles del PR13: usa sus permisos ya incorporados en la base `main`.

Las pruebas incluyen creación independiente de todos los tipos, clasificación opcional, archivo, agregados privados, migración con relaciones antiguas, importación idempotente con referencias en orden inverso, navegación y filtros en móvil/escritorio, conservación de enlaces antiguos y ámbito del zoom. Las capturas de `artifacts/project-experience` usan datos ficticios. Los resultados definitivos de build y de la suite completa están en los checks del PR.
