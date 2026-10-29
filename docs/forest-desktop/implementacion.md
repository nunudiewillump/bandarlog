# Forest Experience · implementación desktop y móvil

El usuario aprobó el diseño y autorizó su implementación con ajustes: movimiento más perceptible, hojas de las mismas formas que la copa que también pueden cruzar el centro, uso móvil y preferencia de ocultación. Se conservan los iconos anteriores.

## Resultado

- Inicio desktop comparte Smart Focus por rol, con trabajo personal, equipo autorizado, contexto y estado al día. La navegación lateral, las comisiones agrupadas y el resumen compacto de Responsable usan Forest sin duplicar el dashboard anterior. Se conservan acciones, alcance y validación de permisos en servidor.
- `BotanicalCanopy` comparte exactamente las siluetas, nervios y paleta entre hojas de la copa y hojas sueltas. La reacción local al cursor es más perceptible; una sola hoja puede caer por el centro, sin interceptar clics. El follaje ambiental se detiene con movimiento reducido.
- Perfil → Preferencias → Mostrar copa y hojas guarda `forestEffects` para la cuenta. Oculta ilustración, hover y caída en móvil y desktop. Se añade al JSON de preferencias existente, sin migración ni variables nuevas; los guardados parciales conservan los demás valores.
- El perfil abre como información: foto, nombre, correo y Rosales del Canal 702 con una pequeña pañoleta rosa y morada. «Editar perfil» abre nombre/foto; guardar o cancelar vuelve a lectura. «Configurar avisos» gestiona por separado los recordatorios existentes. El correo y el grupo no son editables.
- Cada finalización confirmada encola un cruce independiente de la liana 2D, incluso en acciones consecutivas y con movimiento reducido. La preferencia del follaje no desactiva esta confirmación. Guardados fallidos no producen celebración.
- Tema y fondo de la PWA: `#103b2d`, con viewport-fit, área segura superior y estado iOS translúcido. El fondo raíz tiene prioridad sobre el estilo crema anterior, mientras el cuerpo mantiene crema y el borde de hojas móvil conserva transparencia. La pantalla sin conexión comparte el tono y el caché estático se renueva a v2 sin cachear API ni escrituras.

## Comprobaciones

Build de producción y 47 pruebas de aplicación/API aprobados localmente. Los guardados reales verifican `forestEffects: false`, persistencia y conservación de nombre, foto y recordatorios; rechazan un valor no booleano.

La batería de navegador contiene 50 casos. La ejecución completa verificó 49 y detectó la prioridad incorrecta del fondo raíz; ese selector se corrigió y el caso PWA también pasó en la comprobación dirigida. El resultado completo de CI del PR es la referencia para el commit final. Las comprobaciones incluyen invitaciones y permisos, CRUD de Responsable, fotos JPEG mayores de 5 MB con recorte, preferencias, hojas compartidas/centrales/no bloqueantes y dos inicios reales de la liana con desplazamiento.

Las pruebas pueden usar un almacenamiento aislado mediante `E2E_DATA_DIR`; se preservó el directorio local anterior. El tiempo de arranque del servidor permite la inicialización fría de PGlite sin aumentar los límites de las comprobaciones de interfaz.

La [revisión independiente de implementación](implementation-review.md) registra **ship**, sin pendientes materiales. Se inspeccionaron 42 vistas/estados y nueve formularios/recorte, más confirmaciones de interacción. Las capturas y mediciones registradas no muestran desbordamientos horizontales ni imágenes rotas. Se distingue esta revisión de las láminas estáticas del diseño.

## Capturas reales

[Inicio desktop](../../artifacts/desktop-implementation/desktop-home.png) · [Comisiones desktop](../../artifacts/desktop-implementation/desktop-commissions.png) · [Comisión de Responsable](../../artifacts/desktop-implementation/desktop-commission.png) · [Inicio móvil](../../artifacts/desktop-implementation/mobile-home.png) · [Perfil móvil](../../artifacts/desktop-implementation/mobile-profile.png) · [Preferencias móviles](../../artifacts/desktop-implementation/mobile-preferences.png).

Todos los datos de estas capturas son ficticios. Los originales completos y los registros de la revisión se conservan localmente; se publica una selección.

## Límites y entrega

No se ha probado la barra física/notch de una PWA instalada en iOS o Android: los metadatos y estilos están verificados, pero el sistema operativo conserva el control final de esa superficie. Tampoco se declara certificación completa de accesibilidad o rendimiento en dispositivos físicos. La revisión independiente conserva dos detalles menores heredados de concordancia/progreso, sin bloquear la entrega.

Esta entrega prepara código y PR revisables. No fusiona ni despliega en Railway y no modifica secretos o configuración externa.
