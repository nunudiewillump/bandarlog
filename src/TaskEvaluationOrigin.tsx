import { useEffect, useState } from 'react';
import { api } from './api';

type Origin = { id: string; title: string };

export function TaskEvaluationOrigin({
  taskId,
  onOpen,
}: {
  taskId: string;
  onOpen: (id: string) => void;
}) {
  const [origin, setOrigin] = useState<Origin | null>(null);
  useEffect(() => {
    let active = true;
    api('/group-evaluations/manage/task/' + encodeURIComponent(taskId))
      .then(({ origin }) => {
        if (active) setOrigin(origin);
      })
      .catch(() => {
        if (active) setOrigin(null);
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  return (
    origin && (
      <button type="button" className="text-link" onClick={() => onOpen(origin.id)}>
        Evaluación de origen: {origin.title}
      </button>
    )
  );
}
