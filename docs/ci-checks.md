# Comprobaciones por cambio

El workflow conserva los eventos de PR, push a main y ejecución manual. El check obligatorio sigue llamándose **checks**; no se modifican las protecciones del repositorio ni la configuración de Railway.

## En un PR

El plan compara la base del PR con el contenido integrado que GitHub entrega al checkout. Las rutas renombradas se consideran como eliminación y alta para incluir ambos ámbitos. El resumen de Actions enumera las suites elegidas y el motivo de cualquier ampliación.

- Se ejecutan las pruebas de las áreas afectadas según el mapa conservador de scripts/ci-scope.ts. Una prueba modificada se ejecuta directamente.
- Los cambios de estructura o estilos globales cubren todos los recorridos de navegador, sin repetir las pruebas de backend.
- Esquema, migraciones, autorización, dependencias, infraestructura de pruebas y rutas nuevas sin mapa activan toda la cobertura. Si desaparece una prueba referenciada por el mapa también se amplía la cobertura.
- Documentación y capturas no activan suites funcionales; las piezas fuente de la animación sí.
- Instalación limpia, tipos y compilación siguen siendo obligatorios en todos los casos. La aplicación se compila una sola vez y los bloques de navegador comparten el resultado.

Cada archivo de Playwright tiene su propio job, con un máximo de cuatro en paralelo. **Re-run failed jobs** repite los jobs fallidos y el check final dependiente, sin repetir los archivos que ya pasaron. Cada job usa su propio runner, base de pruebas y caché de navegador. Solo se guardan capturas nuevas o modificadas, además de errores y trazas; no se duplican las capturas históricas del repositorio.

El check final falla si la preparación o algún bloque necesario falla, se cancela o no entrega un resultado coherente. No se emite evidencia reutilizable antes de superar ese control.

## Al integrar en main

Un PR correcto deja un pequeño artefacto con el hash Git de **todo el árbol de archivos efectivamente comprobado**, el ID de ejecución y la confirmación de que terminó su plan. El hash incluye código, pruebas, recursos, dependencias y workflows; no es solo el SHA del último commit ni una comparación de los nombres de archivo.

Main puede reutilizar ese plan únicamente si:

1. La ejecución pertenece a este repositorio y al workflow principal de PR.
2. GitHub indica que la ejecución terminó correctamente.
3. El artefacto corresponde a esa ejecución y su árbol coincide exactamente con el actual.

En ese caso siguen ejecutándose los tipos y la compilación y se enlaza la ejecución reutilizada, sin repetir sus suites. La evidencia acredita el plan seleccionado para el PR; no afirma que un PR acotado haya ejecutado toda la suite.

Si cambia la integración, faltan permisos de lectura, el artefacto ha caducado, la descarga falla o no hay evidencia válida, main ejecuta toda la cobertura. La búsqueda se limita a las veinte ejecuciones de PR correctas más recientes y los artefactos se conservan treinta días. Una ejecución manual del workflow principal también solicita cobertura completa.

El primer PR que introduce esta infraestructura ejecuta toda la cobertura porque cambia la propia CI. La reutilización en main solo entra en funcionamiento cuando existe evidencia generada por este workflow.

## Rendimiento

La prueba funcional de acceso mantiene retenida la respuesta HTTP y comprueba el botón deshabilitado, la carga visible y la ausencia de un formulario de código prematuro. Después libera la respuesta y comprueba recuperación del código, persistencia y verificación. Esto detecta que la interfaz espere al servidor sin depender del reloj o de la carga del runner.

El objetivo visual sigue siendo **100 ms**. **Actions → Mediciones de rendimiento → Run workflow** lo comprueba explícitamente en móvil y escritorio, guarda las mediciones en ui.json y señala si se supera. El paso de presupuesto es informativo: una fluctuación de un runner compartido no bloquea la publicación. No se aumenta el límite ni se convierten errores funcionales en éxitos de la CI principal.

El mismo workflow guarda tiempos HTTP de la API en api.json. Usa una base PGlite aislada y correos de prueba; no accede a Railway, Neon ni destinatarios reales. No permite afirmar un máximo de 100 ms en producción.

## Mantener el mapa

Al añadir un módulo o una relación entre áreas, revisar su regla y las pruebas correspondientes. Una ruta desconocida activa cobertura completa hasta que exista un mapa revisable. No usar excepciones para silenciar fallos reales. Para añadir una comprobación obligatoria nueva, incluirla en las dependencias del check final antes de emitir evidencia.
