import './platform-admin.css';
// This entry has no ordinary app imports, Service Worker, IndexedDB or web storage.
type Child = Node | string | number | null | undefined | false;
function el(
  tag: string,
  props: Record<string, any> | null = null,
  ...children: (Child | Child[])[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (['value', 'checked', 'disabled', 'selected'].includes(key)) (node as any)[key] = value;
    else if (value !== false && value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  }
  for (const child of children.flat())
    if (child !== null && child !== undefined && child !== false)
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const root = document.getElementById('platform-root')!;
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const value = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? nf.format(v) : '—');
const percent = (n: unknown, d: unknown) =>
  typeof n === 'number' && typeof d === 'number' && d > 0 ? value((100 * n) / d) + ' %' : '—';
const date = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'Europe/Madrid' }).format(
        new Date(v),
      )
    : '—';
const views = [
  ['overview', 'Inicio'],
  ['metrics', 'Métricas'],
  ['groups', 'Grupos'],
  ['requests', 'Solicitudes'],
  ['feedback', 'Feedback'],
  ['access', 'Accesos'],
  ['mail', 'Comunicaciones'],
  ['audit', 'Auditoría'],
];
let user: any = null,
  data: any = null,
  detail: any = null,
  view = 'overview',
  period = '7',
  cursor = '',
  nextCursor = '',
  filter = '',
  search = '',
  message = '',
  email = '',
  challenge = '',
  wait = 0,
  working = false,
  google = false;
let codeValue = '';
let loadFailed = false,
  booting = true;
let controller: AbortController | undefined;
const channel =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('bandarlog-platform') : null;
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: any = {},
  ) {
    super(message);
  }
}
async function api(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  const response = await fetch('/api/platform/' + path, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && user?.csrf ? { 'X-CSRF-Token': user.csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({ error: 'Respuesta no disponible.' }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error || 'No se pudo completar la operación.',
      result,
    );
  return result;
}
function clearPrivate() {
  controller?.abort();
  user = null;
  data = null;
  detail = null;
  challenge = '';
  codeValue = '';
  message = '';
  working = false;
  root.replaceChildren();
}
channel?.addEventListener('message', (e) => {
  if (e.data === 'logout') {
    clearPrivate();
    email = '';
    renderLogin();
  }
});
function button(text: string, onclick: () => unknown, secondary = false, accessibleName?: string) {
  return el(
    'button',
    {
      type: 'button',
      class: secondary ? 'secondary' : '',
      disabled: working,
      onclick,
      'aria-label': accessibleName,
    },
    text,
  );
}
function help(...children: Child[]) {
  return el(
    'details',
    { class: 'definition' },
    el('summary', null, 'Definiciones y fuentes'),
    ...children,
  );
}
function heading(title: string, subtitle?: string, refresh: () => unknown = () => loadView()) {
  return el(
    'div',
    { class: 'page-title' },
    el('div', null, el('h1', null, title), subtitle ? el('p', null, subtitle) : null),
    button('Actualizar', refresh, true),
  );
}
function metrics(rows: [string, unknown, string][]) {
  return el(
    'dl',
    { class: 'metrics' },
    rows.map(([label, n, note]) =>
      el(
        'div',
        null,
        el('dt', null, label),
        el('dd', null, typeof n === 'string' ? n : value(n)),
        el('small', null, note),
      ),
    ),
  );
}
function table(caption: string, columns: string[], rows: Child[][]) {
  const head = el(
    'thead',
    null,
    el(
      'tr',
      null,
      columns.map((c) => el('th', { scope: 'col' }, c)),
    ),
  );
  const body = el(
    'tbody',
    null,
    rows.length
      ? rows.map((row) =>
          el(
            'tr',
            null,
            row.map((cell, i) => el('td', { class: i ? 'number' : '' }, cell)),
          ),
        )
      : el('tr', null, el('td', { colspan: columns.length }, 'Sin resultados')),
  );
  return el(
    'div',
    {
      class: caption === 'Adopción por grupo' ? 'table-wrap group-adoption' : 'table-wrap',
      role: 'region',
      tabindex: 0,
      'aria-label': caption,
    },
    el('table', null, el('caption', null, caption), head, body),
  );
}
let fieldIndex = 0;
function field(label: string, input: HTMLElement) {
  if (!input.id) input.id = 'platform-field-' + ++fieldIndex;
  return el(
    'div',
    { class: 'field' },
    el('label', { for: input.id }, el('span', null, label)),
    input,
  );
}
function failure(error: any) {
  if (error.name === 'AbortError') return;
  if (error instanceof ApiError && [401, 403, 428].includes(error.status)) {
    clearPrivate();
    message = error.message;
    renderLogin();
  } else {
    loadFailed = true;
    message = error instanceof Error ? error.message : 'Error de conexión. Reintenta.';
    render();
  }
}
async function bootstrap() {
  root.replaceChildren(
    el('div', { class: 'auth', role: 'status' }, 'Comprobando sesión administrativa…'),
  );
  try {
    user = await api('me');
    booting = false;
    await loadView();
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      clearPrivate();
      booting = false;
      renderLogin();
    } else {
      booting = false;
      root.replaceChildren(
        el(
          'div',
          { class: 'auth' },
          el('p', { role: 'alert' }, 'No se pudo comprobar la sesión.'),
          button('Reintentar', bootstrap),
        ),
      );
    }
  }
}
async function loginConfig() {
  try {
    google = (await api('auth/config')).googleEnabled === true;
    if (!user && !booting) renderLogin();
  } catch {
    /* Code sign-in stays available. */
  }
}
function renderLogin() {
  const notice =
    message ||
    (new URLSearchParams(location.search).has('auth_error')
      ? 'No se ha completado Google. Usa el código de correo.'
      : '');
  const section = el(
    'section',
    { class: 'auth' },
    el('div', { class: 'brand' }, el('img', { src: '/brand-mark.png', alt: '' }), 'Bandarlog'),
    el('h1', null, 'Administración'),
    el('p', { class: 'muted' }, 'Acceso reservado'),
  );
  const mail = el('input', {
    type: 'email',
    autocomplete: 'email',
    required: true,
    disabled: working,
    value: email,
    oninput: (e: Event) => (email = (e.target as HTMLInputElement).value),
  });
  const form = el(
    'form',
    {
      onsubmit: async (e: Event) => {
        e.preventDefault();
        if (working) return;
        email = email.trim().toLowerCase();
        working = true;
        message = '';
        renderLogin();
        try {
          const result = await api('auth/code/request', 'POST', { email });
          challenge = result.challengeId;
          codeValue = '';
          waitFor(result.retryAfter);
          message = result.message;
        } catch (error: any) {
          if (error instanceof ApiError && error.status === 429) {
            message = error.message;
            if (error.data.challengeId) challenge = error.data.challengeId;
            waitFor(error.data.retryAfter || 60);
          } else message = error.message || 'Sin conexión. Reintenta.';
        } finally {
          working = false;
          renderLogin();
        }
      },
    },
    field('Correo', mail),
    el(
      'button',
      { id: 'platform-resend', type: 'submit', disabled: working || wait > 0 },
      working ? 'Solicitando…' : wait > 0 ? `Reenviar en ${wait} s` : 'Recibir código',
    ),
  );
  section.append(form);
  if (challenge) {
    section.append(
      el(
        'form',
        {
          onsubmit: async (e: Event) => {
            e.preventDefault();
            if (working) return;
            working = true;
            message = '';
            renderLogin();
            try {
              await api('auth/code/verify', 'POST', {
                email,
                challengeId: challenge,
                code: codeValue,
              });
              challenge = '';
              user = await api('me');
              history.replaceState(null, '', '/plataforma' + location.hash);
              working = false;
              await loadView();
            } catch (error: any) {
              working = false;
              message = error.message || 'Sin conexión. Reintenta.';
              renderLogin();
            }
          },
        },
        field(
          'Código de correo',
          el('input', {
            inputmode: 'numeric',
            autocomplete: 'one-time-code',
            value: codeValue,
            pattern: '[0-9]{6}',
            maxlength: 6,
            required: true,
            oninput: (e: Event) => (codeValue = (e.target as HTMLInputElement).value),
          }),
        ),
        el('button', { type: 'submit', disabled: working }, working ? 'Verificando…' : 'Entrar'),
      ),
    );
  }
  if (google)
    section.append(
      el('a', { class: 'google', href: '/api/platform/auth/google/start' }, 'Continuar con Google'),
    );
  if (notice) section.append(el('p', { class: 'status', role: 'status' }, notice));
  root.replaceChildren(section);
}
// Local countdown only; no timer sends a network request.
let waitDeadline = 0,
  waitTimer: ReturnType<typeof setTimeout> | undefined;
function countdown() {
  if (waitTimer) clearTimeout(waitTimer);
  wait = Math.max(0, Math.ceil((waitDeadline - Date.now()) / 1000));
  const b = document.getElementById('platform-resend') as HTMLButtonElement | null;
  if (b && !working) {
    b.disabled = wait > 0;
    b.textContent = wait > 0 ? `Reenviar en ${wait} s` : 'Recibir código';
  }
  if (wait > 0 && document.visibilityState !== 'hidden') waitTimer = setTimeout(countdown, 1000);
}
function waitFor(seconds: number) {
  wait = seconds;
  waitDeadline = Date.now() + seconds * 1000;
  countdown();
}
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' && wait > 0) countdown();
});
function selectView(key: string) {
  if (view === key && !detail) return;
  view = key;
  detail = null;
  cursor = '';
  filter = '';
  search = '';
  message = '';
  location.hash = key;
  void loadView();
}
async function loadView() {
  if (!user) return;
  if (view === 'feedback' && !user.productFeedbackEnabled) view = 'overview';
  controller?.abort();
  controller = new AbortController();
  detail = null;
  data = null;
  message = '';
  loadFailed = false;
  render();
  try {
    data = await api(
      view +
        '?' +
        new URLSearchParams({ period: view === 'overview' ? '7' : period, cursor, filter }),
      'GET',
      undefined,
      controller.signal,
    );
    nextCursor = data?.nextCursor || '';
    render();
  } catch (error) {
    failure(error);
  }
}
async function openRequest(id: string) {
  try {
    detail = await api('requests/' + encodeURIComponent(id));
    render();
  } catch (error) {
    failure(error);
  }
}
async function openGroup(id: string) {
  try {
    const result = await api('groups/' + encodeURIComponent(id));
    if (!result) throw new ApiError(404, 'Grupo no encontrado.');
    detail = result;
    if (view !== 'groups') {
      view = 'groups';
      data = { items: [] };
      location.hash = 'groups';
    }
    render();
  } catch (error) {
    failure(error);
  }
}
async function logout() {
  working = true;
  try {
    await api('logout', 'POST', {});
    channel?.postMessage('logout');
    clearPrivate();
    email = '';
    renderLogin();
  } catch (error) {
    working = false;
    failure(error);
  }
}
const navPaths: Record<string, string> = {
  overview: 'M3 10 12 3l9 7v11h-6v-7H9v7H3z',
  metrics: 'M4 20V10m8 10V4m8 16v-7',
  groups: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  requests: 'M9 3h6v4H9zM8 5H5v16h14V5h-3M8 12h8m-8 4h5',
  feedback: 'M4 5h16v11H9l-5 4V5zm4 4h8m-8 3h5',
  access: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6',
  mail: 'M3 5h18v14H3zM3 5l9 7 9-7',
  audit: 'M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5',
};
function navIcon(key: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(k, v);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', navPaths[key]);
  svg.append(path);
  return svg;
}
function render() {
  if (!user) {
    renderLogin();
    return;
  }
  const nav = el(
    'nav',
    { 'aria-label': 'Administración' },
    views.filter(([key]) => key !== 'feedback' || user.productFeedbackEnabled).map(([key, label]) =>
      el(
        'button',
        {
          type: 'button',
          'aria-current': view === key ? 'page' : null,
          onclick: () => selectView(key),
        },
        navIcon(key),
        label,
      ),
    ),
  );
  const aside = el(
    'aside',
    null,
    el(
      'div',
      null,
      el('div', { class: 'brand' }, el('img', { src: '/brand-mark.png', alt: '' }), 'Bandarlog'),
      el('div', { class: 'access-label' }, 'Administración'),
    ),
    nav,
    el(
      'div',
      { class: 'session-note' },
      el('strong', null, user.name),
      button('Cerrar administración', logout, true),
    ),
  );
  const main = el('main', { class: 'sheet', id: 'content', tabindex: -1 });
  if (message) main.append(el('p', { class: 'status', role: 'alert' }, message));
  if (!data)
    main.append(
      loadFailed
        ? button('Reintentar', () => loadView(), true)
        : el('p', { role: 'status' }, 'Cargando…'),
    );
  else if (detail && view === 'requests') renderRequest(main, detail);
  else if (detail && view === 'groups') renderGroup(main, detail);
  else renderView(main);
  root.replaceChildren(
    el(
      'a',
      {
        class: 'skip',
        href: '#content',
        onclick: (event: Event) => {
          event.preventDefault();
          main.focus();
        },
      },
      'Saltar al contenido',
    ),
    el(
      'div',
      { class: 'layout' },
      aside,
      el(
        'div',
        { class: 'workspace' },
        el(
          'header',
          { class: 'top' },
          el('p', null, 'Administración de la plataforma'),
          el('small', null, 'Europe/Madrid'),
        ),
        main,
      ),
    ),
  );
}
function coverage(u: any) {
  return el(
    'p',
    { class: 'coverage' },
    u?.coverage?.since
      ? 'Medición desde ' +
          date(u.coverage.since) +
          (u.coverage.current ? '' : ' · periodo incompleto')
      : 'Actividad: pendiente de iniciar la medición',
  );
}
function usageTable(u: any) {
  const covered = u.coverage?.current;
  const active = covered ? u.active : null;
  return table(
    'Uso de funcionalidades',
    ['Acción', 'Eventos', 'Cuentas', '% activas'],
    [
      ['Tareas creadas', value(u.created), value(u.createdUsers), percent(u.createdUsers, active)],
      [
        'Tareas actualizadas',
        value(u.updated),
        value(u.updatedUsers),
        percent(u.updatedUsers, active),
      ],
      [
        'Finalizaciones',
        value(covered ? u.done : null),
        value(covered ? u.doneUsers : null),
        percent(covered ? u.doneUsers : null, active),
      ],
      ['Comentarios', value(u.comments), value(u.commentUsers), percent(u.commentUsers, active)],
      [
        'Pasos de checklist marcados',
        value(covered ? u.checklist : null),
        value(covered ? u.checklistUsers : null),
        percent(covered ? u.checklistUsers : null, active),
      ],
    ],
  );
}
function renderGroup(main: HTMLElement, g: any) {
  main.append(
    button(
      'Volver a grupos',
      () => {
        detail = null;
        render();
      },
      true,
    ),
    heading(g.name, undefined, () => openGroup(g.id)),
  );
  const u = g.usage;
  main.append(
    metrics([
      ['Cuentas', u.members, 'Habilitadas'],
      ['Activas hoy', u.coverage.daily ? u.daily : null, 'DAU'],
      ['Activas 7 días', u.coverage.weekly ? u.weekly : null, 'WAU'],
      ['Activas 30 días', u.coverage.monthly ? u.monthly : null, 'MAU'],
      ['Colaboran', u.contributors, '7 días'],
      ['Proyectos', u.projects, 'Vigentes'],
    ]),
    coverage(u),
    usageTable(u),
    el('p', null, 'Alta: ' + date(g.createdAt)),
  );
}
function renderRequest(main: HTMLElement, r: any) {
  main.append(
    button(
      'Volver a solicitudes',
      () => {
        detail = null;
        void loadView();
      },
      true,
    ),
    heading(r.groupName, undefined, () => openRequest(r.id)),
    table(
      'Solicitud',
      ['Responsable', 'Correo', 'Recibida', 'Estado'],
      [[r.name, r.email, date(r.createdAt), requestStatus(r)]],
    ),
  );
  if (r.approvedAt || r.rejectedAt || r.consumedAt) {
    if (r.decisionReason) main.append(el('p', null, 'Motivo: ' + r.decisionReason));
    return;
  }
  let reason = '',
    confirmed = false;
  const status = el('p', { role: 'status', class: 'status' });
  const submit = async (decision: string) => {
    if (working) return;
    if (!reason.trim() || !confirmed) {
      status.textContent = 'Indica el motivo y confirma la decisión.';
      return;
    }
    working = true;
    render();
    try {
      await api('requests/' + encodeURIComponent(r.id) + '/review', 'POST', {
        decision,
        reason: reason.trim(),
        confirmed: true,
      });
      working = false;
      message =
        decision === 'approve' ? 'Solicitud aprobada. Activación en cola.' : 'Solicitud rechazada.';
      await openRequest(r.id);
    } catch (error) {
      working = false;
      failure(error);
    }
  };
  main.append(
    el(
      'section',
      { class: 'decision' },
      el('h2', null, 'Decisión'),
      el('p', null, 'Aprobar envía la activación; no activa el grupo.'),
      field(
        'Motivo',
        el('textarea', {
          maxlength: 500,
          oninput: (e: Event) => (reason = (e.target as HTMLTextAreaElement).value),
        }),
      ),
      el(
        'label',
        null,
        el('input', {
          type: 'checkbox',
          onchange: (e: Event) => (confirmed = (e.target as HTMLInputElement).checked),
        }),
        ' Confirmo la decisión',
      ),
      el(
        'div',
        { class: 'actions' },
        button('Aprobar solicitud', () => submit('approve')),
        button('Rechazar solicitud', () => submit('reject'), true),
      ),
      status,
    ),
  );
}
const statusLabel = (s: string) =>
  (
    ({
      pending: 'Pendiente',
      pending_v2: 'Pendiente',
      sending: 'Procesando',
      sent: 'Aceptados por proveedor',
      failed: 'Fallido',
      preview: 'Vista previa',
      cancelled: 'Cancelado',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      activated: 'Activada',
      expired: 'Caducada',
    }) as Record<string, string>
  )[s] || s;
const actionLabel = (s: string) =>
  (
    ({
      'login.email': 'Acceso con código',
      'login.google': 'Acceso con Google',
      'request.approve': 'Solicitud aprobada',
      'request.reject': 'Solicitud rechazada',
      'mail.test': 'Correo de prueba',
      'session.closed': 'Sesión cerrada',
    }) as Record<string, string>
  )[s] || s;
function requestStatus(r: any) {
  return (
    r.status ||
    (r.consumedAt
      ? 'activated'
      : r.rejectedAt
        ? 'rejected'
        : new Date(r.expires) < new Date()
          ? 'expired'
          : r.approvedAt
            ? 'approved'
            : 'pending')
  );
}
function paging(main: HTMLElement) {
  main.append(
    el(
      'div',
      { class: 'paging' },
      cursor
        ? button(
            'Primera página',
            () => {
              cursor = '';
              void loadView();
            },
            true,
          )
        : null,
      nextCursor
        ? button(
            'Siguiente',
            () => {
              cursor = nextCursor;
              void loadView();
            },
            true,
          )
        : null,
    ),
  );
}
function renderView(main: HTMLElement) {
  if (view === 'overview' || view === 'metrics') {
    const u = data.usage,
      c = u.coverage?.current,
      active = c ? u.active : null;
    main.append(
      heading(
        view === 'overview' ? 'Resumen' : 'Métricas',
        view === 'overview' ? 'Últimos 7 días' : 'Uso y recurrencia',
      ),
    );
    if (view === 'metrics')
      main.append(
        field(
          'Periodo',
          el(
            'select',
            {
              value: period,
              onchange: (e: Event) => {
                period = (e.target as HTMLSelectElement).value;
                cursor = '';
                void loadView();
              },
            },
            el('option', { value: '7', selected: period === '7' }, 'Últimos 7 días'),
            el('option', { value: '30', selected: period === '30' }, 'Últimos 30 días'),
          ),
        ),
      );
    main.append(
      metrics([
        ['Activas hoy', u.coverage.daily ? u.daily : null, 'DAU · hoy parcial'],
        ['Activas 7 días', u.coverage.weekly ? u.weekly : null, 'WAU'],
        ['Activas 30 días', u.coverage.monthly ? u.monthly : null, 'MAU'],
        [
          'Adopción',
          percent(active, u.members),
          value(active) + ' / ' + value(u.members) + ' cuentas',
        ],
        ['Colaboran', u.contributors, percent(u.contributors, active) + ' de las activas'],
        ['Proyectos', u.projects, 'Vigentes'],
      ]),
      coverage(u),
    );
    if (view === 'overview')
      main.append(
        el(
          'div',
          { class: 'row' },
          el('strong', null, value(data.stock.pendingRequests) + ' solicitudes pendientes'),
          button('Revisar', () => selectView('requests'), true),
        ),
        el(
          'div',
          { class: 'row' },
          el('strong', null, value(data.stock.mailFailed) + ' envíos con intentos agotados'),
          button('Ver envíos', () => selectView('mail'), true),
        ),
      );
    if (view === 'metrics')
      main.append(
        table(
          'Recurrencia',
          ['Indicador', 'Valor'],
          [
            ['Activas en el periodo', value(active)],
            ['Activas en ambos periodos', value(c && u.coverage.previous ? u.returning : null)],
            ['Retención', percent(c && u.coverage.previous ? u.returning : null, u.previous)],
            ['Activas en al menos 2 días', value(c ? u.recurring : null)],
            ['Uso recurrente', percent(c ? u.recurring : null, active)],
            [
              'Días activos por cuenta',
              typeof active === 'number' && active > 0 ? value(u.days / active) : '—',
            ],
          ],
        ),
      );
    if (view === 'metrics' && Array.isArray(data.series)) {
      const intervalDate = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      const interval = (r: any) => {
        const start = intervalDate.format(new Date(r.day));
        const end = r.end ? intervalDate.format(new Date(r.end)) : start;
        return (
          start +
          (period === '30' && start !== end ? '–' + end : '') +
          (r.partial ? ' · parcial' : '')
        );
      };
      const maximum = Math.max(
        1,
        ...data.series.map((r: any) => (typeof r.active === 'number' ? r.active : 0)),
      );
      main.append(
        el('h2', null, 'Actividad'),
        el(
          'p',
          { class: 'chart-caption' },
          period === '30' ? 'Cuentas activas por tramo de 5 días' : 'Cuentas activas por día',
        ),
        el(
          'div',
          {
            class: 'chart',
            role: 'img',
            'aria-label':
              'Cuentas activas: ' +
              data.series.map((r: any) => interval(r) + ': ' + value(r.active)).join('; '),
          },
          data.series.map((r: any) =>
            el(
              'div',
              { class: 'bar-cell' },
              el('strong', null, value(r.active)),
              el('div', {
                class: 'bar',
                style: `height:${typeof r.active === 'number' ? (r.active / maximum) * 120 : 0}px`,
              }),
            ),
          ),
        ),
        el(
          'div',
          { class: 'chart-labels' },
          data.series.map((r: any) => el('span', null, interval(r))),
        ),
      );
    }
    main.append(
      el('h2', null, 'Uso'),
      usageTable(u),
      help(
        el(
          'p',
          null,
          'Activas: cuentas por grupo con sesión validada. Hoy es parcial. Retención: activas en ambos periodos / activas del anterior. Recurrencia: al menos dos días de actividad. Finalización y checklist son subtipos de actualización; no sumar todas las filas. Los periodos sin cobertura muestran —.',
        ),
      ),
    );
    if (Array.isArray(data.groups))
      main.append(
        el('h2', null, 'Adopción por grupo'),
        table(
          'Adopción por grupo',
          ['Grupo', 'Activas', 'Adopción', 'Colaboran', 'Ficha'],
          data.groups.map((g: any) => [
            g.name,
            value(c ? g.active : null),
            percent(c ? g.active : null, g.members),
            value(g.contributors),
            button(
              'Ver grupo',
              () => {
                void openGroup(g.id);
              },
              true,
              'Ver ' + g.name,
            ),
          ]),
        ),
        button('Todos los grupos', () => selectView('groups'), true),
      );
  } else if (view === 'groups') {
    main.append(
      heading('Grupos'),
      el(
        'form',
        {
          class: 'toolbar',
          onsubmit: (e: Event) => {
            e.preventDefault();
            filter = search;
            cursor = '';
            void loadView();
          },
        },
        field(
          'Buscar grupo',
          el('input', {
            type: 'search',
            value: search,
            oninput: (e: Event) => (search = (e.target as HTMLInputElement).value),
          }),
        ),
        el('button', { type: 'submit' }, 'Buscar'),
      ),
      table(
        'Grupos',
        ['Grupo', 'Cuentas', 'Activas ' + period + ' días', 'Proyectos', 'Ficha'],
        data.items.map((g: any) => [
          g.name,
          value(g.members),
          value(data.coverage ? g.active : null),
          value(g.projects),
          button('Ver ' + g.name, () => openGroup(g.id), true),
        ]),
      ),
    );
    paging(main);
  } else if (view === 'requests') {
    main.append(
      heading('Solicitudes'),
      field(
        'Estado',
        el(
          'select',
          {
            onchange: (e: Event) => {
              filter = (e.target as HTMLSelectElement).value;
              cursor = '';
              void loadView();
            },
          },
          ...['', 'pending', 'approved', 'rejected', 'activated', 'expired'].map((s) =>
            el(
              'option',
              { value: s, selected: filter === s },
              (
                {
                  '': 'Todas',
                  pending: 'Pendientes',
                  approved: 'Aprobadas',
                  rejected: 'Rechazadas',
                  activated: 'Activadas',
                  expired: 'Caducadas',
                } as any
              )[s],
            ),
          ),
        ),
      ),
      table(
        'Solicitudes',
        ['Grupo', 'Recibida', 'Estado', 'Revisión'],
        data.items.map((r: any) => [
          r.groupName,
          date(r.createdAt),
          statusLabel(requestStatus(r)),
          button('Revisar ' + r.groupName, () => openRequest(r.id), true),
        ]),
      ),
    );
    paging(main);
  } else if (view === 'feedback') {
    const statuses = [
      ['new','Nueva'], ['reviewing','En revisión'], ['in_progress','En proceso'],
      ['resolved','Resuelta'], ['archived','Archivada'],
    ];
    const categories: Record<string, string> = {
      bug: 'Error', idea: 'Sugerencia', help: 'Solicitud de ayuda', general: 'Comentario general',
    };
    const options = (selected: string) => statuses.map(([key, label]) =>
      el('option', { value: key, selected: key === selected }, label),
    );
    main.append(
      heading('Feedback de Bandarlog'),
      el('label', null, 'Estado', el('select', {
        'aria-label': 'Filtrar por estado',
        onchange: (event: Event) => {
          filter = (event.currentTarget as HTMLSelectElement).value;
          cursor = '';
          void loadView();
        },
      }, [el('option', { value: '', selected: filter === '' }, 'Todos los estados'), ...options(filter)])),
      table('Aportaciones', ['Fecha','Categoría','Aportación','Contactar','Estado'],
        data.items.map((item: any) => [
          date(item.createdAt),
          categories[item.category] ?? item.category,
          el('p', { class: 'feedback-message' }, item.body),
          item.replyEmail || '—',
          el('select', {
            'aria-label': 'Cambiar estado de aportación',
            onchange: async (event: Event) => {
              const input = event.currentTarget as HTMLSelectElement;
              const status = input.value;
              input.disabled = true;
              try {
                await api('feedback/' + encodeURIComponent(item.id), 'POST', { status, revision: item.revision });
                await loadView();
              } catch (error) {
                failure(error);
              } finally { input.disabled = false; }
            },
          }, options(item.status)),
        ]),
      ),
    );
    paging(main);
  } else if (view === 'access') {
    main.append(
      heading('Accesos', 'Sesiones primarias de grupos'),
      table(
        'Métodos',
        ['Método', 'Emisiones'],
        data.methods.map((r: any) => [
          (
            {
              email: 'Código',
              google: 'Google',
              activation: 'Activación',
              unknown: 'Sin clasificar',
            } as any
          )[r.method] || r.method,
          value(r.count),
        ]),
      ),
      table(
        'Verificaciones rechazadas',
        ['Método', 'Intentos observados'],
        (data.rejected || []).map((r: any) => [r.method, value(r.count)]),
      ),
      table(
        'Tus accesos administrativos',
        ['Fecha', 'Acción'],
        data.items.map((r: any) => [date(r.at), r.action]),
      ),
    );
  } else if (view === 'mail') {
    main.append(
      heading('Comunicaciones'),
      table(
        'Cola',
        ['Estado', 'Mensajes'],
        data.items.map((r: any) => [statusLabel(r.status), value(r.count)]),
      ),
      el('h2', null, 'Resumen semanal'),
      el('iframe', {
        class: 'mail-frame',
        title: 'Vista previa con datos ficticios',
        sandbox: '',
        srcdoc: data.preview?.html || '',
      }),
      button('Enviar prueba a ' + user.email, async () => {
        working = true;
        render();
        try {
          await api('test-mail', 'POST', {});
          working = false;
          message = 'Prueba en cola.';
          render();
        } catch (error) {
          working = false;
          failure(error);
        }
      }),
    );
  } else if (view === 'audit') {
    main.append(
      heading('Auditoría'),
      table(
        'Acciones administrativas',
        ['Fecha', 'Actor', 'Acción', 'Ámbito', 'Motivo'],
        data.items.map((r: any) => [
          date(r.at),
          r.actor,
          actionLabel(r.action),
          r.target || '—',
          r.reason || '—',
        ]),
      ),
    );
    paging(main);
  }
}
window.addEventListener('pagehide', () =>
  root.replaceChildren(el('p', { role: 'status' }, 'Sesión protegida.')),
);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void bootstrap();
});
view = views.some(([key]) => key === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
void loginConfig();
void bootstrap();

window.addEventListener('hashchange', () => {
  const key = location.hash.slice(1);
  if (views.some(([v]) => v === key) && key !== view) {
    view = key;
    detail = null;
    cursor = '';
    filter = '';
    if (user) void loadView();
  }
});
