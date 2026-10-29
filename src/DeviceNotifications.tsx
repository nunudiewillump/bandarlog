import { useEffect, useState } from 'react';
import { api } from './api';
export function DeviceNotifications({
  userId,
  firstVisit = false,
}: {
  userId: string;
  firstVisit?: boolean;
}) {
  const supported =
    'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
  const [show, setShow] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = `bandarlog-push-asked:${userId}`;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  useEffect(() => {
    let alive = true;
    if (firstVisit) {
      // Present the in-app explanation first; native permission is requested by a click.
      try {
        setShow(!localStorage.getItem(key));
      } catch {
        setShow(true);
      }
    }
    if (supported)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then(async (s) => {
          let owner = '';
          try {
            owner = localStorage.getItem('bandarlog-push-owner') || '';
          } catch {}
          if (s && owner !== userId) {
            await s.unsubscribe();
            s = null;
          }
          if (alive) setEnabled(Boolean(s) && Notification.permission === 'granted');
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key, firstVisit, supported]);
  function dismiss() {
    try {
      localStorage.setItem(key, 'yes');
    } catch {}
    setShow(false);
  }
  async function activate() {
    setBusy(true);
    setError('');
    try {
      if (!supported)
        throw new Error(
          'Este navegador no admite avisos push. Puedes seguir usando los avisos por correo.',
        );
      if (apple && !installed)
        throw new Error(
          'En iPhone, añade Bandarlog a la pantalla de inicio y ábrelo desde su icono para activar los avisos.',
        );
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error(
          permission === 'denied'
            ? 'Las notificaciones están bloqueadas. Permítelas en los ajustes del navegador para este sitio.'
            : 'No has activado las notificaciones. Puedes hacerlo más adelante en Perfil.',
        );
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await api('/push/config');
      const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
        }));
      await api('/push/subscriptions', 'POST', subscription.toJSON());
      localStorage.setItem('bandarlog-push-owner', userId);
      setEnabled(true);
      dismiss();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api('/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      localStorage.removeItem('bandarlog-push-owner');
      setEnabled(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (firstVisit && !show) return null;
  return (
    <section
      className={`device-notifications ${firstVisit ? 'notification-prompt' : ''}`}
      aria-label="Notificaciones en este dispositivo"
    >
      <h2>
        {firstVisit ? '¿Quieres recibir avisos en el móvil?' : 'Notificaciones en este dispositivo'}
      </h2>
      <p>
        {enabled
          ? 'Notificaciones activadas en este dispositivo.'
          : 'Recibe tareas y recordatorios aunque Bandarlog esté cerrada. Puedes decidir cuándo avisarte en Preferencias.'}
      </p>
      {apple && !installed && (
        <p>En iPhone necesitas abrir la aplicación instalada en la pantalla de inicio.</p>
      )}
      {!supported && <p>Este navegador no admite notificaciones push.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="notice-actions">
        <button
          className="primary"
          disabled={busy || !supported}
          onClick={() => void (enabled ? disable() : activate())}
        >
          {enabled ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
        </button>
        {firstVisit && (
          <button className="secondary" disabled={busy} onClick={dismiss}>
            Ahora no
          </button>
        )}
      </div>
    </section>
  );
}
