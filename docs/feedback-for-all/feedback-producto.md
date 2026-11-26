# Feedback espontáneo de Bandarlog

Con `PRODUCT_FEEDBACK_ENABLED=true`, **Mi perfil → Ayúdanos a mejorar** permite comunicar errores, proponer mejoras, pedir ayuda o enviar un comentario. El formulario envía el tipo, el texto y el correo de contacto solo cuando la persona lo escribe. La bandeja no guarda IDs de usuario ni grupo ni adjunta diagnósticos. La ruta exige sesión y CSRF y aplica cinco intentos por hora por cuenta.

**Plataforma → Feedback** ofrece una bandeja paginada con filtro de estado. Los cambios de estado exigen sesión administrativa y CSRF y usan una revisión para evitar sobrescribir cambios recientes. La auditoría registra el ID de la aportación y el administrador que cambió su estado. El equipo puede usar el correo proporcionado para contactar a la persona por el canal habitual.

La migración 0049 crea la tabla interna y tres capacidades SQL separadas. Los roles de aplicaciones de grupo pueden enviar con un contexto válido. El servicio de identidad puede listar y actualizar previa validación de la sesión administrativa. Ambos carecen de acceso directo a la tabla. Aplicar la migración antes de activar el flag en HTTP e identidad. Desactivar el flag conserva las aportaciones y retira ambas superficies.

Con la migración 0050, **Product Insights** muestra el recuento diario real de aportaciones de los últimos 7 o 30 días, desglosado por categoría. Pendientes incluye los estados Nueva, En revisión y En proceso. Estas cifras proceden de la bandeja voluntaria y requieren sesión de administración de plataforma.

## Encuestas de producto

La migración 0051 incorpora campañas voluntarias en Inicio con `PRODUCT_CAMPAIGNS_ENABLED=true` en HTTP, identidad y entrega. Usa la fecha de alta del grupo como fecha de activación. F01 abre los días 7–20 para Coordinación y Administración. F02 abre los días 30–50. F03 abre durante 21 días a partir del día 60 y de cada múltiplo de 60 días. Se registra la invitación cuando la persona abre Inicio dentro de su ventana. Las ventanas vencidas no se recuperan y nunca se ofrecen dos campañas a la vez.

Se puede posponer 72 horas o descartar. El servicio de entrega encola como máximo un correo tras 72 horas, si quedan más de 24 horas de plazo, y vuelve a comprobar estado y preferencias antes de enviar. La administración de plataforma puede pausar o reanudar las tres campañas predefinidas. F01 puede crear una solicitud de ayuda con un correo aportado de forma expresa.

Product Insights calcula la tasa como encuestas completadas entre invitaciones emitidas en el periodo. Las puntuaciones usan respuestas del periodo y se muestran desde cinco respuestas válidas por campaña y versión. SUS va de 0 a 100 y NPS de −100 a +100. La satisfacción usa la escala de 1 a 5 de F03. El calendario y las preguntas se versionan en el código. Las tres campañas predefinidas no tienen editor de plantillas, segmentación ni exportación.

F02 reproduce las preguntas de la versión española validada por Sevilla-Gonzalez et al., 2020, [anexo 2](https://humanfactors.jmir.org/2020/4/e21161/#app2), bajo licencia CC BY 4.0.

### Campañas personalizadas y evolución

La migración 0052 amplía Product Insights. Desde **Gestionar campañas**, administración de plataforma puede definir título, fechas de Madrid, audiencia y hasta doce preguntas de escala 1–5. El editor permite previsualizar, publicar una versión, consultar versiones anteriores, pausar o reanudar y descargar los agregados autorizados de cada versión en CSV. Las preguntas de F01–F03 se mantienen estandarizadas. Un cuestionario publicado se aplica solo a invitaciones nuevas; quienes ya recibieron una invitación conservan su versión. Las campañas personalizadas aparecen en Inicio cuando hay una ventana abierta y la persona es elegible.

**Evolución y segmentos** muestra las doce últimas semanas completas por semana de invitación, rol, trimestre de activación o estado de configuración del perfil, utilizado como indicador de adopción. Solo se publican filas que superan los umbrales de respuestas y grupos tanto de completadas como del resto. Las puntuaciones de segmentos exigen diez respuestas y NPS también protege los tamaños de sus categorías. Los segmentos se capturan al invitar. Las invitaciones anteriores a la 0052 siguen en los totales y no se les atribuyen segmentos retrospectivamente.
