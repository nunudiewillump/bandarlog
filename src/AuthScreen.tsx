import { installedApp, validGoogleReturn, proofChallenge } from './google-return';
import { groupBasePath } from './group-location';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { api, ApiError } from './api';
import { pendingAccess, rememberAccess, forgetAccess } from './pending-access';
import { ForestHeader } from './ForestHeader';
import { BananaLoader } from './BananaLoader';
export function AuthScreen({
  token,
  notice,
  development,
  onAuthenticated,
  onToken,
}: {
  token: string;
  notice?: string;
  development: boolean;
  onAuthenticated: () => Promise<void>;
  onToken: (token: string) => void;
}) {
  const [groupName, setGroupName] = useState('');
  const [initial] = useState(() => {
    const saved = pendingAccess();
    const requested = new URLSearchParams(location.search).get('email');
    return saved && (!requested || requested.trim().toLowerCase() === saved.email) ? saved : null;
  });
  const [email, setEmail] = useState(() =>
    (new URLSearchParams(location.search).get('email') || initial?.email || '').slice(0, 254),
  );
  const [challenge, setChallenge] = useState(initial?.challengeId || ''),
    [code, setCode] = useState(''),
    [wait, setWait] = useState(
      initial ? Math.max(0, Math.ceil((initial.resendAt - Date.now()) / 1000)) : 0,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      new URLSearchParams(location.search).get('auth_error') === 'google_email_verify'
        ? 'Para confirmar este correo, solicita un código con la misma dirección.'
        : new URLSearchParams(location.search).has('auth_error')
          ? 'No se ha completado el acceso con Google. Puedes entrar con tu correo.'
          : '',
    ),
    [google, setGoogle] = useState(false),
    [messages, setMessages] = useState<any[]>([]);
  const [standalone] = useState(installedApp);
  const [popupPending, setPopupPending] = useState(false);
  const [googleOrigin, setGoogleOrigin] = useState(location.origin);
  const preparedGoogle = useRef<{ proof: string; challenge: string } | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  useEffect(() => {
    if (!google || !standalone || popupPending) return;
    let disposed = false;
    setGoogleReady(false);
    const proof = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    void proofChallenge(proof)
      .then((challenge) => {
        if (!disposed) {
          preparedGoogle.current = { proof, challenge };
          setGoogleReady(true);
        }
      })
      .catch(() => {
        if (!disposed) setError('Usa el código de correo para entrar desde este dispositivo.');
      });
    return () => {
      disposed = true;
      preparedGoogle.current = null;
    };
  }, [google, standalone, popupPending]);

  const popupCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => popupCleanup.current?.(), []);
  function stopGoogle() {
    popupCleanup.current?.();
    popupCleanup.current = null;
    setPopupPending(false);
    setBusy(false);
  }
  async function googleInApp() {
    const prepared = preparedGoogle.current;
    if (!prepared) return;
    const popup = window.open('about:blank', 'bandarlog-google-' + crypto.randomUUID(), 'popup');
    if (!popup) {
      setError(
        'No se ha podido abrir Google. Utiliza el código de correo dentro de la aplicación.',
      );
      return;
    }
    setBusy(true);
    setPopupPending(true);
    setError('');
    const { proof, challenge } = prepared;
    preparedGoogle.current = null;
    setGoogleReady(false);
    let disposed = false,
      consuming = false,
      queuedTicket: string | null = null,
      resumeAttempts = 0;
    const exchange = async (ticket?: string) => {
      if (disposed) return;
      if (consuming) {
        if (ticket) queuedTicket = ticket;
        return;
      }
      if (!ticket && resumeAttempts >= 4) return;
      if (!ticket) resumeAttempts++;
      consuming = true;
      setBusy(true);
      try {
        const result = await api(
          ticket ? '/auth/google/return' : '/auth/google/resume',
          'POST',
          ticket ? { ticket, proof } : { proof },
        );
        if (disposed) return;
        if (result.pending) return;
        stopGoogle();
        if (result.needsEmailVerification) {
          setEmail(result.email);
          setError('Para confirmar este correo, solicita un código con la misma dirección.');
        } else {
          forgetAccess();
          await onAuthenticated();
        }
      } catch {
        if (!disposed) {
          stopGoogle();
          setError('No se ha completado el acceso con Google. Utiliza el código de correo.');
        }
      } finally {
        consuming = false;
        setBusy(false);
        if (queuedTicket && !disposed) {
          const next = queuedTicket;
          queuedTicket = null;
          void exchange(next);
        }
      }
    };
    const resume = () => {
      if (!disposed && document.visibilityState !== 'hidden') void exchange();
    };
    const receive = (event: MessageEvent) => {
      if (disposed) return;
      if (
        event.origin === googleOrigin &&
        event.source === popup &&
        event.data?.type === 'bandarlog.google.return' &&
        event.data.error === true
      ) {
        stopGoogle();
        setError('No se ha completado el acceso con Google. Utiliza el código de correo.');
        return;
      }
      const ticket = validGoogleReturn(event, popup, googleOrigin);
      if (ticket) {
        try {
          popup.postMessage({ type: 'bandarlog.google.ack', ticket }, event.origin);
        } catch {}
        void exchange(ticket);
      }
    };
    // Native PWA/Safari returns can lose opener/postMessage. Resume only on
    // foreground return or a closed popup, never by polling an idle hidden app.
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') {
        resumeAttempts = 0;
        resume();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('message', receive);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
      try {
        if (popup.closed) resume();
      } catch {}
    }, 1000);
    const timeout = window.setTimeout(() => {
      stopGoogle();
      setError('No se ha completado el acceso. Puedes entrar con un código de correo.');
    }, 180_000);
    popupCleanup.current = () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('message', receive);
      try {
        popup.close();
      } catch {}
    };
    try {
      if (!disposed) {
        popup.location.href =
          groupBasePath() +
          '/api/auth/google/start?handoff_challenge=' +
          challenge +
          '&handoff_origin=' +
          encodeURIComponent(location.origin);
        setBusy(false);
      }
    } catch {
      stopGoogle();
      setError('No se ha podido completar el acceso. Utiliza el código de correo.');
    }
  }
  const invitation = token.startsWith('invite.');
  useEffect(() => {
    void api('/auth/config')
      .then((c) => {
        setGoogleOrigin(new URL(c.googleOrigin || location.origin).origin);
        setGoogle(c.googleEnabled === true);
        setGroupName(c.group?.name || '');
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function requestCode() {
    stopGoogle();
    setBusy(true);
    setError('');
    try {
      const p = new URLSearchParams(location.search);
      const r = await api('/auth/code/request', 'POST', {
        email,
        task: p.get('task') || undefined,
        action: p.get('action') || undefined,
      });
      setChallenge(r.challengeId);
      setCode('');
      setWait(r.resendAfter || 60);
      rememberAccess(
        email.trim().toLowerCase(),
        r.challengeId,
        r.expiresIn || 600,
        r.resendAfter || 60,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const recovery = e.recovery;
        setWait(Number.isFinite(recovery.retryAfter) ? Math.max(1, recovery.retryAfter!) : 60);
        if (
          typeof recovery.challengeId === 'string' &&
          /^[a-f0-9]{64}$/.test(recovery.challengeId) &&
          Number.isFinite(recovery.expiresIn) &&
          recovery.expiresIn! > 0
        ) {
          setChallenge(recovery.challengeId);
          rememberAccess(
            email.trim().toLowerCase(),
            recovery.challengeId,
            recovery.expiresIn!,
            recovery.retryAfter || 60,
          );
        }
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError('');
    try {
      await api(
        token ? '/auth/verify' : '/auth/code/verify',
        'POST',
        token ? { token } : { challengeId: challenge, code },
      );
      forgetAccess();
      await onAuthenticated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="forest-auth">
      <ForestHeader />
      <main className="forest-auth-main">
        {notice && <p role="status">{notice}</p>}
        {challenge && !token && (
          <button
            type="button"
            className="text-link auth-back"
            disabled={busy}
            onClick={() => {
              setChallenge('');
              setCode('');
              setError('');
              setWait(0);
              forgetAccess();
            }}
          >
            <ArrowLeft size={16} />
            Cambiar correo
          </button>
        )}
        {groupName && <p className="auth-group-name">{groupName}</p>}
        <h1>
          {token
            ? invitation
              ? 'Te han invitado a Bandarlog'
              : 'Confirmar acceso'
            : challenge
              ? 'Introduce el código'
              : 'Entrar en Bandarlog'}
        </h1>
        {token && (
          <p>
            {invitation
              ? 'Acepta para entrar con el correo de la invitación.'
              : 'Confirma el acceso para entrar de forma segura.'}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {token ? (
          <button className="primary" disabled={busy} onClick={() => void verify()}>
            {invitation ? 'Aceptar invitación y entrar' : 'Confirmar inicio de sesión'}
            <ArrowRight size={18} />
          </button>
        ) : challenge ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p className="auth-recipient">Enviado a {email}</p>
            <label>
              Código de acceso
              <input
                autoFocus
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <button className="primary" disabled={busy || code.length !== 6}>
              Entrar
            </button>
            <p className="hint">
              Introduce el último código recibido. Caduca a los 10 minutos de solicitarlo.
            </p>
            <button
              className="text-link"
              type="button"
              disabled={busy || wait > 0}
              onClick={() => void requestCode()}
            >
              {wait > 0 ? `Reenviar en ${wait} s` : 'Reenviar código'}
            </button>
          </form>
        ) : (
          <>
            {google && (
              <>
                {standalone ? (
                  <button
                    type="button"
                    className="secondary google-access"
                    disabled={busy || popupPending || !googleReady}
                    onClick={() => void googleInApp()}
                  >
                    Continuar con Google
                  </button>
                ) : (
                  <a
                    href={groupBasePath() + '/api/auth/google/start'}
                    className="secondary google-access"
                  >
                    Continuar con Google
                  </a>
                )}
                {popupPending && (
                  <div role="status">
                    <p>
                      Completa Google en la ventana abierta. Al volver a Bandarlog se comprobará el
                      acceso.
                    </p>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy}
                      onClick={stopGoogle}
                    >
                      Usar código de correo
                    </button>
                  </div>
                )}
                <p className="auth-divider">o con tu correo</p>
              </>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestCode();
              }}
            >
              <label>
                Tu correo electrónico
                <input
                  type="email"
                  autoComplete="email"
                  disabled={busy}
                  required
                  placeholder="nombre@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                <Mail size={18} />
                Recibir código
              </button>
              <p className="hint">Usa el correo de tu invitación.</p>
            </form>
          </>
        )}
        {busy && <BananaLoader compact label="Comprobando acceso…" />}
        {development && (
          <details className="dev-mail">
            <summary>Bandeja de desarrollo</summary>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                void api('/dev/mail')
                  .then(setMessages)
                  .catch(() => setError('No se ha podido cargar la bandeja local.'))
              }
            >
              Actualizar correos de prueba
            </button>
            {messages
              .slice(-8)
              .reverse()
              .map((m) => (
                <article key={m.id}>
                  <strong>{m.email}</strong>
                  <p>{m.subject}</p>
                  <p className="dev-mail-body">{m.body}</p>
                  {m.body.match(/token=([a-f0-9.\-]+)/i)?.[1] && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onToken(m.body.match(/token=([a-f0-9.\-]+)/i)![1])}
                    >
                      Abrir enlace de prueba
                    </button>
                  )}
                </article>
              ))}
          </details>
        )}
        <nav className="auth-public-links" aria-label="Información de Bandarlog">
          <a href="/presentacion">Sobre Bandarlog</a>
          <a href="/privacidad">Privacidad</a>
          <a href="/condiciones">Condiciones</a>
        </nav>
      </main>
    </div>
  );
}
