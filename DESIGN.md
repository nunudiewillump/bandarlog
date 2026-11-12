---
name: Bandarlog · Forest Experience
description: Coordinación de equipos con copa compacta y trabajo legible.
colors:
  green: "#124d38"
  deep: "#103b2d"
  cream: "#faf8f2"
  ink: "#24352b"
  muted: "#52675a"
  line: "#dfe5da"
  muted-desktop: "#69766d"
  line-desktop: "#e6e8df"
  surface: "#fffefa"
  field: "#fffefb"
  field-border: "#8b9d85"
  avatar: "#e9eddf"
  green-hover: "#1b674b"
  amber: "#805006"
  red: "#bd352f"
  blue: "#276cae"
  focus-control: "#e8a33c"
  focus-field: "#21865c"
  scrollbar-thumb: "#386c4c"
  scrollbar-track: "#edf0e5"
typography:
  brand:
    fontFamily: "'Bungee', 'Poppins', sans-serif"
    fontWeight: 400
    letterSpacing: "0"
  headline:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: "30px"
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "18px"
    lineHeight: "24px"
    fontWeight: 800
  task:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "22px"
    fontWeight: 800
  body:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  context:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
  label:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  navigation:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: "16px"
  headline-desktop:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "-0.9px"
rounded:
  mobile: "8px"
  desktop-control: "9px"
  panel: "12px"
  circle: "50%"
spacing:
  icon-gap: "8px"
  field-gap: "12px"
  compact: "16px"
  gutter: "20px"
  section: "24px"
  page-top: "28px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "white"
    rounded: "{rounded.mobile}"
    padding: "12px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.mobile}"
    padding: "12px 16px"
  auth-button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.cream}"
    rounded: "{rounded.mobile}"
    padding: "12px 18px"
  auth-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.mobile}"
    padding: "12px 14px"
  desktop-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "20px"
  forest-profile:
    backgroundColor: "{colors.avatar}"
    textColor: "{colors.deep}"
    rounded: "{rounded.circle}"
    height: "44px"
    width: "44px"
---

# Design System: Bandarlog · Forest Experience

## Overview

**Creative North Star: "Copa compacta, trabajo al frente"**

Forest Experience hace reconocible la coordinación de equipos con una copa verde de borde orgánico, marca pequeña y fondo crema. El tono es cercano y sereno; la densidad sirve a personas voluntarias que necesitan localizar trabajo y actuar con claridad. Las listas continuas y los estados textuales llevan la jerarquía; la identidad acompaña sin ocupar el centro operativo.

La autoridad visual es la propuesta refinada Codex aprobada en `7088637`, actualizada por la decisión posterior del usuario de retirar todos los monos 3D estáticos y permitir solo marca, liana y guiños discretos 2D. La implementación vigente, leída después de esa decisión, determina los tokens. Las láminas antiguas y los recursos Stitch conservados como evidencia no deben sustituirla.

**Key Characteristics:**

- Copa orgánica compacta anclada arriba en móvil y navegación estable.
- Verde bosque, crema y contraste de texto funcional.
- Poppins local, nombres que envuelven y listas continuas.
- Identidad 2D discreta y celebración breve tras guardar.
- Desktop Forest con foco por rol y comisiones agrupadas; acceso y onboarding compartidos.

Extracción por lectura de `src/styles.css`, `src/forest.css`, `src/ForestHeader.tsx`, `src/AuthScreen.tsx`, `src/Onboarding.tsx`, `src/MobileUX.tsx`, `src/Artwork.tsx` y `src/main.tsx`, con [PRODUCT.md](PRODUCT.md), [implementación](docs/forest-experience/implementacion.md), [handoff](docs/forest-experience/handoff.md) y [recursos](docs/forest-experience/implementation-assets.json). `forest.css` se importa después de `styles.css`; prevalece en su ámbito. El motor local Impeccable no se ejecutó: el launcher falló por permisos, ya comunicado en conversación. Este documento registra código y decisiones, sin atribuir validación al motor. La [revisión independiente de la implementación](docs/forest-experience/revision-implementacion.md) registra `ship` y cero defectos materiales; sus límites externos siguen vigentes.

## Colors

La paleta combina bosque profundo con crema cálida; los colores de estado conservan una función concreta.

### Primary

- **Bosque** (`green`): copa, acción primaria y selección móvil.
- **Bosque profundo** (`deep`): navegación desktop, tinta del avatar y capa superior de la copa.
- **Bosque de respuesta** (`green-hover`): hover de la acción primaria operativa; los estilos específicos de acceso mantienen su propio fondo.

### Secondary

- **Ámbar de contexto** (`amber`): campamento y bloqueo en listas móviles.
- **Rojo funcional** (`red`): acciones destructivas; los avisos de error conservan además sus superficies y bordes específicos en CSS.
- **Azul funcional** (`blue`): estados auxiliares existentes; no es una familia decorativa nueva.

### Neutral

- **Crema** (`cream`): lienzo y base opaca de navegación móvil.
- **Tinta vegetal** (`ink`): lectura principal.
- **Verde gris legible** (`muted`): contexto y ayudas móviles y de acceso.
- **Línea de bosque** (`line`): divisores móviles.
- **Papel de superficie** (`surface`): paneles y controles secundarios existentes.
- **Papel de campo** (`field`) y **borde vegetal** (`field-border`): campos del acceso/onboarding.
- **Hoja pálida** (`avatar`): avatar de la cabecera.
- `muted-desktop` y `line-desktop` conservan los neutros globales anteriores fuera de la redefinición móvil; no aplicar los overrides de Forest a todo desktop.

**The Estado Legible Rule.** Un estado debe conservar texto o forma además de color; el activo de navegación tiene peso y una marca superior.

## Typography

**Brand Font:** Bungee Regular, exclusivamente para la palabra Bandarlog en las cabeceras y la navegación de marca.
**Interface Font:** Poppins, para títulos de pantalla, tareas, texto, formularios y navegación, con system-ui y sans-serif de reserva.

Las fuentes se alojan localmente como subconjuntos WOFF2 latinos: Bungee 400 y Poppins 400, 500, 600, 700, 800 y 900, con licencias SIL OFL. Los pesos intermedios se resuelven contra los archivos disponibles. `public/typography.css` comparte familias y tokens entre interfaz, páginas públicas y pantalla sin conexión; la PWA los precachea. La marca utiliza peso 400 y espaciado natural para respetar el dibujo de Bungee; se adapta a 22px en el lateral desktop, 18px en su variante compacta y 20px en la cabecera pública más estrecha. La navegación inferior conserva 12px, con 11px por debajo de 360px para que sus cinco etiquetas no se solapen. No se solicitan fuentes externas durante el uso. Los archivos proceden de las distribuciones Fontsource 5.3.0 de Bungee y Poppins; Poppins es la misma familia gratuita del catálogo de Font Squirrel. Referencias: [Bungee](https://fonts.google.com/specimen/Bungee) y [Poppins](https://www.fontsquirrel.com/fonts/poppins).

La jerarquía normativa del frontmatter describe el sistema móvil/acceso: `headline` para pantalla, `title` para sección, `task` para fila, `body` para contenido/campos, `context` para proyecto/fecha/ayuda y `navigation` para los cinco destinos. `label` describe las etiquetas visibles de formulario. En desktop se mantiene raíz de 14px y la jerarquía operativa existente; `headline-desktop` registra su título global. En móvil la raíz pasa a 16px. El resumen principal de Inicio usa cifra de 38px con línea de 44px; es un acento informativo, no un estilo display general.

**The Texto Completo Rule.** Permitir que nombres de tareas, proyectos y comisiones envuelvan; no reducir la fuente para encajar una altura fija. El mínimo de 44px se refiere al área táctil, no al tamaño tipográfico de las etiquetas.

## Layout

El ámbito Forest operativo se activa con `(max-width: 767px)` **o** `(orientation: landscape) and (max-height: 599px) and (max-width: 1023px)`. No simplificarlo a una única regla de ancho: una pantalla horizontal de 844×390 utiliza la experiencia móvil. Los límites son inclusivos. Fuera de ese ámbito se conserva la composición operativa tablet/desktop.

En móvil el contenido usa padding superior de 28px, laterales de 20px y reserva inferior de `calc(110px + env(safe-area-inset-bottom))`. Hasta 389px de ancho, los laterales bajan a 16px. La cabecera usa un interior flexible de al menos 64px, ancho máximo de 1180px y borde inferior SVG de 17px; conserva su espacio inicial y permanece anclada arriba al desplazar en móvil. La marca tiene icono de 44px y el acceso a Perfil un objetivo de 44×44px.

La navegación inferior es fija, cinco columnas iguales, altura mínima de 72px, objetivos de al menos 44px de ancho y 52px de alto, más padding y área segura inferior. En landscape bajo la misma condición móvil: cabecera interior de 52px, navegación mínima de 64px, botones con icono y etiqueta en fila, y reserva inferior del contenido de 100px. Toast y Deshacer se colocan por encima de la barra con área segura.

Las filas de tarea usan divisores y padding vertical de 14px; las filas de comisión y personas usan 16px. Tareas y comisiones permiten contenido variable. Los campos y acciones principales móviles miden al menos 48px de alto; controles de icono, completar y enlaces operativos tienen objetivos de al menos 44px. No extrapolar esa garantía a cada control legacy desktop sin medirlo.

Acceso y onboarding usan el nuevo mundo a todos los anchos: columna centrada de máximo 540px, padding 36px 24px 48px; a partir de 768px, 48px 40px. La copa de esas superficies pasa a laterales de 36px en ancho amplio. El corte de 389px reduce sus laterales a 16px; landscape reduce el padding superior a 24px.

La estructura desktop utiliza sidebar de 226px, de 180px entre 1024px y 1279px y rail de 72px entre 768px y 1023px cuando no prevalece el ámbito landscape móvil. La implementación desktop añade lateral claro, foco por rol, listas de comisión comparables y un resumen compacto que deja ver las tareas. Los ajustes concretos de anchura viven en desktop-forest.css. No convertir estas pantallas en una ampliación de la composición móvil.

## Elevation & Depth

La profundidad es híbrida y contenida: copa con una capa SVG oscura translúcida y borde orgánico; en móvil predominan el fondo crema, los divisores y las filas abiertas. Paneles móviles y navegación inferior eliminan sombras y blur. Los paneles desktop conservan sombra ambiental casi imperceptible; menús y diálogos tienen elevación funcional para separar capas.

Las sombras exactas, anillos de foco y duraciones viven en el sidecar, porque no caben en los tokens de componentes del frontmatter. El botón primario global conserva una sombra leve; acceso elimina la sombra de primarios y secundarios. No confundir esa sombra CSS con permiso para reintroducir ilustración 3D.

**The Celebración Confirmada Rule.** La liana 2D cruza siempre tras confirmar cada guardado. El recorrido dura 2.2s y la etiqueta 2.5s; las finalizaciones consecutivas se encolan. Con movimiento reducido se conserva el cruce sin giro accesorio. El follaje ambiental respeta movimiento reducido y la preferencia forestEffects; es independiente de la liana.

## Shapes

Los controles Forest usan esquinas suaves `mobile`; los controles globales desktop conservan `desktop-control` y los paneles `panel`. Las filas móviles son rectas, abiertas y divididas por línea; no son una sucesión de tarjetas elevadas. El avatar, la selección de foto y el objetivo gráfico de completar son circulares. La copa es la silueta orgánica distintiva; sus SVG son decorativos, sin sustituir controles HTML.

## Components

### Buttons

Una acción principal clara, con texto que puede envolver. En móvil usa el primario del frontmatter, alto mínimo de 48px y peso global de 750. El secundario operativo conserva papel y borde global; en acceso es transparente con borde vegetal y texto bosque, ambos de ancho completo. Los enlaces móviles mantienen mínimo táctil de 44px; acceso eleva sus enlaces a 48px. Deshabilitado reduce opacidad a 0.55 y usa cursor de espera.

El foco de botones, enlaces y summary utiliza contorno de 3px y separación de 3px en ámbar. Los campos tienen contorno verde de 2px con separación de 1px. El selector personalizado conserva su tratamiento específico; no retirar foco al estilizarlo.

### Chips

Los badges operativos móviles usan texto de 12px y padding de 3px 8px. Las tareas usan las mismas etiquetas en móvil y escritorio, con radio de 4px y peso 800: Pendiente conserva la superficie neutra y Terminada la superficie y tinta verdes. No se retiran sus fondos en los metadatos móviles.

### Cards / Containers

El panel desktop conserva papel, borde sutil, padding de 20px y radio `panel`. En móvil los paneles bajan a radio `mobile` y no tienen sombra; las listas, banners de comisión/proyecto y perfil retiran marcos o fondos adicionales según su función. Los estados vacíos quedan alineados al inicio, con explicación y acción real; sin grandes mascotas estáticas.

### Inputs / Fields

Etiquetas visibles y campos al menos de 48px en móvil/acceso. Acceso usa `auth-field`, borde vegetal y gap de 12px entre etiqueta y campo; el formulario separa elementos con 24px. El código de acceso usa un único campo pegable de seis cifras, números tabulares, tamaño de 22px y tracking de 0.2em. Error se anuncia como alerta y permite recuperar la acción. La foto inicial usa vista circular de 96px y una indicación explícita de opcionalidad; nunca bloquea continuar sin foto.

### Navigation

Inicio, Mis tareas, Proyectos, Comisiones y Perfil son los cinco destinos móviles. La selección usa bosque, peso 800 y una raya superior de 22×3px; base crema opaca sin backdrop blur. Los iconos son de 23px. En desktop se mantiene sidebar y topbar; no mostrar simultáneamente la topbar anterior y la copa móvil.

### Copa, iconos y confirmación

Reutilizar la geometría de `ForestHeader`, el archivo oficial `public/brand-mark.webp`, los iconos originales asociados desde el catálogo y `public/monkey-vine-2d.webp`. No redibujar ni recolorear el logotipo. El selector presenta iconos y nombre, sin sprites o monos 3D. Conservar los IDs históricos para compatibilidad. La confirmación visible y Deshacer comunican el resultado aunque se reduzca el movimiento.

## Do's and Don'ts

### Do:

- **Do** mantener copa compacta, trabajo legible y cuatro destinos móviles estables.
- **Do** respetar los dos supuestos del breakpoint móvil y las áreas seguras.
- **Do** conservar etiquetas visibles, foco, estados textuales y objetivos táctiles de al menos 44px en la experiencia móvil.
- **Do** preservar desktop operativo y ofrecer acceso/onboarding coherentes en ancho amplio.
- **Do** utilizar recursos oficiales 2D y mostrar celebración solo después del guardado confirmado.

### Don't:

- **Don't** reintroducir monos 3D estáticos, sprites de mascotas ni recursos del diseño Stitch.
- **Don't** reducir tipografía para impedir que los nombres envuelvan.
- **Don't** cubrir la última fila o el foco con la navegación inferior.
- **Don't** convertir cada fila móvil en una tarjeta elevada ni añadir decoración animada continua.
- **Don't** atribuir pruebas de OAuth real, sesión en PWA física o accesibilidad completa a una lámina, este documento o un build correcto.

## Enmienda aprobada · copa, perfil y escritorio

La aprobación del usuario incorpora la copa botánica 2D a desktop y móvil, conservando los iconos originales. BotanicalCanopy comparte exactamente las siluetas, nervios y paleta de haya/roble entre hojas de copa y hojas sueltas. Tres planos, escalas variadas y sombras de solape dan profundidad. El cursor mueve solo ramillas cercanas: límite nominal12px/5px/3grados, recorrido ponderado observable de alrededor de7px. La caída central es ocasional (26–40segundos de espera,7segundos de recorrido), como máximo una hoja y sin interceptar acciones. Esos tiempos son parámetros de producto, no una prescripción de plataforma.

La preferencia forestEffects oculta copa, hover y caída en ambos formatos. Movimiento reducido detiene solo estos efectos ambientales; la liana de confirmación continúa cruzando por decisión expresa del usuario. Los recursos3D y el estudio rechazado de iconos ilustrados no se incorporan. La base superior y la zona segura de la PWA usan #103b2d. Con follaje, la base oscura ocupa la zona de controles y deja transparentar el borde orgánico hacia el fondo crema.

ProfilePanel abre como información personal, con una única foto/nombre/correo/grupo y pañoleta rosa-morada. Editar perfil revela el formulario y permite cancelar; avisos y apariencia están en Preferencias. El correo y el grupo no son editables. La edición no es el estado inicial de la pantalla. Fuentes actuales: src/BotanicalCanopy.tsx, botanical-canopy.css, ForestHeader.tsx, ProfilePanel.tsx, profile-panel.css, ProfileForm.tsx, main.tsx y desktop-forest.css. Esta actualización es manual por lectura de fuente; no se atribuye al motor de Impeccable.

## Correcciones de uso posteriores al PR11

Esta corrección histórica usó crema a todos los anchos; la decisión posterior de Proyectos unificados, recogida debajo, restaura el verde oscuro en escritorio. Los encabezados/listados desktop usan superficies claras. Formularios conservan sus acciones en el flujo y separadas del borde y la barra de desplazamiento. El indicador móvil fijo ocupa solo su contenido. Perfil muestra una pañoleta de rayas rosas y moradas. En detalle móvil la actividad precede a acciones de estado iguales, con gestión al final. La liana no repite el mensaje de Deshacer. Consulta [correcciones y validación](docs/forest-desktop/workflow-corrections.md).

## Enmienda vigente: Proyectos y superficies desktop

El lienzo operativo desktop es verde oscuro #103b2d. Las superficies de lectura y acción siguen siendo blancas #fffefa con tinta #24352b: paneles, encabezados, listados, comisiones, proyectos, perfil, pestañas y vacíos. Solo los elementos que estén directamente sobre el lienzo llevan texto claro. El móvil conserva crema. Esta decisión del usuario sustituye la instrucción anterior de lienzo crema a todos los tamaños.

Proyectos es una única sección, con clasificación opcional y filtro. El tipo no cambia las funciones ni crea una jerarquía visual. La barra móvil incluye Proyectos y mantiene objetivos táctiles de al menos 44 px. El zoom de página se limita únicamente en la PWA móvil instalada; los controles de recorte de foto siguen funcionando. Ver [Proyectos independientes](docs/unified-projects.md).

## Ajustes de cabecera y copa

El engranaje de gestión vive a la derecha de la tarjeta de título de proyecto, comisión o tarea y reserva espacio para evitar solapar nombres largos. Usa el mismo objetivo de 44 px en todos los dispositivos y un popover de papel con tinta oscura. Formularios y eliminación se muestran progresivamente; las acciones operativas principales siguen visibles. La copa usa 17–50 segundos por lote, 15 % de dos hojas y 10 % de un plátano del indicador de carga. La preferencia de apariencia y movimiento reducido siguen siendo vinculantes. La pañoleta completa del perfil lleva franjas rosas y moradas.

## Acciones de correo y contexto del equipo

Los correos de tarea muestran «Ver tarea» y debajo tres acciones de icono en una fila: en curso azul, bloqueo amarillo con candado y finalización verde con check. Se usan PNG y tablas para conservar la disposición en clientes de correo, con texto alternativo, nombres accesibles y una franja de césped con la paleta de la copa debajo. Los enlaces mantienen la confirmación en la aplicación.

«Por completar» en el resumen personal siempre cuenta tareas asignadas al usuario, incluso cuando llega a cero. El contexto «Tareas del equipo» lleva su contador pequeño junto al título, excluyendo las tareas personales del numerador y denominador: hasta 30 % pendiente verde, más de 30 % hasta 60 % amarillo, más de 60 % rojo. Incluye tareas pendientes, en curso y bloqueadas como no completadas. El porcentaje también se comunica en el nombre accesible y el título del contador.

## Primera misión

La invitación de Inicio es una tarjeta discreta con título «Tu primera misión», duración 2–3 minutos y acciones Empezar/Omitir. La práctica reutiliza el detalle de tarea y la checklist, sin recorridos modales ni pasos obligatorios. La etiqueta de práctica individual y la responsable ficticia evitan confundirla con trabajo real. La ayuda contextual se limita al carácter opcional de los pasos y a que las actualizaciones escritas no se guardan ni envían. La celebración es una región no modal de papel, con mono 2D original tocando trompeta, pañoleta rosa/morada y tres notas pequeñas; nunca bloquea navegación y respeta movimiento reducido y áreas seguras. Perfil incorpora Ayuda y, solo para Administración, las estadísticas del tutorial.

La celebración al terminar tareas personales conserva el contenido de Inicio y su scroll; no sustituye el contexto del equipo por una pausa vacía. La liana y el aviso Deshacer permiten seguir desplazando el contenido.

## Páginas públicas y cuenta de grupo

La presentación pública conserva Forest Experience: Poppins local, verde bosque, papel crema, marca 2D y las mismas siluetas de hojas. La portada se limita a «Menos lío. Más grupo.», una línea sobre proyectos, comisiones y tareas y el acceso. La composición vigente utiliza una única ilustración original del mono al teclado, anclada a una mesa, en aproximadamente la mitad izquierda del escritorio. El titular queda en primer plano y la entrada a la derecha. En móvil, texto y acceso preceden a una escena amplia debajo; no se reduce la composición desktop. Las hojas de haya y roble existentes forman cuatro planos más poblados y ramas laterales, con pequeñas flores y bellotas 2D; no se introducen siluetas nuevas. El mono es una animación articulada de ocho segundos con tecleo, giro, sonrisa y parpadeo, codificada como WebP animado. El render une piezas 2D de colores planos, sin fundir dos escenas ni mover la mesa. La imagen estática aparece antes de decodificar la animación. No hay pausa visible; movimiento reducido, pestaña oculta y salida de pantalla conservan una ilustración estática. Sin JavaScript también se conserva la ilustración y el acceso. El pie permanece al fondo de la ventana y en el flujo si hay más contenido. Ver [portada ilustrada](docs/forest-landing/implementation.md). La solicitud de grupo vive como enlace discreto en el pie y nunca activa una cuenta sin aprobación del responsable. Las páginas legales priorizan lectura y siguen disponibles sin sesión o JavaScript. El registro pide nombre del grupo, correo y nombre del primer administrador y dos colores de pañoleta. La suscripción de ejemplo señala su naturaleza ficticia antes de cualquier precio y mantiene deshabilitada toda contratación. La identidad del grupo se muestra en acceso, cabecera, manifiesto PWA y perfil; sus ajustes no aparecen sin rol de Administración.

La explicación extensa del servicio y de Gmail se mantiene en `/presentacion` para la verificación de Google; no se añade a la portada animada.

## Enmienda vigente: identidad, copa móvil y avisos diarios

La cabeza del logotipo conserva el recurso original y gana tamaño: 44px en la app y la barra lateral amplia, 36px en el lateral compacto y 48px en la cabecera pública desktop (40px en su versión móvil). No se cambia la cabeza ni la articulación de la ilustración al teclado. Las tarjetas de proyecto móviles centran un único icono de 36px dentro de su fondo.

La cabecera móvil completa permanece fija al borde superior; un espacio en el flujo conserva su altura y el contenido se desplaza debajo del borde orgánico. La transición superior se funde con el verde de la barra nativa. Dos hojas del catálogo existente cubren el hueco sobre la primera N del rótulo. Solo los controles reservan el área segura. No hay un relleno adicional del body ni una capa opaca sobre el notch. La PWA conserva viewport-fit=cover, black-translucent en iOS y theme-color verde oscuro para Android. El blanco de los iconos nativos depende del sistema y no se atribuye a una captura de navegador.

La copa no responde al toque ni al lápiz. Conserva la interacción de cursor en escritorio. La brisa automática dura 3,6 segundos con hasta 1px de desplazamiento y 0,45 grados de giro; se programa de nuevo entre 5 y 15 segundos en móvil y escritorio. Se detiene con movimiento reducido, página oculta o efectos desactivados. La portada pública comparte la brisa ligera y deja de balancearse continuamente. No se modifica la caída ocasional de hojas/plátanos de 17–50 segundos ni sus probabilidades.

Las barras de desplazamiento usan pista de papel vegetal y tirador verde bosque, con hover más oscuro. No se cambian las superficies claras ni el contraste del escritorio.

Perfil incorpora un aviso diario opcional para tareas vencidas, desactivado por defecto e independiente del semanal por decisión del usuario. La clave diaria se limita a un aviso por tarea, destinatario y día de Madrid, incluso al editar una fecha vencida; los demás avisos conservan sus claves anteriores. Ver implementación, fuentes y límites en docs/mobile-canopy-reminders.md.


## Rendimiento móvil y navegación común

La copa móvil puede precalcularse sin pérdida desde su SVG original y conserva este como alternativa hasta disponer de la imagen. Su composición mantiene la dirección visual, el relleno sobre la N y la brisa ligera; no se rediseñan los recursos. El scroll sigue siendo nativo, las barras móviles se ocultan y las superficies de carga son crema desde el primer frame. Todos los grupos usan `/g/ID/`, sin una entrada especial del grupo inicial en la página pública. La compatibilidad de sesión y datos antiguos se concentra en el transporte y en una migración local verificada. Detalles y evidencias en [rendimiento y navegación](docs/mobile-performance-navigation.md).
