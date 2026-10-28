import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { api } from './api';
import { ForestHeader } from './ForestHeader';
import { BananaLoader } from './BananaLoader';
export function AuthScreen({
  token,
  development,
  onAuthenticated,
  onToken,
}: {
  token: string;
  development: boolean;
  onAuthenticated: () => Promise<void>;
  onToken: (token: string) => void;
}) {
  const [email, setEmail] = useState(() =>
    (new URLSearchParams(location.search).get('email') || '').slice(0, 254),
  );
  const [challenge, setChallenge] = useState(''),
    [code, setCode] = useState(''),
    [wait, setWait] = useState(0),
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
  const invitation = token.startsWith('invite.');
  useEffect(() => {
    void api('/auth/config')
      .then((c) => setGoogle(c.googleEnabled === true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function requestCode() {
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
    } catch (e) {
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
        {challenge && !token && (
          <button
            type="button"
            className="text-link auth-back"
            onClick={() => {
              setChallenge('');
              setCode('');
              setError('');
            }}
          >
            <ArrowLeft size={16} />
            Cambiar correo
          </button>
        )}
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
            <p className="hint">El código caduca en 10 minutos.</p>
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
                <a href="/api/auth/google/start" className="secondary google-access">
                  Continuar con Google
                </a>
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
      </main>
    </div>
  );
}
