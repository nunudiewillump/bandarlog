# Retorno de Google en PWA · 19 de noviembre de 2026

La pantalla anterior podía mostrar «Comprobando acceso» durante los tres minutos de espera del popup. Dependía de un único postMessage y calculaba el reto criptográfico después de abrir la ventana: iOS podía suspender la PWA antes de navegar. En la muestra observada, dos callbacks de Google terminaron correctamente en 435 y 521 ms, sin un POST de retorno posterior. Esto apunta al traspaso entre ventanas; no demuestra el comportamiento de todos los dispositivos.

## Cambios y límites

Se prepara el reto en memoria antes del clic y se navega sin esperar una operación asíncrona tras abrir la ventana. Mientras Google está abierto, se muestra una espera específica y el acceso por correo sigue disponible. El callback reenvía el mensaje hasta recibir confirmación. Solo ese documento efímero usa COOP unsafe-none; conserva CSP con nonce, no-store y no-referrer. La aplicación conserva su política habitual.

Si se pierde opener, volver a primer plano permite comprobar inmediatamente el retorno con una cookie HttpOnly/Secure/SameSite=Lax de un minuto y el secreto aleatorio que sigue en memoria en la PWA. No basta conocer o elegir el reto: se exigen ambos secretos independientes, el grupo correcto y el plazo válido. La eliminación del permiso y la emisión de sesión son atómicas, también si compiten mensaje y recuperación. Las comprobaciones de primer plano se limitan a cuatro por retorno; no hay sondeo de red permanente ni nuevas conexiones por petición.

El origen canónico se publica en la configuración. Rosales admite únicamente sus orígenes heredados configurados; los demás grupos conservan el canónico. También se redirige el inicio OAuth con ruta de grupo desde el dominio antiguo antes de crear cookies. 0038 añade un origen nullable firmado por la autoridad de identidad y asociado a la transacción. No concede capacidades globales nuevas. Las filas y emisores anteriores con NULL siguen funcionando.

Si iOS separa los almacenes de cookies y también pierde opener, la recuperación con cookie no es posible: se conserva el código de correo como alternativa. No se usa el reto como credencial suficiente. No se promete latencia de red cero ni se ha completado esta versión en un iPhone físico o una cuenta Google real.

## Verificación

- Compilación TypeScript/Vite y once pruebas Node específicas correctas.
- Ocho pruebas con PostgreSQL 17 desechable completas, sin omisiones. Cubren callback con JWT RSA firmado por proveedor sintético, nonce/firma, origen válido y rechazado, cookies, secreto insuficiente, grupo incorrecto, repetición, consumo concurrente y autoridad SQL. Incluyen regresiones de permisos, altas y aislamiento A/B porque cambian el emisor y el contrato compartido.
- Quince casos seleccionados de navegador correctos: cuatro de PWA Google, tres de recuperación por correo, dos de acceso simple y seis de almacenamiento/sesión offline. La recuperación simulada de primer plano queda bajo dos segundos; es un límite de prueba, no una medición de producción. El caso de origen heredado usa una navegación explícita en el fixture; la redirección 308 real se verifica en PostgreSQL.
- Se mantienen los checks obligatorios de CI. No se debilitan PBKDF2, límites de intentos, verificación de Google, aislamiento por grupo ni comprobaciones de sesión. ASVS L2 sigue sin poder declararse por los límites ya documentados.

## Introducción y rollback

1. Ensayar 0038 con el migrador sobre una rama aislada de Neon, sin seed. Conservar una copia previa sin compute.
2. Aplicar 0038 con credenciales independientes de mantenimiento antes de desplegar los binarios que requieren contrato 38. Verificar contrato, permisos, MFA desactivado y recuentos empresariales. No cambian secretos ni contraseñas.
3. Desplegar la revisión comprobada de identidad, HTTP y entrega con sus LOGIN y secretos separados. Comprobar readiness, rutas públicas, Google habilitado y caché estática v12. IndexedDB y cambios pendientes permanecen.
4. Verificar el acceso interactivo en el dispositivo afectado. El smoke público no sustituye ese paso.

Para rollback, fijar los tres servicios al commit anterior 7492850208d13fbcb9dcb6daeb6e94817fbb5429. Ese binario exige contrato mínimo 37 y admite el esquema aditivo 38; los emisores antiguos escriben NULL y conservan su prueba de autoridad anterior. Mantener 0038 aplicada evita escrituras destructivas y permite volver a avanzar. No restaurar una copia de datos sobre producción para revertir este cambio. Una reversión a un binario que vuelva a exigir MFA requiere otro plan.
