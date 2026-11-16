# Integración del PR36 con main · 16/11/2026

PR36 partía de una versión anterior al aislamiento por credenciales. Se integra main `8eed2c1` resolviendo los conflictos a favor del modelo de seguridad vigente y recuperando las mejoras de consumo. No requiere nuevas migraciones, secretos ni servicios. No se ha modificado producción.

## Invariantes preservadas

- HTTP sigue usando exclusivamente `DATABASE_URL` runtime: sin ownerDb, migrador ni credenciales de mantenimiento. Se conservan las comprobaciones de rol al arrancar, HMAC, contexto transaccional, RLS, descarte de conexiones fallidas y operaciones globales mediante capacidades limitadas.
- El planificador obtiene grupos mediante `platform.jobGroups`; nunca recupera consultas propietarias globales. Los destinatarios y metadatos se reutilizan dentro de una operación y grupo.
- Las migraciones 0019–0021 y las pruebas obligatorias de PostgreSQL de main se conservan. El caso de plazos push también se ejecuta en ese PostgreSQL real; no existe un test opcional que lo omita por falta de URL.
- Se preservan los correos hello/join, guía del primer administrador, resumen semanal, OAuth PWA con prueba/ticket de un uso, CSRF, origen y cabeceras COOP. Las revisiones SSE son pistas de frescura, nunca autorización.
- El ajuste visual posterior al #41 se entrega por separado en #42. Ambas PR parten de la misma versión de main y no modifican los mismos archivos.

## Mejoras recuperadas

JOIN de sesión y usuario; proyecciones sin fotos al preparar avisos; recordatorios por grupo y calendario Madrid; plazos/leases reales por dispositivo push; snapshots coordinados con reconciliación SSE sin perder eventos intermedios; telemetría agregada del driver, contexto, espera del pool y latencias. No se guardan SQL, parámetros, tokens ni datos personales en métricas.

## Medición reproducida frente al main vigente

PostgreSQL **17.12 local desechable**; diez grupos sintéticos, 17 usuarios por grupo, fotos artificiales de 12 kB, tres tareas por grupo y tres responsables por tarea. Baseline: backend main `8eed2c1` en worktree canopy; candidate: esta integración. Dos clones de la misma base. Una ronda en orden baseline/candidate, compartiendo máquina con las comprobaciones de navegador: latencias orientativas, sin atribución causal general. Proveedores de correo de prueba.

| Fase (peticiones) | Sentencias driver | Bytes escalares DB estimados | p50 / p95 ms antes → después | Bytes HTTP |
| --- | --- | --- | --- | --- |
| process-cache-cold (10) | 260 → 210 | 2156726 → 2156086 | 49.0 / 114.7 → 37.2 / 110.4 | 2206422 → 2206422 |
| warm (100) | 2600 → 2100 | 1129860 → 1123460 | 30.2 / 113.0 → 21.2 / 72.4 | 22064220 → 22064220 |
| concurrent (10) | 260 → 210 | 112986 → 112346 | 174.8 / 182.1 → 98.3 / 138.6 | 2206422 → 2206422 |
| mutations (100) | 7200 → 6700 | 3977866 → 330596 | 30.1 / 70.3 → 30.5 / 74.0 | 41887 → 41887 |

`/data` pasa de 26 a 21 sentencias por petición (−19,2 %); las 100 ediciones reducen los bytes escalares estimados aproximadamente un 91,7 %. Los cuerpos HTTP conservan su tamaño. Estos bytes no equivalen a egress facturable. No se ha medido ahorro de factura, CU-h, suspensión ni reanudación de Neon. Resultados completos en [JSON](neon-integration-20261116.json).

El script exige un baseline explícito y una base local vacía `bandarlog_benchmark` en 127.0.0.1. Usa mantenimiento solo para construir fixtures/migrar; los procesos HTTP de ambos candidatos arrancan como `bandarlog_runtime` sin MIGRATION_DATABASE_URL. Contexto generado aleatoriamente para esa base sintética, sin exponer su valor. Crear la base y ejecutar:

```sh
TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55439/bandarlog_benchmark node --import tsx scripts/benchmark-neon.ts /ruta/worktree-main .
```

## Validación ejecutada

- Build y TypeScript aprobados, diff sin errores.
- 69 pruebas Node dirigidas: API, ciclo de cuenta, autenticación Forest, grupos, aislamiento de entregas, Resend, métricas, plazos push, coordinación de snapshots, acceso cliente, IdleJobs y descarte de pool. Sin fallos ni omisiones.
- Tres pruebas obligatorias de PostgreSQL real: diez grupos, concurrencia/rollback/reutilización, privilegios runtime, rutas públicas/heredadas, flujos de alta y autenticación, OAuth delegado y rollback/resume de políticas. Se incorpora el caso de elegibilidad push compartido con PGlite. Sin fallos ni omisiones. Base sintética desechable, fuera de producción.
- Nueve recorridos Chromium: guía del administrador, dos de OAuth PWA/email, dos de SSE/snapshots y cuatro de permisos por rol. Todos aprobados. Se amplía cobertura porque se modifica autenticación compartida, sincronización y planificación.
- La CI de esta cabeza debe completar sus comprobaciones obligatorias; no se reutilizan resultados del commit anterior. No se ejecutó rutinariamente toda la suite local. No se probaron proveedores reales, un iPhone físico ni cargas productivas en esta integración.

## Publicación y rollback

1. Esperar las comprobaciones obligatorias de la nueva cabeza de PR36; los verdes históricos no validan esta integración.
2. Revisar y fusionar por separado #36 y #42. No necesitan orden entre sí. El despliegue automático de Railway se activará al fusionar: no se ha ejecutado aquí.
3. Mantener la identidad runtime, GROUP_CONTEXT_SECRET y migraciones 0019–0021 ya provisionadas. No añadir credenciales administrativas al servicio HTTP ni reintroducir migraciones/seed remotos en su arranque.
4. Comprobar `/api/live`, login en cada grupo, tareas, sincronización/offline, OAuth desde PWA, guía, correo y push. Observar métricas agregadas y latencia sin registrar datos personales. Con múltiples réplicas conservar reconciliación periódica SSE.
5. Si hay regresión, desplegar el último main compatible previo (`8eed2c1`, o el que incorpore #42). No volver a `cb86261`: es anterior a la separación de privilegios. Mantener esquema, datos y credenciales vigentes. Esta PR no añade esquema ni necesita migración inversa. Reiniciar invalida revisiones efímeras y fuerza reconciliación; no borrar outboxes ni restaurar snapshots.

Las pruebas de contexto/rollback y descarte de pool pasaron con PostgreSQL real. No se ha ensayado rollback de un despliegue productivo ni realizado ningún cambio de infraestructura.
