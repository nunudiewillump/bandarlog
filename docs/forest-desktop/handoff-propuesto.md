# Integración propuesta · pendiente de aprobación visual

Este documento pertenece a la revisión desktop. La selección de Codex y la aprobación del alcance autorizan diseñar y revisar; todavía no autorizan implementar ni desplegar. No sustituye la propuesta móvil aprobada: la extiende al escritorio. El código base de esta revisión es `65dc0a0`; comprobar la integración de PR #9 y el estado actual de main antes de abrir una rama de implementación posterior.

## Integración de la composición

- Adaptar el contenedor, navegación lateral y cabecera de `src/main.tsx` usando los tokens existentes de `src/forest.css` y `DESIGN.md`. Mantener las reglas móviles, incluido el móvil en horizontal. Los HTML de `codex/screens/` son especificaciones visuales, no componentes de producción.
- Compartir la priorización de `src/focus.ts`: propias, equipo autorizado, resumen autorizado y al día. Coordinación conserva la visión global; no ampliar datos ni permisos para llenar espacios. Las cifras y las acciones se derivan de los datos reales, nunca del dataset ilustrativo.
- Reutilizar tablas, filtros, detalle lateral, confirmaciones y formularios con la nueva composición. Los controles de selección de producción conservan `src/Select.tsx` y su portal; los selectores HTML del tablero no autorizan sustituir Radix por menús básicos.
- Conservar los destinos de las invitaciones al entrar desde comisión o proyecto. Perfil reutiliza `ProfileForm`, `PhotoEditor` y las preferencias configurables actuales; correo de acceso solo de lectura. El acceso y onboarding públicos no muestran navegación privada.
- Reutilizar `ForestHeader` o su geometría exacta. Nunito procede de la dependencia local existente. Los iconos se resuelven con el catálogo real y el tema del proyecto/campamento, respetando asociaciones bloqueadas. No añadir monos 3D ni nuevas llamadas a generadores.

## Finalización: enmienda vinculante del usuario

«No, la liana se tiene que mover de lado a lado al acabar una tarea siempre».

Cada finalización confirmada por el servidor debe provocar un cruce completo del mono 2D y «Tarea completada», con Deshacer. No dispararlo antes del guardado ni en un error. No perder celebraciones si se completan dos tareas seguidas: identificar cada evento y gestionar su reproducción sin bloquear el trabajo ni Deshacer. La variante con menor movimiento conserva el cruce lateral y puede retirar las rotaciones accesorias; el CSS vigente que oculta la imagen en `prefers-reduced-motion` deberá adaptarse a esta enmienda.

`published/liana-2d.gif` es una simulación de movimiento sobre el diseño. Sus fotogramas y posiciones se registran en `published/motion-preview.json`. La repetición del GIF sirve para examinarlo; no propone una animación decorativa continua en la aplicación ni prueba un evento de guardado real.

## Validación posterior a implementar

Comprobar roles y contexto con datos aislados; filtros y tablas completas; invitaciones individuales/listas y recuperación; preferencias/foto/recorte; recorrido de teclado y retorno de foco; reflow y zoom; errores, concurrencia y guardado; finalizaciones consecutivas, cruce completo y Deshacer. Verificar desktop a 1024, 1280, 1440 y 1920 y mantener las regresiones móviles existentes. La geometría y las imágenes de un tablero no prueban API, envío, persistencia ni accesibilidad asistida.

La rama de diseño conserva los recursos originales, matrices y capturas reproducibles. Los cambios de aplicación, las variables externas y el despliegue quedan fuera de esta entrega.
