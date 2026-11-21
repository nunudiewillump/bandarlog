# Controles y navegación Forest

Refinamiento posterior a P0, sobre `1aad9fe` (PR 52). El usuario pidió tirador circular, formas redondeadas y gradiente suave integrado en Forest, sin monos ni bananas en los controles. Solicitó también cuatro destinos con separación uniforme, footer fijo y retirar el botón redundante de todas las tareas de Inicio.

## Implementación

- Reutiliza `HomeTaskAction`: cápsula redondeada, tirador circular de 44 px e icono Lucide. El gradiente verde translúcido se revela mediante la distancia de arrastre existente, sin animaciones continuas ni escrituras durante el gesto. El texto reserva espacio al tirador en el extremo derecho. La alternativa accesible y Finalizar comparten la forma redondeada. Se conserva Poppins/Bungee.
- La práctica del tutorial recibe el mismo diseño automáticamente. Umbral del 83 %, cancelación, confirmación, permisos, cola, versiones, Deshacer y háptica permanecen en la implementación existente.
- `project-experience.css` sobrescribía la barra con **cinco columnas**, incluso después de retirar Perfil. Se elimina esa definición y sus ajustes de texto para cinco destinos: Forest es ahora la autoridad de las cuatro columnas iguales.
- Navegación con indicador activo claro y redondeado, etiquetas de 12 px, `aria-current`, safe areas y el anclaje `fixed` al viewport. Se conserva el scroll de documento y se da a la barra una capa de composición propia para favorecer su estabilidad durante el desplazamiento. No se añaden listeners, temporizadores o dependencias.
- Se retira el botón de todas las tareas/historial en Inicio móvil y el enlace equivalente de tareas propias en escritorio. Mis tareas sigue accesible en la navegación. Se conserva el acceso contextual a las comisiones cuando Smart Focus muestra trabajo del equipo.

## Verificación

`npm run build`: TypeScript y ambos builds Vite correctos.

```sh
E2E_DATA_DIR=.data/forest-polish-clean npx playwright test \
  tests/browser/home-quick-actions.spec.ts tests/browser/tutorial.spec.ts \
  tests/browser/forest.spec.ts tests/browser/typography.spec.ts \
  tests/browser/mobile-v2.spec.ts --grep-invert 'mobile screen review'
```

**61/61 aprobadas.** Se amplió desde Inicio a tutorial, navegación y tipografía por el componente compartido y los cambios en el footer. No se ejecutó toda la suite local; se excluyeron seis recorridos extensos de capturas de pantallas ajenas. Los checks obligatorios de CI se mantienen intactos.

La prueba nueva verifica anchos y centros equidistantes a 320/375/390/430 px, ausencia del botón retirado, estado accesible actual, scroll real de documento con la barra inmóvil y su anclaje al redimensionar a horizontal. Se mantienen las pruebas existentes de scroll táctil, teclado, movimiento reducido, texto ampliado, cola, errores y conflictos. Las capturas adicionales a 320 px usan el mismo fixture de la prueba visual; no se cuentan como otro caso funcional distinto.

Una primera ejecución encontró progreso de tutorial ya completado en la base local de otra sesión. Se verificó su estado y se repitió la cobertura con una base PGlite nueva y aislada, sin modificar datos productivos ni alterar el comportamiento del tutorial.

Impeccable: inspección conjunta móvil/escritorio y una pasada regex, cero antipatrones detectados. Los avisos de radio `999px` son intencionales por la forma solicitada; no se han reparado advertencias históricas ajenas ni alterado el sistema global. La pasada no evalúa una página parseada ni certifica accesibilidad completa.

Capturas con datos ficticios en `captures/`. El footer queda comprobado en Chromium/emulación, no en un iPhone/Android físico. No se declara comprobado el rebote o teclado de cada versión de Safari. La navegación lateral de escritorio conserva su diseño. No hay cambios de API, base de datos, secretos, recursos productivos o despliegues. La nueva PR requiere aprobación antes de fusionar.
