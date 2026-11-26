import { useEffect, useState } from 'react';
import { api } from './api';
import { BrandCanopyFill } from './BotanicalCanopy';
import { NeckerchiefMascot } from './NeckerchiefMascot';

export default function HomeEvaluationsEntry({
  onOpen,
  desktop = false,
}: {
  onOpen: (id?: string) => void;
  desktop?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api('/group-evaluations/pending')
      .then((result) => {
        if (active && typeof result?.id === 'string') setPending(result.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (desktop && !pending) return null;
  return (
    <div className={desktop ? 'desktop-evaluation-sign' : 'mobile-evaluation-entry'}>
      {pending && (
        <button type="button" className="pending-evaluation-sign" onClick={() => onOpen(pending)}>
          {!desktop && (
            <span className="pending-evaluation-leaves">
              <BrandCanopyFill />
            </span>
          )}
          <NeckerchiefMascot kind="evaluation" />
          <span>Evaluación pendiente</span>
        </button>
      )}
      {!desktop && (
        <button type="button" className="primary" onClick={() => onOpen()}>
          Mis evaluaciones
        </button>
      )}
    </div>
  );
}
