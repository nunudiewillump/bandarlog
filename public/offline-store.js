/* Shared by the window and service worker. Private snapshots and queued changes
   live in IndexedDB, scoped to the last authenticated user, never in HTTP cache. */
(() => {
  const database = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('bandarlog-offline', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  async function update(change) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite'),
        store = tx.objectStore('state');
      let result;
      const request = store.get('active');
      request.onsuccess = () => {
        const state = request.result || { queue: [] };
        try {
          result = change(state);
          store.put(state, 'active');
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  const lock = (fn) =>
    globalThis.navigator?.locks ? navigator.locks.request('bandarlog-offline-sync', fn) : fn();
  function project(state) {
    if (!state.data) return null;
    const data = structuredClone(state.data),
      user = state.me?.user;
    for (const job of state.queue) {
      const body = job.body,
        taskId = job.path.split('/')[2];
      if (job.path === '/commissions') {
        if (!data.commissions.some((c) => c.id === body.clientId)) {
          data.commissions.push({ ...body, id: body.clientId, artworkStatus: 'pending' });
          data.members.push(
            ...body.members.map((m) => ({
              ...m,
              commissionId: body.clientId,
              id: `${job.id}-${m.userId}`,
            })),
          );
        }
      } else if (job.path === '/tasks') {
        if (!data.tasks.some((t) => t.id === body.clientId)) {
          data.tasks.push({
            ...body,
            id: body.clientId,
            status: 'pending',
            blockedReason: null,
            completedAt: null,
            completedBy: null,
            updatedAt: job.createdAt,
          });
          data.assignments.push(
            ...body.responsibleIds.map((userId) => ({
              id: `${job.id}-${userId}`,
              taskId: body.clientId,
              userId,
              assignedAt: job.createdAt,
            })),
          );
        }
      } else if (job.method === 'PATCH') {
        const task = data.tasks.find((t) => t.id === taskId);
        if (!task) continue;
        const { checklistChange, ...fields } = body;
        Object.assign(task, fields, { updatedAt: job.createdAt });
        if (checklistChange) {
          const items = task.checklist || [],
            change = checklistChange;
          task.checklist =
            change.action === 'add'
              ? items.some((item) => item.id === change.id)
                ? items
                : [...items, { id: change.id, title: change.title, done: false }]
              : change.action === 'remove'
                ? items.filter((item) => item.id !== change.id)
                : items.map((item) =>
                    item.id !== change.id
                      ? item
                      : change.action === 'edit'
                        ? { ...item, title: change.title }
                        : { ...item, done: change.done },
                  );
        }
        if (body.status) {
          task.completedAt = body.status === 'done' ? job.createdAt : null;
          task.completedBy = body.status === 'done' ? user?.id : null;
          task.blockedReason = body.status === 'blocked' ? body.blockedReason : null;
        }
        if (body.responsibleIds) {
          const previous = data.assignments.filter((a) => a.taskId === taskId);
          data.assignments = data.assignments.filter((a) => a.taskId !== taskId);
          data.assignments.push(
            ...body.responsibleIds.map(
              (userId) =>
                previous.find((a) => a.userId === userId) || {
                  id: `${job.id}-${userId}`,
                  taskId,
                  userId,
                  assignedAt: job.createdAt,
                },
            ),
          );
        }
      }
      if (job.path.startsWith('/tasks'))
        data.activity.push({
          id: job.id,
          taskId: job.path === '/tasks' ? body.clientId : taskId,
          userId: user?.id,
          kind: job.path.endsWith('/comments') ? 'comment' : 'updated',
          body: body.body || 'Cambio pendiente de sincronización.',
          createdAt: job.createdAt,
        });
    }
    for (const summary of data.campSummaries || []) {
      for (const commission of summary.commissions) {
        if (!data.commissions.some((c) => c.id === commission.id)) continue;
        const tasks = data.tasks.filter((t) => t.commissionId === commission.id);
        const counts = {
          total: tasks.length,
          done: tasks.filter((t) => t.status === 'done').length,
          open: tasks.filter((t) => t.status !== 'done').length,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
          overdue: tasks.filter((t) => t.status !== 'done' && +new Date(t.due) < Date.now()).length,
        };
        for (const [key, value] of Object.entries(counts)) {
          summary[key] += value - commission[key];
          commission[key] = value;
        }
      }
    }
    return data;
  }
  const allowed = (path, method) =>
    (method === 'POST' && ['/tasks', '/commissions'].includes(path)) ||
    (method === 'PATCH' && /^\/tasks\/[^/]+$/.test(path)) ||
    (method === 'POST' && /^\/tasks\/[^/]+\/comments$/.test(path));
  async function remember(path, value) {
    return update((s) => {
      if (path === '/me') {
        if (s.me?.user.id !== value.user.id) {
          s.data = null;
          s.queue = [];
        }
        // CSRF is renewed at sync and never written to disk.
        s.me = { ...value, csrf: '' };
      }
      if (path === '/data' && s.me) s.data = value;
      return path === '/data' ? project(s) || value : value;
    });
  }
  async function cached(path) {
    return update((s) => (path === '/me' ? s.me : path === '/data' ? project(s) : null));
  }
  async function enqueue(path, method, body, id) {
    if (!allowed(path, method))
      throw new Error('Esta acción necesita conexión. Inténtalo cuando recuperes cobertura.');
    return lock(() =>
      update((s) => {
        if (!s.me || !s.data)
          throw new Error('Abre Bandarlog con conexión antes de trabajar sin cobertura.');
        const createdAt = new Date().toISOString();
        s.queue.push({ path, method, body, id, userId: s.me.user.id, createdAt });
        const task = project(s)?.tasks.find((t) => t.id === path.split('/')[2]);
        return { queued: true, ok: true, id: body.clientId || id, task };
      }),
    );
  }
  async function flush() {
    return lock(async () => {
      let state = await update((s) => structuredClone(s));
      if (!state.queue.length) return;
      let response;
      try {
        response = await fetch('/api/me', { cache: 'no-store' });
      } catch {
        return;
      }
      if (!response.ok) {
        await update((s) => {
          s.error = 'Inicia sesión para sincronizar tus cambios pendientes.';
        });
        return;
      }
      const session = await response.json();
      if (session.user.id !== state.me?.user.id) {
        await update((s) => {
          s.error = 'Los cambios pendientes pertenecen a otra cuenta.';
        });
        return;
      }
      for (const queued of state.queue) {
        // Earlier creates/status changes can replace the expected server version
        // of this dependent job. Read the persisted version, not the initial snapshot.
        const job = await update((s) => structuredClone(s.queue.find((j) => j.id === queued.id)));
        if (!job) continue;
        if (job.failed) break;
        try {
          const result = await fetch('/api' + job.path, {
            method: job.method,
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': session.csrf,
              'X-Mutation-ID': job.id,
            },
            body: JSON.stringify(job.body),
          });
          const saved = await result.json();
          if (!result.ok) {
            await update((s) => {
              const current = s.queue.find((j) => j.id === job.id);
              if (current) current.failed = true;
              s.error = saved.error || 'No se pudo sincronizar. Revisa el cambio pendiente.';
            });
            break;
          }
          await update((s) => {
            s.queue = s.queue.filter((j) => j.id !== job.id);
            s.error = '';
            if (saved.task) {
              const entityPath = job.path === '/tasks' ? '/tasks/' + saved.id : job.path;
              const next = s.queue.find((j) => j.path === entityPath && j.method === 'PATCH');
              if (next && next.body.expectedUpdatedAt === job.createdAt)
                next.body.expectedUpdatedAt = saved.task.updatedAt;
            }
          });
        } catch {
          break;
        }
      }
      try {
        const current = await fetch('/api/data', { cache: 'no-store' });
        if (current.ok) await remember('/data', await current.json());
      } catch {}
      if (globalThis.clients) {
        for (const client of await clients.matchAll())
          client.postMessage({ type: 'bandarlog:synced' });
      } else globalThis.dispatchEvent(new Event('bandarlog:data'));
    });
  }
  async function discard() {
    return update((s) => {
      s.queue = [];
      s.error = '';
    });
  }
  async function retry() {
    await update((s) => {
      s.queue.forEach((j) => {
        delete j.failed;
      });
      s.error = '';
    });
    return flush();
  }
  async function clear() {
    return lock(() =>
      update((s) => {
        for (const k of Object.keys(s)) delete s[k];
        s.queue = [];
      }),
    );
  }
  globalThis.BandarlogOffline = {
    remember,
    cached,
    enqueue,
    flush,
    clear,
    discard,
    retry,
    status: () => update((s) => ({ pending: s.queue.length, error: s.error || '' })),
    allowed,
  };
})();
