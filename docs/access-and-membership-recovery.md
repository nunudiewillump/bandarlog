# Acceso, bajas y respuesta de la aplicación

La espera antes de pedir otro código no impide introducir el código vigente. La respuesta 429 puede recuperar la referencia de la solicitud sin enviar otro mensaje ni reiniciar caducidad o intentos. El servidor reconstruye la referencia mediante HMAC con secreto, grupo, correo y fecha; sigue guardando únicamente su hash. El acceso exige el código de seis cifras, conserva sus diez minutos y el bloqueo tras cinco errores. Las direcciones desconocidas reciben el mismo formato de respuesta.

El navegador conserva la referencia, correo y plazos en `sessionStorage`, separados por grupo. Nunca conserva el código escrito. Recargar restaura el formulario; entrar o cambiar de correo elimina esta copia. Las restricciones de almacenamiento no impiden el acceso normal. Los códigos anteriores siguen verificándose con sus referencias originales; una solicitud de una versión antigua cuya referencia se haya perdido puede requerir esperar al próximo reenvío, ya que su referencia aleatoria no puede reconstruirse desde el hash.

El correo destaca las cifras como texto seleccionable y mantiene la alternativa de texto. Añade `public/monkey-key-2d.png`: ilustración original a partir de la mascota existente, con pañoleta rosa/morada y llave; PNG transparente de 240 píxeles de alto y aproximadamente 19 KB. Los otros tipos de correo conservan su diseño.

## Bajas y reincorporación

Retirar de una comisión elimina sus asignaciones de esa comisión. La baja del grupo las elimina en todo el grupo, revoca acceso y avisos como antes. Cada retirada queda en la actividad de la tarea y actualiza su versión; el título, estado, fecha, finalización y resto del historial se conservan. Si queda sin responsables se muestra expresamente y se puede reasignar. Reincorporar al proyecto o comisión no restaura asignaciones anteriores. La reactivación limpia también asignaciones heredadas de antiguas bajas.

La migración `0017_unassigned_tasks` permite ese estado sin responsables; sigue comprobando la pertenencia de los responsables restantes. Crear una tarea o modificar su lista explícita de responsables sigue exigiendo al menos uno. La migración cambia una función y no reescribe datos previos. El índice 0016 pertenece al PR de Resend: este cambio se integra sobre ese PR para conservar la secuencia de migraciones.

## Optimización y medidas

- Las lecturas simultáneas de estado, sesión, configuración y datos comparten una petición del mismo grupo. La deduplicación dura solo mientras hay una petición pendiente. Iniciar y terminar una escritura invalida esa reutilización; una respuesta anterior al cierre de sesión no repuebla la copia sin conexión.
- La carga de datos usa una sola transacción con el rol del grupo, conservando RLS y los filtros de permisos. La comprobación pública de salud solo ejecuta `select 1`, sin abrir una transacción de grupo ni leer tablas privadas.
- Salud y sesión se consultan en paralelo al arrancar. Los responsables de tareas se indexan una vez por revisión de datos en móvil y escritorio. Las asociaciones de ilustraciones se reutilizan en una caché acotada, cuyo identificador incluye todo el catálogo personalizado; no se guardan permisos ni tareas en esa caché.

Medidas del 5 de noviembre de 2026, entorno local aislado, PGlite y HTTP real, con datos ficticios y transporte de correo en previsualización. Incluyen lectura del cuerpo JSON; no representan Neon, correo real ni dispositivos físicos:

| Operación                           | Peticiones |  Mediana | Percentil 95 |   Máximo |
| ----------------------------------- | ---------: | -------: | -----------: | -------: |
| Todas las operaciones del escenario |        415 |  10,3 ms |      23,5 ms | 212,3 ms |
| Cargar datos                        |         56 |  18,6 ms |      36,1 ms |  83,1 ms |
| Crear tarea                         |         31 |  15,3 ms |      19,2 ms |  35,9 ms |
| Crear comisión                      |         23 |  10,4 ms |      11,8 ms |  14,0 ms |
| Crear proyecto                      |         19 |   7,3 ms |      12,5 ms |  16,2 ms |
| Invitar                             |         17 |  13,2 ms |      18,6 ms |  20,6 ms |
| Procesar avisos por lotes           |          3 | 158,8 ms |     158,8 ms | 212,3 ms |

Solo dos peticiones superaron 100 ms: ambas de procesamiento de avisos. La reacción visual al solicitar código se midió en 28,3 ms y 43,6 ms, con una demora de servidor simulada de 200 ms. El cálculo repetido de ilustraciones de seis comisiones pasó de aproximadamente 27 ms de mediana a menos de 0,1 ms tras reutilizar el resultado.

El objetivo de **100 ms máximos en cualquier operación completa no está acreditado ni garantizado**. La comprobación pública de producción, medida desde este entorno antes de publicar estos cambios, tardó entre 619 y 1.435 ms. Incluye red, proxy, aplicación y base; no permite atribuir el retraso a Neon por sí solo. Después del cambio a EU West comunicado por el usuario, otra tanda pública midió 249–521 ms, con mediana de 470 ms, todavía por encima del objetivo. Falta confirmar la región de Neon y medir con las nuevas optimizaciones publicadas para continuar el ajuste. No se ha cambiado infraestructura ni desplegado desde esta tarea.

Reproducción de la medición local: `BANDARLOG_BENCHMARK_OUTPUT=/tmp/bandarlog-api-benchmark.json node --import tsx --test tests/api.test.ts`. El archivo solo contiene acción, estado y tiempos del escenario ficticio. No se añaden servicios externos de analítica.
