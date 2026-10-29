# Correcciones de uso después del PR11

La revisión del usuario señaló un lienzo verde detrás de texto oscuro, un indicador móvil que ocupaba casi toda la altura y cambios que no aparecían en otras vistas. Esta entrega conserva Forest, sus hojas y sus iconos, y corrige esas situaciones.

- El lienzo de trabajo es crema en todos los tamaños. Encabezados y listados desktop tienen superficies claras. El verde del sistema queda separado mediante `theme-color`, fondo raíz y área segura; en PWA instalada se reserva la altura del notch fuera del contenido.
- La banana fija usa `top: auto` en móvil. Los formularios conservan los botones en el flujo y reservan espacio inferior y lateral.
- Las escrituras actualizan el estado compartido. SSE avisa a sesiones abiertas sin enviar contenido privado; cada sesión vuelve a consultar su ámbito autorizado. BroadcastChannel propaga el cambio entre pestañas. Foco, visibilidad, reconexión y consulta cada 15 segundos recuperan cambios si falla el canal en directo.
- Nueva tarea desde una comisión fija su destino. Fuera de ella se elige primero campamento/proyecto y después una comisión gestionable de ese destino. Los vencimientos son días completos en Europe/Madrid, con cambios de horario de verano; los controles ya no solicitan hora.
- Actividad precede a los botones de estado del detalle móvil. Editar y eliminar quedan al final como lápiz y papelera, con nombres accesibles y confirmación de borrado. La liana se conserva y se elimina su recuadro de texto duplicado; Deshacer conserva la confirmación operativa.
- La pañoleta del perfil tiene rayas rosas y moradas.
- La elección automática del icono prioriza el nombre normalizado, la similitud y los alias. El resultado no depende del ID de comisión ni de la descripción. Se mantiene la colección Navidad del proyecto y la selección manual para nombres sin asociación.

## Notificaciones del dispositivo

El primer acceso presenta una pregunta dentro de la aplicación. Solo pulsar Activar notificaciones solicita el permiso nativo. También existe el control en Perfil → Preferencias, separado del calendario de avisos por correo. Una negativa no impide usar la aplicación.

Se utiliza Web Push con claves VAPID generadas una sola vez y persistidas en PostgreSQL, sin nuevas variables de Railway ni una API de pago. La clave privada no se entrega al navegador. Los endpoints de suscripción admiten únicamente proveedores de navegadores conocidos. Los avisos de tareas tienen una cola independiente del envío SMTP/Gmail; no incluyen enlaces de autenticación. Al cambiar de cuenta se retira la suscripción anterior y hace falta consentimiento de la nueva cuenta. Cerrar sesión elimina la suscripción de ese dispositivo.

En iPhone/iPad las notificaciones web requieren abrir la PWA instalada en la pantalla de inicio y una versión compatible del sistema. Los navegadores sin soporte muestran una explicación y mantienen el correo. La prueba de permiso/suscripción usa un proveedor simulado y la API real; no acredita recepción en hardware real.

## Sin cobertura

El service worker conserva el shell y los recursos estáticos. IndexedDB guarda la última información autorizada y una cola por cuenta: crear tareas/comisiones, cambiar estado/fecha/responsables y comentar. La aplicación distingue cambios pendientes de datos sincronizados. Invitaciones, eliminación y edición de perfil requieren conexión.

El envío recupera sesión y CSRF actuales, conserva el orden de dependencias y utiliza recibos transaccionales para que repetir una solicitud no duplique tareas, comisiones, actividad o correo. Si el servidor cambió una tarea, o caduca la sesión/permisos, la cola se detiene con un mensaje y permite reintentar o descartar expresamente. Volver a entrar con la misma cuenta conserva el trabajo pendiente. Cerrar sesión o cambiar de cuenta limpia sus datos locales.

Background Sync procesa la cola cuando el navegador lo permite. Como alternativa, se intenta al recuperar conexión, volver a la aplicación y mientras permanece abierta. Un sistema que suspende la PWA y no implementa Background Sync necesita volver a abrirla; no se promete ejecución de fondo que el sistema operativo no permite. Ninguna respuesta privada `/api` se guarda en Cache Storage; la copia local autorizada reside únicamente en IndexedDB.

## Carga y evolución

En Personas desktop, Coordinación ve el grupo y Responsable sus comisiones gestionables. Se puede filtrar por comisión. El panel muestra carga abierta/vencida/bloqueada, progreso, porcentaje de tareas completadas dentro del plazo y mediana entre asignación y finalización con su tamaño de muestra. Excluye proyectos archivados y tareas borradas; las tareas compartidas cuentan para cada responsable. El plazo se compara con la fecha límite vigente.

La migración `0008` añade `assigned_at`, suscripciones/claves/cola push y recibos de sincronización. Las asignaciones anteriores conservan `NULL`: no se inventa fecha histórica. Cambiar la fecha o conservar a una persona asignada no reinicia su antigüedad. El indicador temporal empieza a ser útil con asignaciones registradas después de esta entrega.

## Validación

La evidencia vigente se recoge en el PR y sus checks. Las capturas de `artifacts/workflow-fixes` usan exclusivamente datos ficticios del entorno de pruebas. El color del notch y la recepción push en iOS/Android físicos requieren comprobar la versión desplegada en un dispositivo real; la emulación no sustituye esa comprobación.
