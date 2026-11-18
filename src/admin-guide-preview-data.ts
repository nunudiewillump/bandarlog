import type { Data, User } from './types';

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
