# Revisión independiente · Codex · ronda 1

**Veredicto: `meets direction`.** La representación actual resuelve las desviaciones estáticas identificadas en la revisión inicial. No detecto un incumplimiento material expresable en renders que exija otro lote antes de presentar esta propuesta al usuario. El resultado conserva la dirección A y añade identidad sin desplazar el trabajo. Este veredicto es de diseño estático: no declara aprobación del usuario ni implementación, autenticación, permisos efectivos o compatibilidad de dispositivo.

Alcance: solo Codex/platform, fuente `../../common-brief.sent.txt`, refinamiento autorizado `../../refinamiento-codex.md` y revisión inicial `../initial-review.md` (checkpoint inicial 452183a). Skills ya leídos y aplicados: Visual QA y criterios de conformidad/render de Design Arc. No se inspeccionó ni alteró ningún output del otro renderizador. Único archivo escrito por esta revisión: este informe.

## Evidencia inspeccionada

Con `view_image` se inspeccionaron los cinco tableros actuales `captures/board-1-9.png`, `board-10-18.png`, `board-19-27.png`, `board-28-36.png`, `board-37-43.png`: cubren F01–F27 y las 16 variantes. Se revisaron además, a tamaño individual, F06/F14/VNAME/VBULKERROR/VSCOUTER a 320, F05 y VSELECT a 390; F13 scrolled a 320; F06 horizontal top y scrolled, F18 horizontal scrolled; F04 tablet y desktop. No se atribuye inspección visual individual a cada uno de los 187 registros geométricos.

Se leyeron `findings.json`, `measurements.json`, `assets-manifest.json`, `dataset-reconciliation.json`, el dataset fuente `../dataset.json`, el capturador `../capture-revision-1.mjs`, CSS y el origen del fixture móvil. Se recomputaron partición y sumas del dataset con lectura de JSON. Se comprobaron dimensiones de PNG: F06 horizontal top y scrolled son realmente **844×390**, F04 amplio es **768×1024** y **1440×1000**. Los tableros completos tienen alturas variables acordes al contenido: no dependen de recortar todos los estados a 820.

La geometría existente tiene 187 registros, imágenes cargadas y cero desbordamientos horizontales registrados; incluye botones, inputs de texto/correo/range/checkbox y textarea. El mínimo registrado es 44×44. Los selectores de la propuesta se representan como botones y opciones; no se afirma que sean un combobox funcional accesible. `findings.json` no registra objetivos pequeños, navegación fuera del viewport ni último contenido oculto en sus comprobaciones. Son mediciones del prototipo exportado, no pruebas de aplicación final.

## Resolución del lote autorizado

| Corrección | Resultado | Evidencia actual y juicio |
| --- | --- | --- |
| Copa reconocible y cálida | resolved | F06-320-full: masas de copa superpuestas en dos tonos y borde de lóbulos menos uniforme; cabecera compacta y marca intacta. Su lectura sigue siendo abstracta, adecuada al tamaño operativo. No hace falta una ilustración hero adicional. |
| Jerarquía/listas | resolved | F06/F13/F14 conservan foco principal, filas continuas, divisores y aire; iconos asociados aportan detalle sin KPI decorativos. |
| Catálogo en diez filas | resolved | F13 y dataset-reconciliation: diez iconos originales distintos con rutas/catalogKey/seed trazables. No se expandieron ni se declararon validados los 338 recursos. |
| Navegación durante scroll | resolved | F13-320-scrolled y F06/F18-844x390-scrolled: cuatro destinos visibles y última fila/acción por encima de la barra. |
| Objetivos 44 px | resolved | Mínimos 44×44 en los 187 registros, incluidos campos, slider, checkbox y pestañas. F14 ya no tiene pestaña de 43.56 px. |
| Exportaciones completas | resolved | Tableros de altura variable; F05 conserva Cancelar, F11 muestra siete filas, F13 diez, F19/F20 acciones y navegación. Las capturas viewport se distinguen de exportaciones largas. |
| Nombre/foto/omisión | resolved | VNAME error local, F05 imagen original de prueba identificada externamente, VRETURN Alex conservado, F26 llegada a Inicio con iniciales sin pregunta repetida. |
| Recuperación de código | resolved | VWAIT espera deshabilitada, F02 reenvío habilitado, F25 error corregible, VEXHAUST desafío agotado y solicitud de uno nuevo. Nueva entrada se representa mediante F02; no se envían códigos. |
| Invitaciones contextuales | resolved | VBULK abierto, VBULKERROR validación local, VINVITESENDERROR fallo de envío, VPROJECTINVITE destino proyecto. Personas/Cancelar dan camino de retorno estático. |
| Dataset 74 y variantes | resolved | 74 IDs únicos: 7 propias abiertas, 30 del equipo, 14 externas agregadas y 23 terminadas; variantes 1/5 conservan 37 abiertas y 23 terminadas en comisiones propias. |
| Proyectos sin duplicación | resolved | F15 único encabezado Ronda, avance y sus cinco comisiones; no duplica nombre en otro nivel. |
| Formularios compartidos | resolved | F18/F20/VSELECT comparten campos y selector Forest; VSENDERROR y VINVITESENDERROR separan envío de validación y conservan valores. |
| Scouter/Responsable | resolved | F14 muestra gestión; VSCOUTER omite Nueva tarea/Añadir personas y sustituye completar por lectura. |
| Última tarea | resolved | VLAST 1 → F07 0/satisfacción/Deshacer → F08 personal al día. Son fotogramas con contrato temporal externo, no animación probada. |
| Onboarding amplio | resolved | F04-768x1024-viewport y F04-1440x1000-viewport: composición coherente, campo y acciones completos. |

Observación de acabado no material: a 320, los dos botones de F14 muestran un pequeño desfase vertical; ambos siguen siendo legibles, contenidos y suficientemente grandes. El contrato no fija alineación superior idéntica, por lo que no justifica otra ronda. La cabecera de comisión conserva título/contexto y mascota: no exige duplicar allí el icono que sí se recuperó en sus filas.

No quedan fixes `partial` o `unresolved` dentro del lote estático autorizado. Persisten pruebas de implementación descritas al final; no se reclasifican como defectos de representación.

## Matriz completa de conformidad

Los requisitos de cada fila proceden de F01–F27 del contrato común y del lote de refinamiento. `B1`, `B2`, `B3`, `B4`, `B5` identifican respectivamente los renders actuales `board-1-9.png`, `board-10-18.png`, `board-19-27.png`, `board-28-36.png`, `board-37-43.png`, todos en `captures/`. Las referencias de variantes son las celdas rotuladas en esos renders.

| ID | Requisito y observación actual | Clasificación | Estado del fix | observed render ID | next action |
| --- | --- | --- | --- | --- | --- |
| F01 | Correo/código, Google configurado y variante V01 sin Google. | match | resolved | B1 + B4/V01 | Conservar. |
| F02 | Campo único; espera VWAIT, reenvío habilitado y cambiar correo. | match | resolved | B1 + B4/VWAIT | Conservar secuencia; pegado/autocomplete reales pendientes. |
| F03 | Invitación contextual y aceptar/entrar explícito. | match | resolved | B1 | Conservar. |
| F04 | Copia exacta, nombre editable; VNAME error de vacío; foto opcional; amplio coherente. | match | resolved | B1 + B4/VNAME + f04-768x1024-viewport.png + f04-1440x1000-viewport.png | Conservar; validación persistente pendiente. |
| F05 | Recorte con imagen de prueba, arrastrar/zoom/centrar, guardar/cancelar; VRETURN conserva Alex. | match | resolved | f05-390-full.png + B4/VRETURN | Implementar con editor existente tras autorización. |
| F06 | 7 abiertas, tres prioridades, una ruta al resto, filas legibles 320. | match | resolved | B1 + f06-320-full.png | Conservar. |
| F07 | 1 en VLAST, 0 en satisfacción, Deshacer y continuidad de mensaje propio. | match | resolved | B4/VLAST + B1/F07–F08 | Medir temporalidad posteriormente. |
| F08 | 30 abiertas del equipo tras completar las propias; consulta sin controles ajenos. | match | resolved | B1 | Conservar lectura. |
| F09 | 14 externas solo agregadas tras terminar comisiones propias; 27/41 completadas y 66%. | match | resolved | B1 | Conservar alcance del agregado. |
| F10 | Confirmación tranquila, mascota pequeña e historial ilustrativo. | match | resolved | B2 | Datos reales autorizados en implementación. |
| F11 | Siete propias por fecha, lista única sin pestañas Ronda/Campamento. | match | resolved | B2 | Conservar; navegación real pendiente. |
| F12 | Contexto, fecha, responsable, descripción, estado, actividad y acciones. | match | resolved | B2 | Conservar; acciones autorizadas se verifican en backend futuro. |
| F13 | Diez filas agrupadas, iconos asociados, 37 pendientes reconciliadas. | match | resolved | B2 + f13-320-scrolled.png | Conservar asociaciones; no ampliar catálogo en esta fase. |
| F14 | Un avance 40%, tres tareas, mascota secundaria y gestión Responsable; Scouter lectura. | match | resolved | f14-320-full.png + vscouter-320-full.png | Conservar variantes. |
| F15 | Proyecto anual único, contexto, cinco comisiones y avance 39%. | match | resolved | B2 | Conservar. |
| F16 | Campamentos y Nuevo campamento; Navidad sin tareas, sin avance inventado. | match | resolved | B2 | Colección navideña sigue pendiente de revisión de recursos durante implementación. |
| F17 | Coordinación compacta: 24%, tres bloqueadas y comisiones. | match | resolved | B2 | Conservar; alcance real de coordinación pendiente. |
| F18 | Personas, destino fijo Servicios, lista de correos y proyecto, error local/envío y retorno. | match | resolved | B2 + B5/VBULK/VBULKERROR/VPROJECTINVITE/VINVITESENDERROR | Conservar contexto; no envíos reales en la propuesta. |
| F19 | Perfil, nombre, foto, avisos y cerrar sesión completos. | match | resolved | B3 | Revocación servidor pendiente. |
| F20 | Validación junto a fecha, Cancelar y datos preservados en fallo de envío diferenciado. | match | resolved | B3 + B5/VSENDERROR | Conservar. |
| F21 | Sin asignaciones; explicación sin cifras o trabajo inventado. | match | resolved | B3 | Conservar. |
| F22 | Banana original, texto de estado, sin login ni porcentaje. | match | resolved | B3 | SR y carga lenta pendientes. |
| F23 | Sin conexión, Reintentar y ausencia de confirmación falsa de guardado. | match | resolved | B3 | Estado de mutación real pendiente. |
| F24 | Caducidad y acceso por código; sin secretos ni destino sensible visible. | match | resolved | B3 | Backend y destino seguro pendientes. |
| F25 | Error corregible y agotamiento con nuevo desafío VEXHAUST. | match | resolved | B3 + B4/VEXHAUST | Conservar secuencia estática. |
| F26 | Inicio con iniciales tras omitir foto; no repite onboarding. | match | resolved | B3 | Persistencia servidor pendiente. |
| F27 | Google cancelado vuelve al acceso, correo alternativo y reintento. | match | resolved | B3 | OAuth/PWA reales pendientes. |

## Datos, recursos y límites de prueba

Recomputación independiente sobre `dataset.json`: **74 IDs únicos**, estados iniciales 48 pending + 3 blocked + 23 done; 7 propias abiertas + 30 abiertas de otras personas en las diez comisiones + 14 externas abiertas. Las diez filas iniciales suman **37**, coherente con 7+30. Tras completar propias suman **30** (F08); tras completar equipo quedan **14** externas (F09), con campamento 27 terminadas/41 total = 66%. F15 representa 13/33 = 39%; F14 Servicios 2/5 = 40%; F16/F17 usan etapa personal con campamento 10/41 = 24%. Los snapshots están rotulados fuera de pantalla; no son contadores simultáneos contradictorios. V02 tiene una comisión con 37 abiertas/23 terminadas; V05 cinco con 8+8+7+7+7 = 37 abiertas y 23 terminadas. Esto demuestra coherencia del diseño exportado y no ejecución del fixture en la aplicación.

Marca y mascotas originales se ven cargadas, intactas en uso decorativo. El recorte deliberado de F05 corresponde a una imagen de prueba del editor, identificada externamente; no se interpreta como daño al recurso de marca. Las diez asociaciones de iconos se documentan con sus rutas originales, sin sustituirlas por pictogramas inventados. Los 338 IDs, exportaciones individuales, parejas `#tile`, accesorios y recursos de Navidad no están validados globalmente por esta revisión ni se exigen ahora.

Movimiento M01–M05: la copa no introduce animación y los renders muestran solo estados necesarios; el movimiento mantiene finalidad de feedback/continuidad. La procedencia de 350 ms, 2600 ms y feedback existente sigue siendo inspección previa de código en el contrato común; ninguna captura demuestra duración, easing, rendimiento, interrupción o anuncios SR. VLAST/F07/F08 representan secuencia y la CSS incluye reducción de movimiento, pero la implementación deberá preservar resultado y Deshacer sin desplazamiento no esencial. Esa prueba continúa `runtime proof` y no bloquea la conformidad estática.

También continúan `runtime proof`: teclado y foco no oculto/retorno, interacción del selector, zoom 200%, lectores de pantalla, cámara, teclado virtual, safe areas físicas, comportamiento nativo, OAuth en navegador/PWA, permisos backend, sesiones, onboarding persistente y conservación del desktop operativo. El esquema VSAFE es simulación. Las capturas y mediciones de scroll sí prueban composición del prototipo Web, no todas esas capacidades. No se ha probado despliegue ni se declara URL HTTPS verificada en este informe.

Siguiente paso: presentar la propuesta corregida con imágenes y límites verificables en la parada de aprobación visual del modo Seguir recomendación. Este informe no consume una nueva ronda ni concede aprobación de implementación.
