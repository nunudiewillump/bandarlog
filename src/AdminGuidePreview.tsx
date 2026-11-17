import { useMemo, useState } from 'react';
import { AdminSetupGuide } from './AdminSetupGuide';
import { previewDataFor } from './admin-guide-preview-data';
import type { Data, User } from './types';
import './admin-guide-preview.css';

export function AdminGuidePreview({ data, user, onExit, onCelebrate }: {
  data: Data;
  user: User;
  onExit: () => void;
  onCelebrate: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [message, setMessage] = useState('');
  const demoData = useMemo(() => previewDataFor(data, user, stage), [data, user, stage]);
  function advance(next: number) {
    if (stage + 1 !== next) return;
    setStage(next);
    setMessage('');
  }
  return (
    <div className="admin-guide-preview">
      <div className="admin-guide-preview-banner" role="status">
        <div>
          <strong>Vista de prueba · solo para tu cuenta</strong>
          <span>Simulación: no crea grupos, usuarios, invitaciones ni tareas reales. Tus permisos no cambian.</span>
        </div>
        <button type="button" className="secondary" onClick={onExit}>Salir de la prueba</button>
      </div>
      <AdminSetupGuide
        data={demoData}
        onSettings={() => setMessage('En un grupo nuevo abrirías los ajustes del nombre y la pañoleta. Rosales no se modificará.')}
        onProject={() => advance(1)}
        onCommission={() => advance(2)}
        onInvite={() => advance(3)}
        onTask={() => advance(4)}
        onPractice={() => setMessage('En el alta real, este enlace abre «Tu primera misión». La simulación no modifica tus tareas.')}
        onFinish={async (completed) => {
          onExit();
          if (completed) onCelebrate();
          return true;
        }}
      />
      {message && <div className="admin-guide-preview-message" role="status">{message}</div>}
    </div>
  );
}
