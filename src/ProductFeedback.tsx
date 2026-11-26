import { useState } from 'react';
import { api } from './api';
import './evaluation-templates.css';

export function ProductFeedback() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <details className="panel evaluation-templates">
      <summary>Ayúdanos a mejorar</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const fields = new FormData(form);
          const body = String(fields.get('body') ?? '').trim();
          if (!body) {
            setError('Escribe tu aportación.');
            return;
          }
          const replyEmail = String(fields.get('replyEmail') ?? '').trim();
          setError('');
          setMessage('');
          setBusy(true);
          try {
            await api('/product-feedback', 'POST', {
              category: fields.get('category'),
              body,
              ...(replyEmail ? { replyEmail } : {}),
            });
            form.reset();
            setMessage('Gracias. Tu aportación se ha enviado.');
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'No se pudo enviar. Inténtalo de nuevo.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          El equipo de Bandarlog recibirá lo que escribas. Si quieres que te responda, puedes dejar
          un correo.
        </p>
        <fieldset disabled={busy}>
          <label>
            Tipo de aportación
            <select name="category">
              <option value="general">Comentario general</option>
              <option value="bug">Comunicar un error</option>
              <option value="idea">Proponer una mejora</option>
              <option value="help">Solicitar ayuda</option>
            </select>
          </label>
          <label>
            Tu aportación
            <textarea name="body" required maxLength={3000} />
          </label>
          <label>
            Correo de contacto (opcional)
            <input name="replyEmail" type="email" maxLength={254} />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="evaluation-controls">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </details>
  );
}
