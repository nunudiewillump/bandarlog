# Handoff canónico · Forest Experience

Estado: preparado para revisión; **pendiente de aprobación visual de la propuesta Codex refinada**. No crea un segundo encargo ni autoriza desplegar. La autorización original para implementar se ejecutará después de cumplir el flujo de diseño elegido por el usuario.

## Diseño y recursos seleccionables

El ámbito de refinamiento elegido es `platform`: Codex. Mantener la dirección A, la marca y paleta bloqueadas, el contrato de `README.md`, los estados F01–F27 y el lote de `refinamiento-codex.md`. Los archivos de Stitch se conservan como evidencia de la comparación fallida; no se importan a la aplicación ni se mezclan sus fuentes, estilos o recursos.

La propuesta no sustituye a componentes semánticos: una captura demuestra composición, nunca una implementación de controles. La fuente de recursos sigue siendo el catálogo y los originales en `public/`. El manifiesto Codex identifica las referencias exactas para verificar su uso posterior. Si una pareja tiene un problema de recorte en la fuente, tratarla como un caso concreto y conservar su ID.

## Mapa de implementación

| Superficie | Punto actual y cambio acotado | Evidencia de aceptación |
| --- | --- | --- |
| Copa y navegación | `src/main.tsx`, `src/styles.css`; extraer componentes compartidos pequeños si aclara el código, con estilos móviles acotados y área segura. Conservar flujos y acciones existentes. | Cabecera y cuatro destinos coinciden con la propuesta aprobada, accesibles durante scroll, sin ocultar foco ni última fila. |
| Inicio/listas/contexto | `src/MobileUX.tsx`, `src/focus.ts`; actualizar presentación, conservar prioridad personal→comisión→campamento→al día, permisos y hasta tres destacadas. | Fixture aislado de 1/5/10 comisiones, 74 tareas y cero ampliación de acceso. |
| Completar/Deshacer | `src/AnimatedCounter.tsx` y lógica de tareas de `src/main.tsx`; conservar bloqueo por tarea, control de versión, scroll, Deshacer y satisfacción final. | Pruebas de concurrencia, fallo de guardado, última tarea, restauración y movimiento reducido. |
| Comisiones/proyectos/personas | Componentes actuales de `src/main.tsx`; presentación compacta, iconos reales, contexto de invitación fijado, gestión solo por permiso. | Scouter consulta; Responsable gestiona su comisión; coordinación/administración mantienen sus capacidades existentes. |
| Fotos/onboarding | Reutilizar `src/PhotoEditor.tsx`, `src/ProfileForm.tsx`, `server/photos.ts`; formulario inicial breve y endpoint transaccional con marca servidor. | Nombre obligatorio, foto opcional, cancelación sin pérdida de nombre, compresión y retorno sin repetir onboarding. |
| Persistencia del primer acceso | `server/schema.ts` y migración compatible; `onboarding_completed_at` para nuevos usuarios, usuarios anteriores marcados configurados. | Migración en base existente y nueva; no altera invitaciones ni pertenencias. |
| Código dentro de PWA | `server/index.ts`, `server/schema.ts`, cola de correo actual y pantalla de entrada. Nuevo desafío con HMAC, expiración/consumo/intentos y límites persistentes. | Código válido, erróneo, agotado, reenviado, caducado y dos consumos concurrentes; cuenta ajena o invitación revocada no obtiene acceso. |
| Google opcional | OIDC backend, callback exacto, state/nonce/PKCE y verificación de token. Identidad por sub, asociación segura; credenciales separadas de Gmail. | Tests de firma, audiencia, emisor, expiración, nonce/state y asociación de correo no autoritativo. Credenciales reales y dispositivos se prueban aparte. |
| Sesión | Middleware actual y tabla `sessions`; inactividad/límite absoluto, renovación controlada, cookie segura, hash y CSRF existentes. | Reapertura, renovación, concurrencia, expiración absoluta, cambio de identidad y revocación al cerrar sesión. No almacenar tokens en localStorage. |
| Red y recuperación | `src/api.ts` y `bootup`; distinguir 401 de red/servidor y preservar contexto de navegación seguro. | Fallo de red ofrece reintentar sin simular cierre de sesión ni afirmar guardado incierto. |
| Monos sin fragmentos | `src/Artwork.tsx`, catálogo y herramientas de exportación; assets individuales transparentes, resolución compatible de rutas #tile históricas. | Las 338 parejas mantienen sus IDs; inspección de bordes/casos detectados y cajas de proporciones distintas. |
| Desktop | Mantener composición operativa actual; adaptar solo superficies nuevas compartidas de acceso/onboarding. | Comparación conjunta tablet/desktop antes/después y batería de regresión actual. |

## Secuencia autorizable después de aprobar el diseño

1. Integrar recursos seleccionados y presentación móvil compartida, sin cambiar permisos ni tareas.
2. Incorporar migraciones compatibles, onboarding, desafíos por código y política de sesión. Mantener enlaces e invitaciones existentes.
3. Preparar Google con configuración opcional; la app no muestra el botón sin configuración válida. No reutilizar `GMAIL_*`, no solicitar acceso a mensajes ni alterar variables de Railway.
4. Ejecutar pruebas actuales y cobertura adicional pertinente. Inspeccionar en una ronda conjunta móvil, landscape, tablet y desktop; corregir defectos detectados en un lote.
5. Verificar fidelidad de recursos en fuente y en render, y registrar límites de navegador/dispositivo. Entregar PR revisable; despliegue requiere autorización separada.

## Configuración externa futura

Propuesta de variables privadas de aplicación: `AUTH_CHALLENGE_SECRET`, `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET`. Callback de Google: `${APP_URL}/api/auth/google/callback`, registrado exactamente para un cliente web separado del usado para enviar Gmail. No inventar valores ni cambiar configuración real durante esta fase.

`STITCH_API_KEY` pertenece exclusivamente a la herramienta de diseño del entorno: no debe incorporarse al frontend, backend de Bandarlog, correos, Railway o repositorio.

## Criterio de cierre

Implementación completa significa coincidencia con la propuesta visual aprobada, controles reales y autorizados, estados conectados, pruebas pertinentes en verde y límites externos explícitos. Una lámina, un build correcto o una configuración declarada no demuestran Google operativo, persistencia de sesión en PWA ni accesibilidad en dispositivos físicos.
