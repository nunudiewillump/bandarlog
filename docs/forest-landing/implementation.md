# Portada ilustrada · Forest Experience

## Dirección y alcance

La entrada pública representa la coordinación scout como un puesto de trabajo en un claro del bosque. Conserva la marca, Nunito Sans local, crema y verde bosque. El propósito y la acción permanecen visibles: «Menos lío. Más grupo.», «Proyectos, comisiones y tareas scout.» y «Entrar a mi grupo». La explicación extensa continúa en `/presentacion`.

En escritorio, el mono, teclado, mesa y taburete ocupan aproximadamente la mitad izquierda. El título pasa a primer plano sobre el borde de la escena y el acceso queda despejado a la derecha. En móvil, el orden es texto, acceso e ilustración a ancho completo. Los controles mantienen 44 px como mínimo y el pie respeta el área segura inferior.

La petición posterior del usuario prevalece sobre el primer experimento gráfico: la copa usa **exactamente** `shared/forest-art.ts` (haya/roble) y el lenguaje de nervios y colores de `BotanicalCanopy`. Tres planos de hojas, ramas laterales y sombras de solape dan profundidad. Las flores y bellotas son geometría SVG 2D discreta. No se incorpora la copa generada durante la exploración ni la liana suspendida de la portada anterior. La liana de celebración dentro de la aplicación no cambia.

## Ilustración y movimiento

Recurso original generado con la herramienta de imágenes a partir de la identidad de `public/monkey-wave-2d.png`: mono marrón, cara crema, pañoleta rosa/morada, mesa de madera, teclado, ordenador verde, helecho y plátano. Dos poses registradas muestran concentración y sonrisa. No es un modelo 3D ni un servicio de generación en tiempo de ejecución.

Los cuatro WebP locales de `public/landing/` ofrecen las dos poses en 480 y 887 px, con transparencia real. El navegador selecciona según ancho y densidad; cada pose se descarga una vez aunque se reutilice para la capa de manos. Total aproximado de las dos poses: 99 KB a 480 px o 257 KB a 887 px. El fichero fuente permanece en el espacio de generación de esta sesión; los derivados publicados son los recursos utilizados por la app.

El ciclo CSS dura 14 s: tecleo breve con manos y pausa para mirar/sonreír durante unos 2 s. La capa de manos se oculta al mostrar la sonrisa. El movimiento de ramas es pequeño y desfasado entre planos; hojas y un plátano caen ocasionalmente y no interceptan clics. No hay sonidos, scripts externos, dependencias nuevas ni código del cliente de la aplicación en esta página.

«Pausar animación» es un checkbox nativo que detiene la escena y muestra la sonrisa. Funciona sin JavaScript mediante `:has()`. La preferencia no se guarda entre visitas. `prefers-reduced-motion` muestra esa misma ilustración estática, sin hojas que caigan, sin alterar la composición.

## Compatibilidad y verificación

No cambian autenticación, autorización, solicitudes de grupo, aprobación del titular, base de datos ni rutas privadas. Las páginas legales mantienen su cabecera estática y siguen disponibles sin sesión o JavaScript.

Verificaciones específicas de este cambio:

- Build TypeScript/Vite.
- Seis pruebas de `forest-landing.spec.ts`: 320, 390, 768 y 1440 px, imágenes decodificadas, ausencia de overflow, acceso sin interferencias, ciclo/sonrisa, pausa por teclado, movimiento reducido y modo sin JavaScript.
- Dos recorridos públicos de `publication.spec.ts`: presentación, privacidad y demo a 390/1440 px sin JavaScript.
- Caso API público de `groups-api.test.ts`: portada anónima, páginas públicas, solicitud validada y demo sin cobros.

La revisión visual se hace en capturas reales de Chromium, con una tanda inicial y una confirmación tras las correcciones. Las capturas viven en `artifacts/forest-landing/`. No se afirma comprobación en iPhone/Android físicos, Safari o correo real. No se ejecuta toda la suite porque el alcance es la portada SSR y su hoja de estilos; no cambia la estructura ni permisos de la app.

Dirección y revisión independiente aplicadas con las skills [Designly Director](skill://plugins_6a80500711748191bee28e0649499efa/designly-director/SKILL.md), [Composition Director](skill://plugins_6a80500711748191bee28e0649499efa/composition-director/SKILL.md), [Brand Intelligence](skill://plugins_6a80500711748191bee28e0649499efa/brand-intelligence/SKILL.md) y [Visual QA](skill://plugins_6a80500711748191bee28e0649499efa/visual-qa/SKILL.md), junto con Impeccable. El motor local de Impeccable no se ejecutó por permisos; se leyó el contexto directamente y no se atribuyen resultados a ese motor.
