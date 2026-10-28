# Codex · refinamiento seleccionado

**Ronda 1 completada:** revisión independiente `meets direction`, quince correcciones resueltas, cero parciales o pendientes materiales. [Resultado visual](propuesta-refinada.md). Pendiente de aprobación del usuario para avanzar a implementación.

El usuario seleccionó explícitamente **Codex** para refinar y continuar el flujo. Se conserva la dirección A y el modo Seguir recomendación. El resultado original de Stitch y su revisión quedan intactos como comparación; no se vuelven a generar ni se mezclan sus recursos.

## Procedencia y presupuesto

- Checkpoint de propuesta inicial: commit `452183a`, con capturas y matrices independientes F01–F27.
- Feedback del usuario sobre Codex: «Más maja, sí, un pelín sosa, pero mejor».
- Autorización de refinamiento: «Perfecto, refina la propuesta de Codex y continuamos con el flujo».
- Alcance activo de corrección: `platform`, elegido por el usuario.
- Ronda 1: un lote sobre la propuesta completa. Presupuesto compartido máximo: tres rondas Design Arc; no se reinicia al descartar Stitch para las correcciones.
- Fuente de requisitos: contrato común original, auditoría independiente de Codex y ajustes visuales aceptados. No constituye aprobación visual de una versión aún no mostrada ni autorización de despliegue.

## Lote de corrección 1

| Requisito aprobado y procedencia | Estado/renders iniciales | Corrección requerida |
| --- | --- | --- |
| Copa de árbol reconocible y compacta, encargo y feedback | Todas las cabeceras, F06 | Sustituir la ondulación genérica por volúmenes orgánicos de copa de árbol, conservando legibilidad, marca oficial, altura contenida y ausencia de animación. |
| Identidad cálida sin ruido, feedback | Listas, F06/F13/F14 | Mejorar jerarquía y detalles de composición; mantener filas continuas y ausencia de KPI decorativos. |
| Catálogo original, contrato y auditoría | F13 y listas de comisiones | Recuperar los iconos asociados de las diez comisiones mostradas, con referencias trazables a los recursos originales. No ampliar ni redibujar el catálogo. |
| Navegación estable, contrato y auditoría | F11/F13/F19 y landscape | Mantener cuatro destinos visibles durante scroll con espacio reservado para la última fila y área segura. Capturar el viewport horizontal real, además del contenido largo si se necesita. |
| Objetivos táctiles, auditoría | F14, controles de todas las escenas | Mínimo 44×44, incluyendo pestañas, campos, selectores, slider y checkboxes; medir los tipos de control presentes, no solo botones. |
| Escenas completas, auditoría | F05/F12/F13/F19/F20 y tablero | Exportar el tablero y cada escena sin cortar acciones, navegación ni contenido. |
| Nombre obligatorio y foto opcional, contrato | F04/F05/F26 | Nombre vacío con error, escena de recorte con imagen de prueba claramente identificada, cancelación preservando nombre y llegada a Inicio tras omitir foto. No repetir onboarding en el estado final. |
| Recuperación por correo, contrato y auditoría | F02/F25 | Representar espera de reenvío, código incorrecto, intentos agotados y nuevo desafío. No implementar autenticación en la lámina. |
| Invitaciones contextuales, contrato y auditoría | F18 | Mostrar lista de correos abierta, validación y retorno, con comisión/proyecto de destino fijo. |
| Datos de estrés coherentes, contrato y auditoría | F06/F08/F09/F11/F13 | Un dataset sintético trazable de 74 tareas: 7 personales abiertas, 30 abiertas del equipo, 14 externas solo agregadas y 23 terminadas. Reconciliar cifras entre estados; no confundir renders con prueba del fixture real. |
| Jerarquía de proyectos, auditoría | F15 | Eliminar nombre duplicado y dejar clara pertenencia de comisiones. |
| Formularios con diseño compartido, encargo | F18/F20 | Selectores con presentación Forest, error de validación y error de envío diferenciados, valores conservados y cancelación visible. |
| Consulta y gestión por rol, contrato | F14 | Variantes de Scouter y Responsable: no dibujar controles de gestión en lectura. Autorización backend pendiente. |
| Última tarea, contrato y auditoría | F07 | Representar inicio 1 y resultado 0, satisfacción y Deshacer; tiempos y transición real siguen siendo prueba de implementación. |
| Tablet/desktop compartidos, auditoría | F04 | Añadir composición amplia del primer acceso. No rediseñar el desktop operativo actual. |

Las mejoras preservan la dirección aprobada y se clasifican como `repairable drift`. La prueba de backend, OAuth, persistencia, movimiento real, dispositivo y accesibilidad asistida continúa como `runtime proof` y no se intenta resolver regenerando una imagen.

## Validación requerida

Revisar de nuevo la propuesta completa, incluidas escenas que antes coincidían. Verificar cargas de imágenes, desbordamientos, tamaños de controles, datos coherentes, foco y nombres en los ejemplos estáticos; inspeccionar conjuntamente móvil, landscape y composiciones amplias. La matriz nueva debe distinguir representación verificada de comportamiento pendiente y enlazar los renders concretos inspeccionados.

No declarar corrección solo porque se haya editado el HTML. Un revisor independiente evalúa las nuevas capturas. La siguiente parada del modo Seguir recomendación es la aprobación de la propuesta visual corregida por el usuario, con imágenes accesibles mediante URL HTTPS comprobada.
