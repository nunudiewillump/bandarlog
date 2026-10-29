# Codex · Finalizar Forest Experience móvil (Bandarlog)

## Meta y alcance
Actúa como agente de implementación, NO solo como auditor. Repositorio `nunudiewillump/bandarlog`. Inspecciona el `main` actual, el historial y PR #9 («Forest Experience móvil, acceso dentro de la PWA e identidad 2D»). No rehagas funcionalidades ya terminadas. Esta ejecución ocurre en una copia aislada en CI: deja cambios de código concretos para revisión mediante PR, no despliegues ni alteres infraestructura.

## Jerarquía de trabajo (en este orden)
1. **Finalizar todas las pantallas móviles del diseño Forest Experience**: inicio, mis tareas, detalle/edición, comisiones, Ronda Solar, Campamento, coordinación según rol, perfil, login, onboarding, diálogos, estados de carga, vacíos y errores. No basta con la cabecera.
2. **Identidad y navegación**: copa de árbol verde bosque integrada con logo crema y avatar a la derecha, colores `#124D38` y `#103B2D`, fondo `#FAF8F2`, Nunito Sans, recursos 2D naturales; sin exceso de tarjetas SaaS, contenedores innecesarios ni slogans repetitivos. Navegación inferior Inicio / Mis tareas / Comisiones / Perfil y safe areas iOS.
3. **Keep It Accessible / Always Something / Smart Focus**: en Inicio primero tareas abiertas asignadas al usuario (máximo tres protagonistas), luego progreso informativo de sus comisiones, luego estado global autorizado si procede. Nunca presentar tareas ajenas como asignaciones propias. Proyectos Ronda Solar (calendario/verde) y Campamento (tienda/arena) distinguibles sin filtros obligatorios.
4. **Feedback de tareas**: completar tareas propias con acción rápida, Deshacer accesible, contadores que descienden suavemente mientras avanzan los completados, microtransiciones de aprox. 250–400 ms; respetar `prefers-reduced-motion`. Si la última tarea propia se completa, mantener la confirmación positiva durante 2–3 s antes de enseñar el contexto informativo del equipo.
5. **Onboarding y sesión PWA**: nombre obligatorio, foto opcional (reutilizar editor existente), persistencia para no repetir onboarding; revisar login dentro de PWA y manejo de sesiones sin reducir seguridad. No bloquear trabajo visual por OAuth o secretos externos no disponibles.
6. **Ilustraciones**: evitar monos parcialmente cortados o de otros fotogramas por tamaños de pantalla; reutilizar assets individuales o recortes estables proporcionales.
7. **Responsive y accesibilidad**: revisar al menos 320, 375, 390 y 430 px; tamaños táctiles, contraste, tabulación, lectores de pantalla, estados de foco y safe areas; desktop debe seguir funcional.
8. **Solo si el diseño está resuelto**: página `/instalar` para compartir por WhatsApp con instrucción iOS y botón de instalación Android cuando el navegador lo permita.

## Calidad y límites
- Respeta API existente, flujo de roles (Scouter, Responsable, Coordinación, Administración), datos, auditoría, seguridad y permisos de backend. No añadir chat ni funciones de «pedir ayuda».
- Prueba con varias comisiones de Ronda Solar y Campamento y tareas propias/ajenas; no llenes Inicio de detalles redundantes.
- Implementa y ejecuta las pruebas que razonablemente soporta el proyecto; el workflow ejecuta `npm test` y `npm run build` después de tu trabajo. Puedes crear tests proporcionados a cambios relevantes, pero evita baterías repetitivas o pruebas ficticias.
- No tocar `.github/workflows`, credenciales, variables `.env`, infraestructura, Neon, Railway, datos reales o servicios externos. No desplegar, hacer merge ni crear commits desde el trabajo de Codex: la segunda fase del workflow prepara rama y PR.
- Usa la ventana disponible para generar cambios reales. Si no puedes completar todos los frentes, prioriza un conjunto coherente y documenta pendientes exactos.
- No afirmes haber probado dispositivos reales si solo hay pruebas automatizadas.

## Respuesta final
Enumera pantallas y comportamientos realmente modificados, pruebas realizadas o pendientes, riesgos y asuntos abiertos. Redacta un resumen conciso, sin información sensible.
