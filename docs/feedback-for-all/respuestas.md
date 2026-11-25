# Evaluaciones individuales identificadas

Este incremento del motor de P2 añade la API de publicación y respuesta. La experiencia del participante en Inicio y la interfaz de gestión corresponden a un incremento posterior.

## API de grupo

| Método y ruta | Operación |
| --- | --- |
| `POST /api/group-evaluations` | Coordinación o Administración publica con título, ID de plantilla, revisión publicada, fecha límite futura y de 1 a 100 usuarios activos del grupo. La evaluación y sus asignaciones se crean en una transacción. |
| `GET /api/group-evaluations` | Lista las asignaciones propias, paginadas por ID. Incluye plazo y estado de envío. |
| `GET /api/group-evaluations/:id` | Devuelve la versión inmutable de la plantilla y la respuesta propia, si hay una asignación. |
| `PUT /api/group-evaluations/:id/response` | Guarda un borrador o entrega una respuesta final mediante `action`, `revision` y `answers`. Los envíos incompletos devuelven 400. Las revisiones obsoletas, los plazos vencidos y las respuestas ya enviadas devuelven 409. |

El contrato cubre respuestas individuales identificadas. El borrador es privado para la cuenta asignada. La consulta de resultados por Coordinación o Administración aún no tiene endpoint. La API de respuestas no almacena respuestas anónimas ni se usa para campañas globales.

## Datos e instalación

La migración aditiva 0044 agrega una relación con la versión publicada y asignaciones únicas por grupo, evaluación y usuario. Extiende RLS de versiones para que un miembro asignado pueda consultar la versión exacta. La política de la asignación limita su lectura y actualización al actor asignado. Un trigger valida el plazo y la transición de la revisión y asigna la hora de envío desde PostgreSQL. Un campo de revisión impide que dos escrituras simultáneas reemplacen la misma respuesta.

En un entorno aislado, aplicar `npm run db:migrate` con credenciales de mantenimiento y activar `GROUP_EVALUATIONS_ENABLED=true` en HTTP. La validación de arranque exige contrato 44 al habilitar la API. Se puede retirar el acceso desactivando el flag y reiniciando HTTP, conservando los datos de la migración. El flujo de producción requiere revisión previa.

## Verificación local

- API con PGlite y sesiones HTTP ficticias. Comprueba publicación transaccional, asignaciones ajenas rechazadas, versión fija, validación de respuestas y competencia entre dos envíos.
- PostgreSQL 17 con el rol HTTP. Comprueba lectura de versión por asignación, identidad sin asignación, aislamiento entre grupos, privacidad de borrador, expiración y protección del envío final. Incluye la prueba anterior de versiones porque cambió su RLS.
- Validación unitaria de los diez tipos de respuesta y compilación de las dos entradas Vite.
