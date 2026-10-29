# Bandarlog

Bandarlog es una PWA web para coordinar las comisiones y seguir las tareas de un único grupo scout. Ayuda a personas voluntarias a saber qué les toca, completar su trabajo y consultar el avance del equipo sin convertir la coordinación en otro canal de conversación.

## Personas y alcance

Cada instalación corresponde a un grupo con varios proyectos y comisiones. Una persona puede pertenecer a varias comisiones. La pertenencia y los permisos se comprueban en servidor; la navegación, las invitaciones y los métodos de acceso nunca amplían ese alcance.

| Rol | Capacidad y límite |
| --- | --- |
| Scouter | Consulta las tareas de sus comisiones; cambia estados y comenta sus tareas asignadas. |
| Responsable | Gestiona tareas, fechas, asignaciones y personas dentro de sus comisiones. |
| Coordinación | Supervisa el grupo y gestiona proyectos, comisiones, personas e invitaciones. |
| Administración | Incluye Coordinación y gestiona roles globales. |

La invitación al grupo no da acceso automático a sus comisiones; la invitación a un proyecto tampoco da acceso a todas sus comisiones. Los resúmenes autorizados no deben revelar detalles de trabajo oculto. No forman parte del producto el chat, inventario, gamificación ni una integración permanente con las hojas anteriores.

## Trabajo principal

Inicio aplica Smart Focus: trabajo personal pendiente, trabajo de las comisiones propias, resumen autorizado del campamento y estado al día. Muestra hasta tres tareas destacadas y ofrece acceso al listado. Las tareas conservan proyecto, comisión, persona asignada, fecha, estado y observaciones. Los estados son pendiente, en curso, bloqueada y terminada; los bloqueos requieren motivo y la finalización conserva autor y fecha.

Completar requiere confirmación del guardado; se mantienen control de concurrencia, recuperación de errores y Deshacer. Borrar retira la tarea de listados y avisos, conservando su historial. Las acciones de gestión se muestran según permiso y se autorizan de nuevo en servidor.

Los cuatro destinos móviles estables son Inicio, Mis tareas, Comisiones y Perfil. Desktop comparte Forest Experience con navegación lateral clara, tareas prioritarias por rol, comisiones agrupadas y resumen compacto de Responsable. Tablet y móvil conservan su navegación operativa. Acceso y primer acceso comparten las superficies también en ancho amplio.

## Entrada e identidad

El acceso principal usa un código de seis cifras dentro de la PWA, con caducidad de diez minutos, cinco intentos y espera de reenvío. Se mantienen enlaces anteriores e invitaciones. Google es opcional y solo se presenta cuando está configurado. Todos los métodos resuelven la misma identidad autorizada; Google Login usa un cliente separado del transporte Gmail.

Las cuentas nuevas completan un nombre obligatorio y pueden añadir foto. La foto es opcional; omitirla permite continuar y conserva el nombre. Se reutiliza el editor de recorte y compresión. La finalización del onboarding se persiste en servidor; los perfiles existentes mantienen su configuración.

Los fallos de red ofrecen recuperación sin fingir cierre de sesión o guardado correcto. La sesión utiliza cookie HttpOnly, Secure en producción, SameSite y CSRF; no se guardan tokens de acceso en localStorage. La PWA cachea recursos estáticos y conserva en IndexedDB la última información autorizada por cuenta y una cola de cambios pendientes. Las escrituras sin cobertura se distinguen de las confirmadas, se envían con recibos idempotentes y se detienen ante conflictos. Cache Storage no contiene respuestas privadas de API.

## Identidad y comunicación

La dirección vigente es Forest Experience, propuesta refinada Codex aprobada en `7088637`, con una modificación posterior vinculante del usuario: eliminar todos los monos 3D estáticos y mantener únicamente la marca pequeña 2D, la liana 2D y guiños discretos 2D. Los originales e identificadores históricos se conservan por compatibilidad; no constituyen recursos que deban volver a mostrarse. El sistema visual actual está en [DESIGN.md](DESIGN.md).

El trabajo tiene prioridad sobre la decoración: copa compacta, crema, verde bosque, listas legibles y confirmaciones breves. La marca oficial y los iconos asociados a las comisiones se conservan. La liana cruza lateralmente en cada finalización guardada, incluso con movimiento reducido; las finalizaciones consecutivas se encolan. La copa responde al cursor con mayor recorrido y una hoja de sus mismas siluetas puede caer por el centro sin interceptar clics. El follaje ambiental queda estático con movimiento reducido y puede ocultarse por completo mediante la preferencia personal persistente forestEffects.

Accesos, invitaciones, tareas, recordatorios y resúmenes comparten el branding Bandarlog en HTML y alternativa de texto. El remitente usa el nombre Bandarlog con una dirección autorizada del grupo. Los enlaces conservan contexto, exigen autenticación y confirmación para modificar datos y no ejecutan cambios mediante GET. No se presupone envío ni compatibilidad verificada en clientes de correo reales.

## Plataforma y privacidad

React, TypeScript y Vite forman el cliente; Express sirve API y producción compilada; Drizzle gestiona PostgreSQL, con Neon como base de producción y PGlite como alternativa local. Las fotos se normalizan y persisten en base de datos. Railway es el destino de alojamiento documentado; esta documentación no autoriza despliegues ni cambios de configuración externa.

Los secretos de códigos, sesión, base de datos, Google y transporte de correo pertenecen al servidor y a la configuración privada. No incluir valores en cliente, Git, capturas, documentación o chat. Las credenciales de herramientas de diseño no pertenecen a la aplicación. Los fixtures, capturas y pruebas deben usar datos aislados, sin información personal real del grupo.

## Autoridad y estado de comprobación

Fuentes: [README.md](README.md), confirmación del objetivo y propuesta por el usuario, [propuesta refinada](docs/forest-experience/propuesta-refinada.md), [implementación](docs/forest-experience/implementacion.md), [handoff](docs/forest-experience/handoff.md), [manifiesto de recursos](docs/forest-experience/implementation-assets.json) y código vigente. Los avisos de implementación al principio de los documentos históricos y la modificación 2D prevalecen sobre sus párrafos anteriores que aún describen aprobación pendiente, láminas estáticas o mascotas 3D.

Esta captura de contexto se hizo por lectura directa de instrucciones y repositorio: el launcher/motor local de Impeccable no se ejecutó por un fallo de permisos ya comunicado en la conversación. No se atribuye a ese motor la extracción ni una validación automática.

Estado comunicado por la integración de esta rama: build y 47 pruebas unitarias/API aprobados; 42 recorridos funcionales base de navegador y tres pruebas Forest aprobados localmente (un título de prueba ajustado y reejecutado con resultado correcto). La ejecución conjunta de las 45 pruebas en CI sigue pendiente. La [revisión independiente de la implementación](docs/forest-experience/revision-implementacion.md) registra `ship` y cero defectos materiales; se distingue de la revisión de la propuesta estática. No se ha validado una cuenta Google real, retorno OAuth o persistencia de sesión en PWA instalada en iOS/Android físicos, accesibilidad asistida completa ni envío externo. No se declara terminado el producto ni desplegada la rama. Consultar la evidencia de la rama antes de actualizar estos estados.

## Perfil y PWA · implementación desktop aprobada

El perfil muestra por defecto nombre, correo, foto y el grupo Rosales del Canal 702, con una pequeña pañoleta rosa y morada. Editar perfil es una acción explícita; la configuración de avisos y apariencia se despliega por separado. Los guardados parciales de nombre, foto, avisos y forestEffects conservan los demás valores. La instalación PWA declara tema y fondo #103b2d, área segura superior y barra iOS translúcida; el estado de sistema en hardware físico queda pendiente de comprobación.

Esta enmienda sigue la aprobación explícita del usuario de la propuesta desktop/copa y sus ajustes finales. La fuente de la implementación es src/main.tsx, BotanicalCanopy, ForestHeader, ProfilePanel/ProfileForm y sus CSS; la propuesta estática anterior no sustituye la evidencia de aplicación real. Estado actual de pruebas y revisión en docs/forest-desktop/implementacion.md; las cifras históricas anteriores describen el PR9 y no la validación de esta nueva rama.

Las correcciones posteriores al PR11, las notificaciones del dispositivo, el análisis de carga y los límites de sincronización están documentados en [workflow-corrections](docs/forest-desktop/workflow-corrections.md).

## Ámbito de acciones por rol

Los controles sin permiso se ocultan. Scouter actúa únicamente sobre sus tareas asignadas; Responsable gestiona tareas y personas existentes dentro de sus propias comisiones; Coordinación incluye las acciones anteriores y la gestión de proyectos y campamentos. Solo Administración puede dar de alta usuarios mediante invitaciones, eliminar su acceso y cambiar roles globales. La baja revoca sesiones y avisos, conserva el historial y exige reasignar antes las tareas pendientes; no permite eliminar la propia cuenta. Las consultas de tareas de una comisión conservan su alcance autorizado.
