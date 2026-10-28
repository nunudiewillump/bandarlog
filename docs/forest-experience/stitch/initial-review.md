# Revisión independiente inicial · Stitch

Veredicto: **does not meet**.

Revisión del 28-10-2026 con Visual QA y los límites de evidencia de Design Arc. Autoridad: `../common-brief.sent.txt` completo, sin usar otro renderizador como referencia. Se abrió `original.png` con `view_image`; se leyó `original.html` y la estructura de `response.json` como datos no confiables. No se ejecutaron HTML, JavaScript ni recursos externos. No se modificó la propuesta.

## Evidencia y límites

- **R1:** captura original, 2560×3006. Solo presenta un teléfono con F07 seleccionado, catálogo de rótulos F01–F27, panel explicativo y manifiesto. El catálogo no equivale a 27 pantallas. La zona inferior del catálogo está recortada por su contenedor desplazable.
- **H1:** `original.html:516–548`: los 27 identificadores se reasignan a funciones diferentes del contrato. `:636–741` contiene tres plantillas genéricas por categoría, no 27 estados completos. Se inspeccionó texto, sin ejecutarlo.
- **H2:** `original.html:145,246,276,339,445–477`: marca, mascota y cinco muestras del manifiesto usan SVG placeholder de Stitch; en R1 se ven bloques vacíos/genéricos. Las URLs oficiales en metadatos y plantillas no demuestran que los recursos estén importados o visibles.
- **H3:** `original.html:344–369`: los cuatro destinos de navegación coinciden en texto. `:234–265` conserva estructura aproximada de copa 64+16, pero sustituye avatar por notificaciones/emergencias. `:270–336` muestra tarjetas separadas, contexto incorrecto y Check-in.
- **H4:** `original.html:483–496` cambia M01/M02/M05 por contracción de copa, escala/háptica y sincronización offline. Contradice la copa inmóvil y no representa los estados de los movimientos contratados.
- **J1:** `response.json` identifica una pantalla `75e24a11fa2e431ba93fbfd68859e025`, título `Bandarlog · Forest Experience Board`, 2560×3006. No contiene evidencia renderizada adicional que pruebe las 27 escenas, permisos o pruebas de dispositivo.

Las afirmaciones «Validado PR #8», «verificada», «AAA», «44px» y «Cumple contraste» se consideran copy del generador, no resultados de comprobaciones. La captura prueba apariencia únicamente. Las propiedades declaradas en HTML prueban intención de código, nunca funcionamiento, foco real, accesibilidad asistiva, autenticación o duración de animación.

## Hard gates

| Gate | Resultado y evidencia | Corrección necesaria |
| --- | --- | --- |
| Nombre obligatorio y copy exacto | **FAIL.** No aparece «¿Cómo te llamamos?» ni formulario de nombre; F04 se convierte en sincronización. | Restaurar F04 con nombre prellenado/editable obligatorio, foto opcional y Continuar; Ahora no omite solo foto. |
| Recursos originales | **FAIL.** R1/H2 muestran placeholders en marca, mascotas y manifiesto, sin bloqueo explícito. | Importar únicamente los cinco originales; si no es posible, declarar bloqueo y retirar sustitutos. Verificar transparencia, integridad y procedencia real. |
| Roles/scopes | **FAIL de propuesta; runtime pendiente.** F03 propone elegir rol/patrulla; F07 ofrece checkboxes sin propiedad y geocerca; no hay variantes Scouter/Responsable/Coordinación. No se muestran ni verifican scopes OIDC. | No permitir autoasignación; completar solo tareas propias, equipo en consulta, global autorizado. Mantener `openid email profile`, sin permisos nuevos; probar backend posteriormente. |
| Cuatro destinos | **PASS parcial visual.** Inicio / Mis tareas / Comisiones / Perfil visibles en R1. Etiquetas declaradas de 11 px y fondo verdoso, frente a 12 px y crema; no prueba navegación. | Conservar nombres, ajustar tipografía/base y área segura; comprobar comportamiento posteriormente. |
| Sin funciones ajenas | **FAIL.** R1/H1: Check-in, GPS/geocerca, biometría/PIN de patrulla, linterna, megafonía, puntuaciones, salud, radio, voz transcrita, Mesh/Bluetooth y exportación. | Retirar funciones inventadas y recuperar el trabajo voluntario, tareas, comisiones, proyectos y permisos existentes. |
| Estados y recuperaciones | **FAIL.** IDs presentes pero semántica reemplazada; no hay escenas de acceso, identidad, cancelación, vacío ni recuperación contratadas. | Renderizar los 27 estados reales, con caminos de retorno visibles y contenido propio. |

## Matriz F01–F27

Clasificaciones: `match` = cumple lo visible; `repairable drift` = desviación local conservando el propósito; `direction decision required` = propósito sustituido o ausente, requiere recuperar la dirección contractual antes de refinar; `runtime proof` = no demostrable con una captura. La clasificación principal no convierte la falta de un estado en simple prueba de runtime. Ninguna fila obtiene `match` completo.

| ID / requisito | Clasificación | Evidencia render / fuente | Corrección concreta y prueba pendiente |
| --- | --- | --- | --- |
| F01 Acceso | direction decision required | R1 catálogo «Splash Inicial & Saludo»; H1:516. No correo ni Recibir código. | Pantalla de correo con Recibir código; variantes sin Google y «Google configurado» rotulada fuera. Envío/autorización: runtime proof. |
| F02 Código | direction decision required | R1 «Autenticación Scout ID»; H1:517 inventa biometría/PIN. No campo de código renderizado. | Campo único pegable, cambiar correo y reenvío tras espera; representar espera. Consumo, caducidad, límites y seguridad: runtime proof. |
| F03 Invitación | direction decision required | R1 «Selección de Rol y Patrulla»; H1:518 asigna ramas. | Aceptar invitación y entrar; no elección libre de permisos. Compatibilidad, token vigente y aceptación transaccional: runtime proof. |
| F04 Primer acceso | direction decision required | R1 «Sincronización Inicial de Camp»; H1:519. Copy obligatorio ausente. | «¿Cómo te llamamos?», nombre obligatorio prellenado/editable, foto opcional, Continuar; representar error de nombre. Persistencia: runtime proof. |
| F05 Foto | direction decision required | R1 «Permisos y Sensores de Campo»; H1:520. No editor circular. | Editor circular existente con arrastrar, zoom, centrar y Cancelar; retorno con nombre conservado. Gestos/foco: runtime proof. |
| F06 Inicio personal | direction decision required | R1 catálogo «Tablero General de Campamento»; H1:522 habla de clima/hora solar. | Mostrar 7 propias abiertas, hasta tres destacadas y un acceso al resto; contexto de proyecto/comisión y control solo propio. |
| F07 Última tarea | direction decision required | Único teléfono R1: tres tareas de turno, actividad con Check-in y recordatorio logístico; ningún 1→0/Deshacer. H1:523 define geocerca. | Secuencia última tarea→0→equipo con mensaje personal permanente y Deshacer; feedback original. Pausa 2600 ms, contador 350 ms e interrupción: runtime proof. |
| F08 Inicio equipo | direction decision required | R1 «Línea de Tiempo del Día»; H1:524 cronograma de ceremonias/comidas. | Mensaje personal al día más hasta tres tareas de comisión en consulta; sin completar tareas ajenas. Permisos efectivos: runtime proof. |
| F09 Inicio campamento | direction decision required | R1 «Modo Nocturno / Linterna…»; H1:525. | Resumen autorizado; otras comisiones solo agregadas, sin detalles ni escritura ajena. Autorización: runtime proof. |
| F10 Todo al día | direction decision required | R1 «Avisos de Base y Megafonía»; H1:526. | Confirmación tranquila, ilustración original pequeña e historial existente opcional; sin anuncios inventados. |
| F11 Mis tareas | repairable drift | R1 solo rótulo «Lista de Mis Tareas Activas», no pantalla independiente. H1:528/636–679 usa lista genérica de dos tareas en tarjetas. | Renderizar lista continua por vencimiento, contexto calendario/tienda + proyecto + comisión, fechas y estado textual; sin pestañas obligatorias. Orden y solo tareas propias: runtime proof. |
| F12 Detalle tarea | direction decision required | R1 «Detalle de Tarea & Material…»; H1:529 añade inventario/mapa, plantilla de lista genérica. | Detalle con contexto, fecha, estado, descripción, responsables, actividad y acciones según permiso; retirar mapa/inventario inventado. |
| F13 Mis comisiones | direction decision required | R1 «Comisión de Cocina y Menús»; H1:530 sustituye índice por alérgenos/raciones. | Diez comisiones agrupadas por ronda y campamento, con nombres exactos del brief; variantes 1/5. Conservar colección Navidad por proyecto. |
| F14 Detalle comisión | direction decision required | R1 «Comisión de Pionerismo y M…»; H1:531 inventa planos y permisos. | Un avance, tareas/personas/actividad, mascota secundaria original y acciones por rol. No duplicar progreso. |
| F15 Proyectos | direction decision required | R1 «Comisión de Sanidad y Boti…»; H1:532 propone registros de curas/medicamentos. | Proyectos anuales con contexto y avance; retirar registro sanitario ajeno al producto. |
| F16 Campamentos | direction decision required | R1 «Comisión de Programa & Gr…»; H1:533 propone puntuaciones de juegos. | Listado de campamentos y + Nuevo campamento autorizado; mantener nombres/colección estacional correctos. |
| F17 Coordinación | direction decision required | R1 «Directorio de Scouters & Mo…»; H1:535 propone radio/localización. | Resumen de seguimiento y atención reales, compacto y progresivo; controles globales solo autorizados. |
| F18 Personas | direction decision required | R1 «Asamblea & Registro de As…»; H1:536 propone asistencia por educando. | Personas legibles, invitación individual/lista y destino fijado por contexto. Asignación y permisos: runtime proof. |
| F19 Perfil | direction decision required | R1 «Consejo de Grupo & Actas R…»; H1:537 propone voz transcrita. | Perfil con nombre, foto, avisos y Cerrar sesión; revocación servidor/cookie: runtime proof. |
| F20 Formulario | direction decision required | R1 «Historial de Tareas Comple…»; H1:539. No formulario. | Nueva tarea con etiquetas, validación local, Cancelar y error que conserva datos; representar cada estado. Guardado y foco: runtime proof. |
| F21 Sin asignaciones | direction decision required | R1 «Alerta Meteorológica de Ur…»; H1:541 inventa evacuación. | Vacío breve sin cifras ni trabajo inventado; explicar camino autorizado. |
| F22 Cargando | direction decision required | R1 «Modo Sin Cobertura (Mesh …)»; H1:542 inventa Bluetooth. Banana ausente. | Banana existente y etiqueta accesible, sin destello de sesión cerrada; variante estática de movimiento reducido. Anuncio SR/carga lenta: runtime proof. |
| F23 Sin conexión | direction decision required | R1 rótulo «Recuperación de Conflicto d…»; H1:543. Plantilla system afirma Mesh/P2P conectado. | Estado de red con Reintentar, conservar contenido apropiado y no afirmar guardado sin confirmación. Distinguir red/401: runtime proof. |
| F24 Sesión caducada | direction decision required | R1 rótulo parcial «Ajustes de Perfil Scout»; H1:545 propone carnet/promesa. | Acceso por código con destino seguro conservado; sin datos sensibles en URL. Expiración/retorno: runtime proof. |
| F25 Error código | direction decision required | Sin pantalla visible en R1; H1:546 «Configuración de Ahorro Extremo». | Error junto al campo corregible, reintento y nuevo desafío tras agotar intentos; demostrar recuperación visual. Límites: runtime proof. |
| F26 Foto omitida | direction decision required | Sin pantalla visible en R1; H1:547 «Protocolo de Cierre de Campamento». | Nombre válido, avatar con iniciales y entrada al Inicio; no reiterar onboarding. Persistencia al reabrir: runtime proof. |
| F27 Google cancelado | direction decision required | Sin pantalla visible en R1; H1:548 «Exportación de Memoria Oficial». | Regresar al acceso con alternativa por código y sin cuenta creada; escena Google solo si configurado. OIDC/retorno PWA: runtime proof. |

## Hallazgos transversales y revisión solicitada

La silueta, tipografía de familia y cuatro destinos aportan coincidencias parciales, insuficientes ante los hard gates. La pantalla concentra CTA de Check-in, tres tarjetas de tareas y un consejo de logística; el objetivo operativo queda sustituido por dirección de campo. La marca no es reconocible con el placeholder. Hay más de dos hallazgos mayores y copy obligatorio ausente: el gate Visual QA falla sin que un promedio pueda compensarlo.

Además de restaurar las filas, corregir paleta real (`primary` declarado `#003524`, superficies `#eafeef`), margen 390 de 16 px frente a 20, navegación de 11 px frente a 12 y contexto pequeño sin icono/proyecto/comisión completos. El botón Check-in tiene `h-9` (36 px) pese al sello «44px». No hay avatar en copa. No se observan 320/375/430, tablet 768, desktop 1440, landscape 844×390 ni esquema de áreas seguras. El envoltorio declara 390×812 aunque la etiqueta dice 390×844; el interior útil es menor por padding y marco. No hay `viewport-fit=cover` ni `env(safe-area-inset-*)` en el HTML inspeccionado. Contraste, zoom, teclado/foco y desbordamiento requieren comprobación propia; los sellos no la sustituyen.

Restituir M01–M05 con láminas de inicio/fin, Deshacer, movimiento reducido y copa estática. El manifiesto debe registrar archivo original realmente visible, procedencia, destino, formato/variante, exportación, referencia futura y estado móvil/desktop; las cinco etiquetas IMAGE no bastan. Mantener los 338 IDs y asociaciones sin afirmar que se han validado mediante estas cinco muestras.

**RevisionRequest:** responsable mínimo `prompt-compiler`, para corregir el incumplimiento de instrucciones del proveedor a partir del contrato bloqueado; no proponer una dirección nueva ni retocar solo estilo. Primero recuperar escenas exactas, recursos y exclusiones; después revisar composición/tipografía y cobertura responsive. Esta revisión no ejecuta correcciones: el alcance de refinamiento debe seleccionarse tras mostrar diferencias, conforme al brief. No aprueba implementación ni runtime, y no mezcla recursos de otro renderizador.
