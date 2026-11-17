import { useMemo, useState } from 'react';
import { AdminSetupGuide } from './AdminSetupGuide';
import type { Data, User } from './types';
import './admin-guide-preview.css';

export function previewDataFor(data: Data, user: User, stage: number): Data {
  const projectId = 'preview-project';
  const commissionId = 'preview-commission';
  return {
    ...data,
    group: data.group ? { ...data.group, name: 'Grupo scout de ejemplo' } : undefined,
    users: [user],
    projects: stage >= 1 ? [{
      id: projectId, name: 'Ronda Solar (ejemplo)', type: 'general',
      parentId: null, starts: '2027-01-01', ends: '2027-12-31', archived: 'false',
    }] : [],
    commissions: stage >= 2 ? [{
      id: commissionId, name: 'Material (ejemplo)', projectId, description: '', icon: 'tent',
    }] : [],
    invitations: stage >= 3 ? [{
      id: 'preview-invite', name: 'Scouter de ejemplo', email: 'scouter@example.test',
      commissionId: null, projectId: null, status: 'pending', role: 'member',
    }] : [],
    tasks: stage >= 4 ? [{
      id: 'preview-task', title: 'Preparar material', commissionId,
      description: 'Tarea de ejemplo', due: '2027-07-01T10:00:00Z',
      status: 'pending', blockedReason: null, completedBy: null,
      completedAt: null, updatedAt: '2027-01-01T00:00:00Z',
    }] : [],
  };
}

export function AdminGuidePreview({ data, user, onExit }: {
  data: Data;
  user: User;
  onExit: () => void;
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
        onFinish={async () => { onExit(); return true; }}
      />
      {message && <div className="admin-guide-preview-message" role="status">{message}</div>}
    </div>
  );
}
