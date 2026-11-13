# Segunda iteración de consumo Neon · 13 de noviembre de 2026

## Estado y alcance

Implementación en `perf/neon-iteration-two`, desde main `cb8626170ffa0a349feee899f42bd82c95af4a72`. Código medido: `728caba`; después se añadió la conservación del descarte de conexiones fallidas del pool, validada con callbacks y PostgreSQL real, sin alterar el camino de consultas correctas. Cambios revisables y probados localmente; **no desplegados**, ni integrados en main para evitar activar el despliegue automático. Se agrupan en una PR porque autenticación, difusión y planificadores comparten `server/index.ts` y conviene revisar sus interacciones. Sin dependencias nuevas, migraciones, restauraciones ni modificaciones de infraestructura productiva.

Contraste de solo lectura del 13/11:

- Railway confirma ese SHA desplegado, deployment `fe1574da-f632-4088-b857-de8ee821bb6c`, SUCCESS, una réplica online y sin incidencias. Existe un patch anterior sin cambios, ajeno a este trabajo; no se aplica.
- Neon Launch: endpoint `ep-old-silence-baklexzb`, rama `br-dark-breeze-ba7n1frc`, mínimo 0,25 CU, máximo 1, suspensión a los 300 s. Plano de control: idle, última suspensión 13/11 a las 10:59:47 Madrid. No se consultó SQL productivo ni `/api/health` para observarlo.
- Historial **24 horas** y snapshots diarios a las 03:00 UTC, retención **7 días**, releídos y preservados. Las referencias anteriores a seis horas son históricas y están superadas.
- OAuth de Railway solo devuelve nombres: existen `DATABASE_URL` y `SSE_RECONCILE_SECONDS`, pero no permite verificar sus valores. El 0 de SSE está documentado por la PR #35; el pooling efectivo sigue pendiente de comprobar en el entorno, sin publicar credenciales. `pooler_enabled` no permite inferir qué hostname usa la aplicación.

## Propuestas atendidas

| Propuesta                            | Resultado                                                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medición por operación               | Inicio antes del resolvedor de grupo; contador Drizzle y contador real del driver; separación de contexto/transacción, lecturas y escrituras; tiempo DB, espera de pool, bytes escalares estimados y bytes HTTP separados.                                                        |
| Distribución de latencia             | Histograma fijo de todas las observaciones, sin sesgo hacia las primeras 256. p50/p95 como límites superiores de intervalo, con overflow explícito.                                                                                                                               |
| Trabajos anidados                    | SQL de cada ámbito se atribuye solo a ese ámbito. Duración inclusiva y exclusiva separadas; el solapamiento de hijos se descuenta como unión temporal. No sumar duraciones inclusivas como CPU.                                                                                   |
| Destinatarios                        | Proyección de ID, nombre, correo, baja y preferencias; no viajan fotos. Metadatos de proyecto/comisión limitados. Recordatorios reutilizan destinatarios, asignaciones y metadatos de su operación, sin caché de permisos entre solicitudes.                                      |
| Autenticación                        | JOIN sesión–usuario acotado, conservando caducidad absoluta/renovación, baja, CSRF, origen, roles y RLS. Foto solo en `/me`.                                                                                                                                                      |
| Arranque/SSE/mutaciones              | Revisiones por grupo y coordinador único de snapshots. `ready` compatible con el snapshot evita otra descarga; un cambio intermedio obliga a reconciliar. Señales durante una lectura no se pierden. BroadcastChannel puede compartir la revisión ya aplicada.                    |
| Límites de sincronización            | Revisiones en memoria acotadas a 512 grupos; al reiniciar/expulsar cambia el epoch y se reconcilia. Son pistas de frescura, nunca permisos, ETag ni versión durable. Se conserva fallback de 15 s, foco, visibilidad, offline y reconciliación para réplicas/escritores externos. |
| Planificador push                    | Próximo plazo según dispositivo nuevo, `next_attempt_at`, expiración de lease y suscripciones actuales. Elegibilidad y orden estable antes de LIMIT: 100 trabajos aplazados no ocultan uno ejecutable. Sin polling de un minuto para un reintento de una hora.                    |
| Recordatorios                        | Mutaciones invalidan solo su grupo. Inicio y cambio de fecha Madrid mantienen recorrido global; cada grupo programa sus vencimientos. Cálculos simultáneos comparten la promesa y su siguiente plazo.                                                                             |
| Recuperación y entrega               | Conservados barrido horario, despertar inmediato, reclamación atómica, reintentos parciales, 404/410, deduplicación y límites de entrega incierta. Sin promesa de exactamente una entrega.                                                                                        |
| Catálogo, agregados, paginación      | Se conserva lo ya optimizado; no se añade otra caché ni se truncan tareas, búsquedas, contadores, historial u offline.                                                                                                                                                            |
| Índices, infraestructura y proveedor | No hay evidencia que justifique índices nuevos, bajar capacidad productiva, migrar o volver a Free. Propuesta opcional para futuras ramas más abajo.                                                                                                                              |

La telemetría usa el flag existente `CONSUMPTION_METRICS`. Memoria limitada a 129 operaciones y 15 intervalos por operación; salida agregada en los logs existentes. No retiene SQL, parámetros, correos, grupos, usuarios, sesiones ni cuerpos. `dbValueBytesEstimate` suma una vez los valores escalares del resultado, sin serializar objetos completos; omite objetos JSON y framing PostgreSQL/TLS. **No es egress facturable.** `dbMs` incluye red y servidor, no CPU exclusiva. El wrapper cuenta sentencias enviadas al driver, no las internas de triggers. Los histogramas por minuto no deben promediarse para obtener un p95 global.

## Comparación controlada

PostgreSQL **18** local en Docker; dos bases clonadas de la misma plantilla sintética, base y candidato, sin actividad de navegador simultánea. Node 24, mismas dependencias y configuración, métricas activadas en ambos. Observador independiente a nivel de `pg.Client.query`, idéntico para ambas versiones, cuenta también RLS y transacciones.

Diez grupos, 17 usuarios por grupo con fotos sintéticas de 12.000 caracteres, tres tareas/grupo, tres responsables/tarea, 125 entradas de actividad en el primero. Proveedores preview, ninguna suscripción real ni destinatario real. Diez lecturas iniciales, 100 lecturas calientes secuenciales repartidas por grupo, diez simultáneas y 100 ediciones de título. Sin reiniciar ni despertar producción para fabricar muestras.

| Indicador local                               |        Base |   Candidato |
| --------------------------------------------- | ----------: | ----------: |
| /data: peticiones calientes                   |         100 |         100 |
| /data: SQL funcional / driver total           | 1400 / 2600 | 1300 / 2100 |
| /data: valores escalares estimados DB (B)     |   1.133.840 |   1.130.240 |
| /data: cuerpos HTTP (B)                       |  22.063.660 |  22.063.660 |
| Ediciones: peticiones                         |         100 |         100 |
| Ediciones: SQL funcional / driver total       | 2800 / 7200 | 2700 / 6700 |
| Ediciones: valores escalares estimados DB (B) |   3.959.705 |     315.252 |
| Ediciones: cuerpos HTTP (B)                   |      41.882 |      41.896 |
| Errores HTTP                                  |           0 |           0 |

Los cuerpos HTTP de `/data` se conservan: las fotos siguen disponibles al navegador; el ahorro de destinatarios ocurre entre PostgreSQL y el servidor. La caída de SQL total en lecturas es **19,23 %**; los valores escalares estimados de las 100 ediciones bajan alrededor del **92 %**. Estos porcentajes pertenecen al escenario sintético, no a una factura Neon.

### Rapidez y frescura

| Escenario · ms        | p50 base → candidato | p95 base → candidato |
| --------------------- | -------------------: | -------------------: |
| Caché de proceso fría |        24.78 → 24.53 |        52.54 → 48.64 |
| /data caliente        |        14.63 → 14.54 |        21.74 → 22.64 |
| 10 grupos simultáneos |      101.60 → 115.17 |      149.50 → 132.33 |
| Edición de tarea      |        21.72 → 22.09 |        27.73 → 31.38 |

La repetición anterior, también con 100 lecturas/100 ediciones, dio p95 caliente 23,28 → 20,68 ms y p95 de edición 29,72 → 28,00 ms. En la última, edición varió en sentido contrario. Las muestras cortas y el entorno compartido producen variación; no se declara una mejora general de rapidez ni una regresión reproducible a partir de diferencias de pocos milisegundos. El escenario concurrente y el de caché fría tienen diez muestras: su p95 es el máximo observado. Caché fría significa primera lectura del proceso, **no reanudación de Neon**; esa medición queda pendiente en un entorno de prueba adecuado. Resultados de las rondas dedicadas en [el registro JSON](neon-iteration-20261113.json).

La apertura sin cambios descargó un solo snapshot. Una mutación entre snapshot y suscripción provocó exactamente una reconciliación adicional y apareció en la UI. La sincronización entre ventanas se comprobó con un máximo de 5 s en el test existente; no se impone ese retraso al producto. Durante diez minutos simulados con SSE sano hubo cero lecturas periódicas, y se verificaron fallback y pausa en segundo plano. No existe aún un percentil de antigüedad de datos sobre tráfico real.

## Consumo de producción: referencia, no ahorro de esta PR

API de control consultada otra vez, horas completas del 12/11 17:00 al 13/11 10:00 Madrid: **4.319 CU-s = 1,1997 CU-h**, **6.603.822 bytes públicos** en el proyecto. A 0,106 USD/CU-h son **0,1272 USD de compute**. Es la referencia previa a publicar esta iteración, e incluye ramas; no se atribuye exclusivamente a producción ni al candidato.

| Indicador productivo                   | Antes de esta PR                                            | Después                                                        |
| -------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| CU-h / egress facturable               | Referencia de 17 h anterior                                 | Pendiente de publicación y ventana equivalente                 |
| Errores y latencia real, caliente/fría | Logs previos limitados; no percentiles globales comparables | Pendiente                                                      |
| Antigüedad de datos                    | Sin histograma de tráfico real                              | Validación de carreras en pruebas; distribución real pendiente |
| Protección                             | Snapshots 7 días; historial 24 h                            | Preservada, sin cambios                                        |

Aún no han transcurrido siete días representativos posteriores al despliegue de estos cambios. No se extrapola a una factura mensual. Reutilizar el monitor existente cada cuatro horas, sin otra automatización, y observar consumo/estado mediante plano de control. Almacenamiento, historial, snapshots, impuestos y Railway son partidas distintas; la factura de Railway no está disponible en el conector. Los modelos 19,08 USD continuos y 1,59 USD de reposo ideal siguen siendo ejemplos de compute, no predicciones ni ahorro observado.

## Validación ejecutada

- 46 pruebas dirigidas de API, grupos, acceso cliente, preferencias, entregas y Resend: aprobadas. Tras compartir el cálculo de recordatorios y tipar su contexto, se repitieron los 29 casos de API afectados: aprobados.
- 19 casos dirigidos de métricas, coordinación de snapshots, planificación, seguridad de autenticación y offline: aprobados, incluyendo SQL de elegibilidad push sobre PostgreSQL 18 real.
- Dos pruebas PostgreSQL reales: diez grupos concurrentes, lectura/escritura ajena rechazada, mismo correo, rollback, rol local, devolución de conexiones, renovación de sesión y rutas públicas. Se actualizó la expectativa de acceso canónico ya introducida por PR #33; no cambió ese comportamiento.
- Once recorridos de navegador en base limpia: inicio sin duplicados, carrera de arranque, eventos, fallback, dos ventanas, cola offline/idempotencia, sesión expirada, conflicto de versión, tareas y scroll. Cuatro recorridos de roles también aprobados.
- Build/typecheck y `git diff --check`: aprobados. CI obligatoria se conserva; su resultado se referencia en la PR.

La cobertura se amplió por tocar autenticación compartida, el driver, sincronización y entregas. No se ejecutó toda la suite local rutinariamente. La primera ejecución conjunta de navegador quedó contaminada por el cambio de nombre de una prueba: se corrigió para restaurarlo y se repitió sobre una base limpia; no se cuentan esos fallos como validación aprobada.

## Reproducción local

Crear una base **vacía y exclusivamente sintética** llamada `bandarlog_benchmark` en PostgreSQL local. Debe poder crear clones `bandarlog_benchmark_before` y `bandarlog_benchmark_after`; el script falla si ya existen y no elimina bases automáticamente. Nunca admite un hostname remoto.

```sh
TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55438/bandarlog_benchmark \
  node --import tsx scripts/benchmark-neon.ts /ruta/base /ruta/candidato
```

La base debe tener permisos locales para aplicar las migraciones y crear clones. El script levanta únicamente procesos HTTP locales en 3138, usa preview y termina ambos procesos. `BENCH_REVERSE=1` invierte el orden; `BENCHMARK_DIR` cambia el directorio de resultados. No compara cuotas ni CU-h de un PostgreSQL local con Neon. Las pruebas dirigidas usan `TEST_POSTGRES_URL` con el mismo requisito de localhost, en otra base de test.

## Propuesta separada para QA/previews · sin aplicar

Los defaults del proyecto siguen en 0,25–8 CU; no son el límite productivo. Para futuras ramas temporales, proponer 0,25 CU, máximo 0,25 para QA ligera o 1 para previews con carga justificada, suspensión a 300 s y TTL de 24–72 h. Preferir esquema y datos sintéticos. Poner IDs de proyecto/rama y límites explícitos al provisionarlas; comprobar que no es la rama default/productiva. Sin crear servicios pagados ni instalar IaC/dependencias en esta iteración. No modificar defaults globales ni borrar ramas antiguas sin comprobar necesidad/caducidad. No hay ahorro productivo medido atribuible a esta propuesta.

## Publicación y rollback

1. Revisar PR y CI. Mantener main y producción en su estado actual hasta autorizar la publicación. Confirmar una réplica, `SSE_RECONCILE_SECONDS` efectivo y conexión pooled con TLS mostrando únicamente indicadores seguros, nunca la URL/credenciales.
2. Publicar el commit aprobado mediante el flujo habitual de Railway y observar SUCCESS. No restaurar snapshots ni modificar endpoint para publicar.
3. Comprobar funcionalidad con QA aislado autorizado y medir ventanas completas con uso comparable. Observar el reposo por control API, no con consultas SQL periódicas. Recoger siete días representativos antes de concluir coste mensual.
4. Si se añaden réplicas sin bus de eventos, restablecer reconciliación a 120 s antes de escalar. Los clientes antiguos siguen siendo compatibles; si faltan revisiones se usa actualización conservadora.
5. Rollback: desplegar el commit base `cb86261` (o el último compatible aprobado), conservando datos nuevos. Sin cambios de esquema en esta PR, no hay migración inversa. Las revisiones son efímeras y se reconcilian tras reiniciar. No restaurar producción ni borrar outboxes, historial o fotos.
