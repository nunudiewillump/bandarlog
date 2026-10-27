# Mobile UX V2

Inicio móvil destaca el trabajo más cercano a la persona sin ampliar sus permisos de escritura. Se conservan la navegación inferior, la identidad Bandarlog y los recorridos de escritorio.

## Experiencia

- **Smart Focus / Always Something:** primero las tareas personales abiertas, después las tareas de sus comisiones, después el seguimiento agregado de sus campamentos autorizados y, finalmente, «Todo está al día». Las bloqueadas siguen abiertas. Inicio destaca como máximo tres tareas o dos campamentos, con acceso al contenido completo.
- **Una lista personal:** reúne proyectos anuales y campamentos por plazo. Calendario y verde identifican el proyecto anual; tienda y arena identifican cada campamento. Comisiones se agrupa por proyecto. Buscar y filtrar queda disponible en un desplegable.
- **Completar directamente:** el control de 44 × 44 px completa la tarea; el resto de la fila abre el detalle. Las tareas ajenas de un Scouter son de consulta. Los permisos existentes de Responsable, Coordinación y Administración se conservan.
- **Feedback confirmado:** se espera al servidor y se actualizan datos y contadores antes de celebrar. Deshacer permanece disponible durante 12 segundos y restaura también el motivo si la tarea estaba bloqueada. El detalle conserva filtros y desplazamiento al cerrarse, incluso con Atrás del navegador.
- **Última tarea personal:** muestra «¡Tus tareas están al día!» y «Has terminado todo lo que tenías pendiente.». Durante 2,6 segundos mantiene el protagonismo de esa confirmación; después muestra el contexto siguiente sin navegar. La confirmación personal permanece.

## Contadores y accesibilidad

`AnimatedCounter` comparte los valores reales entre resúmenes, listados, comisiones y proyectos. Las disminuciones se desplazan hacia abajo y los incrementos hacia arriba durante 350 ms; las barras de progreso cambian en el mismo intervalo. No anima la carga inicial ni repite transiciones por renders con el mismo valor. Conserva el ancho numérico y descarta temporizadores de transiciones anteriores.

Con movimiento reducido los valores cambian directamente. El lector de pantalla recibe el valor actual, sin dígitos visuales duplicados ni anuncios simultáneos de cada contador. El resultado de la operación se anuncia en la confirmación. Se mantienen foco visible, objetivos táctiles cómodos y la banana durante el guardado.

## Autorización y concurrencia

`/api/data` incorpora resúmenes de campamentos ya visibles por membresía o gestión. Incluye cantidades, progreso, plazos y nombres de comisiones; no devuelve títulos, descripciones, responsables ni tareas individuales de otras comisiones. El seguimiento puede consultarse sin conceder acceso a sus tareas ni permisos de modificación.

Las actualizaciones de estado de la interfaz envían `expectedUpdatedAt`. El servidor compara esa versión dentro de la transacción que bloquea la tarea y devuelve la versión guardada. Deshacer utiliza esa versión: si alguien ha modificado la tarea, responde 409 y conserva el cambio más reciente. Los bloqueos por tarea evitan envíos duplicados y las respuestas antiguas de carga no sobrescriben las nuevas. Los enlaces de correo conservan autenticación, autorización y confirmación explícita.

No requiere migraciones de base de datos, nuevas dependencias ni servicios de IA.

## Ampliación del catálogo

Se añaden dos parejas independientes para Servicios (limpieza y cuidado del campamento) y Animación (música y entretenimiento), con fondo transparente. La entrada antes llamada Autobuses pasa a Logística, con un icono de cajas; conserva su identificador e ilustración para mantener las selecciones guardadas.

«Campamento de Navidad» activa la colección navideña por nombre, también al leer campamentos existentes. Se conserva la detección anterior de invierno. Se incorporan seis parejas navideñas específicas para Servicios, Animación, Material, Menú, Logística y Lugar. El catálogo contiene 302 parejas scouts y 36 navideñas.

Cuando el nombre tiene una asociación conocida, la ilustración se asigna automáticamente y desaparece «Elegir ilustraciones». Las selecciones manuales antiguas no sustituyen esa asociación. La API rechaza los cambios manuales también para Responsables y Coordinación. Para nombres sin asociación se conserva la elección y la ampliación del catálogo, con sus permisos existentes.

## Capturas

La captura anterior procede de la versión previa; las posteriores usan datos de prueba aislados, por lo que no comparan exactamente las mismas tareas.

| Estado | Captura |
| --- | --- |
| Inicio anterior, 390 px | [Antes](../artifacts/mobile-v2/before-390.png) |
| Diez comisiones, 390 px | [Después](../artifacts/mobile-v2/after-10-390.png) |
| Diez comisiones, 320 px | [320 px](../artifacts/mobile-v2/after-10-320.png) |
| Diez comisiones, 430 px | [430 px](../artifacts/mobile-v2/after-10-430.png) |
| Última tarea | [Confirmación](../artifacts/mobile-v2/last-task.png) |
| Contexto del equipo | [Comisiones](../artifacts/mobile-v2/team-context.png) |
| Seguimiento del campamento | [Campamento](../artifacts/mobile-v2/camps.png) |
| Ningún trabajo abierto | [Todo al día](../artifacts/mobile-v2/clear.png) |
| Escritorio conservado, 1440 px | [Escritorio](../artifacts/mobile-v2/desktop-1440.png) |
| Servicios | [Pareja scout](../artifacts/mobile-v2/catalogo-servicios-general.png) |
| Animación | [Pareja scout](../artifacts/mobile-v2/catalogo-animacion-general.png) |
| Servicios de Navidad | [Navidad](../artifacts/mobile-v2/navidad-servicios.png) |
| Animación de Navidad | [Navidad](../artifacts/mobile-v2/navidad-animacion.png) |
| Material de Navidad | [Navidad](../artifacts/mobile-v2/navidad-material.png) |
| Menú de Navidad | [Navidad](../artifacts/mobile-v2/navidad-menu.png) |
| Logística de Navidad | [Navidad](../artifacts/mobile-v2/navidad-logistica.png) |
| Lugar de Navidad | [Navidad](../artifacts/mobile-v2/navidad-lugar.png) |

También se incluyen capturas para una y cinco comisiones en los tres anchos.

## Validación y límites

Resultados: compilación TypeScript/Vite correcta, 34 pruebas de aplicación y 31 pruebas de navegador superadas.

Los escenarios aislados contienen 74 tareas: siete personales abiertas, treinta abiertas del resto de sus comisiones, catorce abiertas de otras comisiones del campamento y veintitrés terminadas. Las catorce ajenas se consultan mediante agregados; no se amplía el acceso individual para simular el escenario. Se prueban una, cinco y diez comisiones a 320, 390 y 430 px.

Las pruebas cubren foco progresivo, descenso 7 → 6, incremento de terminadas, progreso, última tarea, consulta sin acciones ajenas, fallo de guardado, Deshacer, operaciones consecutivas, movimiento reducido, filtros, Atrás y desplazamiento. La API verifica el aislamiento de los resúmenes y que Deshacer no sobrescriba cambios concurrentes. Se conservan los recorridos existentes de escritorio, roles, invitaciones, perfil, avisos, catálogo y PWA sin conexión.

La validación de navegador usa Chromium. No sustituye pruebas en iPhone/Android físicos ni una auditoría completa con lectores de pantalla. No se han modificado datos de producción ni desplegado estos cambios.
