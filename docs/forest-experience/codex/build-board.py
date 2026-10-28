"""Build static design evidence; no application/runtime behavior is implemented."""
from pathlib import Path
import json,shutil,html,hashlib
ROOT=Path(__file__).resolve().parent
icons=json.loads((ROOT/'assets/icons.json').read_text())
def ico(name):return icons[name]
def btn(text,kind='primary',icon=None):return f'<button type="button" class="{kind}">{ico(icon) if icon else ""}{text}</button>'
def field(label,value='',kind='text',error=''):
 name='f'+hashlib.sha1((label+value).encode()).hexdigest()[:10]
 return f'<label for="{name}">{label}</label><input id="{name}" type="{kind}" value="{html.escape(value)}"'+(' aria-invalid="true"' if error else '')+(' required autocomplete="given-name"' if label=='Nombre' else '')+(' inputmode="numeric" autocomplete="one-time-code" maxlength="6"' if label=='Código de acceso' else '')+'>'+ (f'<p class="error">{error}</p>' if error else '')
def context(project='Ronda 26/27',commission='Material',camp=False):return f'<p class="context {"camp" if camp else ""}">{ico("Tent" if camp else "CalendarDays")}<span>{project} · {commission}</span></p>'
def row(title,project='Ronda 26/27',commission='Material',date='30 oct, 18:00',status='Pendiente',camp=False,readonly=False,done=False):
 marker=f'<span class="read-marker" aria-label="{"Terminada" if done else "Solo consulta"}">{ico("Check" if done else "LockKeyhole")}</span>' if readonly or done else f'<button type="button" class="complete" aria-label="Completar {title}"><span></span></button>'
 return f'<div class="task-row {"is-done" if done else ""}">{marker}<button type="button" class="task-body"><strong>{title}</strong>{context(project,commission,camp)}<span class="meta"><span class="{"late" if "Vencida" in status else ""}">{date}</span><span class="status {"late" if "Vencida" in status else ""} {"warn" if status=="Bloqueada" else ""}">{status}</span></span></button></div>'
def tasks(readonly=False):return '<div class="task-list">'+row('Revisar el listado de material',date='Hoy, 18:00',status='Vencida',readonly=readonly)+row('Confirmar el transporte','Verano 2027','Logística','Mañana, 12:00',camp=True,readonly=readonly)+row('Preparar la actividad de grupo','Ronda 26/27','Animación','3 nov, 19:00',readonly=readonly)+'</div>'
def title(text,back=None):return (f'<button type="button" class="back">{ico("ArrowLeft")}{back}</button>' if back else '')+f'<h1>{text}</h1>'
def progress(value):return f'<div class="progress-row"><div class="progress-track"><span style="width:{value}%"></span></div><strong>{value}%</strong></div>'
def success(text='Tus tareas están al día'):return f'<p class="personal-clear">{ico("CircleCheck")}<span>{text}</span></p>'
def metric(value,label):return f'<p class="main-count"><strong>{value}</strong> {label}</p>'
def person(name,role='Scouter',initials='AL'):return f'<div class="person"><span class="person-avatar">{initials}</span><div><strong>{name}</strong><span class="muted">{role}</span></div><button type="button" class="icon-button" aria-label="Ver {name}">{ico("ChevronRight")}</button></div>'
def commission(name,count='3 pendientes',progressval=None):return f'<button type="button" class="commission-row"><span class="commission-icon">{ico("ClipboardCheck")}</span><span><strong>{name}</strong><span class="muted">{count}</span></span>{ico("ChevronRight")}</button>'
def group(text):return f'<h2 class="group-title">{ico("Tent" if "Verano" in text or "Campamento" in text else "CalendarDays")}{text}</h2>'
def comms(count=10):
 names=['Material','Infraestructura','Botiquín','Animación','Electricidad','Cocina','Menú','Logística','Servicios','Staff']
 if count==1:return group('Verano 2027')+commission('Cocina')
 if count==5:return group('Ronda 26/27')+''.join(commission(n) for n in names[:2])+group('Verano 2027')+''.join(commission(n) for n in names[5:8])
 return group('Ronda 26/27')+''.join(commission(n,'Al día' if i==4 else f'{i+1} pendientes') for i,n in enumerate(names[:5]))+group('Verano 2027')+''.join(commission(n,'Al día' if i==3 else f'{i+2} pendientes') for i,n in enumerate(names[5:]))
def nav(active='Inicio'):
 names=[('Inicio','House'),('Mis tareas','ClipboardCheck'),('Comisiones','Users'),('Perfil','UserRound')]
 return '<nav aria-label="Navegación principal">'+''.join(f'<button type="button" class="{"selected" if name==active else ""}"'+(' aria-current="page"' if name==active else '')+f'>{ico(icon)}<span>{name}</span></button>' for name,icon in names)+'</nav>'
def header(avatar=True):
 return '<header class="canopy"><svg class="canopy-depth" viewBox="0 0 390 64" preserveAspectRatio="none" aria-hidden="true"><path fill="#103b2d" d="M0 0H390V18C359 3 331 12 315 0C293 22 268 19 249 5C218 23 184 19 169 0C139 14 115 7 101 0C67 17 31 15 0 5Z" opacity=".28"/></svg><div class="canopy-inner"><button type="button" class="brand" aria-label="Bandarlog, inicio"><img src="../../../../public/brand-mark.webp" alt="" width="34" height="34"><span>Bandarlog</span></button>'+('<button type="button" class="avatar" aria-label="Mi perfil">AL</button>' if avatar else '')+'</div><svg class="canopy-edge" viewBox="0 0 390 16" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H390V3C377 9 364 6 356 9C349 15 328 16 316 11C301 17 278 15 269 8C255 12 241 10 230 6C220 15 199 17 184 11C170 17 149 16 139 8C121 14 104 13 94 7C79 18 54 17 42 10C28 17 11 16 0 10Z"/></svg></header>'

def tabs(labels,selected=None):return '<div class="tabs">'+''.join(f'<button type="button" class="{"active" if l==(selected or labels[0]) else ""}">{l}</button>' for l in labels)+'</div>'
def login(google=False):return title('Entrar en Bandarlog')+'<div class="form-stack">'+(btn('Continuar con Google','secondary')+'<p class="divider-text">o con tu correo</p>' if google else '')+field('Correo electrónico','alex@example.test','email')+btn('Recibir código',icon='Mail')+'<p class="help">Usa el correo de tu invitación.</p></div>'
def code(error=False):return title('Introduce el código','Cambiar correo')+'<p class="muted">Enviado a alex@example.test</p><div class="form-stack code-form">'+field('Código de acceso','' if not error else '123456','text','El código no es correcto. Compruébalo e inténtalo de nuevo.' if error else '')+btn('Entrar')+'<p class="help">El código caduca en 10 minutos.</p>'+btn('Reenviar código','text-button')+'</div>'
def onboarding(photo=False,skipped=False):return title('¿Cómo te llamamos?')+'<div class="form-stack">'+field('Nombre','Alex')+('<div class="profile-identity"><span class="large-avatar">AL</span></div>' if skipped else '<div class="photo-add"><span class="photo-placeholder">'+ico('Camera')+'</span><strong>Foto de perfil</strong><span class="muted">Opcional</span></div>'+btn('Elegir foto','secondary','Image')+btn('Hacer foto','text-button','Camera'))+btn('Continuar')+('' if skipped else btn('Ahora no, sin foto','text-button'))+'</div>'

DATA=json.loads((ROOT/'dataset.json').read_text())
COMM=DATA['commissions']
BYID={c['id']:c for c in COMM}
TASKS=DATA['allTasks']
SNAP=DATA['snapshots']
def custom_select(label,value,options=None,opened=False):
 cid='select-'+hashlib.sha1(label.encode()).hexdigest()[:8]
 result=f'<label id="{cid}-label">{label}</label><button type="button" class="select-trigger" role="combobox" aria-expanded="{str(opened).lower()}" aria-labelledby="{cid}-label">{value}{ico("ChevronDown")}</button>'
 if opened: result+='<div role="listbox" class="select-options">'+''.join(f'<button type="button" role="option" aria-selected="{str(o==value).lower()}" class="{"chosen" if o==value else ""}">{o}{ico("Check") if o==value else ""}</button>' for o in options or [])+'</div>'
 return result

def commission(name,count=None,progressval=None,stage='personal',variant=None):
 c=next(c for c in (DATA['variants'][str(variant)] if variant else SNAP[stage]['commissions']) if c['name']==name)
 st=c['stats'];count=count if count is not None else ('Al día' if not st['open'] else f'{st["open"]} pendientes')
 image='../../../../public/'+c['iconUrl'].lstrip('/')
 return f'<button type="button" class="commission-row"><img class="commission-icon real-icon" src="{image}" alt="" width="40" height="40"><span><strong>{name}</strong><span class="muted">{count}</span></span>{ico("ChevronRight")}</button>'

def comms(count=10):
 selected=COMM if count==10 else DATA['variants'][str(count)]
 out=''
 for pid,label in [('round-v2','Ronda 26/27'),('camp-v2','Verano 2027')]:
  cs=[c for c in selected if c['projectId']==pid]
  if cs:out+=group(label)+''.join(commission(c['name'],variant=count if count!=10 else None) for c in cs)
 return out

def taskrow(t,readonly=False,done=False):
 c=BYID[t['commissionId']];camp=c['projectId']=='camp-v2'
 i=int(t['id'].rsplit('-',1)[1]);dates=['Ayer','Mañana, 18:00','30 oct, 18:00','31 oct, 18:00','1 nov, 18:00','2 nov, 18:00','3 nov, 18:00']
 status='Terminada' if done else 'Vencida' if i==0 else 'Bloqueada' if t['status']=='blocked' else 'Pendiente'
 return row(t['title'],'Verano 2027' if camp else 'Ronda 26/27',c['name'],dates[i] if i<7 else '5 nov, 18:00',status,camp,readonly,done)

def tasks(readonly=False):
 chosen=[TASKS[17],TASKS[7],TASKS[8]] if readonly else [TASKS[0],TASKS[6],TASKS[1]]
 # Team titles are intentionally factual mock labels from the isolated fixture.
 return '<div class="task-list">'+''.join(taskrow(t,readonly) for t in chosen)+'</div>'

scenes=[]
def scene(id,label,body,active='Inicio',auth=False,note='',extra=''):
 scenes.append(dict(id=id,label=label,body=body,active=active,auth=auth,note=note,extra=extra))
scene('F01','Acceso · Google configurado',login(True),auth=True,note='Variante con Google configurado; datos sintéticos.')
scene('F02','Código dentro de la PWA',code(),auth=True)
scene('F03','Aceptar invitación',title('Te han invitado a Bandarlog')+'<p class="lead">Verano 2027</p><div class="invitation-context">'+ico('Users')+'<div><strong>Comisión de Servicios</strong><p class="muted">Scouter · alex@example.test</p></div></div>'+btn('Aceptar invitación y entrar')+'<p class="help">El enlace caduca en 7 días.</p>',auth=True)
scene('F04','Primer acceso · nombre y foto',onboarding(),auth=True)
scene('F05','Editor de foto · cancelación',title('Ajustar foto','Volver')+'<div class="crop-preview"><span class="large-avatar">AL</span></div><p class="help centered">Arrastra la foto para encuadrarla.</p><label for="zoom">Acercar</label><input id="zoom" type="range" min="1" max="4" value="2"><div class="action-pair">'+btn('Alejar','secondary','ZoomOut')+btn('Acercar','secondary','ZoomIn')+'</div>'+btn('Centrar','text-button')+btn('Guardar foto')+btn('Cancelar','text-button'),auth=True,note='El marco expresa el editor existente. Imagen personal pendiente de selección; no se genera una persona ficticia.')
scene('F06','Inicio · tareas personales',title('Mis tareas')+metric('7','pendientes')+'<p class="incidents"><span class="late">1 vencida</span><span>1 bloqueada</span></p>'+tasks()+btn('Ver todas mis tareas','secondary','ChevronRight'))
scene('F07','Última tarea · satisfacción',title('¡Tus tareas están al día!')+'<div class="quiet-success"><img src="../../../../public/monkey-vine.webp" alt="" width="140" height="150"><strong>Tarea completada</strong><span class="muted">0 pendientes personales</span></div><div class="undo">'+ico('Check')+'<span>Listado de material completado</span>'+btn('Deshacer','text-button')+'</div>',note='Estado final tras 1 → 0. Mantener 2,6 s antes del equipo; la lámina no demuestra el tiempo.')
scene('F08','Inicio · equipo en consulta',success()+title('Mis comisiones')+metric('30','pendientes del equipo')+tasks(True)+btn('Ver mis comisiones','secondary','ChevronRight'),note='Scouter: sin controles para completar tareas ajenas.')
scene('F09','Inicio · campamento autorizado',success()+title('Campamento de verano')+'<p class="muted">Tus comisiones están al día.</p>'+group('Verano 2027')+metric('14','pendientes del campamento')+progress(73)+'<div class="summary-line"><span>Comisiones</span><strong>10</strong></div><div class="summary-line"><span>Próximo vencimiento</span><strong>4 nov</strong></div>'+btn('Ver campamento','secondary','ChevronRight'),note='Solo agregado autorizado, sin títulos ni personas de comisiones ajenas.')
scene('F10','Todo al día',title('Todo al día')+'<div class="quiet-success"><img src="../../../../public/monkey.webp" alt="" width="108" height="145"><strong>Sin tareas pendientes</strong></div><h2>Terminadas recientemente</h2>'+row('Revisar el listado de material',date='Hoy',status='Terminada',done=True)+row('Confirmar el transporte','Verano 2027','Logística','Ayer',status='Terminada',camp=True,done=True),note='Historial ilustrativo de tareas reales de la cuenta en producción; no fabricar datos.')
scene('F11','Mis tareas · lista única',title('Mis tareas')+'<div class="list-toolbar">'+btn('Buscar y filtrar','secondary','Search')+'</div>'+tasks()+row('Reponer el botiquín','Ronda 26/27','Botiquín','5 nov, 18:00')+row('Confirmar los menús','Verano 2027','Menú','6 nov, 12:00',camp=True),active='Mis tareas')
scene('F12','Detalle de tarea · asignada',title('Revisar el listado de material','Mis tareas')+context()+'<div class="detail-block"><span class="late">Vencida · Ayer</span><h2>Responsables</h2>'+person('Alex','Encargado')+'<h2>Descripción</h2><p>Comprobar el material disponible y actualizar lo que falta para la próxima salida.</p><h2>Estado</h2><p>Pendiente</p></div>'+btn('Completar',icon='Check')+btn('Marcar en curso','secondary')+'<h2>Actividad</h2><p class="muted">Laura actualizó la fecha ayer.</p>',active='Mis tareas')
scene('F13','Comisiones · diez agrupadas',title('Mis comisiones')+comms(),active='Comisiones',note='Escenario de diez comisiones. La lista continúa por scroll sin diez tarjetas grandes.')
scene('F14','Comisión · Responsable',title('Servicios','Comisiones')+'<div class="commission-heading"><div>'+context('Verano 2027','Servicios',True)+'<p class="muted">3 tareas pendientes</p></div><img src="../../../../public/artwork/mascots/servicios.webp" width="82" height="96" alt=""></div>'+progress(60)+'<div class="action-pair">'+btn('Nueva tarea',icon='Plus')+btn('Añadir personas','secondary','Users')+'</div>'+tabs(['Tareas','Personas','Actividad'])+row('Preparar los turnos','Verano 2027','Servicios','Mañana, 12:00',camp=True)+row('Revisar la zona común','Verano 2027','Servicios','4 nov, 18:00',camp=True),active='Comisiones',note='Responsable de esta comisión: acciones autorizadas. El Scouter omite gestión y controles ajenos.')
scene('F15','Proyectos anuales',title('Proyectos')+group('Ronda 26/27')+progress(62)+comms(5).split(group('Verano 2027'))[0]+btn('Nuevo proyecto','secondary','Plus'),active='Comisiones',note='Creación disponible solo con permisos actuales.')
scene('F16','Campamentos',title('Campamentos')+btn('Nuevo campamento','primary','Plus')+'<section class="project-summary">'+group('Campamento de Navidad')+'<p class="muted">27–30 diciembre</p>'+progress(35)+btn('Ver campamento','text-button','ChevronRight')+'</section><section class="project-summary">'+group('Verano 2027')+'<p class="muted">1–15 julio</p>'+progress(73)+btn('Ver campamento','text-button','ChevronRight')+'</section>',active='Comisiones',note='Campamento de Navidad activa la colección navideña sin cambiar los nombres de comisiones.')
scene('F17','Seguimiento · Coordinación',title('Seguimiento')+group('Verano 2027')+progress(73)+'<h2>Requieren atención</h2><div class="summary-line"><span class="late">Tareas vencidas</span><strong>3</strong></div><div class="summary-line"><span>Bloqueadas</span><strong>2</strong></div><h2>Comisiones</h2>'+commission('Logística','2 pendientes · 1 vencida')+commission('Servicios','3 pendientes')+commission('Cocina','Al día'),active='Comisiones')
scene('F18','Personas e invitaciones',title('Personas','Servicios')+person('Alex','Responsable','AL')+person('Laura','Scouter','LA')+person('Carlos','Scouter','CA')+'<h2>Invitar a Servicios</h2>'+tabs(['Un correo','Lista de correos'])+'<div class="form-stack">'+field('Correo electrónico','','email')+field('Nombre')+'<label for="role">Rol en Servicios</label><select id="role"><option>Scouter</option><option>Responsable</option></select>'+btn('Enviar invitación','primary','Mail')+'</div>',active='Comisiones',note='Destino bloqueado a Servicios; desde proyecto, al proyecto de origen. Lista de correos comparte destino.')
scene('F19','Perfil y avisos',title('Mi perfil')+'<div class="profile-top"><span class="large-avatar">AL</span><div><strong>Alex</strong><p class="muted">alex@example.test</p></div></div><div class="form-stack">'+field('Nombre','Alex')+btn('Cambiar foto','secondary','Camera')+'<fieldset><legend>Avisos de tareas</legend><label class="check-label"><input type="checkbox" checked> Recibir avisos por correo</label><p class="help">Al crear, 7 y 3 días antes, al vencer y cada semana si sigue vencida.</p>'+btn('Configurar avisos','text-button','Settings')+'</fieldset>'+btn('Guardar perfil')+btn('Cerrar sesión','text-button','LogOut')+'</div>',active='Perfil')
scene('F20','Nueva tarea · validación',title('Nueva tarea','Servicios')+'<div class="form-stack">'+field('Título','Revisar la zona común')+field('Fecha límite','','date','Elige una fecha para la tarea.')+'<label for="responsible">Encargado</label><select id="responsible"><option>Alex</option><option>Laura</option></select><label for="description">Descripción</label><textarea id="description" rows="3">Revisar el espacio antes de la llegada del grupo.</textarea>'+btn('Crear tarea')+btn('Cancelar','text-button')+'</div>',active='Comisiones')
scene('F21','Cuenta sin asignaciones',title('Sin tareas asignadas')+'<div class="quiet-success"><img src="../../../../public/monkey.webp" width="108" height="145" alt=""><p>Aquí aparecerán las tareas de tus comisiones cuando te las asignen.</p></div>',note='Cuenta vacía: sin estadísticas ni obligaciones inventadas.')
banana='<svg viewBox="0 0 96 96" class="banana" aria-hidden="true"><path d="M17 13 C18 38 45 63 85 45 C79 66 57 81 34 74 C11 67 2 39 12 14 Z" fill="#f7c948" stroke="#124d38" stroke-width="3.5"/><ellipse cx="20" cy="45" rx="4" ry="6" fill="#86522d"/><ellipse cx="38" cy="65" rx="5" ry="3.5" fill="#86522d"/><ellipse cx="66" cy="61" rx="4.5" ry="3.5" fill="#86522d"/><path d="M12 14L13 7L19 8L17 15M83 45L88 42" fill="none" stroke="#124d38" stroke-width="4" stroke-linecap="round"/></svg>'
scene('F22','Carga · sin destello de login',title('Mis tareas')+'<div class="quiet-success" role="status">'+banana+'<p>Cargando tareas…</p></div>',note='Estado estático del indicador existente. No representa porcentaje de progreso real.')
scene('F23','Sin conexión · reintentar',title('Sin conexión')+'<p class="lead">No se ha podido cargar Bandarlog.</p>'+btn('Reintentar','primary','RefreshCw')+'<p class="help">El cambio no se ha guardado. Vuelve a intentarlo cuando tengas conexión.</p>',note='No se confunde falta de red con cierre de sesión; conservar contexto seguro.')
scene('F24','Sesión caducada',title('Tu sesión ha caducado')+'<p class="lead">Vuelve a entrar para continuar.</p><div class="form-stack">'+field('Correo electrónico','alex@example.test','email')+btn('Recibir código','primary','Mail')+'</div>',auth=True,note='Renovación y límites se prueban en backend después de implementar.')
scene('F25','Código incorrecto · recuperación',code(True),auth=True)
scene('F26','Foto omitida · nombre validado',onboarding(skipped=True),auth=True,note='Solo la fotografía se omite. El nombre permanece obligatorio y la marca de onboarding es de servidor.')
scene('F27','Google cancelado · alternativa',title('Entrar en Bandarlog')+'<p class="notice">No se ha completado el acceso con Google.</p><div class="form-stack">'+field('Correo electrónico','alex@example.test','email')+btn('Recibir código',icon='Mail')+btn('Volver a Google','secondary')+'</div>',auth=True,note='Google configurado y cancelado; no se crea acceso ni se cambia la cuenta.')
# Additional required variants are static scenes in the same visual family.
scene('V01','Acceso · sin Google',login(False),auth=True,note='Google se omite cuando falta configuración.')
scene('V02','Comisiones · una comisión',title('Mis comisiones')+comms(1),active='Comisiones')
scene('V05','Comisiones · cinco comisiones',title('Mis comisiones')+comms(5),active='Comisiones')
scene('VSAFE','Áreas seguras · esquema',title('Mis tareas')+metric('7','pendientes')+tasks(),note='Esquema de márgenes: top 44px y bottom 34px simulados; no dispositivo físico.',extra='safe-demo')
# Revision 1: one batched correction of the independent initial review.
def revise(id,body=None,note=None,auth=None):
 s=next(s for s in scenes if s['id']==id)
 if body is not None:s['body']=body
 if note is not None:s['note']=note
 if auth is not None:s['auth']=auth
 return s

revise('F05',title('Ajustar foto','Volver')+'<div class="crop-preview"><img src="../../../../public/monkey.webp" alt="Imagen de prueba: mascota original de Bandarlog" width="256" height="256"></div><p class="help centered">Arrastra la foto para encuadrarla.</p><label for="zoom">Acercar</label><input id="zoom" type="range" min="1" max="4" value="2"><div class="action-pair">'+btn('Alejar','secondary','ZoomOut')+btn('Acercar','secondary','ZoomIn')+'</div>'+btn('Centrar','text-button')+btn('Guardar foto')+btn('Cancelar','text-button'),note='Imagen de prueba: mascota original, no foto de una persona. Cancelar vuelve a VRETURN con Alex intacto. Recorte funcional pendiente de implementación.')
revise('F07',title('¡Tus tareas están al día!')+'<div class="quiet-success"><img src="../../../../public/monkey-vine.webp" alt="" width="140" height="150"><strong>Tarea completada</strong><span class="muted">0 pendientes personales</span></div><div class="undo">'+ico('Check')+'<span>Listado de material completado</span>'+btn('Deshacer','text-button')+'</div>',note='Secuencia de satisfacción: VLAST muestra 1; F07 muestra 0; F08 conserva la confirmación personal tras 2,6s. Estos frames estáticos no prueban tiempo ni interrupción.')
revise('F09',success()+title('Campamento de verano')+'<p class="muted">Tus comisiones están al día.</p>'+group('Verano 2027')+metric('14','pendientes del campamento')+progress(round(100*SNAP['camps']['camp']['done']/SNAP['camps']['camp']['total']))+'<div class="summary-line"><span>Comisiones propias</span><strong>5</strong></div><div class="summary-line"><span>Completadas del campamento</span><strong>27 de 41</strong></div>'+btn('Ver campamento','secondary','ChevronRight'),note='Etapa camps del fixture: 60tareas propias/comisiones terminadas; campamento41total/27done/14open. Se muestran solo agregados autorizados.')
revise('F11',title('Mis tareas')+'<div class="list-toolbar">'+btn('Buscar y filtrar','secondary','Search')+'</div>'+''.join(taskrow(t) for t in TASKS[:7]),note='Siete tareas personales abiertas del fixture, por fecha, de cinco comisiones anuales y Cocina/Menú del campamento. No se insertan tareas ajenas en esta lista.')
services=next(c for c in SNAP['personal']['commissions'] if c['name']=='Servicios')['stats']
servicepct=round(100*services['done']/services['total'])
servicebody=title('Servicios','Comisiones')+'<div class="commission-heading"><div>'+context('Verano 2027','Servicios',True)+f'<p class="muted">{services["open"]} tareas pendientes</p></div><img src="../../../../public/artwork/mascots/servicios.webp" width="82" height="96" alt=""></div>'+progress(servicepct)
service_tasks=[t for t in TASKS if t['commissionId']=='commission-v2-8' and t['status']!='done']
revise('F14',servicebody+'<div class="action-pair">'+btn('Nueva tarea',icon='Plus')+btn('Añadir personas','secondary','Users')+'</div>'+tabs(['Tareas','Personas','Actividad'])+''.join(taskrow(t) for t in service_tasks),note='Responsable: gestiona esta comisión. Fixture personal: 3abiertas/2done/5total, progreso40%. Ver VSCOUTER para consulta sin gestión.')
roundstats=[c['stats'] for c in SNAP['personal']['commissions'] if c['projectId']=='round-v2']
roundpct=round(100*sum(x['done'] for x in roundstats)/sum(x['total'] for x in roundstats))
revise('F15',title('Proyectos')+group('Ronda 26/27')+progress(roundpct)+''.join(commission(c['name']) for c in COMM[:5])+btn('Nuevo proyecto','secondary','Plus'),note='Un único encabezado del proyecto. Fixture:33total/13done/20open; progreso39%.')
revise('F16',title('Campamentos')+btn('Nuevo campamento','primary','Plus')+'<section class="project-summary">'+group('Campamento de Navidad')+'<p class="muted">27–30 diciembre · sin tareas todavía</p>'+btn('Ver campamento','text-button','ChevronRight')+'</section><section class="project-summary">'+group('Verano 2027')+'<p class="muted">1–15 julio</p>'+progress(round(100*SNAP['personal']['camp']['done']/SNAP['personal']['camp']['total']))+btn('Ver campamento','text-button','ChevronRight')+'</section>',note='Navidad es un segundo proyecto vacío de muestra; no se inventa progreso. Verano utiliza etapa personal del fixture:41total/10done/31open.')
revise('F17',title('Seguimiento')+group('Verano 2027')+progress(round(100*SNAP['personal']['camp']['done']/SNAP['personal']['camp']['total']))+'<h2>Requieren atención</h2><div class="summary-line"><span>Bloqueadas</span><strong>3</strong></div><h2>Comisiones</h2>'+''.join(commission(c['name']) for c in COMM[5:]),note='Coordinación, etapa personal del mismo fixture: campamento41total/31open/10done y3bloqueadas. Alcance de backend pendiente de prueba.')
revise('F26',title('Mis tareas')+metric('7','pendientes')+'<p class="incidents"><span class="late">1 vencida</span><span>1 bloqueada</span></p>'+tasks()+btn('Ver todas mis tareas','secondary','ChevronRight'),auth=False,note='Destino tras Continuar sin fotografía: Inicio con avatarAL, nombreAlex y sin repetir la pregunta. Persistencia servidor pendiente de implementación.')
# Replace native selects with closed custom-control designs consistently.
for s in scenes:
 s['body']=s['body'].replace('<label for="role">Rol en Servicios</label><select id="role"><option>Scouter</option><option>Responsable</option></select>',custom_select('Rol en Servicios','Scouter'))
 s['body']=s['body'].replace('<label for="responsible">Encargado</label><select id="responsible"><option>Alex</option><option>Laura</option></select>',custom_select('Encargado','Alex'))
 s['body']=s['body'].replace('<input id="zoom" type="range"','<input id="zoom" aria-label="Acercar la imagen" type="range"')
 # Input date is drawn as localized design instead of platform-specific mm/dd/yyyy.
 s['body']=s['body'].replace('type="date"','type="text" inputmode="numeric" placeholder="dd/mm/aaaa"')

scene('VLAST','Secuencia · queda una tarea',title('Mis tareas')+metric('1','pendiente')+'<div class="task-list">'+taskrow(TASKS[0])+'</div>',note='Frame anterior a F07: las otras6 propias ya se completaron. Completar esta última conduce a0 y satisfacción; la transición no se simula en HTML.')
scene('VWAIT','Código · espera de reenvío',title('Introduce el código','Cambiar correo')+'<p class="muted">Enviado a alex@example.test</p><div class="form-stack code-form">'+field('Código de acceso')+btn('Entrar')+'<p class="help">El código caduca en 10 minutos.</p><button type="button" class="text-button" disabled>Reenviar en 42 s</button></div>',auth=True,note='Estado de espera del mismo desafío; valor42s ilustrativo. Temporizador y límites se implementarán en servidor/cliente.')
scene('VEXHAUST','Código · intentos agotados',title('Solicita otro código','Cambiar correo')+'<p class="error">Has agotado los intentos de este código.</p><p class="lead">Recibe uno nuevo para volver a entrar.</p>'+btn('Recibir un código nuevo',icon='Mail'),auth=True,note='El desafío anterior queda inválido. Esta muestra no consume ni envía códigos.')
scene('VNAME','Primer acceso · nombre vacío',title('¿Cómo te llamamos?')+'<div class="form-stack">'+field('Nombre','','text','Escribe cómo quieres que te llamemos.')+'<p class="help">La foto es opcional.</p>'+btn('Continuar')+btn('Ahora no, sin foto','text-button')+'</div>',auth=True,note='Campo required. Ambas acciones deben validar el nombre antes de guardar; omitir nunca omite nombre.')
scene('VRETURN','Editor cancelado · nombre conservado',onboarding(),auth=True,note='Retorno desde Cancelar de F05: nombreAlex y foto sin cambios. No se pierde el dato escrito.')
scene('VBULK','Invitación · lista de correos',title('Invitar a Servicios','Personas')+tabs(['Un correo','Lista de correos'],'Lista de correos')+'<div class="form-stack"><label for="emails">Correos electrónicos</label><textarea id="emails" rows="5">laura@example.test\ncarlos@example.test</textarea><p class="help">Un correo por línea. Destino: Servicios · Verano2027.</p>'+custom_select('Rol en Servicios','Scouter')+btn('Enviar 2 invitaciones',icon='Mail')+btn('Cancelar','text-button')+'</div>',active='Comisiones',note='Lista abierta con2direcciones sintéticas. El destino no se cambia desde este formulario.')
scene('VBULKERROR','Invitación · correo incorrecto',title('Invitar a Servicios','Personas')+tabs(['Un correo','Lista de correos'],'Lista de correos')+'<div class="form-stack"><label for="bad-emails">Correos electrónicos</label><textarea id="bad-emails" rows="5" aria-invalid="true">laura@example.test\ncarlos@</textarea><p class="error">Revisa el correo de la línea2: carlos@.</p>'+custom_select('Rol en Servicios','Scouter')+btn('Revisar y enviar',icon='Mail')+btn('Cancelar','text-button')+'</div>',active='Comisiones',note='Error local concreto; toda la lista permanece editable y no se envía parcialmente sin confirmarlo.')
scene('VPROJECTINVITE','Invitación · desde proyecto',title('Invitar a Verano2027','Personas')+'<p class="help">Destino: Campamento de verano2027</p><div class="form-stack">'+field('Correo electrónico','laura@example.test','email')+btn('Enviar invitación',icon='Mail')+btn('Cancelar','text-button')+'</div>',active='Comisiones',note='Invitación de proyecto: destino fijado al proyecto, sin convertirla en comisión ni asignar rol global.')
scene('VSCOUTER','Servicios · Scouter en consulta',servicebody+tabs(['Tareas','Personas','Actividad'])+''.join(taskrow(t,True) for t in service_tasks),active='Comisiones',note='Scouter: no Nueva tarea/Añadir personas ni círculos sobre tareas ajenas. Solo lectura del equipo autorizado.')
scene('VSELECT','Selector · abierto',title('Invitar a Servicios','Personas')+'<div class="form-stack">'+field('Correo electrónico','laura@example.test','email')+custom_select('Rol en Servicios','Scouter',['Scouter','Responsable'],True)+btn('Enviar invitación',icon='Mail')+'</div>',active='Comisiones',note='Selector diseñado para la UI; opción seleccionada verde y confirmada con check, objetivos44px. Interacción real reutilizará Select existente.')
scene('VSENDERROR','Nueva tarea · envío fallido',title('Nueva tarea','Servicios')+'<p class="error">No se ha podido guardar la tarea. Reintenta sin perder los datos.</p><div class="form-stack">'+field('Título','Revisar la zona común')+field('Fecha límite','04/11/2026')+custom_select('Encargado','Alex')+'<label for="saved-description">Descripción</label><textarea id="saved-description" rows="3">Revisar el espacio antes de la llegada del grupo.</textarea>'+btn('Reintentar')+btn('Cancelar','text-button')+'</div>',active='Comisiones',note='Fallo de envío distinto de validación: título, fecha, encargado y descripción se conservan.')
scene('VINVITESENDERROR','Invitación · envío fallido',title('Invitar a Servicios','Personas')+'<p class="error">No se ha podido enviar la invitación. Vuelve a intentarlo.</p><div class="form-stack">'+field('Correo electrónico','laura@example.test','email')+field('Nombre','Laura')+custom_select('Rol en Servicios','Scouter')+btn('Reintentar envío',icon='Mail')+btn('Cancelar','text-button')+'</div>',active='Comisiones',note='DestinoServicios y datos conservados; no se afirma que se haya enviado la invitación.')

for weight in [400,600,800]:
 src=ROOT.parents[2]/'node_modules/@fontsource/nunito-sans/files'/f'nunito-sans-latin-{weight}-normal.woff2'
 shutil.copy(src,ROOT/'assets'/f'nunito-{weight}.woff2')
shutil.copy(ROOT.parents[2]/'node_modules/@fontsource/nunito-sans/LICENSE',ROOT/'assets/FONT-LICENSE.txt')
head='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>{title} · Propuesta Bandarlog</title><link rel="stylesheet" href="../style.css"></head><body class="scene {extra}">'
for s in scenes:
 out=head.format(title=s['label'],extra=(s['extra']+(' auth-scene' if s['auth'] else ' app-scene')))+header(not s['auth'])+'<main>'+s['body']+'</main>'+(nav(s['active']) if not s['auth'] else '')+'</body></html>'
 (ROOT/'screens'/f'{s["id"].lower()}.html').write_text(out)
(ROOT/'scenes.json').write_text(json.dumps([{k:s[k] for k in ['id','label','auth','note']} for s in scenes],ensure_ascii=False,indent=2))
# Static contact sheet, no interaction logic or application runtime.
board='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bandarlog · Forest Experience · Codex</title><link rel="stylesheet" href="style.css"></head><body class="board"><header class="board-heading"><h1>Bandarlog · Forest Experience</h1><p>Propuesta Codex · copa compacta · diseño estático · datos sintéticos</p><p>27 estados principales y variantes. No autentica, envía invitaciones ni modifica tareas.</p></header><div class="board-grid">'
for s in scenes:
 board+=f'<section class="board-cell" id="{s["id"]}"><h2>{s["id"]} · {s["label"]}</h2><a href="screens/{s["id"].lower()}.html" aria-label="Abrir propuesta {s["label"]}"><img class="scene-evidence" src="revision-1/captures/{s["id"].lower()}-390-full.png" alt="Propuesta completa: {s["label"]}" width="390"></a><p>{s["note"] or "Composición móvil a390px. Datos sintéticos; controles sin acciones reales."}</p></section>'
board+='</div></body></html>'
(ROOT/'index.html').write_text(board)
print('Generated',len(scenes),'static scenes and board')
