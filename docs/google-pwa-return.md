# Retorno de Google a la PWA

Estado: implementación para revisión, sin despliegue ni cambios productivos. El ensayo en iPhone real con Google sigue pendiente.

## Flujo

El navegador ordinario conserva el acceso Google por redirección. En modo instalado (`display-mode: standalone` o `navigator.standalone`) el botón abre una ventana como resultado directo del gesto del usuario. La PWA conserva en memoria una prueba aleatoria de 32 bytes y pasa únicamente su SHA256 al inicio de OAuth.

Se mantienen state, cookie de navegador OAuth, PKCE, nonce, firma, audiencia, emisor y caducidad del ID token. El desafío del retorno se conserva en `google_states` junto al estado existente. Una vez verificada Google, el callback crea un ticket aleatorio, almacena solamente su hash y devuelve un documento sin caché, con CSP de nonce y Referrer-Policy no-referrer.

El ticket solo se entrega mediante `postMessage` al opener, con origen de destino exacto. No viaja en URL ni se publica en un endpoint de consulta. La PWA comprueba tanto origen como ventana emisora; después canjea ticket y prueba por POST desde su propio contexto. La cookie de sesión HttpOnly/Secure se establece en esa respuesta, dentro de la PWA. El ticket caduca en 60 segundos y su DELETE condicional y la creación de sesión ocurren en una transacción: falla ante otro grupo, prueba incorrecta, expiración o reutilización.

La prueba no se persiste en localStorage, IndexedDB ni cookies. Si iOS termina la PWA o pierde la referencia de ventana, el acceso no se transfiere. Se ofrece el código de correo, con cancelación manual y espera máxima de tres minutos. No se promete que iOS permita siempre el retorno automático.

Si Google exige verificar la propiedad del correo antes de vincular una identidad, el canje establece el vínculo temporal en la PWA y exige el código de correo existente. No crea una sesión mediante ese resultado. El servidor vuelve a comprobar la cuenta habilitada antes de crear una sesión.

## Seguridad y compatibilidad

- RLS firmada, claves de contexto y credenciales runtime se mantienen. No se añaden funciones globales ni credenciales administrativas al HTTP.
- `google_handoffs` tiene group_id, política firmada y FK compuesta al usuario; el LOGIN runtime no obtiene lectura directa. Solo el rol tenant recibe CRUD.
- No se añade polling ni un job: los tickets caducados se limpian al emitir otro ticket dentro de su grupo.
- Se mantiene el callback registrado de Google; no hace falta otro client ID, secreto ni URI de callback.
- COOP cambia a `same-origin-allow-popups` exclusivamente en la entrada SPA `/` y documentos de inicio/callback OAuth. El resto de API conserva `same-origin`. No se habilita framing ni se relaja globalmente CSP.
- El nuevo endpoint conserva el control de Origin y los límites de `/api/auth`. No permite seleccionar un grupo o usuario desde el cuerpo del canje.
- No hay recogida de sesiones por polling: un atacante que comparta su enlace de inicio con otra persona no recibe por esa vía un ticket para su propia PWA.
- Los códigos, invitaciones, enlaces profundos, cookies y cierre de sesión existentes conservan sus rutas. El popup deja la URL original de la PWA abierta. La vinculación de correo requiere los pasos anteriores.

## Migración y reversión

Aplicar `0021_google_pwa_return` con la identidad administrativa independiente antes de desplegar el código nuevo. La migración añade una columna nullable a `google_states`, la tabla de tickets y sus restricciones/permisos. No reescribe usuarios, sesiones o tokens existentes. No debe aplicarse con las credenciales HTTP.

En staging: verificar identidad runtime, nueva RLS y FK; ensayar Google completo en navegador y una PWA instalada de iPhone. Comprobar éxito, cancelación, cierre de ventana, pérdida de opener/COOP, suspensión/recarga de la PWA, red interrumpida y correo adicional. Revisar invitaciones y destino profundo tras entrar. El origen de la PWA y APP_URL deben coincidir; no se aceptan mensajes de un origen heredado distinto.

Rollback de aplicación: volver a la revisión anterior; ignora la columna nullable y la tabla aditivas. Los tickets no canjeados caducan. Conservar las tablas al revertir, sin editar el journal ni borrar datos históricos. No requiere rotar secretos ni cambiar configuración de Google.

## Validación

Pruebas nuevas: origen y emisor de mensajes, CSP, prueba hash; HTTP/PostgreSQL real para grupo incorrecto, prueba incorrecta, cookie en el Path correcto, reutilización, consumo concurrente, expiración y verificación adicional de correo. Los grants sintéticos de estas pruebas no sustituyen la validación externa de Google.

Playwright reproduce modo instalado: popup bloqueado con alternativa de correo y retorno a la misma PWA con verificación adicional. Se simula el proveedor y se reproduce la política COOP de la SPA; no se afirma haber probado Safari/iOS real.
