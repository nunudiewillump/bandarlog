# Háptica P0: alcance comprobado

La acción de tarea no depende de vibración. `src/haptics.ts` comprueba soporte y captura errores: inicio confirmado solicita 18 ms, finalización confirmada `[15,45,15]` y error `[25,30,10]`. No hay llamadas durante el arrastre ni por una escritura solo encolada. Se respeta movimiento reducido y se desactiva también cuando `forestEffects=false`. No se añade una preferencia persistente ni una dependencia.

## Android

La tabla de compatibilidad de MDN consultada el 21 de noviembre de 2026 declara `navigator.vibrate` desde Chrome Android 32; documenta necesidad de interacción del usuario desde Chrome 60 y restricciones en iframes entre orígenes. La llamada después de una confirmación asíncrona puede ser ignorada por el navegador o por el dispositivo. Un valor de retorno positivo tampoco prueba vibración física.

Las pruebas automatizadas comprueban patrones, preferencias, movimiento reducido, API ausente y excepción del controlador. No hay prueba física Android en esta entrega. Para verificarla: dispositivo real, iniciar y finalizar una tarea de prueba autorizada, confirmar que no vibra al arrastrar/cancelar ni antes del guardado; repetir sin conexión, reconectar y comprobar el pulso solo tras el recibo. Repetir con efectos apagados y movimiento reducido.

## Safari / PWA iOS

MDN declara que Safari no implementa Vibration API (`safari_ios` hereda esa compatibilidad). El código de producción conserva por tanto exclusivamente el feedback visual cuando la API no existe. No se afirma soporte háptico iOS.

Se estudió el control HTML nativo `<input type="checkbox" switch>`, introducido por WebKit en Safari 17.4. El [prototipo aislado](ios-haptics-prototype.html) tiene un interruptor visible, con etiqueta real, sin controles ocultos, eventos sintéticos, peticiones ni cambios en tareas. La documentación de WebKit confirma el control nativo, no garantiza una vibración concreta. Su efecto físico en Safari y en una PWA instalada sigue **sin verificar**.

No se integra en la acción: un interruptor representa un valor booleano y puede dar feedback durante el toque, antes de que el servidor confirme. Utilizarlo como un botón escondido para forzar háptica cambiaría la semántica y sería engañoso. La semántica de confirmar un inicio se mantiene con Pointer Events y un botón accesible alternativo.

Prueba manual pendiente: servir el prototipo en un origen HTTPS aislado, tocarlo físicamente en Safari y luego instalado, registrar modelo/iOS/navegador/ajustes/resultado. No disparar `.click()` desde JavaScript ni confundir la animación nativa con vibración. Incluso si funciona, no cambia la decisión de excluir ese interruptor de las tareas.

Fuentes consultadas:

- [MDN: Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).
- [Datos de compatibilidad MDN](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json).
- [WebKit: Safari 17.4, Switch control](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/).
