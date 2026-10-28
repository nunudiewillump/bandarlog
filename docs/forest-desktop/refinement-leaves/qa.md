# Revisión independiente · copa botánica

**Veredicto del alcance: `meets direction`. Cero desajustes materiales pendientes en esta enmienda visual.** No sustituye ni amplía la revisión de las 78 escenas desktop: se revisaron únicamente Comisiones, Inicio y una referencia de cabecera móvil. La aplicación no se ha integrado ni desplegado.

Se inspeccionaron los cinco renders finales: Comisiones a 1024, 1440 y 1920; Inicio a 1280; referencia móvil a 390. También se revisaron los fotogramas de hover y caída. La copa se reconoce como follaje de haya/roble: tres planos, superposición, nervios y escalas/ángulos variados. El contenido de trabajo y sus controles mantienen la jerarquía. Los iconos son los originales: las seis referencias por escena y el HTML de trabajo coinciden exactamente con D01/D07 tras ajustar las rutas relativas. No se incorpora el estudio de iconos complejos.

## Comprobaciones de la enmienda

- Los cinco registros finales no presentan desbordamiento de documento ni imágenes rotas. Los controles de cabecera conservan un mínimo de 44 px; marca y avatar permanecen visibles en 390 px.
- Se corrigió la legibilidad de los textos de cabecera a blanco. En un fotograma asentado a 1440, comparando el render con el mismo fondo sin texto y muestreando bajo los glifos, los mínimos calculados son 4,89:1 para «Mi grupo scout» y 4,88:1 para la fecha; «Comisiones» alcanza 6,80:1. Es una comprobación de ese fotograma, no certificación global de accesibilidad ni de todos los estados animados.
- El hover mueve 13 de 54 ramillas en la prueba de puntero. El rectángulo de contenido de cabecera permanece idéntico antes/después: los controles no se mueven.
- La caída se limita mediante un canal de 20 px con recorte de pintura. Se muestrearon seis puntos del recorrido en cada lado a 390 y 1440. La pintura queda dentro de los márgenes: 0–20 / 370–390 en móvil y 218–238 / 1420–1440 en desktop. No apareció desbordamiento ni intercepción de clics. El primer disparo determinista genera una hoja y el segundo simultáneo se rechaza.
- La preferencia de movimiento reducido emulada en Chromium deja cero hojas, cero canales y cero ramillas transformadas; no permite generar otra hoja. El manejador de ocultación se comprobó con un evento de visibilidad simulado: pausa la animación y rechaza el disparo. No se atribuye esa simulación a una prueba real de pestaña en segundo plano.

Los 26–40 segundos entre hojas, los 6,5 segundos de caída y los límites de hover son parámetros propuestos en el prototipo, no medidas de un producto de referencia ni prescripciones de una guía. El disparo utilizado para capturar la caída evita la espera; no demuestra la frecuencia durante una sesión larga. El GIF es evidencia visual del prototipo, no de integración en la aplicación.

La estática por movimiento reducido afecta solo al follaje ambiental. **La liana conserva su contrato independiente: cruce lateral en cada finalización guardada, siempre.** Estos archivos no modifican sus recursos, selectores ni eventos.

## Límites y próxima decisión

Quedan pendientes integración y regresión de las pantallas reales, rendimiento/comodidad en dispositivos físicos, larga duración y pestañas reales en segundo plano, teclado y tecnologías de apoyo. El móvil de 390 es una referencia de cabecera, no una revalidación del recorrido móvil completo. La aprobación visual corresponde al usuario; este informe no autoriza implementar, fusionar o desplegar.

`qa.json` conserva las observaciones, muestras, matriz de conformidad y huellas de las fuentes revisadas.
