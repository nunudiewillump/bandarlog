import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import './evaluation-templates.css';

type Offer = {
  id: string;
  campaign: 'F01' | 'F02' | 'F03';
  version: number;
  configuration?: { title: string; questions: { id: string; label: string }[] };
};
const titles = {
  F01: '¿Cómo va el comienzo?',
  F02: 'Tu primer mes con Bandarlog',
  F03: '¿Cómo te está funcionando Bandarlog?',
};
const durations = { F01: '1 minuto', F02: '2–3 minutos', F03: '3 minutos' };
const firstWeek = [
  ['easy', '¿Os está resultando fácil empezar a utilizar Bandarlog?'],
  ['questions', '¿Tenéis dudas sobre alguna funcionalidad?'],
  ['help', '¿Necesitáis que os echemos una mano?'],
  ['blocked', '¿Hay algo que no hayáis conseguido hacer?'],
];
// Sevilla-Gonzalez et al., JMIR Human Factors (2020), appendix 2, CC BY 4.0.
const sus = [
  'Me gustaría usar esta herramienta frecuentemente.',
  'Considero que esta herramienta es innecesariamente compleja',
  'Considero que la herramienta es fácil de usar.',
  'Considero necesario el apoyo de personal experto para poder utilizar esta herramienta',
  'Considero que las funciones de la herramienta están bien integradas',
  'Considero que la herramienta presenta muchas contradicciones',
  'Imagino que la mayoría de las personas aprenderían a usar esta herramienta rápidamente',
  'Considero que el uso de esta herramienta es tedioso',
  'Me sentí muy confiado al usar la herramienta',
  'Necesité saber bastantes cosas antes de poder empezar a usar esta herramienta',
];
const experience = [
  'Facilidad de uso',
  'Rapidez percibida',
  'Organización del trabajo',
  'Comunicación del equipo',
  'Utilidad general',
  'Satisfacción con Bandarlog',
];

function Scale({
  name,
  label,
  min = 1,
  max = 5,
}: {
  name: string;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue="" required>
        <option value="" disabled>
          Elige una puntuación
        </option>
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ProductSurvey() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void api('/product-survey', 'POST', { action: 'offer' })
      .then((value) => {
        if (current && (value?.version === 1 || value?.configuration)) setOffer(value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  if (!offer) return message ? <p role="status">{message}</p> : null;
  const { id, campaign, configuration } = offer;
  async function send(body: Record<string, unknown>, confirmation: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/product-survey', 'POST', { ...body, id });
      setOffer(null);
      setMessage(confirmation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const notes = (...keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, fields.get(key) ?? '']));
    const ratings = (items: string[]) => items.map((_, i) => Number(fields.get('rating-' + i)));
    const answers = configuration
      ? {
          ratings: Object.fromEntries(
            configuration.questions.map(({ id }) => [id, Number(fields.get(id))]),
          ),
        }
      : campaign === 'F01'
        ? {
            ...Object.fromEntries(firstWeek.map(([key]) => [key, fields.get(key) === 'yes'])),
            ...notes('detail'),
          }
        : campaign === 'F02'
          ? { sus: ratings(sus), ...notes('useful', 'difficult', 'missing') }
          : { scores: ratings(experience), nps: Number(fields.get('nps')), ...notes('change') };
    const replyEmail = String(fields.get('replyEmail') ?? '').trim();
    void send(
      { action: 'submit', answers, ...(replyEmail ? { replyEmail } : {}) },
      'Gracias por compartir tu opinión.',
    );
  }
  return (
    <section className="panel evaluation-templates" aria-labelledby="product-survey-title">
      <h2 id="product-survey-title">{configuration?.title ?? titles[campaign]}</h2>
      {!expanded ? (
        <>
          <p>Dar tu opinión es voluntario. {!configuration && durations[campaign] + '.'}</p>
          <div className="evaluation-controls">
            <button type="button" className="primary" onClick={() => setExpanded(true)}>
              Dar mi opinión
            </button>
            <label>
              Ahora no
              <select
                value=""
                disabled={busy}
                onChange={({ target }) => {
                  if (target.value === 'postpone')
                    void send(
                      { action: 'postpone' },
                      'Podrás volver a responder dentro de tres días si sigue abierta.',
                    );
                  if (target.value === 'dismiss')
                    void send({ action: 'dismiss' }, 'Encuesta descartada.');
                }}
              >
                <option value="" disabled>
                  Elige una opción
                </option>
                <option value="postpone">Recordar en tres días</option>
                <option value="dismiss">Descartar encuesta</option>
              </select>
            </label>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {configuration && (
              <>
                <p>Valora cada aspecto de 1 (muy bajo) a 5 (muy alto).</p>
                {configuration.questions.map(({ id, label }) => (
                  <Scale key={id} name={id} label={label} />
                ))}
              </>
            )}
            {!configuration && campaign === 'F01' && (
              <>
                {firstWeek.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <select
                      name={key}
                      required
                      defaultValue=""
                      onChange={(event) => {
                        if (key === 'help') setHelp(event.target.value === 'yes');
                      }}
                    >
                      <option value="" disabled>
                        Elige una respuesta
                      </option>
                      <option value="yes">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                ))}
                <label>
                  {help ? '¿En qué podemos ayudaros?' : '¿Qué quieres añadir?'}
                  <textarea name="detail" maxLength={1200} />
                </label>
                {help && (
                  <label>
                    Correo de contacto (opcional)
                    <input name="replyEmail" type="email" maxLength={254} />
                  </label>
                )}
              </>
            )}
            {!configuration && campaign === 'F02' && (
              <>
                <p>1 significa totalmente en desacuerdo, 3 neutral y 5 totalmente de acuerdo.</p>
                {sus.map((label, i) => (
                  <Scale key={label} name={'rating-' + i} label={label} />
                ))}
                <label>
                  ¿Qué funcionalidad te resulta más útil?
                  <textarea name="useful" maxLength={1200} />
                </label>
                <label>
                  ¿Qué parte de Bandarlog te resulta más complicada?
                  <textarea name="difficult" maxLength={1200} />
                </label>
                <label>
                  ¿Qué echas en falta?
                  <textarea name="missing" maxLength={1200} />
                </label>
              </>
            )}
            {!configuration && campaign === 'F03' && (
              <>
                <p>Valora cada aspecto de 1 (muy bajo) a 5 (muy alto).</p>
                {experience.map((label, i) => (
                  <Scale key={label} name={'rating-' + i} label={label} />
                ))}
                <p>0 significa nada probable y 10 muy probable.</p>
                <Scale
                  name="nps"
                  label="¿Qué probabilidad hay de que recomiendes Bandarlog a otro grupo scout?"
                  min={0}
                  max={10}
                />
                <label>
                  Si pudieras cambiar una cosa de Bandarlog, ¿cuál sería?
                  <textarea name="change" maxLength={1200} />
                </label>
              </>
            )}
            <div className="evaluation-controls">
              <button type="button" className="secondary" onClick={() => setExpanded(false)}>
                Volver
              </button>
              <button type="submit" className="primary">
                {busy ? 'Enviando…' : 'Enviar opinión'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
