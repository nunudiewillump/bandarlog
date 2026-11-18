import { useState } from 'react';
import { api, setCSRF } from './api';
type Key = { id: string; name: string; rpId: string; createdAt: string };
export function PasskeySettings() {
  const [keys, setKeys] = useState<Key[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [prepared, setPrepared] = useState<{
      kind: 'authenticate' | 'register';
      id: string;
      options: any;
    } | null>(null),
    [driver, setDriver] = useState<typeof import('@simplewebauthn/browser') | null>(null),
    [codes, setCodes] = useState<string[] | null>(null);
  const prepare = async (kind: 'authenticate' | 'register') => {
    setBusy(true);
    setError('');
    setPrepared(null);
    try {
      const status = await api('/auth/passkeys/status');
      setCSRF(status.csrf || '');
      const [library, result, list] = await Promise.all([
        import('@simplewebauthn/browser'),
        api('/auth/passkeys/' + kind + '/options', 'POST', {}),
        api('/auth/passkeys/list'),
      ]);
      setDriver(library);
      setKeys(list);
      setPrepared({ ...result, kind });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!driver || !prepared) return;
    setBusy(true);
    setError('');
    try {
      const response =
        prepared.kind === 'register'
          ? await driver.startRegistration({ optionsJSON: prepared.options })
          : await driver.startAuthentication({ optionsJSON: prepared.options });
      const result = await api('/auth/passkeys/' + prepared.kind + '/verify', 'POST', {
        id: prepared.id,
        response,
      });
      setCSRF(result.csrf || '');
      setPrepared(null);
      setKeys(await api('/auth/passkeys/list'));
      if (result.recoveryCodes) setCodes(result.recoveryCodes);
    } catch (e) {
      setPrepared(null);
      setError(
        (e as Error).name === 'NotAllowedError'
          ? 'La verificación se ha cancelado. Puedes intentarlo de nuevo.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel">
      <summary>Passkeys y recuperación</summary>
      <p>
        Usa la biometría o el PIN para verificar cambios sensibles. Puedes añadir otra passkey antes
        de cambiar de dispositivo.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void prepare('authenticate')}
      >
        Verificar mi passkey
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void prepare('register')}
      >
        Añadir otra passkey
      </button>
      {prepared && (
        <button type="button" disabled={busy || !driver} onClick={() => void confirm()}>
          {prepared.kind === 'register'
            ? 'Confirmar creación de passkey'
            : 'Confirmar con biometría o PIN'}
        </button>
      )}
      {keys.length > 0 && (
        <ul>
          {keys.map((key) => (
            <li key={key.id}>
              {key.name} · {key.rpId} · {new Date(key.createdAt).toLocaleDateString('es-ES')}
              <button
                type="button"
                className="text-link"
                disabled={busy || keys.length < 2}
                onClick={() => {
                  if (
                    !window.confirm(
                      '¿Retirar esta passkey? Asegúrate de conservar otra que puedas utilizar.',
                    )
                  )
                    return;
                  setBusy(true);
                  void api('/auth/passkeys/remove', 'POST', { id: key.id })
                    .then(() => api('/auth/passkeys/list'))
                    .then(setKeys)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Retirar
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (
            !window.confirm(
              'Se invalidarán los códigos de recuperación anteriores. ¿Generar diez códigos nuevos?',
            )
          )
            return;
          setBusy(true);
          void api('/auth/passkeys/recovery/new', 'POST', {})
            .then((result) => setCodes(result.codes))
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Renovar códigos de recuperación
      </button>
      {codes && (
        <section className="recovery-codes">
          <p role="status">
            Guarda estos códigos fuera de Bandarlog. Cada uno sirve una sola vez junto a tu correo o
            Google. No se volverán a mostrar.
          </p>
          <ul>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(['Bandarlog · Códigos de recuperación\n\n' + codes.join('\n')], {
                  type: 'text/plain',
                }),
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
          <button type="button" className="text-link" onClick={() => setCodes(null)}>
            Ya los he guardado
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
