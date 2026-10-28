from pathlib import Path
import json, shutil, html
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
A=ROOT/'assets'; A.mkdir(exist_ok=True)
for w in [400,600,800]: shutil.copyfile(REPO/f'node_modules/@fontsource/nunito-sans/files/nunito-sans-latin-{w}-normal.woff2',A/f'nunito-{w}.woff2')
ICONS=json.loads((REPO/'docs/forest-experience/codex/assets/icons.json').read_text())
def i(name): return ICONS.get(name,ICONS['CircleCheck'])
def esc(x): return html.escape(str(x))
def btn(text,kind='secondary',icon=None,href=None):
 s=f'{i(icon) if icon else ""}<span>{text}</span>'
 return f'<a class="button {kind}" href="{href}">{s}</a>' if href else f'<button type="button" class="{kind}">{s}</button>'
def link(text,href):return f'<a class="text-link" href="{href}">{text}{i("ChevronRight")}</a>'
def av(n='AM',small=False):return f'<span class="avatar {"small" if small else ""}" aria-label="{n}">{n}</span>'
def chip(t,c='neutral'):return f'<span class="chip {c}">{t}</span>'
def field(label,value='',kind='text',hint='',error=''):
 control=f'<textarea>{value}</textarea>' if kind=='textarea' else f'<select><option>{value}</option></select>' if kind=='select' else f'<input type="{kind}" value="{esc(value)}" {"aria-invalid=true" if error else ""}>'
 return f'<label class="field"><span>{label}</span>{control}{f"<small class=\"muted\">{hint}</small>" if hint else ""}{f"<small class=\"error-copy\">{error}</small>" if error else ""}</label>'
def notice(text,kind='info',action=''):
 return f'<div class="notice {kind}" role="{ "alert" if kind=="error" else "status"}">{i("AlertCircle" if kind in ["error","warning"] else "CircleCheck")}<span>{text}</span>{action}</div>'
def empty(title,text,action='',icon='CircleCheck'):
 return f'<div class="empty">{i(icon)}<h2>{title}</h2><p>{text}</p>{action}</div>'
canopy_edge='M0 0H390V5C376 13 364 6 352 12C337 17 327 14 315 11C301 18 283 16 270 9C256 17 243 15 230 6C215 18 198 17 184 11C168 18 152 17 139 8C125 16 107 16 94 6C77 17 58 18 42 9C27 18 12 16 0 9Z'
canopy_depth='M0 0H390V16C367 3 348 18 323 10C297 30 274 9 250 7C224 32 198 14 174 3C148 25 126 10 102 7C79 21 52 9 32 4C18 10 9 7 0 3Z'
def canopy():return f'<svg class="canopy-depth" viewBox="0 0 390 64" preserveAspectRatio="none" aria-hidden="true"><path d="{canopy_depth}"/></svg><svg class="canopy-edge" viewBox="0 0 390 16" preserveAspectRatio="none" aria-hidden="true"><path d="{canopy_edge}"/></svg>'
def banana(label='Cargando…'):
 return f'<div class="banana" role="status"><svg viewBox="0 0 96 96" aria-hidden="true"><path d="M17 13C18 38 45 63 85 45C79 66 57 81 34 74C11 67 2 39 12 14Z" fill="#f7c948" stroke="#124d38" stroke-width="3.5"/><ellipse cx="20" cy="45" rx="4" ry="6" fill="#86522d"/><ellipse cx="38" cy="65" rx="5" ry="3.5" fill="#86522d"/><ellipse cx="66" cy="61" rx="4.5" ry="3.5" fill="#86522d"/><path d="M12 14L13 7L19 8L17 15M83 45L88 42" fill="none" stroke="#124d38" stroke-width="4" stroke-linecap="round"/></svg><span>{label}</span></div>'
COMMS=[('Servicios','servicios',8,2,2,1),('Animación','animacion',6,3,1,0),('Material','material',7,2,1,1),('Menú','menu',8,4,0,0),('Logística','logistica',6,3,0,0),('Lugar','lugar',5,4,0,0)]
TASKS=[('Revisar listado de material','Material','Hoy, 12:00','Pendiente','overdue','AM','LM'),('Confirmar turnos de servicios','Servicios','Hoy, 18:00','Bloqueada','blocked','AM','CL'),('Preparar la velada de bienvenida','Animación','Mañana, 17:00','En curso','progress','AM','NR'),('Cerrar inventario del almacén','Material','30 oct, 18:00','En curso','progress','AM','LM'),('Preparar el rincón de cuentos','Animación','31 oct, 12:00','Pendiente','neutral','AM','NR'),('Revisar material de limpieza','Servicios','2 nov, 18:00','Pendiente','neutral','AM','CL'),('Preparar zonas de descanso','Servicios','3 nov, 12:00','En curso','progress','AM','LM')]
SERVICES=[TASKS[1],TASKS[5],TASKS[6],('Comprobar botiquines','Servicios','29 oct, 12:00','Pendiente','neutral','LM','CL'),('Revisar suministro de agua','Servicios','27 oct, 18:00','Pendiente','overdue','LM','CL'),('Distribuir bolsas de residuos','Servicios','30 oct, 12:00','Pendiente','neutral','CL','NR'),('Revisar zonas comunes','Servicios','27 oct, 12:00','Terminada','done','AM','CL'),('Preparar carteles de servicios','Servicios','26 oct, 18:00','Terminada','done','LM','CL')]
TEAM=[SERVICES[4],('Confirmar cesión del almacén','Material','30 oct, 12:00','Bloqueada','blocked','LM','CL'),('Revisar la caja de juegos','Animación','27 oct, 17:00','Pendiente','overdue','NR','CL')]
ALERTS=[TASKS[0],TASKS[1],SERVICES[4],TEAM[1],TEAM[2],('Confirmar reserva de autobús','Logística','27 oct, 18:00','Pendiente','overdue','LM','CL'),('Esperar confirmación de proveedor','Logística','31 oct, 12:00','Bloqueada','blocked','CL','NR')]
POST_TASKS=[t for t in TASKS if t[0]!='Confirmar turnos de servicios']
POST_COMMS=[('Servicios','servicios',8,3,1,0)]+COMMS[1:]
DONE_TASKS=[('Confirmar turnos de servicios','Servicios','Hoy, 18:00','Terminada','done','AM','CL'),SERVICES[-2],SERVICES[-1]]
def cicon(name,christmas=True):
 key=next((c[1] for c in COMMS if c[0]==name),'comunicacion' if name=='Comunicación' else 'servicios')
 source='navidad-'+key+'.svg' if christmas else {'servicios':'servicios-general.svg','animacion':'animacion-general.svg','material':'infraestructura-11.svg','menu':'cocina-01.svg','logistica':'logistica-02.svg','lugar':'naturaleza-01.svg','comunicacion':'comunicacion-01.svg'}[key]
 if not (REPO/'public/artwork/icons'/source).exists():source='servicios-general.svg'
 return f'<img class="commission-icon" src="../../../../public/artwork/icons/{source}" alt="">'
def progress(done,total):return f'<div class="progress" aria-label="{done} de {total} tareas terminadas"><span style="width:{round(done/total*100) if total else 0}%"></span></div><span class="progress-value">{done}/{total}</span>'
def section_head(title,right=''):return f'<div class="section-head"><h2>{title}</h2>{right}</div>'
def comm_rows(comms=COMMS,clear=False,href='d08.html',christmas=True):
 s='<div class="commission-list"><div class="commission-table-head"><span>Comisión</span><span>Trabajo abierto</span><span>Avance</span><span>Personas</span><span></span></div>'
 for n,k,total,done,late,block in comms:
  if clear:done=total;late=0;block=0
  state=(chip(f'{late} vencida'+('s' if late!=1 else ''),'overdue') if late else '')+(chip(f'{block} bloqueo'+('s' if block!=1 else ''),'blocked') if block else '')
  target=href if n=='Servicios' else 'd23.html' if christmas else 'd73.html'
  s+=f'<a class="commission-row" href="{target}"><span class="commission-name">{cicon(n,christmas)}<span><strong>{n}</strong><small>{"Al día" if total==done else str(total-done)+" tareas abiertas"}</small></span></span><span class="row-states">{state or chip("Al día","done") if total==done else state or chip("En plazo")}</span><span class="progress-wrap">{progress(done,total)}</span><span class="avatar-stack">{av("LM",True)}{av("AM",True)}{av("CL",True)}</span>{i("ChevronRight")}</a>'
 return s+'</div>'
def project_summary(clear=False,post=False):
 campdone=40 if clear else 19 if post else 18
 return f'<div class="project-summary">{section_head("Campamentos y proyectos",link("Ver todos","d21.html"))}<a class="project-line" href="d23.html"><span class="project-symbol">{i("Tent")}</span><span><strong>Campamento de Navidad</strong><small>27–30 diciembre · 6 comisiones</small></span></a><div class="progress-wrap">{progress(campdone,40)}</div><div class="inline-facts"><span>{40-campdone} abiertas</span><span class="{"muted" if clear else "red"}">{0 if clear else 3 if post else 4} vencidas</span></div><a class="project-line" href="d73.html"><span class="project-symbol">{i("CalendarDays")}</span><span><strong>Proyecto anual 2026–2027</strong><small>Septiembre–agosto · 2 comisiones</small></span></a><div class="progress-wrap">{progress(10 if clear else 7,10)}</div></div>'
def featured(team=False,post=False):
 s='<div class="featured-list">'
 rows=TEAM if team else POST_TASKS if post else TASKS
 for idx,(title,comm,due,status,color,*people) in enumerate(rows[:3]):
  late=color=='overdue' or title=='Confirmar turnos de servicios'
  badge=chip(status,color if color!='overdue' else 'neutral')+(chip('Vencida','overdue') if late else '')
  target='d65.html' if team else 'd13.html' if comm=='Servicios' else 'd12.html'
  s+=f'<article class="featured-task"><div class="task-leading">{cicon(comm)}<div><a class="task-title" href="{target}">{title}</a><p>{comm} · Campamento de Navidad</p><div class="task-meta"><span class="{"red" if late else "muted"}">{i("CalendarDays")}{due}</span>{badge}</div></div></div><div class="task-trailing">{av(people[0],True)}{btn("Completar","complete","Check","d53.html") if not team else link("Abrir",target)}</div></article>'
 return s+'</div>'
def task_table(rows=TASKS,context=True,readonly=False):
 s='<div class="table-scroll"><table><thead><tr><th>Tarea</th><th>Personas asignadas</th><th>Fecha límite</th><th>Estado</th><th><span class="sr-only">Abrir</span></th></tr></thead><tbody>'
 for title,comm,due,status,color,*people in rows:
  late=color=='overdue' or (title=='Confirmar turnos de servicios' and status!='Terminada')
  target='d18.html' if status=='Terminada' else 'd13.html' if title=='Confirmar turnos de servicios' else 'd65.html' if title=='Comprobar botiquines' else 'd12.html'
  s+=f'<tr><td><a class="task-title" href="{target}">{title}</a>{f"<small>{comm} · Campamento de Navidad</small>" if context else ""}</td><td><span class="avatar-stack">'+''.join(av(p,True) for p in people)+f'</span></td><td class="{"red" if late else ""}">{due}{" · Vencida" if late else ""}</td><td>{chip(status,color if color!="overdue" else "neutral")}</td><td><a class="icon-button" aria-label="Abrir {title}" href="{target}">{i("ChevronRight")}</a></td></tr>'
 return s+'</tbody></table></div>'
def filters(active='Todas',search=''):
 return '<div class="toolbar"><div class="segments">'+''.join(btn(t,'selected' if t==active else 'plain') for t in ['Todas','Pendientes','En curso','Terminadas','Bloqueadas'])+f'</div><div class="filter-controls"><label class="search">{i("Search")}<input aria-label="Buscar tarea" placeholder="Buscar tarea…" value="{search}"></label><select aria-label="Filtrar persona"><option>Todas las personas</option></select><select aria-label="Filtrar fecha"><option>Todas las fechas</option></select></div></div>'
def heading(title,subtitle='',actions=''):
 return f'<div class="page-heading"><div><h1>{title}</h1>{f"<p>{subtitle}</p>" if subtitle else ""}</div><div class="actions">{actions}</div></div>'
def tabs(active='Tareas',project=False):
 labels=['Resumen','Comisiones','Tareas','Personas'] if project else ['Tareas','Personas','Actividad']
 return '<nav class="tabs" aria-label="Secciones">'+''.join(f'<a href="{("d23" if t=="Resumen" else "d26" if t=="Personas" else "d25") if project else ("d08" if t=="Tareas" else "d10" if t=="Personas" else "d11")}.html" class="{"active" if active==t else ""}">{t}</a>' for t in labels)+'</nav>'
def commission_head(role='Responsable',clear=False,empty_state=False):
 done,total=(0,0) if empty_state else (8,8) if clear else (2,8)
 return f'<a class="back" href="d07.html">{i("ArrowLeft")}Comisiones</a><div class="commission-heading">{cicon("Servicios")}<div><h1>Servicios</h1><p>Campamento de Navidad</p></div><div class="actions">{btn("Añadir personas","secondary","Users","d39.html")+btn("Nueva tarea","primary","Plus","d34.html") if role!="Scouter" else chip("Scouter")}</div></div>'+f'<div class="compact-summary"><span><strong>{done}/{total}</strong> tareas terminadas</span><span class="progress-wrap summary-progress"><span class="progress" aria-label="{done} de {total} tareas terminadas"><span style="width:{round(done/total*100) if total else 0}%"></span></span></span><a href="d12.html" class="{"" if clear or empty_state else "red"}">{"Sin vencimientos" if clear or empty_state else "2 vencidas"}</a><a href="d15.html">{"Sin bloqueos" if clear or empty_state else "1 bloqueo"}</a></div>'
def home(role='Coordinación',state='personal',post=False):
 title={'personal':'Tus tareas primero','team':'Tus tareas están al día','clear':'Todo al día','empty':'Inicio'}[state]
 actions=btn('Nueva tarea','primary','Plus','d34.html') if role!='Scouter' and state!='empty' else ''
 if state=='empty':return heading(title,actions=actions)+empty('Empieza por tu primer proyecto','Organiza las comisiones y sus tareas en un proyecto o campamento.',btn('Nuevo proyecto','primary','Plus','d41.html'),'Tent')
 own=6 if post else 7
 left=section_head(title,chip(f'{own} abiertas') if state=='personal' else chip('Al día','done'))
 if state=='personal':left+=featured(post=post)+link(f'Ver mis {own} tareas abiertas','d12.html')
 if state=='team':left+=notice('Has terminado tus tareas. Hay trabajo abierto en tus comisiones.','success')+section_head('En tus comisiones')+featured(True)+link('Ver tareas de mis comisiones','d09.html')
 if state=='clear':left+=f'<div class="clear-state"><span class="clear-mark">{i("Check")}</span><h2>No hay tareas pendientes</h2><p>Todos los proyectos y comisiones del grupo están al día.</p><div class="clear-facts"><span><strong>50</strong> tareas terminadas</span><span><strong>8</strong> comisiones al día</span></div>{link("Ver tareas terminadas","d18.html")}</div>'
 right=project_summary(state=='clear',post) if role=='Coordinación' else section_head('Mis comisiones')+comm_rows(COMMS[:3],state=='clear',href='d09.html' if role=='Scouter' else 'd08.html')
 below=section_head('Necesitan atención',link('Ver alertas','d19.html'))+comm_rows(POST_COMMS[:3] if post else COMMS[:3]) if role=='Coordinación' and state!='clear' else ''
 return heading('Inicio',actions=actions)+f'<div class="home-columns"><section class="focus-column">{left}</section><aside class="context-column">{right}</aside></div>'+ (f'<section class="lower-section">{below}</section>' if below else '')
def commissions(count=6,clear=False,christmas=True):
 cs=(COMMS+[("Servicios","servicios",8,2,2,1),("Animación","animacion",6,3,1,0),("Material","material",7,2,1,1),("Logística","logistica",6,3,0,0)])[:count]
 return heading('Comisiones',actions=btn('Nueva comisión','primary','Plus','d35.html'))+'<div class="filter-row">'+btn('Todas','selected')+btn('Campamento de Navidad','plain')+btn('Proyecto anual 2026–2027','plain')+'</div>'+section_head('Campamento de Navidad',f'<span class="muted">{min(count,6)} comisiones</span>')+comm_rows(cs[:6],clear)+(section_head('Proyecto anual 2026–2027',f'<span class="muted">{count-6} comisiones</span>')+comm_rows(cs[6:],href="d73.html",christmas=False) if count>6 else '')
def people(scope='Grupo',invites=False,role='Coordinación'):
 rows=[('LM','Laura Martín','laura@example.test','Responsable'),('AM','Álex Martín','alex@example.test','Responsable' if role=='Responsable' else 'Scouter'),('CL','Carlos López','carlos@example.test','Scouter'),('NR','Nuria Fernández','nuria@example.test','Scouter')]
 head=heading('Personas',actions=btn('Invitar personas','primary','Plus','d29.html')) if scope=='Grupo' else commission_head()+tabs('Personas')
 s=head+(f'<div class="filter-row">{btn("Personas","selected")}{btn("Invitaciones","plain")}</div>' if scope=='Grupo' else '')+section_head('4 personas',f'<label class="search">{i("Search")}<input placeholder="Buscar persona…" aria-label="Buscar persona"></label>')
 s+='<div class="people-list">'
 for initials,name,email,role in rows:
  s+=f'<div class="person-row">{av(initials)}<span><strong>{name}</strong><small>{email}</small></span><span class="person-meta">{chip(role if scope!="Grupo" else ("Coordinación" if initials=="AM" else "Miembro"))}</span>{btn("Gestionar","plain",href="d40.html")}</div>'
 return s+'</div>'
def invite_list():
 s=heading('Personas',actions=btn('Invitar personas','primary','Plus','d29.html'))+f'<div class="filter-row">{btn("Personas","plain")}{btn("Invitaciones","selected")}</div>'
 for name,email,status,action in [('Ana García','ana@example.test','Pendiente','Reenviar'),('Miguel Santos','miguel@example.test','Aceptada','Ver persona'),('Pablo Ruiz','pablo@example.test','Caducada','Reenviar'),('Sofía Torres','sofia@example.test','Revocada','Invitar de nuevo')]:
  s+=f'<div class="person-row">{av(name[0]+name.split()[-1][0])}<span><strong>{name}</strong><small>{email}</small></span>{chip(status,"done" if status=="Aceptada" else "neutral")}<div class="actions">{btn(action,"secondary")}{btn("Revocar","plain") if status=="Pendiente" else ""}</div></div>'
 return s

def task_detail(state='blocked',readonly=False):
 status={'pending':'Pendiente','progress':'En curso','blocked':'Bloqueada','done':'Terminada'}[state]
 s=f'<aside class="task-drawer" aria-label="Detalle de tarea"><div class="drawer-head"><a class="back" href="d08.html">{i("ArrowLeft")}Servicios</a><a class="icon-button" href="d08.html" aria-label="Cerrar detalle">{i("X")}</a></div><h1>Confirmar turnos de servicios</h1><p class="muted">Campamento de Navidad · Servicios</p><div class="detail-facts"><div><span>Fecha límite</span><strong class="red">Hoy, 18:00 · Vencida</strong></div><div><span>Personas asignadas</span><span class="inline-person">{av("AM",True)}Álex Martín {av("CL",True)}Carlos López</span></div><div><span>Estado</span>{chip(status,{"pending":"neutral","progress":"progress","blocked":"blocked","done":"done"}[state])}</div></div>'
 if state=='blocked':s+=notice('Falta confirmar la disponibilidad de dos personas.','warning')
 if state=='done':
  s=s.replace('class="red"','class=""').replace(' · Vencida','')
  s+=notice('Completada por Álex Martín · Hoy, 19:01','success')
 s+='<section class="detail-section"><h2>Descripción</h2><p>Revisar los turnos de limpieza y servicios comunes. Confirmar que cada franja tiene dos personas asignadas.</p></section><section class="detail-section"><h2>Actividad</h2><div class="activity-item">'+av('LM',True)+'<div><strong>Laura Martín</strong><small>Ayer, 18:24</small><p>Ya están confirmados los turnos de mañana.</p></div></div></section>'
 s+=(field('Añadir comentario','','textarea')+btn('Comentar','secondary')) if not readonly else ''
 if readonly:s+=notice('Puedes consultar esta tarea. Solo las personas asignadas o responsables pueden cambiarla.')
 else:s+='<div class="drawer-actions">'+btn('Editar tarea','secondary',href='d14.html')+btn('Reabrir' if state=='done' else 'Completar','primary','Check','d53.html' if state!='done' else 'd13.html')+'</div><div class="drawer-secondary">'+btn('Marcar en curso','plain',href='d16.html')+btn('Bloquear','plain',href='d15.html')+btn('Eliminar','danger-link',href='d17.html')+'</div>'
 if readonly:
  s=s.replace(notice('Falta confirmar la disponibilidad de dos personas.','warning'),'')
  s=s.replace('Confirmar turnos de servicios','Comprobar botiquines').replace('Hoy, 18:00 · Vencida','Mañana, 12:00').replace('class="red"','class=""').replace('Bloqueada','Pendiente').replace('Falta confirmar la disponibilidad de dos personas.','La tarea está pendiente de realizar.').replace('Álex Martín','Laura Martín').replace(av('AM',True),av('LM',True)).replace('d08.html','d09.html').replace('Revisar los turnos de limpieza y servicios comunes. Confirmar que cada franja tiene dos personas asignadas.','Revisar el contenido de los botiquines y confirmar que el material está completo.')
 return s+'</aside>'

def modal(title,body,footer='',wide=False):return f'<div class="modal-overlay"><section class="modal {"wide" if wide else ""}" aria-label="{title}"><div class="modal-heading"><h1>{title}</h1><a class="icon-button" aria-label="Cerrar" href="d07.html">{i("X")}</a></div>{body}<div class="form-actions">{footer}</div></section></div>'
def invite(mode='single',scope='commission',error=False,result=False):
 target='Servicios · Campamento de Navidad' if scope=='commission' else 'Campamento de Navidad' if scope=='project' else 'Grupo scout'
 if result:return modal('Invitaciones enviadas',notice('3 invitaciones creadas y 1 correo omitido porque ya pertenece a la comisión.','success')+f'<div class="destination"><span>Destino</span><strong>{target}</strong></div><ul class="result-list"><li>ana@example.test {chip("Enviada","done")}</li><li>miguel@example.test {chip("Enviada","done")}</li><li>sofia@example.test {chip("Enviada","done")}</li><li>laura@example.test {chip("Ya es miembro")}</li></ul>',btn('Volver a la comisión','primary',href='d10.html'))
 body=f'<div class="destination"><span>Destino de la invitación</span><strong>{target}</strong></div><div class="segments">{btn("Un correo","selected" if mode=="single" else "plain",href="d29.html")}{btn("Lista de correos","selected" if mode=="list" else "plain",href="d30.html")}</div>'
 body+=field('Correos electrónicos' if mode=='list' else 'Correo electrónico','ana@example.test\nmiguel@example.test\nsofia@example.test' if mode=='list' else 'ana@' if error else 'ana@example.test','textarea' if mode=='list' else 'email','Un correo por línea. También puedes separarlos con comas. Máximo 100.' if mode=='list' else '', 'Comprueba el correo: falta el dominio completo.' if error else '')
 if scope=='commission':body+=field('Rol en esta comisión','Scouter','select')
 return modal('Invitar personas',body,btn('Cancelar','secondary',href='d10.html')+btn('Enviar invitaciones' if mode=='list' else 'Enviar invitación','primary',href='d33.html'))

def commission_form(step=1):
 steps='<ol class="steps">'+''.join(f'<li class="{"current" if n==step else "passed" if n<step else ""}"><span>{n}</span>{t}</li>' for n,t in [(1,'Datos'),(2,'Personas'),(3,'Crear')])+'</ol>'
 if step==1:body=field('Nombre de la comisión','Servicios')+field('Proyecto o campamento','Campamento de Navidad','select')+field('Descripción (opcional)','Organizar los servicios comunes del campamento.','textarea')
 elif step==2:
  body=notice('Elige al menos una persona Responsable.')+'<div class="member-pick">'+''.join(f'<label class="member-option"><input type="checkbox" checked>{av(n,True)}<span>{name}</span><select aria-label="Rol de {name}"><option>{role}</option></select></label>' for n,name,role in [('LM','Laura Martín','Responsable'),('AM','Álex Martín','Scouter'),('CL','Carlos López','Scouter')])+'</div>'
 else:body=f'<div class="review-commission">{cicon("Servicios")}<h2>Servicios</h2><p>Campamento de Navidad</p></div><dl class="summary-dl"><dt>Personas</dt><dd>3</dd><dt>Responsable</dt><dd>Laura Martín</dd><dt>Icono</dt><dd>Navidad · automático</dd></dl>'
 return modal('Nueva comisión',steps+body,btn('Cancelar' if step==1 else 'Volver','secondary',href='d07.html' if step==1 else f'd{34+step-1:02}.html')+btn('Crear comisión' if step==3 else 'Siguiente','primary',href='d08.html' if step==3 else f'd{35+step:02}.html'))

def profile(saved=False,error=False):
 checks=['Recibir avisos por correo','Al crear y asignarme una tarea','Cuando se actualice una tarea asignada']
 remaining=['Al vencer la tarea','Un recordatorio semanal mientras siga vencida','Resumen semanal de coordinación']
 body=heading('Mi perfil')+f'<div class="profile-layout"><section><h2>Datos personales</h2><div class="profile-photo">{av("AM")}<div><strong>Foto de perfil</strong><p>JPG, PNG, WebP o AVIF, hasta 30 MB.<br>Se recorta y comprime al guardar.</p>{btn("Cambiar foto","secondary","Camera","d46.html")}</div></div>{field("Nombre","Álex Martín")}<div class="readonly-field"><span>Correo de acceso</span><strong>alex@example.test</strong></div></section><section><h2>Avisos de tareas</h2><div class="check-list">'+''.join(f'<label><input type="checkbox" checked>{t}</label>' for t in checks)+'</div>'+field('Días antes del vencimiento','7, 3',hint='Separados por comas. Deja vacío para no recibir avisos previos.')+'<div class="check-list">'+''.join(f'<label><input type="checkbox" checked>{t}</label>' for t in remaining)+'</div></section></div>'
 body+=(notice('Perfil guardado.','success') if saved else notice('No se han guardado los cambios. Tu nombre y preferencias siguen aquí.','error',btn('Reintentar','secondary')) if error else '')+'<div class="profile-bottom">'+btn('Cerrar sesión','plain','LogOut','d58.html')+btn('Guardar perfil y avisos','primary',href='d47.html')+'</div>'
 return body
def project_list(kind='camp',empty_state=False):
 title='Campamentos' if kind=='camp' else 'Proyectos';action='Nuevo campamento' if kind=='camp' else 'Nuevo proyecto'
 s=heading(title,actions=btn(action,'primary','Plus','d42.html' if kind=='camp' else 'd41.html'))
 if empty_state:return s+empty('No hay campamentos' if kind=='camp' else 'No hay proyectos','Crea el primero para organizar sus comisiones y tareas.',btn(action,'primary','Plus','d42.html' if kind=='camp' else 'd41.html'),'Tent' if kind=='camp' else 'CalendarDays')
 s+='<div class="filter-row">'+btn('Activos','selected')+btn('Archivados','plain',href='d24.html')+'</div>'
 if kind=='camp':names=[('Campamento de Navidad','27–30 diciembre 2026',18,40,6),('Campamento de verano 2027','15–30 julio 2027',0,0,0)]
 else:names=[('Proyecto anual 2026–2027','Septiembre 2026–agosto 2027',7,10,2)]
 for name,dates,done,total,num in names:
  s+=f'<a class="project-item" href="{'d23.html' if kind=='camp' else 'd73.html'}"><span class="project-symbol">{i("Tent" if kind=="camp" else "CalendarDays")}</span><span class="project-item-name"><strong>{name}</strong><small>{dates}</small></span><span>{num} comisiones</span><span class="progress-wrap">{progress(done,total)}</span>{i("ChevronRight")}</a>'
 return s

def project_detail(tab='Resumen',archived=False,long=False):
 title='Campamento de Navidad · encuentro de invierno del grupo y preparación de la nueva ronda' if long else 'Campamento de Navidad'
 s='<a class="back" href="d21.html">'+i('ArrowLeft')+'Campamentos</a>'+heading(title,'27–30 diciembre 2026',btn('Restaurar campamento' if archived else 'Añadir personas','secondary','Users' if not archived else 'RefreshCw','d32.html')+btn('Nueva comisión','primary','Plus','d35.html') if not archived else btn('Restaurar campamento','primary'))
 if archived:s+=notice('Campamento archivado. Puedes consultar sus tareas e historial. Restaúralo para hacer cambios.')
 s+=tabs(tab,True)
 if tab=='Resumen':s+='<div class="project-overview"><span><strong>6</strong> comisiones</span><span><strong>22</strong> tareas abiertas</span><span class="red"><strong>4</strong> vencidas</span><span><strong>2</strong> bloqueos</span><span class="progress-wrap">'+progress(18,40)+'</span></div>'+section_head('Comisiones',link('Ver todas','d25.html'))+comm_rows()
 elif tab=='Tareas':s+=filters()+task_table()
 elif tab=='Personas':s+=people()[people().find('<div class="filter-row">'):]
 else:s+=comm_rows()
 return s

def shell(body,active='Inicio',role='Coordinación',alerts=7,overlay='',drawer='',auth=False):
 if auth:
  return f'<div class="public-auth"><header class="public-auth-header">{canopy()}<a class="public-brand" href="d58.html"><img src="../../../../public/brand-mark.webp" alt="" width="32" height="32"><span>Bandarlog</span></a></header><main>{body}</main>{overlay}</div>'
 nav=[('Inicio','House','d01'),('Mis tareas' if role!='Coordinación' else 'Tareas','ClipboardCheck','d12'),('Comisiones','Users','d07'),('Campamentos','Tent','d21'),('Proyectos','CalendarDays','d22'),('Personas','UserRound','d27'),('Alertas','Bell','d19')]
 sidebar=f'<aside class="sidebar"><a class="brand" href="d01.html"><img src="../../../../public/brand-mark.webp" alt="" width="32" height="32"><span>Bandarlog</span></a><nav aria-label="Principal">'+''.join(f'<a class="nav-item {"active" if label==active else ""}" href="{href}.html">{i(icon)}<span>{label}</span>{f"<span class=\"nav-count\">{alerts}</span>" if label=="Alertas" and alerts else ""}</a>' for label,icon,href in nav)+f'</nav><a class="nav-profile" href="d45.html">{av("AM")}<span><strong>Álex Martín</strong><small>{role}</small></span>{i("ChevronRight")}</a></aside>'
 header=f'<header class="topbar">{canopy()}<div class="header-content"><span class="header-context">Mi grupo scout<span class="header-divider">/</span><strong>{active}</strong></span><div class="header-actions"><span>28 octubre2026 · 19:00</span><a class="header-alert icon-button" href="d19.html" aria-label="Ver alertas">{i("Bell")}{"<b></b>" if alerts else ""}</a><a class="header-profile" href="d45.html" aria-label="Mi perfil">{av("AM",True)}</a></div></div></header>'
 return f'<div class="app-shell">{sidebar}<div class="workspace">{header}<main class="main">{body}</main></div>{overlay}{drawer}</div>'

SCENES=[]
def add(id,title,family,body,active='Inicio',role='Coordinación',states=None,overlay='',drawer='',alerts=7):
 SCENES.append({'id':id,'title':title,'family':family,'states':states or [title],'role':role,'file':f'screens/{id.lower()}.html'})
 if role=='Scouter':
  body=body.replace('href="d08.html"','href="d09.html"')
 document=f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{id} · {title} · Bandarlog</title><link rel="stylesheet" href="../desktop.css"></head><body>{shell(body,active,role,alerts,overlay,drawer,auth=family=='Acceso')}</body></html>'
 (ROOT/'screens'/f'{id.lower()}.html').write_text(document)

add('D01','Inicio · Coordinación','Inicio',home())
add('D02','Inicio · Scouter','Inicio',home('Scouter'),role='Scouter')
add('D03','Inicio · Responsable','Inicio',home('Responsable'),role='Responsable')
add('D04','Mis tareas al día · equipo activo','Inicio',home('Scouter','team'),role='Scouter')
add('D05','Todo al día','Inicio',home('Coordinación','clear'),alerts=0)
add('D06','Primera instalación sin datos','Inicio',home(state='empty'),alerts=0)
add('D07','Comisiones · agrupación por contexto','Comisiones',commissions(),active='Comisiones')
add('D08','Comisión · Responsable','Comisión',commission_head()+tabs()+filters()+task_table(SERVICES[:6],False),active='Comisiones',role='Responsable')
add('D09','Comisión · Scouter','Comisión',commission_head('Scouter')+tabs()+filters()+task_table(SERVICES[:6],False),active='Comisiones',role='Scouter')
add('D10','Personas de la comisión','Comisión',people('Servicios',role='Responsable'),active='Comisiones',role='Responsable')
add('D11','Actividad de la comisión','Comisión',commission_head()+tabs('Actividad')+section_head('Actividad reciente')+'<div class="activity-feed"><div class="activity-item">'+av('LM')+'<div><strong>Laura Martín cambió una fecha</strong><small>Hoy, 09:30</small><p>Confirmar turnos de servicios · nueva fecha 28 octubre, 18:00.</p></div></div><div class="activity-item">'+av('AM')+'<div><strong>Álex Martín completó una tarea</strong><small>Ayer, 18:00</small><p>Revisar zonas comunes.</p></div></div></div>',active='Comisiones')
add('D12','Listado de tareas','Tareas',heading('Tareas',actions=btn('Nueva tarea','primary','Plus','d34.html'))+filters()+task_table(),active='Tareas')
add('D13','Detalle de tarea asignada','Tarea',commission_head()+tabs()+filters()+task_table(SERVICES[:6],False),active='Comisiones',drawer=task_detail())
add('D14','Editar tarea','Tarea',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('Editar tarea',field('Nombre','Confirmar turnos de servicios')+'<div class="form-two">'+field('Fecha límite','2026-10-28','date')+field('Hora','18:00','time')+'</div>'+field('Descripción','Revisar los turnos de limpieza y servicios comunes.','textarea')+field('Personas asignadas','Álex Martín, Carlos López','select'),btn('Cancelar','secondary',href='d13.html')+btn('Guardar cambios','primary',href='d13.html')))
add('D15','Bloquear · motivo obligatorio','Tarea',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('Bloquear tarea','<p>Confirmar turnos de servicios</p>'+field('Motivo del bloqueo','Falta confirmar la disponibilidad de dos personas.','textarea'),btn('Cancelar','secondary',href='d13.html')+btn('Guardar bloqueo','primary',href='d16.html')))
add('D16','Tarea bloqueada','Tarea',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',drawer=task_detail('blocked'))
add('D17','Eliminar · confirmación','Tarea',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('Eliminar tarea','<p>¿Quieres eliminar <strong>Confirmar turnos de servicios</strong>?</p><p>Se retirará de las tareas y los avisos. Su historial se conserva.</p>',btn('Cancelar','secondary',href='d13.html')+btn('Eliminar tarea','danger',href='d08.html')))
add('D18','Terminada · reabrir','Tarea',heading('Tareas terminadas')+filters('Terminadas')+task_table(DONE_TASKS),active='Tareas',drawer=task_detail('done'))
add('D19','Alertas con incidencias','Tareas',heading('Alertas')+notice('5 tareas vencidas y3 bloqueadas. Una tarea está en ambos estados.','warning')+filters()+task_table(ALERTS),active='Alertas')
add('D20','Sin resultados de búsqueda','Tareas',heading('Tareas')+filters(search='proveedor de cuerdas')+empty('No hay resultados','Prueba otro nombre o elimina algún filtro.',btn('Limpiar filtros','secondary',href='d12.html'),'Search'),active='Tareas')
add('D21','Campamentos activos','Proyectos',project_list(),active='Campamentos')
add('D22','Proyectos activos','Proyectos',project_list('project'),active='Proyectos')
add('D23','Resumen de campamento','Proyectos',project_detail(),active='Campamentos')
add('D24','Campamento archivado','Proyectos',project_detail(archived=True),active='Campamentos')
add('D25','Tareas del campamento','Proyectos',project_detail('Tareas'),active='Campamentos')
add('D26','Personas del campamento','Proyectos',project_detail('Personas'),active='Campamentos')
add('D27','Directorio de personas','Personas',people(),active='Personas')
add('D28','Estados de invitaciones','Personas',invite_list(),active='Personas')
add('D29','Invitar un correo · comisión fija','Invitaciones',people('Servicios'),active='Comisiones',overlay=invite())
add('D30','Invitar lista · comisión fija','Invitaciones',people('Servicios'),active='Comisiones',overlay=invite('list'))
add('D31','Invitación · validación recuperable','Invitaciones',people('Servicios'),active='Comisiones',overlay=invite(error=True))
add('D32','Invitar desde campamento · destino fijo','Invitaciones',project_detail('Personas'),active='Campamentos',overlay=invite('list','project'))
add('D33','Invitaciones · resultado y duplicados','Invitaciones',people('Servicios'),active='Comisiones',overlay=invite(result=True))
add('D34','Nueva tarea','Formularios',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('Nueva tarea',field('Nombre de la tarea','Revisar zonas comunes')+field('Comisión','Servicios · Campamento de Navidad','select')+'<div class="form-two">'+field('Fecha límite','2026-10-30','date')+field('Hora','18:00','time')+'</div>'+field('Personas asignadas','Álex Martín','select')+field('Descripción (opcional)','','textarea'),btn('Cancelar','secondary',href='d08.html')+btn('Crear tarea','primary',href='d08.html')))
for n in range(1,4):add(f'D{34+n:02}',f'Nueva comisión · paso{n}','Formularios',commissions(),active='Comisiones',overlay=commission_form(n))
add('D38','Guardar · error conserva datos','Formularios',commissions(),active='Comisiones',overlay=modal('Nueva comisión',notice('No se pudo guardar. Comprueba tu conexión y vuelve a intentarlo.','error')+field('Nombre de la comisión','Servicios')+field('Proyecto o campamento','Campamento de Navidad','select')+field('Descripción (opcional)','Organizar los servicios comunes.','textarea'),btn('Cancelar','secondary',href='d07.html')+btn('Reintentar','primary')))
add('D39','Añadir personas · directorio','Formularios',people('Servicios'),active='Comisiones',overlay=modal('Añadir personas','<div class="destination"><span>Comisión</span><strong>Servicios · Campamento de Navidad</strong></div>'+field('Buscar persona','','search')+'<div class="member-pick">'+''.join(f'<label class="member-option"><input type="checkbox" checked>{av(n,True)}<span>{name}</span><select aria-label="Rol de {name}"><option>Scouter</option></select></label>' for n,name in [('NR','Nuria Fernández'),('MG','Miguel Santos')])+'</div>'+link('Invitar por correo','d29.html'),btn('Cancelar','secondary',href='d10.html')+btn('Añadir 2 personas','primary',href='d10.html')))
add('D40','Gestionar rol de comisión','Formularios',people('Servicios'),active='Comisiones',overlay=modal('Laura Martín','<p>Servicios · Campamento de Navidad</p>'+field('Rol en la comisión','Responsable','select')+notice('Este rol se aplica solo a Servicios. No cambia permisos en otros proyectos.'),btn('Quitar de la comisión','danger-link')+btn('Cancelar','secondary',href='d10.html')+btn('Guardar rol','primary',href='d10.html')))
add('D41','Nuevo proyecto','Formularios',project_list('project'),active='Proyectos',overlay=modal('Nuevo proyecto',field('Nombre del proyecto','Proyecto anual 2027–2028')+'<div class="form-two">'+field('Fecha de inicio','2027-09-01','date')+field('Fecha de fin','2028-08-31','date')+'</div>',btn('Cancelar','secondary',href='d22.html')+btn('Crear proyecto','primary',href='d22.html')))
add('D42','Nuevo campamento · Navidad automática','Formularios',project_list(),active='Campamentos',overlay=modal('Nuevo campamento',field('Nombre del campamento','Campamento de Navidad')+field('Proyecto','Proyecto anual 2026–2027','select')+'<div class="form-two">'+field('Fecha de inicio','2026-12-27','date')+field('Fecha de fin','2026-12-30','date')+'</div>'+notice('La colección de Navidad se aplicará automáticamente a sus comisiones.'),btn('Cancelar','secondary',href='d21.html')+btn('Crear campamento','primary',href='d23.html')))
add('D43','Icono editable · comisión sin asociación','Formularios',commissions(),active='Comisiones',overlay=modal('Elegir icono','<div class="destination"><span>Comisión sin asociación automática</span><strong>Equipo de acogida · Proyecto anual 2026–2027</strong></div>'+field('Buscar icono','acampada','search')+'<div class="icon-options">'+''.join(f'<button class="icon-option {"selected" if k==1 else ""}" aria-label="Icono de acampada{ k}"><img src="../../../../public/artwork/icons/naturaleza-{k:02}.svg" alt=""></button>' for k in range(1,7))+'</div>'+link('Añadir icono al catálogo','d44.html'),btn('Cancelar','secondary',href='d07.html')+btn('Guardar icono','primary',href='d07.html')))
add('D44','Ampliar catálogo de iconos','Formularios',commissions(),active='Comisiones',overlay=modal('Añadir icono al catálogo',field('Nombre del icono','Acampada nocturna')+field('Colección','General','select')+'<label class="field"><span>Archivo del icono</span><input type="file" accept="image/svg+xml,image/png,image/webp"></label><p class="muted">El icono podrá elegirse en comisiones sin una asociación automática.</p>',btn('Cancelar','secondary',href='d43.html')+btn('Añadir icono','primary',href='d43.html')))
add('D45','Perfil y avisos','Perfil',profile(),active='Mi perfil')
add('D46','Foto · recorte circular y cancelar','Perfil',profile(),active='Mi perfil',overlay=modal('Ajustar foto','<div class="crop-preview"><img src="../../../../public/brand-mark.png" alt="Imagen 2D de ejemplo para el recorte"><span class="crop-circle"></span></div><p class="muted">Arrastra la foto para elegir el encuadre.</p><label class="field"><span>Zoom</span><input type="range" min="1" max="3" value="1.3"></label>',btn('Cancelar recorte','secondary',href='d45.html')+btn('Usar foto','primary',href='d45.html')))
add('D47','Perfil guardado','Perfil',profile(saved=True),active='Mi perfil')
add('D48','Perfil · error recuperable','Perfil',profile(error=True),active='Mi perfil')
add('D49','Lectura de foto fallida','Perfil',profile()+notice('No se pudo leer la foto. Prueba otra imagen JPG, PNG o WebP.','error',btn('Elegir otra foto','secondary','Camera','d46.html')),active='Mi perfil')
add('D50','Carga de aplicación · banana','Global',f'<div class="global-status">{banana("Cargando tus comisiones…")}</div>',alerts=0)
add('D51','Fallo de conexión · reintentar','Global',empty('No se pudo cargar Bandarlog','Comprueba tu conexión. No se ha cerrado tu sesión.',btn('Reintentar','primary','RefreshCw','d01.html'),'AlertCircle'),alerts=0)
add('D52','Guardando · sin éxito anticipado','Global',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('Guardar tarea',banana('Guardando cambios…')+'<p class="muted">Espera a que termine el guardado antes de cerrar.</p>','<button disabled class="primary">Guardando…</button>'))
add('D53','Completada · celebración 2D y Deshacer','Global',home(post=True),alerts=6,overlay='<div class="celebration"><img src="../../../../public/monkey-vine-2d.webp" alt="Mono 2D en una liana"><div class="saved-toast" role="status">'+i('Check')+'<strong>Tarea completada</strong>'+btn('Deshacer','toast-action',href='d13.html')+'</div></div>')
add('D54','Completada · movimiento reducido conserva cruce','Global',home(post=True),alerts=6,overlay='<div class="celebration reduced"><img src="../../../../public/monkey-vine-2d.webp" alt="Mono 2D cruzando en liana, sin giro ni balanceo adicional"></div><div class="saved-toast" role="status">'+i('Check')+'<strong>Tarea completada</strong>'+btn('Deshacer','toast-action',href='d13.html')+'</div>')
add('D55','Conflicto de cambios · recuperar','Global',commission_head()+tabs()+task_table(SERVICES[:6],False),active='Comisiones',overlay=modal('La tarea ha cambiado',notice('Otra persona ha actualizado esta tarea. Tus cambios todavía no se han guardado.','warning')+'<p>Consulta la versión actual antes de volver a editar.</p>',btn('Cancelar','secondary',href='d08.html')+btn('Ver versión actual','primary',href='d13.html')))
add('D56','Comisiones sin datos','Vacíos',heading('Comisiones',actions=btn('Nueva comisión','primary','Plus','d35.html'))+empty('Todavía no hay comisiones','Crea una comisión y elige quién se encargará de sus tareas.',btn('Nueva comisión','primary','Plus','d35.html'),'Users'),active='Comisiones',alerts=0)
add('D57','Campamentos sin datos','Vacíos',project_list(empty_state=True),active='Campamentos',alerts=0)
add('D58','Acceso por código','Acceso', '<div class="auth-wrap"><h1>Entrar en Bandarlog</h1><p>Recibe un código en tu correo para acceder al grupo.</p>'+field('Tu correo electrónico','ana@example.test','email')+btn('Recibir código','primary','Mail','d59.html')+'</div>',alerts=0)
add('D59','Código · error, reenvío y recuperación','Acceso','<div class="auth-wrap"><h1>Revisa tu correo</h1><p>Introduce el código enviado a <strong>ana@example.test</strong>.</p>'+field('Código de acceso','128349',error='El código no es válido. Compruébalo e inténtalo de nuevo.')+btn('Entrar','primary',href='d60.html')+'<div class="auth-links">'+btn('Cambiar correo','plain',href='d58.html')+'<button class="plain" disabled>Reenviar en 42 s</button></div></div>',alerts=0)
add('D60','Primer acceso · nombre obligatorio y foto opcional','Acceso','<div class="auth-wrap"><h1>¿Cómo te llamamos?</h1>'+field('Nombre','',error='Escribe tu nombre para continuar.')+'<div class="onboard-photo">'+i('Camera')+'<strong>Foto de perfil</strong><span class="muted">Opcional</span>'+btn('Añadir foto','secondary','Camera','d46.html')+'</div>'+btn('Continuar','primary',href='d01.html')+btn('Continuar sin foto','plain',href='d01.html')+'</div>',alerts=0)
add('D61','Comisiones · una sola','Comisiones',commissions(1),active='Comisiones')
add('D62','Comisiones · diez en dos contextos','Comisiones',commissions(10),active='Comisiones')
add('D63','Comisión sin tareas','Vacíos',commission_head(empty_state=True)+tabs()+empty('Aún no hay tareas en Servicios','Añade la primera tarea y asigna a las personas que la harán.',btn('Nueva tarea','primary','Plus','d34.html'),'ClipboardCheck'),active='Comisiones',alerts=0)
add('D64','Comisión completamente al día','Vacíos',commission_head(clear=True)+tabs()+filters('Terminadas')+notice('Todas las tareas de Servicios están terminadas.','success')+task_table([(t[0],t[1],t[2],'Terminada','done',*t[5:]) for t in SERVICES],False),active='Comisiones',alerts=0)
add('D65','Tarea de otra persona · solo lectura','Tarea',commission_head('Scouter')+tabs()+task_table(SERVICES[:6],False),active='Comisiones',role='Scouter',drawer=task_detail(readonly=True))
add('D66','Campamento con nombre largo','Proyectos',project_detail(long=True),active='Campamentos')
add('D67','Proyectos sin datos','Vacíos',project_list('project',True),active='Proyectos',alerts=0)
add('D68','Actividad sin entradas','Vacíos',commission_head()+tabs('Actividad')+empty('Sin actividad todavía','Los cambios de tareas y personas aparecerán aquí.','', 'FileText'),active='Comisiones')
add('D69','Invitar al grupo','Invitaciones',people(),active='Personas',overlay=invite(scope='group'))
add('D70','Tareas sin datos','Vacíos',heading('Mis tareas')+filters()+empty('No tienes tareas asignadas','Puedes consultar las tareas de tus comisiones.',btn('Ver mis comisiones','secondary','Users','d07.html'),'ClipboardCheck'),active='Mis tareas',role='Scouter',alerts=0)
add('D71','Alertas al día','Vacíos',heading('Alertas')+empty('Sin alertas','No hay tareas vencidas ni bloqueadas en tu ámbito.',btn('Ver tareas','secondary','ClipboardCheck','d12.html'),'CircleCheck'),active='Alertas',alerts=0)
add('D72','Comisiones al día · lista','Comisiones',commissions(clear=True),active='Comisiones',alerts=0)

add('D73','Proyecto anual · contexto independiente','Proyectos',heading('Proyecto anual 2026–2027','Septiembre 2026–agosto 2027',btn('Nueva comisión','primary','Plus','d35.html'))+'<div class="project-overview"><span><strong>2</strong> comisiones</span><span><strong>3</strong> tareas abiertas</span><span class="red"><strong>1</strong> vencida</span><span><strong>1</strong> bloqueo</span><span class="progress-wrap">'+progress(7,10)+'</span></div>'+section_head('Comisiones')+comm_rows([('Logística','logistica',6,4,1,1),('Comunicación','servicios',4,3,0,0)],href='d73.html',christmas=False),active='Proyectos')

(ROOT/'scenes.json').write_text(json.dumps(SCENES,ensure_ascii=False,indent=2)+'\n')
# The board is a static index, not app navigation. Each scene is an independent inspectable artifact.
groups={}
for scene in SCENES:groups.setdefault(scene['family'],[]).append(scene)
board='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bandarlog · propuesta desktop</title><link rel="stylesheet" href="desktop.css"></head><body class="board"><header><img src="../../../public/brand-mark.webp" alt="" width="36" height="36"><h1>Forest Experience · Desktop</h1><p>Propuesta visual estática · datos ficticios · no modifica la aplicación</p><p>Inicio → tareas → comisión → personas y contexto. Revisión de 73 estados a1440×900 y1280×800; otros anchos se miden por separado. Los controles representan estados visuales; no envían ni guardan datos.</p></header><main>'
for group,items in groups.items():
 board+=f'<section class="board-group"><h2>{group}</h2><div class="board-grid">'
 for scene in items:
  board+=f'<article><a href="{scene["file"]}"><strong>{scene["id"]} · {scene["title"]}</strong></a><p>{scene["role"]} · propuesta, no aplicación</p><div class="preview"><iframe title="{scene["title"]}" src="{scene["file"]}" loading="lazy"></iframe></div></article>'
 board+='</div></section>'
board+='</main><footer>Los tiempos de la liana proceden del CSS vigente; las imágenes estáticas no prueban movimiento, permisos, red, guardado ni tecnologías de apoyo.</footer></body></html>'
(ROOT/'index.html').write_text(board)
manifest={'renderer':'Codex','status':'correction-round1-awaiting-independent-review','sceneCount':len(SCENES),'assets':[{'id':'BRAND2D','source':'public/brand-mark.webp','target':'sidebar','type':'official existing asset'},{'id':'CANOPY','source':'src/ForestHeader.tsx exact two path geometry','target':'desktop header','type':'same approved mobile geometry, layout adapted'},{'id':'FONT','source':'@fontsource/nunito-sans Latin400/600/800','target':'all text','type':'WOFF2 copied locally'},{'id':'ICONS','source':'docs/forest-experience/codex/assets/icons.json, lucide-react ISC','target':'interface controls','type':'inline SVG'},{'id':'CHRISTMAS','source':'public/artwork/icons/navidad-{servicios,animacion,material,menu,logistica,lugar}.svg','target':'commissions in Campamento de Navidad','type':'existing catalogue, names remain normal'},{'id':'GENERAL','source':'public/artwork/icons/*.svg','target':'icon catalogue expansion example','type':'existing catalogue'},{'id':'VINE2D','source':'public/monkey-vine-2d.webp','target':'D53/D54 crossing retained; D54 no secondary rotation','type':'existing approved2D completion asset'},{'id':'CROP2D','source':'public/brand-mark.png','target':'D46 synthetic crop example only','type':'existing2D brand reference, not invented user photo'},{'id':'BANANA','source':'src/BananaLoader.tsx shape and colors','target':'D50/D52','type':'static frame of existing user-required loader'}],'prohibited':'No3Dresource appears in proposal','runtimeProof':'No APIs, app logic or data writes. No runtime compliance or motion timing validation from static frames.'}
(ROOT/'assets-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(ROOT/'dataset.json').write_text(json.dumps({'fictional':True,'asOf':'2026-10-28T19:00:00+01:00 Europe/Madrid','winterCamp':{'name':'Campamento de Navidad','total':40,'done':18,'open':22,'overdue':4,'blocked':2,'commissions':[{'name':n,'total':t,'done':d,'open':t-d,'overdue':o,'blocked':b} for n,k,t,d,o,b in COMMS]},'annualProject':{'total':10,'done':7,'open':3,'overdue':1,'blocked':1},'global':{'total':50,'done':25,'open':25,'overdue':5,'blocked':3},'personal':{'open':7,'featured':3,'tasks':[t[0] for t in TASKS]},'postCompletion':{'task':'Confirmar turnos de servicios','personalOpen':6,'services':{'total':8,'done':3,'open':5,'overdue':1,'blocked':0},'camp':{'total':40,'done':19,'open':21,'overdue':3,'blocked':1},'global':{'total':50,'done':26,'open':24,'overdue':4,'blocked':2}},'allClear':{'total':50,'done':50,'open':0,'commissions':8},'stressVariantD62':{'winterCommissions':6,'winterTotal':40,'winterDone':18,'annualCommissions':4,'annualTotal':27,'annualDone':10,'independentOfBaseAnnual':True},'variants':'All-clear scenes represent a later end state. Empty/initial scenes are independent fixtures, not simultaneous with active dataset.'},ensure_ascii=False,indent=2)+'\n')
print('Generated',len(SCENES),'static scenes')
