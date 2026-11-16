import { useEffect, useState } from 'react';
import { api, setCSRF } from './api';
import { ForestHeader } from './ForestHeader';
import { clearOffline, offline } from './offline';
export type PasskeyStatus = {
  required: boolean;
  reauthenticate?: boolean;
  hasPasskeys?: boolean;
  csrf?: string;
};
type Prepared = { id: string; options: any };
export function PasskeyGate({
  status,
  onDone,
  adding = false,
}: {
  status: PasskeyStatus;
  onDone: () => Promise<void>;
  adding?: boolean;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [driver, setDriver] = useState<typeof import('@simplewebauthn/browser') | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [codes, setCodes] = useState<string[] | null>(null),
    [saved, setSaved] = useState(false),
    [recovery, setRecovery] = useState(false),
    [code, setCode] = useState('');
  const register = adding || !status.hasPasskeys;
  const prepare = async () => {
    setPrepared(null);
    setError('');
    try {
      setCSRF(status.csrf || '');
      const [driver, options] = await Promise.all([
        import('@simplewebauthn/browser'),
        api('/auth/passkeys/' + (register ? 'register' : 'authenticate') + '/options', 'POST', {}),
      ]);
      setDriver(driver);
      setPrepared(options);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void prepare();
  }, []);
  const submit = async () => {
    if (!prepared || !driver) return;
    setBusy(true);
    setError('');
    try {
      // Options and the module are loaded BEFORE the click, preserving iPhone user activation.
      const response = register
        ? await driver.startRegistration({ optionsJSON: prepared.options })
        : await driver.startAuthentication({ optionsJSON: prepared.options });
      const result = await api(
        '/auth/passkeys/' + (register ? 'register' : 'authenticate') + '/verify',
        'POST',
        { id: prepared.id, response },
      );
      setCSRF(result.csrf || '');
      setPrepared(null);
      if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
      else await onDone();
    } catch (e) {
      setPrepared(null);
      setError(
        (e as Error).name === 'NotAllowedError'
          ? 'La verificación se canceló o el dispositivo no está disponible. Puedes iniciar otro intento.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="forest-auth">
      <ForestHeader />
      <main className="forest-auth-main">
        <h1>
          {codes
            ? 'Guarda tus códigos de recuperación'
            : register
              ? 'Protege tu acceso con una passkey'
              : 'Verifica tu passkey'}
        </h1>
        {codes ? (
          <>
            <p>
              Estos códigos solo se muestran una vez. Cada uno permite recuperar el acceso junto con
              tu correo o Google si pierdes tu passkey. Guárdalos fuera de Bandarlog, en un gestor
              de contraseñas o en papel.
            </p>
            <ul className="recovery-codes" aria-label="Códigos de recuperación">
              {codes.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob(
                    ['Bandarlog · Códigos de recuperación de un solo uso\n\n' + codes.join('\n')],
                    { type: 'text/plain' },
                  ),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'bandarlog-recuperacion.txt';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Descargar códigos
            </button>
            <label>
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              He guardado los códigos en un lugar seguro
            </label>
            <button
              type="button"
              disabled={!saved || busy}
              onClick={() => {
                setCodes(null);
                void onDone();
              }}
            >
              Continuar
            </button>
          </>
        ) : (
          <>
            <p>
              {register
                ? 'Confirma con la biometría o el PIN de tu dispositivo. Bandarlog guarda la clave pública, nunca tu huella, tu cara ni el PIN.'
                : 'Utiliza la biometría, el PIN o tu llave de seguridad para completar el acceso.'}
            </p>
            {!recovery ? (
              <>
                {prepared ? (
                  <button type="button" disabled={busy || !driver} onClick={() => void submit()}>
                    {busy ? 'Verificando…' : register ? 'Crear passkey' : 'Verificar passkey'}
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void prepare()}>
                    Preparar otro intento
                  </button>
                )}
                {status.hasPasskeys && !adding && (
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={() => setRecovery(true)}
                  >
                    No tengo mi passkey
                  </button>
                )}
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError('');
                  void api('/auth/passkeys/recovery/verify', 'POST', {
                    code: code.trim().toLowerCase(),
                  })
                    .then(onDone)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <label>
                  Código de recuperación
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={32}
                    required
                    pattern="[a-fA-F0-9]{32}"
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Recuperar acceso
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => setRecovery(false)}
                >
                  Volver a la passkey
                </button>
              </form>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {!codes && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const state = await offline.status();
                if (
                  state.pending + (state.quarantined || 0) > 0 &&
                  !window.confirm(
                    'Hay cambios pendientes. ¿Cerrar sesión y descartar solo los cambios de esta cuenta en este dispositivo?',
                  )
                )
                  return;
                await api('/auth/passkeys/logout', 'POST', {});
                await clearOffline();
                location.reload();
              })().catch((e) => setError(e.message));
            }}
          >
            Cambiar de cuenta
          </button>
        )}
      </main>
    </div>
  );
}
