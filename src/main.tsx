import React, { useState, useEffect, useRef } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { MobileHome, MobileTasks, ProjectIdentity, CampOverview, TaskSummary } from './MobileUX';
import { MascotArt, ArtworkPicker } from './Artwork';
import { artworkThemes, inferArtworkTheme } from '../shared/scout-catalog';
import { createRoot } from 'react-dom/client';
import {
  Home,
  ClipboardCheck,
  Users,
  UserRound,
  Bell,
  Settings,
  Tent,
  Flag,
  Plus,
  Search,
  ChevronRight,
  ArrowLeft,
  Check,
  Clock,
  AlertCircle,
  LockKeyhole,
  Mail,
  LogOut,
  ChefHat,
  Megaphone,
  Drama,
  Wrench,
  Heart,
  LayoutDashboard,
  CalendarDays,
  MessageCircle,
  X,
  Menu,
  CheckCheck,
  Send,
  ArrowRight,
  Download,
  Archive,
  FileText,
  Leaf,
  MoreHorizontal,
} from 'lucide-react';
import { api, setCSRF } from './api';
import {
  type Data,
  type Task,
  type User,
  type Commission,
  labels,
  overdue,
  progress,
  date,
} from './types';
import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/nunito-sans/latin-600.css';
import '@fontsource/nunito-sans/latin-700.css';
import '@fontsource/nunito-sans/latin-800.css';
import '@fontsource/nunito-sans/latin-900.css';
import './styles.css';
import { ProfileForm } from './ProfileForm';
import { BananaLoader } from './BananaLoader';
import { Select } from './Select';
const initial: Data = {
  artworkEnabled: false,
  users: [],
  projects: [],
  commissions: [],
  tasks: [],
  members: [],
  projectMembers: [],
  assignments: [],
  activity: [],
  invitations: [],
};
const icons: Record<string, typeof Tent> = {
  chef: ChefHat,
  tent: Tent,
  megaphone: Megaphone,
  drama: Drama,
  tools: Wrench,
  heart: Heart,
};
function CIcon({ c }: { c: Commission }) {
  const Icon = icons[c.icon] || Tent;
  return (
    <span className={`commission-icon ${c.icon}`}>
      {c.iconUrl ? <img className="generated-icon" src={c.iconUrl} alt="" /> : <Icon size={28} />}
    </span>
  );
}
function Avatar({ user, small = false }: { user?: User; small?: boolean }) {
  return (
    <span
      className={`avatar ${small ? 'small' : ''}`}
      title={user?.name}
      style={{
        background: ['#e6d5bd', '#d9e5d8', '#ecdcce', '#d8dfe9'][
          (user?.name.charCodeAt(0) || 0) % 4
        ],
      }}
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} />
      ) : (
        user?.name
          .split(' ')
          .map((x) => x[0])
          .slice(0, 2)
          .join('') || '?'
      )}
    </span>
  );
}
function Badge({ task }: { task: Task }) {
  return <span className={`badge ${task.status}`}>{labels[task.status]}</span>;
}
function App() {
  const [me, setMe] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [data, setData] = useState<Data>(initial),
    [view, setView] = useState('home'),
    [project, setProject] = useState(''),
    [commission, setCommission] = useState(''),
    [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [assignee, setAssignee] = useState(''),
    [deadline, setDeadline] = useState(''),
    [tab, setTab] = useState('tasks'),
    [modal, setModal] = useState(''),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [development, setDevelopment] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [pendingAction, setPendingAction] = useState(''),
    [celebrating, setCelebrating] = useState(false),
    [satisfaction, setSatisfaction] = useState(false),
    [pendingTasks, setPendingTasks] = useState(new Set<string>()),
    [undo, setUndo] = useState<{ task: Task; expected: string; last: boolean } | null>(null),
    [emailInput, setEmailInput] = useState(''),
    [sent, setSent] = useState(false),
    [outbox, setOutbox] = useState<any[]>([]);
  const dataRef = useRef(data),
    loadSequence = useRef(0),
    operations = useRef(0),
    taskLocks = useRef(new Set<string>());
  const detailScroll = useRef({ x: 0, y: 0 });
  const lastAnnounced = useRef(false);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const satisfactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      if (satisfactionTimer.current) clearTimeout(satisfactionTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(location.search);
      setSelected(params.get('task') || '');
      setPendingAction(params.get('action') || '');
      if (!params.get('task'))
        requestAnimationFrame(() =>
          window.scrollTo(detailScroll.current.x, detailScroll.current.y),
        );
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const params = new URLSearchParams(location.search);
  const [loginToken, setLoginToken] = useState(params.get('token') || '');
  const manage = me?.role === 'admin' || me?.role === 'coordination';
  const canManage = (cid: string) =>
    manage ||
    data.members.some(
      (m) => m.commissionId === cid && m.userId === me?.id && m.role === 'responsible',
    );
  const load = async () => {
    const sequence = ++loadSequence.current;
    const next = await api('/data');
    if (sequence === loadSequence.current) {
      dataRef.current = next;
      setData(next);
    }
    return dataRef.current;
  };
  const bootup = async () => {
    try {
      const health = await api('/health');
      setDevelopment(health.mail === 'development');
      const session = await api('/me');
      setCSRF(session.csrf);
      setMe(session.user);
      setDevelopment(session.development);
      await load();
      const p = new URLSearchParams(location.search);
      if (p.get('task')) {
        setSelected(p.get('task')!);
        setPendingAction(p.get('action') || '');
      }
      if (p.get('project')) {
        setProject(p.get('project')!);
        setView('project');
      }
      if (p.get('commission')) {
        setCommission(p.get('commission')!);
        setView('commission');
      }
      if (p.get('view')) setView(p.get('view')!);
    } catch {
    } finally {
      setBoot(false);
    }
  };
  useEffect(() => {
    void bootup();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (modal || selected) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setModal('');
          closeTask();
        }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [modal, selected]);
  async function run(fn: () => Promise<void>, message = 'Cambios guardados') {
    setError('');
    operations.current++;
    setBusy(true);
    try {
      await fn();
      await load();
      setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      operations.current--;
      setBusy(operations.current > 0);
    }
  }
  const navigate = (v: string, p = '', c = '') => {
    setView(v);
    setProject(p);
    setCommission(c);
    setQuery('');
    setFilter('all');
    setTab('tasks');
    setAssignee('');
    setDeadline('');
    setSidebar(false);
    const route = new URL(location.href);
    route.search = '';
    if (v !== 'home') route.searchParams.set('view', v);
    if (p) route.searchParams.set('project', p);
    if (c) route.searchParams.set('commission', c);
    history.replaceState({}, '', route);
  };
  const cOf = (t: Task) => data.commissions.find((c) => c.id === t.commissionId)!;
  const pOf = (c: Commission) => data.projects.find((p) => p.id === c.projectId);
  const usersOf = (t: Task) =>
    data.assignments
      .filter((a) => a.taskId === t.id)
      .map((a) => data.users.find((u) => u.id === a.userId)!);
  const myTasks = data.tasks.filter((t) =>
    data.assignments.some((a) => a.taskId === t.id && a.userId === me?.id),
  );
  let scoped = data.tasks.filter(
    (t) =>
      (!project || cOf(t)?.projectId === project) && (!commission || t.commissionId === commission),
  );
  if (view === 'tasks' && !manage) scoped = scoped.filter((t) => myTasks.includes(t));
  if (view === 'alerts')
    scoped = scoped.filter(
      (t) =>
        overdue(t) ||
        t.status === 'blocked' ||
        (t.status !== 'done' && new Date(t.due).getTime() < Date.now() + 86400000),
    );
  const shown = scoped
    .filter(
      (t) =>
        (filter === 'all' || (filter === 'overdue' ? overdue(t) : t.status === filter)) &&
        (!assignee || usersOf(t).some((u) => u.id === assignee)) &&
        (!deadline || new Date(t.due).getTime() < Date.now() + Number(deadline) * 86400000) &&
        (!query || `${t.title} ${cOf(t)?.name}`.toLowerCase().includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        new Date(a.due).getTime() - new Date(b.due).getTime(),
    );
  const activeProject = data.projects.find((p) => p.id === project),
    activeCommission = data.commissions.find((c) => c.id === commission),
    detail = data.tasks.find((t) => t.id === selected);
  function closeTask() {
    setSelected('');
    setPendingAction('');
    if (history.state?.bandarlogTask) history.back();
    else {
      const route = new URL(location.href);
      route.searchParams.delete('task');
      route.searchParams.delete('action');
      history.replaceState({}, '', route);
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.scrollTo(detailScroll.current.x, detailScroll.current.y)),
    );
  }
  const openTask = (t: Task) => {
    detailScroll.current = { x: window.scrollX, y: window.scrollY };
    setSelected(t.id);
    setPendingAction('');
    setError('');
    const route = new URL(location.href);
    route.searchParams.set('task', t.id);
    history.pushState({ bandarlogTask: true }, '', route);
  };
  const taskStatus = async (task: Task, status: string, blockedReason?: string) => {
    const t = dataRef.current.tasks.find((item) => item.id === task.id) || task;
    if (taskLocks.current.has(t.id) || (t.status === status && status === 'done')) return;
    taskLocks.current.add(t.id);
    setPendingTasks(new Set(taskLocks.current));
    const assigned = new Set(
      dataRef.current.assignments.filter((a) => a.userId === me?.id).map((a) => a.taskId),
    );
    const personalWasOpen = dataRef.current.tasks.some(
      (item) => assigned.has(item.id) && item.status !== 'done',
    );
    if (personalWasOpen) lastAnnounced.current = false;
    const scroll = { x: window.scrollX, y: window.scrollY };
    let saved: Task | undefined;
    try {
      const ok = await run(
        async () => {
          const result = await api(`/tasks/${t.id}`, 'PATCH', {
            status,
            blockedReason,
            expectedUpdatedAt: t.updatedAt,
          });
          saved = result.task;
        },
        status === 'done' ? '' : 'Estado actualizado',
      );
      if (!ok) return;
      setPendingAction('');
      if (status !== 'done') setUndo((current) => (current?.task.id === t.id ? null : current));
      if (status === 'done' && saved) {
        const personalOpen = dataRef.current.tasks.some(
          (item) => assigned.has(item.id) && item.status !== 'done',
        );
        const last =
          assigned.has(t.id) && personalWasOpen && !personalOpen && !lastAnnounced.current;
        if (last) {
          lastAnnounced.current = true;
          setSatisfaction(true);
          if (satisfactionTimer.current) clearTimeout(satisfactionTimer.current);
          satisfactionTimer.current = setTimeout(() => setSatisfaction(false), 2600);
        }
        setUndo({ task: t, expected: saved.updatedAt, last });
        if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
        setCelebrating(true);
        celebrationTimer.current = setTimeout(() => setCelebrating(false), 2500);
      }
      requestAnimationFrame(() => window.scrollTo(scroll.x, scroll.y));
    } finally {
      taskLocks.current.delete(t.id);
      setPendingTasks(new Set(taskLocks.current));
    }
  };
  const undoCompletion = async () => {
    if (!undo || busy) return;
    if (
      await run(async () => {
        await api(`/tasks/${undo.task.id}`, 'PATCH', {
          status: undo.task.status,
          blockedReason: undo.task.blockedReason || undefined,
          expectedUpdatedAt: undo.expected,
        });
      }, 'Tarea restaurada')
    ) {
      setUndo(null);
      setSatisfaction(false);
      setCelebrating(false);
      lastAnnounced.current = false;
      if (satisfactionTimer.current) clearTimeout(satisfactionTimer.current);
    }
  };
  const metric = (ts: Task[], status: string) =>
    status === 'overdue' ? ts.filter(overdue).length : ts.filter((t) => t.status === status).length;
  const metricCards = (ts: Task[]) => (
    <div className="metrics">
      {['pending', 'in_progress', 'blocked', 'overdue', 'done'].map((status, i) => {
        const Icon = [ClipboardCheck, FileText, LockKeyhole, AlertCircle, CheckCheck][i];
        return (
          <button
            key={status}
            className={`metric ${status} ${metric(ts, status) === 0 ? 'zero' : ''}`}
            onClick={() => {
              setFilter(status);
              if (view === 'commission') setTab('tasks');
              if (view === 'home') setView('tasks');
            }}
          >
            <span className="metric-icon">
              <Icon size={22} />
            </span>
            <span>
              <strong>
                <AnimatedCounter value={metric(ts, status)} />
              </strong>
              <small>{['Pendientes', 'En curso', 'Bloqueadas', 'Vencidas', 'Terminadas'][i]}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
  const bar = (ts: Task[]) => (
    <div className="progress-wrap">
      <div className="progress">
        <i style={{ width: `${progress(ts)}%` }} />
      </div>
      <small>
        {ts.length ? (
          <>
            <AnimatedCounter value={progress(ts)} />%
          </>
        ) : (
          'Sin tareas'
        )}
      </small>
    </div>
  );
  const desktopTaskList = (ts: Task[], compact = false) => (
    <div className={`task-list ${compact ? 'compact' : ''}`}>
      {ts.length ? (
        ts.map((t) => (
          <button
            className={`task-row ${overdue(t) ? 'late' : t.status}`}
            key={t.id}
            onClick={() => openTask(t)}
          >
            <span className="task-line" />
            <ClipboardCheck size={19} className="task-symbol" />
            <span className="task-content">
              <strong>{t.title}</strong>
              <small>
                {cOf(t)?.name} · {pOf(cOf(t))?.name}
              </small>
              <span className={overdue(t) ? 'due late-text' : 'due'}>
                <Clock size={12} />
                {date(t.due, true)}
                {overdue(t) ? ' · Vencida' : ''}
              </span>
            </span>
            <Badge task={t} />
            <ChevronRight size={16} className="row-chevron" />
          </button>
        ))
      ) : (
        <Empty text="Sin tareas para este filtro" sub="No hay tareas con estos filtros." />
      )}
    </div>
  );
  const taskList = (ts: Task[], compact = false) => (
    <>
      <div className="desktop-only">{desktopTaskList(ts, compact)}</div>
      <div className="mobile-only">
        <MobileTasks
          tasks={ts}
          data={data}
          me={me!}
          onOpen={openTask}
          onComplete={(t) => void taskStatus(t, 'done')}
          pending={pendingTasks}
          canManage={canManage}
        />
      </div>
    </>
  );
  const filterControls = () => (
    <div className="list-controls">
      <div className="filter-tabs" role="group" aria-label="Filtrar por estado">
        {[
          ['all', 'Todas'],
          ['pending', 'Pendientes'],
          ['in_progress', 'En curso'],
          ['done', 'Terminadas'],
          ['blocked', 'Bloqueadas'],
          ['overdue', 'Vencidas'],
        ].map(([value, label]) => (
          <button
            className={filter === value ? 'active' : ''}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="search">
        <Search size={16} />
        <input
          aria-label="Buscar tarea"
          placeholder="Buscar tarea…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <Select
        aria-label="Filtrar por responsable"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
      >
        <option value="">Todos los responsables</option>
        {data.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrar por fecha"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      >
        <option value="">Todas las fechas</option>
        <option value="1">Próximas 24 horas</option>
        <option value="7">Próximos 7 días</option>
      </Select>
    </div>
  );
  const filters = () => (
    <>
      <div className="desktop-only">{filterControls()}</div>
      <details className="mobile-only mobile-task-filters">
        <summary>Buscar y filtrar</summary>
        {filterControls()}
      </details>
    </>
  );
  const taskTable = (ts: Task[]) => (
    <>
      <div className="desktop-table">
        <table>
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Responsables</th>
              <th>Fecha límite</th>
              <th>Estado</th>
              <th>
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ts.map((t) => (
              <tr key={t.id}>
                <td>
                  <button className="text-link task-title" onClick={() => openTask(t)}>
                    {t.title}
                  </button>
                </td>
                <td>
                  <div className="avatars">
                    {usersOf(t).map((u) => (
                      <Avatar key={u.id} user={u} small />
                    ))}
                  </div>
                </td>
                <td className={overdue(t) ? 'late-text' : ''}>
                  {date(t.due, true)}
                  {overdue(t) && <AlertCircle size={12} />}
                </td>
                <td>
                  <Badge task={t} />
                </td>
                <td>
                  <button
                    aria-label={`Abrir ${t.title}`}
                    className="icon-button"
                    onClick={() => openTask(t)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ts.length && (
          <Empty text="Sin tareas por aquí" sub="Prueba con otro filtro o crea la primera tarea." />
        )}
      </div>
      <div className="mobile-list">
        {taskList(view === 'tasks' ? ts.filter((t) => myTasks.some((own) => own.id === t.id)) : ts)}
      </div>
    </>
  );
  const commissionTable = (cs: Commission[]) => (
    <div className="commission-list">
      {cs.length ? (
        cs.map((c) => {
          const ts = data.tasks.filter((t) => t.commissionId === c.id);
          return (
            <button
              key={c.id}
              className="commission-row"
              onClick={() => navigate('commission', c.projectId, c.id)}
            >
              <CIcon c={c} />
              <span className="commission-name">
                <strong>{c.name}</strong>
                <small>{pOf(c)?.name}</small>
              </span>
              <div className="commission-progress">{bar(ts)}</div>
              <span className="count pending" title="Pendientes">
                <AnimatedCounter value={metric(ts, 'pending')} />
              </span>
              <span className="count overdue" title="Vencidas">
                <AnimatedCounter value={metric(ts, 'overdue')} />
              </span>
              <ChevronRight size={16} />
            </button>
          );
        })
      ) : (
        <Empty text="No hay comisiones" sub="Crea una comisión para empezar a organizaros." />
      )}
    </div>
  );
  async function requestLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/request', 'POST', {
        email: emailInput,
        task: params.get('task') || undefined,
        action: params.get('action') || undefined,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (boot)
    return (
      <div className="loading">
        <BananaLoader label="Cargando Bandarlog…" />
      </div>
    );
  if (!me)
    return (
      <div className="login">
        <div className="login-art">
          <div className="brand">
            Bandarlog<span>Comisiones que avanzan</span>
          </div>
          <img src="/monkey.webp" alt="Mascota de Bandarlog, un mono con mochila scout" />

          <span className="leaf-decoration">✦</span>
        </div>
        <main className="login-form">
          <h1>
            {loginToken ? '¡Ya casi estás!' : sent ? 'Revisa tu correo' : 'Bienvenido a Bandarlog'}
          </h1>
          <p>
            {loginToken
              ? 'Confirma el acceso para entrar de forma segura.'
              : sent
                ? 'Si tu correo está registrado o tiene una invitación, recibirás un enlace para entrar.'
                : 'Accede con el correo de tu grupo.'}
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {loginToken ? (
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/auth/verify', 'POST', { token: loginToken });
                  setLoginToken('');
                  const next = new URL(location.href);
                  next.searchParams.delete('token');
                  history.replaceState({}, '', next);
                  await bootup();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar inicio de sesión <ArrowRight size={18} />
            </button>
          ) : (
            <form onSubmit={requestLogin}>
              <label>
                Tu correo electrónico
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nombre@tugrupo.org"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                <Mail size={18} />
                {busy ? (
                  <BananaLoader compact label="Preparando enlace…" />
                ) : (
                  'Recibir enlace de acceso'
                )}
              </button>
              <small>Sin contraseñas. Un enlace seguro, solo para ti.</small>
            </form>
          )}
          {sent && (
            <button className="text-link" onClick={() => setSent(false)}>
              Usar otro correo
            </button>
          )}
          {development && (
            <div className="dev-mail">
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    const messages = await api('/dev/mail');
                    setOutbox(messages);
                  } catch {
                    setError('La bandeja local solo está disponible en desarrollo.');
                  }
                }}
              >
                Bandeja de desarrollo
              </button>
              {outbox.length > 0 && (
                <p className="hint">
                  Datos de prueba: alex@example.test · laura@example.test. Los mensajes de esta
                  bandeja no se han enviado.
                </p>
              )}
              {outbox
                .filter((m) => m.subject.includes('enlace'))
                .slice(-5)
                .reverse()
                .map((m) => (
                  <article key={m.id}>
                    <strong>{m.email}</strong>
                    <p>{m.subject}</p>
                    <button
                      className="secondary"
                      onClick={() => {
                        const match = m.body.match(/token=([a-f0-9]+)/);
                        if (match) setLoginToken(match[1]);
                      }}
                    >
                      Abrir enlace de prueba
                    </button>
                  </article>
                ))}
            </div>
          )}
        </main>
      </div>
    );
  return (
    <FormState.Provider
      value={{
        data,
        me,
        view,
        project,
        commission,
        development,
        busy,
        canManage,
        scoped,
        usersOf,
        run,
        navigate,
        setAssignee,
        setTab,
        setView,
        setModal,
        setToast,
        setSelected,
        pOf,
      }}
    >
      <div className="app-shell">
        <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
          <button className="brand sidebar-brand" onClick={() => navigate('home')}>
            <img src="/brand-mark.webp" alt="" />
            Bandarlog
          </button>
          <span className="nav-caption">ESPACIO DE TRABAJO</span>
          <nav>
            {[
              ['home', 'Resumen', LayoutDashboard],
              ['rounds', 'Proyectos', Flag],
              ['camps', 'Campamentos', Tent],
              ['commissions', 'Comisiones', Users],
              ['tasks', 'Tareas', ClipboardCheck],
              ['people', 'Personas', UserRound],
              ['alerts', 'Alertas', Bell],
              ['settings', 'Ajustes', Settings],
            ].map(([v, label, Icon]: any) => (
              <button key={v} onClick={() => navigate(v)} className={view === v ? 'active' : ''}>
                <Icon size={19} />
                {label}
                {v === 'alerts' && (
                  <b
                    className={
                      data.tasks.some((t) => overdue(t) || t.status === 'blocked')
                        ? 'nav-count'
                        : 'nav-count zero'
                    }
                  >
                    <AnimatedCounter
                      value={data.tasks.filter((t) => overdue(t) || t.status === 'blocked').length}
                    />
                  </b>
                )}
              </button>
            ))}
          </nav>

          <button className="sidebar-profile" onClick={() => navigate('profile')}>
            <Avatar user={me} />
            <span>
              <strong>{me.name}</strong>
              <small>{manage ? 'Coordinación' : 'Miembro'}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </aside>
        {sidebar && <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />}
        <div className="workspace">
          <header className="topbar">
            <button
              className="icon-button menu-toggle"
              aria-label="Abrir menú"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumbs">
              <span>Mi grupo scout</span>
              <ChevronRight size={13} />
              <span>
                {activeCommission?.name || activeProject?.name || 'Espacio de coordinación'}
              </span>
            </div>
            <button className="mobile-brand" onClick={() => navigate('home')}>
              <img src="/brand-mark.webp" alt="" />
              Bandarlog
            </button>
            <div className="topbar-actions">
              <span className="today">
                {new Date().toLocaleDateString('es-ES', {
                  timeZone: 'Europe/Madrid',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              <button
                className="icon-button"
                aria-label="Ver alertas"
                onClick={() => navigate('alerts')}
              >
                <Bell size={19} />
                {data.tasks.some((t) => overdue(t) || t.status === 'blocked') && (
                  <i className="notification-dot" />
                )}
              </button>
              <button
                className="icon-button profile-button"
                aria-label="Mi perfil"
                onClick={() => navigate('profile')}
              >
                <Avatar user={me} small />
              </button>
            </div>
          </header>
          <main className="main">
            <div className="mobile-page-title">
              {
                (
                  {
                    home: 'Inicio',
                    tasks: 'Mis tareas',
                    commissions: 'Comisiones',
                    profile: 'Mi perfil',
                    alerts: 'Alertas',
                  } as any
                )[view]
              }
            </div>
            {error && !modal && !selected && (
              <div className="error" role="alert">
                {error}
                <button aria-label="Cerrar error" onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            {view === 'home' && (
              <>
                <div className="desktop-home">
                  <div className="page-heading home-heading">
                    <div>
                      <h1>Resumen general</h1>
                    </div>
                    <div className="heading-filters">
                      <Select
                        aria-label="Filtrar proyecto"
                        value={project}
                        onChange={(e) => setProject(e.target.value)}
                      >
                        <option value="">Todos los proyectos</option>
                        {data.projects.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <button className="secondary" onClick={() => setModal('task')}>
                        <Plus size={16} /> Nueva tarea
                      </button>
                    </div>
                    <img className="heading-monkey" src="/monkey.webp" alt="" />
                  </div>
                  {metricCards(scoped)}
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Progreso por proyecto</h2>
                        <Tent size={18} />
                      </div>
                      {data.projects
                        .filter((p) => !project || p.id === project)
                        .map((p) => (
                          <button
                            key={p.id}
                            className="project-progress"
                            onClick={() => navigate('project', p.id)}
                          >
                            <span>{p.name}</span>
                            {bar(data.tasks.filter((t) => cOf(t)?.projectId === p.id))}
                          </button>
                        ))}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Estado de las tareas</h2>
                        <span className="muted">Vista general</span>
                      </div>
                      <div className="chart">
                        <button
                          className="donut"
                          aria-label="Ver todas las tareas"
                          onClick={() => navigate('tasks')}
                          style={{
                            background: (() => {
                              let n = 0;
                              const total = scoped.length || 1;
                              const stops = ['done', 'in_progress', 'pending', 'blocked'].map(
                                (v, i) => {
                                  const start = n;
                                  n += (metric(scoped, v) / total) * 100;
                                  return `${['#21865c', '#438cd5', '#e8a33c', '#d9524b'][i]} ${start}% ${n}%`;
                                },
                              );
                              return `conic-gradient(${stops.join(',')})`;
                            })(),
                          }}
                        >
                          <span>
                            <strong>
                              <AnimatedCounter value={scoped.length} />
                            </strong>
                            <small>tareas</small>
                          </span>
                        </button>
                        <div className="chart-legend">
                          {['pending', 'in_progress', 'done', 'blocked', 'overdue'].map(
                            (status) => (
                              <button
                                key={status}
                                onClick={() => {
                                  setView('tasks');
                                  setFilter(status);
                                }}
                              >
                                <i className={status} />
                                <span>{status === 'overdue' ? 'Vencidas' : labels[status]}</span>
                                <b>
                                  <AnimatedCounter value={metric(scoped, status)} />
                                </b>
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Comisiones que necesitan atención</h2>
                        <button className="text-link" onClick={() => navigate('commissions')}>
                          Ver todas
                        </button>
                      </div>
                      <div className="table-caption">
                        <span>Comisión / proyecto</span>
                        <span>Progreso · pendientes · vencidas</span>
                      </div>
                      {commissionTable(
                        data.commissions.filter(
                          (c) =>
                            (!project || c.projectId === project) &&
                            data.tasks.some(
                              (t) =>
                                t.commissionId === c.id && (overdue(t) || t.status === 'blocked'),
                            ),
                        ),
                      )}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Tareas que requieren atención</h2>
                        <span className="count overdue">
                          <AnimatedCounter
                            value={
                              scoped.filter((t) => overdue(t) || t.status === 'blocked').length
                            }
                          />
                        </span>
                      </div>
                      {taskList(
                        scoped.filter((t) => overdue(t) || t.status === 'blocked').slice(0, 4),
                        true,
                      )}
                    </section>
                  </div>
                </div>
                <div className="mobile-only">
                  <MobileHome
                    data={data}
                    me={me}
                    holding={satisfaction}
                    pending={pendingTasks}
                    onOpen={openTask}
                    onComplete={(t) => void taskStatus(t, 'done')}
                    canManage={canManage}
                    navigate={navigate}
                  />
                </div>
              </>
            )}
            {['tasks', 'alerts'].includes(view) && (
              <>
                {view === 'tasks' && (
                  <div className="mobile-only">
                    <TaskSummary tasks={myTasks} />
                  </div>
                )}
                <div className="page-heading">
                  <div>
                    <h1>
                      {view === 'alerts' ? (
                        'Lo que necesita atención'
                      ) : manage ? (
                        <>
                          <span className="desktop-only">Todas las tareas</span>
                          <span className="mobile-only">Mis tareas</span>
                        </>
                      ) : (
                        'Mis tareas'
                      )}
                    </h1>
                    <p>
                      {view === 'alerts' ? 'Vencimientos y bloqueos para resolver en equipo.' : ''}
                    </p>
                  </div>
                  {(manage ||
                    data.members.some((m) => m.userId === me.id && m.role === 'responsible')) && (
                    <button className="primary" onClick={() => setModal('task')}>
                      <Plus size={18} /> Nueva tarea
                    </button>
                  )}
                </div>
                <section className="panel">
                  {filters()}
                  {taskTable(shown)}
                </section>
              </>
            )}
            {['rounds', 'camps'].includes(view) && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>{view === 'rounds' ? 'Proyectos' : 'Campamentos'}</h1>
                    <p></p>
                  </div>
                  {manage && (
                    <button className="primary" onClick={() => setModal('project')}>
                      <Plus size={18} /> {view === 'camps' ? 'Nuevo campamento' : 'Nuevo proyecto'}
                    </button>
                  )}
                </div>
                <div className="project-grid">
                  {data.projects
                    .filter((p) => p.type === (view === 'rounds' ? 'ronda' : 'camp'))
                    .map((p) => (
                      <button
                        className="panel project-card"
                        key={p.id}
                        onClick={() => navigate('project', p.id)}
                      >
                        <span className="project-art">
                          <Tent size={54} />
                          <Leaf size={22} />
                        </span>
                        <h2>{p.name}</h2>
                        <p>
                          {date(p.starts)} – {date(p.ends)}
                          {p.archived === 'true' ? ' · Archivado' : ''}
                        </p>
                        {bar(data.tasks.filter((t) => cOf(t)?.projectId === p.id))}
                        <span className="project-bottom">
                          {data.commissions.filter((c) => c.projectId === p.id).length} comisiones{' '}
                          <ChevronRight size={16} />
                        </span>
                      </button>
                    ))}
                </div>
                {!data.projects.some((p) => p.type === (view === 'rounds' ? 'ronda' : 'camp')) && (
                  <Empty
                    text="No hay proyectos"
                    sub="Crea un proyecto para organizar sus comisiones."
                  />
                )}
              </>
            )}
            {view === 'commissions' && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>Comisiones</h1>
                    <p></p>
                  </div>
                  {manage && (
                    <button className="primary" onClick={() => setModal('commission')}>
                      <Plus size={18} /> Nueva comisión
                    </button>
                  )}
                </div>
                <div className="filter-tabs project-tabs">
                  <button className={!project ? 'active' : ''} onClick={() => setProject('')}>
                    Todas
                  </button>
                  {data.projects.map((p) => (
                    <button
                      key={p.id}
                      className={project === p.id ? 'active' : ''}
                      onClick={() => setProject(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="mobile-only mobile-commission-groups">
                  {data.projects
                    .filter((p) => !project || p.id === project)
                    .map((p) => {
                      const commissions = data.commissions.filter((c) => c.projectId === p.id);
                      return commissions.length ? (
                        <section key={p.id}>
                          <h2>
                            <ProjectIdentity project={p} />
                          </h2>
                          {commissionTable(commissions)}
                        </section>
                      ) : null;
                    })}
                </div>
                <div className="commissions-grid desktop-only">
                  {data.commissions
                    .filter((c) => !project || c.projectId === project)
                    .map((c) => {
                      const ts = data.tasks.filter((t) => t.commissionId === c.id);
                      return (
                        <button
                          className="panel commission-card"
                          key={c.id}
                          onClick={() => navigate('commission', c.projectId, c.id)}
                        >
                          <div>
                            <CIcon c={c} />
                            <ChevronRight size={18} />
                          </div>
                          <h2>{c.name}</h2>
                          <p>{pOf(c)?.name}</p>
                          {bar(ts)}
                          <div className="commission-card-bottom">
                            <span>
                              <b className="count pending">
                                <AnimatedCounter value={metric(ts, 'pending')} />
                              </b>{' '}
                              pendientes
                            </span>
                            <span>
                              <b className="count overdue">
                                <AnimatedCounter value={metric(ts, 'overdue')} />
                              </b>{' '}
                              vencidas
                            </span>
                            <div className="avatars">
                              {data.members
                                .filter((m) => m.commissionId === c.id)
                                .slice(0, 3)
                                .map((m) => (
                                  <Avatar
                                    user={data.users.find((u) => u.id === m.userId)}
                                    key={m.id}
                                    small
                                  />
                                ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
            {view === 'project' && activeProject && (
              <>
                <button
                  className="back text-link"
                  onClick={() => navigate(activeProject.type === 'camp' ? 'camps' : 'rounds')}
                >
                  <ArrowLeft size={16} />{' '}
                  {activeProject.type === 'camp' ? 'Volver a campamentos' : 'Volver a proyectos'}
                </button>
                <div className="project-banner">
                  <span className="project-art">
                    <Tent size={58} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      {activeProject.type === 'camp' ? 'CAMPAMENTO' : 'PROYECTO ANUAL'}{' '}
                      {activeProject.archived === 'true' ? '· ARCHIVADO' : ''}
                    </span>
                    <h1>{activeProject.name}</h1>
                    <p>
                      {date(activeProject.starts)} – {date(activeProject.ends)}
                    </p>
                  </div>
                  <img src="/monkey.webp" alt="" />
                </div>
                {manage && activeProject.archived !== 'true' && (
                  <label className="project-artwork-theme">
                    Colección de ilustraciones
                    <Select
                      value={activeProject.artworkTheme || 'scout'}
                      disabled={busy || inferArtworkTheme(activeProject.name) === 'christmas'}
                      onChange={(event) =>
                        void run(async () => {
                          await api(`/projects/${project}`, 'PATCH', {
                            artworkTheme: event.target.value,
                          });
                        }, 'Colección actualizada')
                      }
                    >
                      {artworkThemes.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </Select>
                    <span className="hint">
                      Se aplica a todas las comisiones de este{' '}
                      {activeProject.type === 'camp' ? 'campamento' : 'proyecto'}.
                    </span>
                  </label>
                )}
                {data.campSummaries?.find((camp) => camp.id === project) && (
                  <div className="mobile-only">
                    <CampOverview camp={data.campSummaries.find((camp) => camp.id === project)!} />
                  </div>
                )}
                <div className="page-tabs">
                  {[
                    ['tasks', 'Resumen'],
                    ['commissions', 'Comisiones'],
                    ['taskList', 'Tareas'],
                    ['people', 'Personas'],
                  ].map(([v, label]) => (
                    <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
                      {label}
                    </button>
                  ))}
                </div>
                {tab === 'tasks' && (
                  <>
                    {!manage && activeProject.type === 'camp' && (
                      <h2 className="mobile-only">Tareas de tus comisiones</h2>
                    )}
                    {metricCards(scoped)}
                    <section className="panel general-progress">
                      <strong>Progreso general</strong>
                      {bar(scoped)}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Comisiones</h2>
                        {manage && (
                          <button className="text-link" onClick={() => setModal('commission')}>
                            <Plus size={16} /> Nueva comisión
                          </button>
                        )}
                      </div>
                      {commissionTable(data.commissions.filter((c) => c.projectId === project))}
                    </section>
                  </>
                )}
                {tab === 'commissions' && (
                  <section className="panel">
                    {manage && (
                      <button className="primary" onClick={() => setModal('commission')}>
                        <Plus size={16} /> Nueva comisión
                      </button>
                    )}
                    {commissionTable(data.commissions.filter((c) => c.projectId === project))}
                  </section>
                )}
                {tab === 'taskList' && (
                  <section className="panel">
                    {manage && (
                      <button className="primary" onClick={() => setModal('task')}>
                        Nueva tarea
                      </button>
                    )}
                    {filters()}
                    {taskTable(shown)}
                  </section>
                )}
                {tab === 'people' && <People />}
                {manage && (
                  <button
                    className="text-link archive"
                    onClick={() =>
                      void run(async () => {
                        await api(`/projects/${project}`, 'PATCH', {
                          archived: activeProject.archived !== 'true',
                        });
                      })
                    }
                  >
                    <Archive size={16} />
                    {activeProject.archived === 'true'
                      ? 'Restaurar proyecto'
                      : 'Archivar proyecto conservando el historial'}
                  </button>
                )}
              </>
            )}
            {view === 'commission' && activeCommission && (
              <>
                <button className="back text-link" onClick={() => navigate('commissions')}>
                  <ArrowLeft size={16} /> Comisiones
                </button>
                <section className="commission-banner">
                  <CIcon c={activeCommission} />
                  <div>
                    <h1>{activeCommission.name}</h1>
                    <p>{activeProject?.name}</p>
                    {bar(scoped)}
                  </div>
                  <div className="banner-actions">
                    {canManage(commission) && activeProject?.archived !== 'true' && (
                      <>
                        <button className="primary" onClick={() => setModal('task')}>
                          <Plus size={16} /> Nueva tarea
                        </button>
                        <button className="secondary" onClick={() => setModal('members')}>
                          <Users size={16} /> Añadir personas
                        </button>
                      </>
                    )}
                  </div>
                  {canManage(commission) &&
                    !activeCommission.artworkLocked &&
                    activeProject?.archived !== 'true' && (
                      <button
                        className="text-link artwork-retry"
                        onClick={() => setModal('artwork')}
                      >
                        Elegir ilustraciones
                      </button>
                    )}
                  <MascotArt
                    className="commission-mascot"
                    src={activeCommission.mascotUrl || '/monkey.webp'}
                  />
                </section>
                {canManage(commission) && (
                  <section className="commission-summary" aria-label="Panel de Responsable">
                    <div className="section-heading">
                      <div>
                        <h2>Panel de Responsable</h2>
                        <p className="hint">
                          Progreso, plazos y bloqueos de esta comisión. Pulsa un indicador para
                          filtrar sus tareas.
                        </p>
                      </div>
                    </div>
                    {metricCards(scoped)}
                    <section className="panel general-progress">
                      <strong>Progreso de la comisión</strong>
                      {bar(scoped)}
                    </section>
                    <div className="responsible-attention">
                      <button
                        className="secondary"
                        onClick={() => {
                          setTab('tasks');
                          setFilter('overdue');
                        }}
                      >
                        Revisar tareas vencidas
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setTab('tasks');
                          setFilter('blocked');
                        }}
                      >
                        Resolver bloqueos
                      </button>
                    </div>
                  </section>
                )}
                <section className="panel commission-work">
                  <div className="page-tabs">
                    {[
                      ['tasks', 'Tareas'],
                      ['people', 'Personas'],
                      ['activity', 'Actividad'],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        className={tab === v ? 'active' : ''}
                        onClick={() => setTab(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === 'tasks' && (
                    <>
                      {filters()}
                      {taskTable(shown)}
                    </>
                  )}
                  {tab === 'people' && <People />}
                  {tab === 'activity' && (
                    <div className="activity-list">
                      {data.activity
                        .filter((a) => scoped.some((t) => t.id === a.taskId))
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                        .map((a) => (
                          <article key={a.id}>
                            <Avatar user={data.users.find((u) => u.id === a.userId)} small />
                            <div>
                              <strong>{data.users.find((u) => u.id === a.userId)?.name}</strong>
                              <p>{a.body}</p>
                              <small>
                                {data.tasks.find((t) => t.id === a.taskId)?.title} ·{' '}
                                {date(a.createdAt, true)}
                              </small>
                            </div>
                          </article>
                        ))}
                    </div>
                  )}
                </section>
              </>
            )}
            {view === 'people' && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>Personas</h1>
                    <p></p>
                  </div>
                </div>
                <People />
              </>
            )}
            {['profile', 'settings'].includes(view) && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>{view === 'settings' ? 'Ajustes' : 'Mi perfil'}</h1>
                    <p></p>
                  </div>
                </div>
                <section className="panel profile-panel">
                  <Avatar user={me} />
                  <h2>{me.name}</h2>
                  <p>
                    {me.email} · {manage ? 'Coordinación' : 'Miembro'}
                  </p>
                  <ProfileForm user={me} busy={busy} run={run} onSaved={setMe} />
                  <button
                    className="text-link logout"
                    onClick={async () => {
                      await api('/logout', 'POST');
                      setMe(null);
                      setData(initial);
                    }}
                  >
                    <LogOut size={16} /> Cerrar sesión
                  </button>
                </section>
                {development && (
                  <section className="panel development-panel">
                    <h2>Entorno de desarrollo</h2>
                    <p>Consulta los mensajes y su estado de envío.</p>
                    <button
                      className="secondary"
                      onClick={async () => {
                        setOutbox(await api('/dev/mail'));
                        setModal('mail');
                      }}
                    >
                      <Mail size={16} /> Ver correos de prueba
                    </button>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Navegación principal">
          {[
            ['home', 'Inicio', Home],
            ['tasks', 'Mis tareas', ClipboardCheck],
            ['commissions', 'Comisiones', Users],
            ['profile', 'Perfil', UserRound],
          ].map(([v, label, Icon]: any) => (
            <button
              key={v}
              className={
                view === v || (v === 'commissions' && view === 'commission') ? 'active' : ''
              }
              onClick={() => navigate(v)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {celebrating && (
          <div className="task-celebration" aria-hidden="true">
            <div className="vine-swing">
              <img src="/monkey-vine.webp" alt="" />
            </div>
            <strong>{undo?.last ? '¡Tus tareas están al día!' : 'Tarea completada'}</strong>
          </div>
        )}
        {busy && (
          <div className="operation-loading">
            <BananaLoader compact label="Guardando…" />
          </div>
        )}
        {undo && (
          <div className="undo-toast" role="status">
            <span>{undo.last ? '¡Tus tareas están al día!' : 'Tarea completada'}</span>
            <button disabled={busy} onClick={() => void undoCompletion()}>
              Deshacer
            </button>
            <button aria-label="Cerrar confirmación" onClick={() => setUndo(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={19} />
            {toast}
          </div>
        )}
        {selected && (
          <Dialog title="Detalle de tarea" onClose={closeTask} side>
            {detail ? (
              <>
                <button className="text-link back" onClick={closeTask}>
                  <ArrowLeft size={16} /> Volver
                </button>
                <div className="detail-heading">
                  <h2>{detail.title}</h2>
                  {overdue(detail) && <span className="badge overdue">Vencida</span>}
                </div>
                <p className="muted">
                  {cOf(detail)?.name} · {pOf(cOf(detail))?.name}
                </p>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <dl className="detail-fields">
                  <div>
                    <dt>
                      <CalendarDays size={17} />
                      Fecha límite
                    </dt>
                    <dd className={overdue(detail) ? 'late-text' : ''}>{date(detail.due, true)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Users size={17} />
                      Responsables
                    </dt>
                    <dd>
                      <div className="avatars">
                        {usersOf(detail).map((u) => (
                          <Avatar key={u.id} user={u} small />
                        ))}
                      </div>
                      <small>
                        {usersOf(detail)
                          .map((u) => u.name)
                          .join(', ')}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <ClipboardCheck size={17} />
                      Estado
                    </dt>
                    <dd>
                      <Badge task={detail} />
                    </dd>
                  </div>
                </dl>
                <h3>Descripción</h3>
                <p className="description">{detail.description || 'Sin descripción.'}</p>
                {detail.blockedReason && (
                  <div className="blocked-note">
                    <LockKeyhole size={17} />
                    <span>
                      <strong>Motivo del bloqueo</strong>
                      <p>{detail.blockedReason}</p>
                    </span>
                  </div>
                )}
                {detail.completedAt && (
                  <p className="success-note">
                    <Check size={17} />
                    Terminada por {data.users.find((u) => u.id === detail.completedBy)?.name} ·{' '}
                    {date(detail.completedAt, true)}
                  </p>
                )}
                {canManage(detail.commissionId) && (
                  <details className="reassign">
                    <summary>Editar fecha y responsables</summary>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await run(async () => {
                          await api(`/tasks/${detail.id}`, 'PATCH', {
                            responsibleIds: f.getAll('responsibleIds'),
                            due: new Date(String(f.get('due'))).toISOString(),
                          });
                        });
                      }}
                    >
                      <label>
                        Fecha límite (hora de este dispositivo)
                        <input
                          type="datetime-local"
                          required
                          name="due"
                          defaultValue={localInput(detail.due)}
                        />
                      </label>
                      <fieldset>
                        <legend>Responsables · al menos uno</legend>
                        {data.members
                          .filter((m) => m.commissionId === detail.commissionId)
                          .map((m) => {
                            const u = data.users.find((u) => u.id === m.userId)!;
                            return (
                              <label className="checkbox-line" key={u.id}>
                                <input
                                  type="checkbox"
                                  name="responsibleIds"
                                  value={u.id}
                                  defaultChecked={usersOf(detail).some((x) => x.id === u.id)}
                                />
                                {u.name}
                              </label>
                            );
                          })}
                      </fieldset>
                      <button className="secondary" disabled={busy}>
                        Guardar asignación
                      </button>
                    </form>
                  </details>
                )}
                {canManage(detail.commissionId) && pOf(cOf(detail))?.archived !== 'true' && (
                  <details className="delete-task">
                    <summary>Eliminar tarea</summary>
                    <p>Se quitará de los listados y del progreso. Conservaremos el historial.</p>
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/tasks/${detail.id}`, 'DELETE');
                          setSelected('');
                        }, 'Tarea eliminada')
                      }
                    >
                      Confirmar eliminación
                    </button>
                  </details>
                )}
                <h3>Actividad reciente</h3>
                <div className="activity-list">
                  {data.activity
                    .filter((a) => a.taskId === detail.id)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((a) => (
                      <article key={a.id}>
                        <Avatar user={data.users.find((u) => u.id === a.userId)} small />
                        <div>
                          <strong>{data.users.find((u) => u.id === a.userId)?.name}</strong>
                          <small>{date(a.createdAt, true)}</small>
                          <p>{a.body}</p>
                        </div>
                      </article>
                    ))}
                </div>
                {(canManage(detail.commissionId) || usersOf(detail).some((u) => u.id === me.id)) &&
                  pOf(cOf(detail))?.archived !== 'true' && (
                    <form
                      className="comment-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const f = new FormData(form);
                        if (
                          await run(async () => {
                            await api(`/tasks/${detail.id}/comments`, 'POST', {
                              body: f.get('body'),
                            });
                          }, 'Comentario añadido')
                        )
                          form.reset();
                      }}
                    >
                      <label className="sr-only" htmlFor="comment">
                        Añadir comentario
                      </label>
                      <input
                        id="comment"
                        name="body"
                        placeholder="Comparte una novedad…"
                        required
                        maxLength={3000}
                      />
                      <button
                        className="icon-button"
                        aria-label="Enviar comentario"
                        disabled={busy}
                      >
                        <Send size={19} />
                      </button>
                    </form>
                  )}
                {(canManage(detail.commissionId) || usersOf(detail).some((u) => u.id === me.id)) &&
                  pOf(cOf(detail))?.archived !== 'true' && (
                    <div className="detail-actions">
                      {pendingAction && (
                        <div className="action-confirm">
                          <strong>Confirmar acción del correo</strong>
                          <p>
                            Vas a marcar esta tarea como {labels[pendingAction] || 'pendiente'}.
                            Revisa los detalles antes de continuar.
                          </p>
                          {pendingAction !== 'blocked' && (
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => void taskStatus(detail, pendingAction)}
                            >
                              Confirmar {labels[pendingAction]}
                            </button>
                          )}
                          <button className="text-link" onClick={() => setPendingAction('')}>
                            Cancelar
                          </button>
                        </div>
                      )}
                      {pendingAction === 'blocked' ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void taskStatus(
                              detail,
                              'blocked',
                              String(new FormData(e.currentTarget).get('reason')),
                            );
                          }}
                        >
                          <label>
                            ¿Qué impide avanzar?
                            <textarea
                              name="reason"
                              required
                              maxLength={1000}
                              placeholder="Escribe un motivo breve…"
                            />
                          </label>
                          <button className="warning" disabled={busy}>
                            Confirmar bloqueo
                          </button>
                        </form>
                      ) : (
                        !pendingAction && (
                          <>
                            <div className="action-pair">
                              {detail.status !== 'in_progress' && detail.status !== 'done' && (
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => void taskStatus(detail, 'in_progress')}
                                >
                                  Marcar en curso
                                </button>
                              )}
                              {detail.status !== 'done' ? (
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() => void taskStatus(detail, 'done')}
                                >
                                  <Check size={17} /> Completar
                                </button>
                              ) : (
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => void taskStatus(detail, 'pending')}
                                >
                                  Reabrir tarea
                                </button>
                              )}
                            </div>
                            {!['done', 'blocked'].includes(detail.status) && (
                              <button
                                className="warning"
                                onClick={() => setPendingAction('blocked')}
                              >
                                <LockKeyhole size={15} /> Bloquear tarea
                              </button>
                            )}
                          </>
                        )
                      )}
                    </div>
                  )}
              </>
            ) : (
              <Empty text="Tarea no disponible" sub="Puede que no tengas acceso a esta comisión." />
            )}
          </Dialog>
        )}
        {modal && (
          <Dialog
            title={
              (
                {
                  task: 'Nueva tarea',
                  commission: 'Nueva comisión',
                  members: 'Añadir personas',
                  invite: 'Invitar personas',
                  project: view === 'camps' ? 'Nuevo campamento' : 'Nuevo proyecto',
                  artwork: 'Elegir ilustraciones',
                  mail: 'Bandeja de desarrollo',
                } as any
              )[modal]
            }
            onClose={() => {
              setModal('');
              setError('');
            }}
          >
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal === 'task' && <TaskForm />}
            {modal === 'commission' && <CommissionForm />}
            {modal === 'members' && <MemberForm />}
            {modal === 'invite' && <InvitationForm />}
            {modal === 'project' && <ProjectForm />}
            {modal === 'artwork' && activeCommission && !activeCommission.artworkLocked && (
              <ArtworkPicker
                theme={activeProject?.artworkTheme || 'scout'}
                selected={activeCommission.artworkKey}
                automatic={activeCommission.artworkMode !== 'manual'}
                busy={busy}
                canAdd={manage}
                onChoose={(key) =>
                  void run(async () => {
                    await api(`/commissions/${commission}/artwork`, 'POST', { key });
                    setModal('');
                  }, 'Ilustraciones actualizadas')
                }
              />
            )}

            {modal === 'mail' && (
              <div className="mail-list">
                <p className="hint">Consulta el estado de envío de cada mensaje.</p>
                {outbox
                  .slice()
                  .reverse()
                  .map((m) => (
                    <article key={m.id}>
                      <strong>{m.subject}</strong>
                      <small>
                        {m.email} · {m.status} · intentos {m.attempts}
                      </small>
                      <iframe
                        loading="lazy"
                        title={`Correo: ${m.subject}`}
                        sandbox=""
                        srcDoc={m.html || ''}
                        className="email-preview"
                      />
                      <details>
                        <summary>Versión de texto</summary>
                        <pre>{m.body}</pre>
                      </details>
                    </article>
                  ))}
              </div>
            )}
          </Dialog>
        )}
      </div>
    </FormState.Provider>
  );
}
type FormContext = {
  data: Data;
  me: User;
  view: string;
  project: string;
  commission: string;
  development: boolean;
  busy: boolean;
  canManage: (id: string) => boolean;
  scoped: Task[];
  usersOf: (t: Task) => User[];
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  navigate: (view: string, project?: string, commission?: string) => void;
  setAssignee: (v: string) => void;
  setTab: (v: string) => void;
  setView: (v: string) => void;
  setModal: (v: string) => void;
  setToast: (v: string) => void;
  setSelected: (v: string) => void;
  pOf: (c: Commission) => import('./types').Project | undefined;
};
const FormState = React.createContext<FormContext>(null!);
function People() {
  const {
    data,
    me,
    view,
    project,
    commission,
    development,
    busy,
    canManage,
    scoped,
    usersOf,
    run,
    navigate,
    setAssignee,
    setTab,
    setView,
    setModal,
    setToast,
    setSelected,
    pOf,
  } = React.useContext(FormState);
  const members = data.members.filter(
    (m) =>
      (!project ||
        data.commissions.some((c) => c.projectId === project && c.id === m.commissionId)) &&
      (!commission || m.commissionId === commission),
  );
  const global = me.role === 'admin' || me.role === 'coordination';
  const canInvite = commission
    ? canManage(commission)
    : project
      ? global
      : global || data.commissions.some((c) => canManage(c.id));
  const us = data.users.filter(
    (u) =>
      (!project && !commission && global) ||
      members.some((m) => m.userId === u.id) ||
      (!commission &&
        data.projectMembers.some((m) => m.projectId === project && m.userId === u.id)),
  );
  return (
    <section className="people panel">
      <div className="section-heading">
        <h2>{us.length} personas en el equipo</h2>
        {canInvite && (
          <button className="primary" onClick={() => setModal('invite')}>
            <Mail size={16} /> Invitar personas
          </button>
        )}
        {((commission && canManage(commission)) || (!commission && project && global)) && (
          <button className="primary" onClick={() => setModal('members')}>
            <Plus size={16} /> Añadir personas
          </button>
        )}
      </div>
      {us.map((u) => {
        const tasks = scoped.filter((t) => usersOf(t).some((x) => x.id === u.id));
        const member = members.find((m) => m.userId === u.id);
        return (
          <article className="person-row" key={u.id}>
            <Avatar user={u} />
            <div>
              <strong>{u.name}</strong>
              <small>{u.email}</small>
              <button
                className="text-link"
                onClick={() => {
                  setAssignee(u.id);
                  setTab(view === 'project' ? 'taskList' : 'tasks');
                  if (view === 'people') setView('tasks');
                }}
              >
                <AnimatedCounter value={tasks.filter((t) => t.status !== 'done').length} />{' '}
                pendientes · <AnimatedCounter value={tasks.filter(overdue).length} /> vencidas
                {tasks.some(
                  (t) =>
                    Date.now() - new Date(t.updatedAt).getTime() > 7 * 86400000 &&
                    t.status !== 'done',
                )
                  ? ' · Sin progreso reciente'
                  : ''}
              </button>
            </div>
            {!commission && me.role === 'admin' && (
              <Select
                aria-label={`Rol global de ${u.name}`}
                value={u.role}
                disabled={busy || u.id === me.id}
                style={{ width: 145, fontSize: 11 }}
                onChange={(e) =>
                  void run(async () => {
                    await api(`/users/${u.id}/role`, 'PATCH', { role: e.target.value });
                  })
                }
              >
                <option value="member">Miembro</option>
                <option value="coordination">Coordinación</option>
                <option value="admin">Administrador</option>
              </Select>
            )}
            {commission && (
              <span className={`badge ${member?.role === 'responsible' ? 'pending' : 'done'}`}>
                {member?.role === 'responsible' ? 'Responsable' : 'Scouter'}
              </span>
            )}
            {commission && canManage(commission) && (
              <div className="person-actions">
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/commissions/${commission}/members/${u.id}`, 'PATCH', {
                        role: member?.role === 'responsible' ? 'scouter' : 'responsible',
                      });
                    })
                  }
                >
                  {member?.role === 'responsible' ? 'Cambiar a Scouter' : 'Designar responsable'}
                </button>
                <button
                  className="text-link danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/commissions/${commission}/members/${u.id}`, 'DELETE');
                    })
                  }
                >
                  Quitar
                </button>
              </div>
            )}
          </article>
        );
      })}
      {data.invitations
        .filter((i) =>
          commission
            ? i.commissionId === commission
            : !project ||
              i.projectId === project ||
              data.commissions.some((c) => c.id === i.commissionId && c.projectId === project),
        )
        .map((i) => (
          <article className="invitation" key={i.id}>
            <Mail size={18} />
            <div>
              <strong>{i.name}</strong>
              <small>
                {i.email} ·{' '}
                {i.commissionId
                  ? data.commissions.find((c) => c.id === i.commissionId)?.name +
                    ' · ' +
                    (i.role === 'responsible' ? 'Responsable' : 'Scouter')
                  : i.projectId
                    ? data.projects.find((p) => p.id === i.projectId)?.name
                    : 'Grupo'}{' '}
                ·{' '}
                {
                  (
                    {
                      pending: 'Pendiente',
                      accepted: 'Aceptada',
                      expired: 'Caducada',
                      revoked: 'Revocada',
                    } as any
                  )[i.status]
                }
              </small>
            </div>
            {i.status !== 'accepted' && (i.commissionId ? canManage(i.commissionId) : global) && (
              <>
                <button
                  className="text-link"
                  onClick={() =>
                    void run(async () => {
                      await api(`/invitations/${i.id}`, 'PATCH', { action: 'resend' });
                    })
                  }
                >
                  Reenviar
                </button>
                <button
                  className="text-link danger"
                  onClick={() =>
                    void run(async () => {
                      await api(`/invitations/${i.id}`, 'PATCH', { action: 'revoke' });
                    })
                  }
                >
                  Revocar
                </button>
              </>
            )}
          </article>
        ))}
    </section>
  );
}
function TaskForm() {
  const {
    data,
    me,
    view,
    project,
    commission,
    development,
    busy,
    canManage,
    scoped,
    usersOf,
    run,
    navigate,
    setAssignee,
    setTab,
    setView,
    setModal,
    setToast,
    setSelected,
    pOf,
  } = React.useContext(FormState);
  const [cid, setCid] = useState(
    commission ||
      data.commissions.find((c) => canManage(c.id) && (!project || c.projectId === project))?.id ||
      '',
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await run(async () => {
            const result = await api('/tasks', 'POST', {
              title: f.get('title'),
              commissionId: cid,
              description: f.get('description'),
              due: new Date(String(f.get('due'))).toISOString(),
              responsibleIds: f.getAll('responsibleIds'),
            });
            setSelected(result.id);
          }, 'Tarea creada')
        )
          setModal('');
      }}
    >
      <p className="muted"></p>
      <label>
        Título
        <input name="title" required maxLength={200} placeholder="¿Qué hay que hacer?" />
      </label>
      <label>
        Comisión
        <Select value={cid} onChange={(e) => setCid(e.target.value)} required>
          <option value="">Selecciona una comisión</option>
          {data.commissions
            .filter((c) => canManage(c.id) && pOf(c)?.archived !== 'true')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {pOf(c)?.name}
              </option>
            ))}
        </Select>
      </label>
      <label>
        Fecha y hora límite (hora de este dispositivo)
        <input type="datetime-local" name="due" required />
      </label>
      <label>
        Descripción opcional
        <textarea
          name="description"
          maxLength={5000}
          placeholder="Los detalles que ayudarán al equipo…"
        />
      </label>
      <fieldset>
        <legend>Responsables · al menos uno</legend>
        {data.members
          .filter((m) => m.commissionId === cid)
          .map((m) => {
            const u = data.users.find((u) => u.id === m.userId)!;
            return (
              <label className="select-person" key={m.id}>
                <input type="checkbox" name="responsibleIds" value={u.id} />
                <Avatar user={u} small />
                <span>{u.name}</span>
              </label>
            );
          })}
      </fieldset>
      <p className="hint">
        ¿Falta alguien? Añádelo desde Personas en la comisión antes de asignarle una tarea.
      </p>
      <button className="primary" disabled={busy}>
        Crear tarea <ArrowRight size={17} />
      </button>
    </form>
  );
}
function CommissionForm() {
  const {
    data,
    me,
    view,
    project,
    commission,
    development,
    busy,
    canManage,
    scoped,
    usersOf,
    run,
    navigate,
    setAssignee,
    setTab,
    setView,
    setModal,
    setToast,
    setSelected,
    pOf,
  } = React.useContext(FormState);
  const [step, setStep] = useState(1),
    [name, setName] = useState(''),
    [pid, setPid] = useState(
      project || data.projects.find((p) => p.archived === 'false')?.id || '',
    ),
    [description, setDescription] = useState(''),
    [members, setMembers] = useState<Record<string, string>>({ [me!.id]: 'responsible' }),
    [search, setSearch] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (step < 3) {
          setStep(step + 1);
          return;
        }
        if (
          await run(async () => {
            const result = await api('/commissions', 'POST', {
              name,
              projectId: pid,
              description,
              members: Object.entries(members).map(([userId, role]) => ({ userId, role })),
            });
            navigate('commission', pid, result.id);
          }, '¡La comisión está lista!')
        )
          setModal('');
      }}
    >
      <div className="steps">
        {['Datos', 'Miembros', 'Crear'].map((label, i) => (
          <span key={label} className={step >= i + 1 ? 'active' : ''}>
            <b>{i + 1}</b>
            {label}
          </span>
        ))}
      </div>
      {step === 1 && (
        <>
          <label>
            Nombre de la comisión
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo, Cocina"
            />
          </label>
          <label>
            Proyecto
            <Select value={pid} onChange={(e) => setPid(e.target.value)} required>
              <option value="">Selecciona un proyecto</option>
              {data.projects
                .filter((p) => p.archived === 'false')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            Descripción (opcional)
            <textarea
              maxLength={3000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿De qué se encargará este equipo?"
            />
          </label>
          <img
            className="form-monkey"
            src="/monkey.webp"
            alt="La mascota de Bandarlog preparada para ayudar"
          />
        </>
      )}
      {step === 2 && (
        <>
          <label className="search">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre o correo…"
              aria-label="Buscar personas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {data.users
            .filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
            .map((u) => (
              <div className="select-person" key={u.id}>
                <input
                  aria-label={`Añadir ${u.name}`}
                  type="checkbox"
                  checked={!!members[u.id]}
                  onChange={(e) =>
                    setMembers((old) => {
                      const next = { ...old };
                      if (e.target.checked) next[u.id] = 'scouter';
                      else delete next[u.id];
                      return next;
                    })
                  }
                />
                <Avatar user={u} small />
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </span>
                {members[u.id] && (
                  <Select
                    aria-label={`Rol de ${u.name}`}
                    value={members[u.id]}
                    onChange={(e) => setMembers({ ...members, [u.id]: e.target.value })}
                  >
                    <option value="scouter">Scouter</option>
                    <option value="responsible">Responsable</option>
                  </Select>
                )}
              </div>
            ))}
          <p className="hint">
            Podrás invitar por correo a nuevas personas desde la comisión creada.
          </p>
        </>
      )}
      {step === 3 && (
        <div className="confirm-commission">
          <img className="form-monkey" src="/monkey.webp" alt="" />
          <h2>{name}</h2>
          <p>{data.projects.find((p) => p.id === pid)?.name}</p>
          <p>{description}</p>
          <strong>{Object.keys(members).length} personas para empezar</strong>
        </div>
      )}
      <div className="form-actions">
        {step > 1 && (
          <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
            Atrás
          </button>
        )}
        <button className="primary" disabled={busy || (step === 2 && !Object.keys(members).length)}>
          {step === 3 ? 'Crear comisión' : 'Siguiente'}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
function MemberForm() {
  const {
    data,
    me,
    view,
    project,
    commission,
    development,
    busy,
    canManage,
    scoped,
    usersOf,
    run,
    navigate,
    setAssignee,
    setTab,
    setView,
    setModal,
    setToast,
    setSelected,
    pOf,
  } = React.useContext(FormState);
  const [search, setSearch] = useState('');
  const [directory, setDirectory] = useState<User[]>([]),
    [searchError, setSearchError] = useState('');
  useEffect(() => {
    let active = true;
    if (!commission) {
      setDirectory([]);
      setSearchError('');
      return;
    }
    if (search.trim().length < 2) {
      setDirectory([]);
      return;
    }
    const timer = setTimeout(() => {
      void api(
        `/directory?commissionId=${encodeURIComponent(commission)}&q=${encodeURIComponent(search)}`,
      )
        .then((rows) => {
          if (active) {
            setDirectory(rows);
            setSearchError('');
          }
        })
        .catch((e) => {
          if (active) setSearchError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, commission]);
  const available = [...new Map([...data.users, ...directory].map((u) => [u.id, u])).values()];
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await run(async () => {
              await api(
                commission ? `/commissions/${commission}/members` : `/projects/${project}/members`,
                'POST',
                {
                  userIds: f.getAll('userIds'),
                },
              );
            })
          )
            setModal('');
        }}
      >
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar personas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {searchError && (
          <p role="alert" className="error">
            {searchError}
          </p>
        )}
        {available
          .filter(
            (u) =>
              !(commission
                ? data.members.some((m) => m.userId === u.id && m.commissionId === commission)
                : data.projectMembers.some((m) => m.userId === u.id && m.projectId === project)) &&
              `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((u) => (
            <label className="select-person" key={u.id}>
              <input type="checkbox" name="userIds" value={u.id} />
              <Avatar user={u} small />
              <span>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
            </label>
          ))}
        <button className="primary" disabled={busy}>
          Añadir personas seleccionadas
        </button>
      </form>
      <hr />
      <h3>Invitar por correo</h3>
      <InvitationForm />
    </>
  );
}
function InvitationForm() {
  const { data, me, commission, project, canManage, run, busy, development } =
    React.useContext(FormState);
  const global = me.role === 'admin' || me.role === 'coordination';
  const choices = data.commissions.filter(
    (c) =>
      canManage(c.id) &&
      (!project || c.projectId === project) &&
      data.projects.find((p) => p.id === c.projectId)?.archived !== 'true',
  );
  const [cid, setCid] = useState(commission || (!global ? choices[0]?.id || '' : '')),
    [mode, setMode] = useState('single'),
    [addresses, setAddresses] = useState(''),
    [role, setRole] = useState('scouter'),
    [result, setResult] = useState<{
      created: string[];
      skipped: { email: string; reason: string }[];
    } | null>(null);
  const values = addresses.trim()
    ? addresses
        .trim()
        .split(/[\s,;]+/)
        .map((v) => v.toLowerCase())
    : [];
  const unique = [...new Set(values)];
  const invalid = unique.filter((v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  return (
    <form
      className="invite-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setResult(null);
        await run(
          async () => {
            setResult(
              await api(
                commission
                  ? `/commissions/${commission}/invitations`
                  : project
                    ? `/projects/${project}/invitations`
                    : '/invitations',
                'POST',
                {
                  commissionId: commission || (!project ? cid : null) || null,
                  projectId: !commission && project ? project : null,
                  emails: unique,
                  role: commission || (!project && cid) ? role : 'scouter',
                },
              ),
            );
          },
          development
            ? 'Invitaciones registradas en la bandeja de desarrollo'
            : 'Invitaciones preparadas para envío',
        );
      }}
    >
      <p className="hint">
        Invita a una persona o pega una lista. No se crean cuentas duplicadas ni se cambian roles de
        personas que ya pertenecen al equipo.
      </p>
      {commission || project ? (
        <div className="invitation-destination">
          <span>Destino de la invitación</span>
          <strong>
            {commission
              ? data.commissions.find((c) => c.id === commission)?.name
              : data.projects.find((p) => p.id === project)?.name}
          </strong>
        </div>
      ) : (
        <label>
          Destino de la invitación
          <Select value={cid} required={!global} onChange={(e) => setCid(e.target.value)}>
            {global && <option value="">Grupo · sin comisión por ahora</option>}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {data.projects.find((p) => p.id === c.projectId)?.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {(commission || (!project && cid)) && (
        <label>
          Rol en la comisión
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="scouter">Scouter</option>
            <option value="responsible">Responsable</option>
          </Select>
        </label>
      )}
      <div className="invitation-mode">
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'single'}
            onChange={() => {
              setMode('single');
              setAddresses('');
              setResult(null);
            }}
          />
          Un correo
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'bulk'}
            onChange={() => {
              setMode('bulk');
              setAddresses('');
              setResult(null);
            }}
          />
          Lista de correos
        </label>
      </div>
      {mode === 'single' ? (
        <label>
          Correo electrónico
          <input
            type="email"
            required
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            placeholder="persona@ejemplo.org"
          />
        </label>
      ) : (
        <label>
          Correos electrónicos
          <textarea
            required
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            placeholder={'ana@ejemplo.org\ncarlos@ejemplo.org'}
          />
          <small>Separados por comas, punto y coma o saltos de línea. Máximo 100 por envío.</small>
        </label>
      )}
      {values.length > 0 && (
        <p className="hint">
          {unique.length} direcciones únicas
          {values.length > unique.length
            ? ` · ${values.length - unique.length} repetidas omitidas`
            : ''}
        </p>
      )}
      {invalid.length > 0 && (
        <p role="alert" className="error">
          Revisa estas direcciones: {invalid.join(', ')}
        </p>
      )}
      {unique.length > 100 && (
        <p role="alert" className="error">
          Divide la lista en grupos de hasta 100 correos.
        </p>
      )}
      <button
        className="primary"
        disabled={
          busy ||
          !unique.length ||
          !!invalid.length ||
          unique.length > 100 ||
          (!global && !commission && !project && !cid)
        }
      >
        <Mail size={16} />
        {mode === 'single' ? 'Enviar invitación' : 'Enviar invitaciones'}
      </button>
      {result && (
        <div className="invitation-result" role="status">
          <strong>
            {result.created.length} invitaciones preparadas
            {development ? ' · previsualización, sin envío real' : ''}
          </strong>
          {result.created.length > 0 && (
            <ul>
              {result.created.map((address) => (
                <li key={address}>{address}</li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <>
              <p>{result.skipped.length} direcciones omitidas:</p>
              <ul>
                {result.skipped.map((item) => (
                  <li key={item.email}>
                    {item.email}: {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}

function ProjectForm() {
  const {
    data,
    me,
    view,
    project,
    commission,
    development,
    busy,
    canManage,
    scoped,
    usersOf,
    run,
    navigate,
    setAssignee,
    setTab,
    setView,
    setModal,
    setToast,
    setSelected,
    pOf,
  } = React.useContext(FormState);
  const [kind, setKind] = useState(view === 'rounds' ? 'ronda' : 'camp');
  const [artworkTheme, setArtworkTheme] = useState('scout');
  const [projectName, setProjectName] = useState('');
  const automaticChristmas = inferArtworkTheme(projectName) === 'christmas';
  const [themeChosen, setThemeChosen] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await run(
            async () => {
              const p = await api('/projects', 'POST', {
                name: f.get('name'),
                type: kind,
                artworkTheme: automaticChristmas ? 'christmas' : artworkTheme,
                parentId: f.get('parentId') || undefined,
                starts: f.get('starts'),
                ends: f.get('ends'),
              });
              navigate('project', p.id);
            },
            kind === 'camp' ? 'Campamento creado' : 'Proyecto creado',
          )
        )
          setModal('');
      }}
    >
      <label>
        Nombre
        <input
          name="name"
          required
          maxLength={200}
          onChange={(event) => {
            setProjectName(event.target.value);
            if (!themeChosen) setArtworkTheme(inferArtworkTheme(event.target.value));
          }}
        />
      </label>
      <label>
        Tipo
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="ronda">Proyecto anual</option>
          <option value="camp">Campamento</option>
        </Select>
      </label>
      {kind === 'camp' && (
        <label>
          Proyecto anual
          <Select name="parentId" required>
            <option value="">Selecciona un proyecto anual</option>
            {data.projects
              .filter((p) => p.type === 'ronda' && p.archived === 'false')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </label>
      )}
      <label>
        Colección de ilustraciones
        <Select
          value={automaticChristmas ? 'christmas' : artworkTheme}
          disabled={automaticChristmas}
          onChange={(event) => {
            setThemeChosen(true);
            setArtworkTheme(event.target.value);
          }}
        >
          {artworkThemes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="form-grid">
        <label>
          Inicio
          <input type="date" name="starts" required />
        </label>
        <label>
          Fin
          <input type="date" name="ends" required />
        </label>
      </div>
      <button className="primary" disabled={busy}>
        {kind === 'camp' ? 'Crear campamento' : 'Crear proyecto'}
      </button>
    </form>
  );
}
function localInput(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Empty({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="empty">
      <img src="/monkey.webp" alt="" />
      <h3>{text}</h3>
      <p>{sub}</p>
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
  side = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = ref.current;
    const focus = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],summary,[tabindex="0"]',
        ) || [],
      ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'));
    focus()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focus(),
        first = els[0],
        last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    root?.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = old;
      root?.removeEventListener('keydown', trap);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${side ? 'side' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="dialog">
        <header>
          <strong>{title}</strong>
          <button aria-label="Cerrar" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js').catch(() => {});
