# Conoce Bandarlog

Presentación voluntaria de siete pasos. Inicio la ofrece a una cuenta autenticada que ya ha terminado la configuración y cuya guía de administración está resuelta. Si hay una tarea abierta, una evaluación o trabajo pendiente de sincronizar, la invitación espera. Perfil → Ayuda permite repetirla desde el principio. La presentación se abre como diálogo y devuelve el foco al salir.

La escena de tareas monta `MobileTasks` y `HomeTaskAction` con una tarea de ejemplo local. El gesto real, el bloqueo con motivo y la finalización están disponibles sin mutaciones de tareas. Las escenas respetan movimiento reducido. Las poses son las ilustraciones existentes de Bandarlog y las nuevas máscaras WebP delimitan exclusivamente la pañoleta. Los colores proceden de los ajustes del grupo.

El documento PDF de la escena es ilustrativo. La explicación de disponibilidad usa la configuración de evaluaciones devuelta por la sesión. El cierre usa el correo de asistencia publicado y la frase prevista cuando el total de grupos no está disponible.

## Persistencia y métricas

La migración `0056_welcome_presentation` añade una tabla con clave por grupo, usuario y versión. La versión inicial es 1 y los primeros tiempos de apertura, finalización, omisión y acceso desde Perfil se conservan con una actualización idempotente. «Ahora no» registra la omisión sin sumar una visualización. Las cuentas existentes empiezan sin historial de la presentación.

`GET /api/welcome-presentation` lee el historial. `POST /api/welcome-presentation` admite las acciones `view`, `complete`, `skip` y `reopen`. El grupo, el usuario y la versión se determinan en el servidor. Se aplican la autenticación, la protección CSRF y las políticas RLS existentes para el contexto de la sesión. `GET /api/welcome-presentation/stats` devuelve cuatro totales del grupo para Administración, sin filas individuales. Estos endpoints no invalidan la instantánea de tareas ni despiertan los recordatorios.

## Impacto y verificación

- **Bundle.** Vite informa de unos 162,05 kB gzip de JavaScript inicial frente a 160,69 kB en la base. El diálogo carga aproximadamente 3,96 kB gzip de JavaScript y 2,20 kB gzip de CSS al abrirse. Las tres máscaras suman 1.256 bytes y se cargan al mostrar la pose correspondiente. No hay dependencias nuevas.
- **Neon.** Aplicar la migración 0056 con el rol de mantenimiento antes de iniciar el nuevo servicio HTTP. La migración crea una tabla, sus políticas y una función de agregación. La prueba local aplica 0056 sobre un grupo con proyecto, usuario, preferencias y tutorial anteriores.
- **Railway.** El cambio utiliza el proceso existente de build y migración. No precisa servicios adicionales ni variables nuevas.
- **Pruebas.** `tests/welcome-storage.test.ts` y `tests/groups-api.test.ts` cubren la migración y la separación de dos grupos. `tests/browser/welcome-presentation.spec.ts` cubre cuenta existente, alta de grupo, guía, gesto de Inicio, persistencia, acceso desde Perfil y dos combinaciones de pañoleta. Las capturas se generan en la salida de Playwright, o en `WELCOME_SCREENSHOTS` si se define esa ruta.
- **Entorno validado.** Chromium y PGlite locales. Pendientes de verificación con hardware real la PWA instalada y la lectura con VoiceOver o TalkBack.
