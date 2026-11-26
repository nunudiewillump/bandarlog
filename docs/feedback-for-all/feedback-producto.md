# Feedback espontáneo de Bandarlog

Con `PRODUCT_FEEDBACK_ENABLED=true`, **Mi perfil → Ayúdanos a mejorar** permite comunicar errores, proponer mejoras, pedir ayuda o enviar un comentario. El formulario envía el tipo, el texto y el correo de contacto solo cuando la persona lo escribe. La bandeja no guarda IDs de usuario ni grupo ni adjunta diagnósticos. La ruta exige sesión y CSRF y aplica cinco intentos por hora por cuenta.

**Plataforma → Feedback** ofrece una bandeja paginada con filtro de estado. Los cambios de estado exigen sesión administrativa y CSRF y usan una revisión para evitar sobrescribir cambios recientes. La auditoría registra el ID de la aportación y el administrador que cambió su estado. El equipo puede usar el correo proporcionado para contactar a la persona por el canal habitual.

La migración 0049 crea la tabla interna y tres capacidades SQL separadas. Los roles de aplicaciones de grupo pueden enviar con un contexto válido. El servicio de identidad puede listar y actualizar previa validación de la sesión administrativa. Ambos carecen de acceso directo a la tabla. Aplicar la migración antes de activar el flag en HTTP e identidad. Desactivar el flag conserva las aportaciones y retira ambas superficies.

Quedan pendientes las campañas automáticas, los correos de seguimiento y las métricas de Product Insights asociadas a las campañas.
