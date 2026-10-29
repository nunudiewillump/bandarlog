**Actualización de implementación:** copa aprobada por el usuario con mayor movimiento, hojas del mismo arte que también caen por el centro, uso móvil y preferencia de ocultación. La implementación real y el perfil/PWA están en [../implementacion.md](../implementacion.md). Las capturas y parámetros de este directorio son el prototipo histórico.

# Copa botánica · enmienda visual

El usuario pidió más profundidad y calidad en el borde superior para reconocer una copa de árbol, con hojas sueltas ocasionales y respuesta al pasar el ratón. Después aclaró que la complejidad puede estar en la dirección artística mientras las acciones y tarjetas siguen siendo sencillas. La última indicación conserva los iconos anteriores; esta propuesta no introduce iconos nuevos.

## Prototipos

- `comms.html`: composición y datos originales de D07, con la nueva copa.
- `home.html`: composición y datos originales de D01, con la nueva copa.
- `mobile-header.html`: referencia de la cabecera a 390 px; no pretende sustituir ni validar el recorrido móvil completo.

Las hojas son geometría vectorial 2D original de haya y roble, con siluetas, nervios, medias tintas y sombras de solape. Tres planos y 54 ramillas se distribuyen con tamaños y ángulos irregulares para evitar la repetición de un patrón. La cabecera conserva entre 112 y 126 px de alto en las variantes medidas. Los controles permanecen por delante del follaje y no se desplazan con él.

El ratón mueve solo las ramillas próximas, con un recorrido máximo propuesto de 6 px horizontal, 3 px vertical y 1,8° de giro. Una hoja pequeña puede caer por los márgenes cada 26–40 segundos; nunca hay dos a la vez ni se interceptan clics. Esos valores son decisiones de esta propuesta, no tiempos prescritos por una guía ni observados en otro producto. El efecto ambiental y la respuesta del follaje se desactivan con movimiento reducido.

La liana es un contrato separado y permanece intacta: debe cruzar de lado a lado en cada finalización guardada. El CSS y el JavaScript de esta cabecera no incluyen selectores ni lógica de la liana.

## Captura y comprobación

Se realizó una captura inicial y una corrección conjunta para romper la regularidad de las agrupaciones. La confirmación comprende Comisiones a 1024/1440/1920, Inicio a 1280 y la referencia de cabecera móvil a 390. Las cinco mediciones registran cero desbordamientos de documento e imágenes rotas; los accesos de cabecera miden al menos 44×44 px.

En la prueba de ratón a 1440 px reaccionaron 13 de las 54 ramillas. Con movimiento reducido no se generó ninguna hoja suelta, no quedó ninguna visible y no se aplicaron transformaciones a las ramillas. Esto verifica el prototipo local, no una integración en la aplicación ni un estudio de comodidad o rendimiento en dispositivos físicos.

`preservation.json` confirma que los seis recursos de icono originales son idénticos en cada una de las dos escenas. `asset-manifest.json` identifica los recursos; `motion-contract.json` separa parámetros propuestos, evidencia observada y pruebas pendientes. `initial-source/` y `captures/initial/` conservan el punto de partida; `captures/` contiene la confirmación final.

Todo el trabajo está aislado en este directorio. No se modificaron la aplicación, los prototipos originales, los recursos publicados ni la configuración externa. La aprobación visual de la enmienda corresponde al usuario.

## Comprobaciones puntuales de legibilidad y margen

La revisión independiente detectó que la rotación de la hoja podía pintar unos píxeles fuera del margen en390px. Se añadió un canal fijo de20px con recorte de pintura, sin cambiar el follaje ni los componentes. También se elevó el color del texto de contexto/cabecera a blanco para mejorar su contraste sobre las hojas. `final-capture-records.json` registra las cinco capturas posteriores. Son correcciones de legibilidad/contención, no otra ronda de dirección artística.

`canopy-motion.gif` muestra una demostración con cursor visible y una hoja provocada para revisarla sin esperar. El movimiento está implementado en el prototipo; la aplicación de producción no se ha modificado. El GIF se repite para verlo y no representa la frecuencia ambiental real, prevista en26–40segundos. `motion-preview.json` identifica los fotogramas controlados y sus límites.

## Veredicto independiente acotado

**meets direction**, cero pendientes materiales: [informe](qa.md) y [mediciones](qa.json). Esta comprobación se limita a la cabecera y sus interacciones de presentación; no revalida todas las78escenas ni afirma integración de la aplicación. La selección explícita mantiene los iconos originales.
