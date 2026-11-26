import type { EvaluationStructure } from '../shared/evaluations';

export function baseEvaluationTemplate(): EvaluationStructure {
  return {
    title: 'Evaluación de proyecto',
    description: 'Valora cómo se desarrolló el proyecto y propone mejoras para el siguiente.',
    sections: [
      {
        id: crypto.randomUUID(),
        title: 'Organización y objetivos',
        description: '',
        questions: [
          {
            id: crypto.randomUUID(),
            type: 'numberScale',
            label: '¿Cómo valoras la organización del proyecto?',
            description: '1 = muy deficiente. 5 = excelente.',
            min: 1,
            max: 5,
            required: false,
          },
          {
            id: crypto.randomUUID(),
            type: 'numberScale',
            label: '¿En qué medida se cumplieron los objetivos?',
            description: '1 = nada. 5 = por completo.',
            min: 1,
            max: 5,
            required: false,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        title: 'Aprendizajes y mejoras',
        description: '',
        questions: [
          {
            id: crypto.randomUUID(),
            type: 'longText',
            label: '¿Qué funcionó bien y conviene mantener?',
            description: '',
            required: false,
          },
          {
            id: crypto.randomUUID(),
            type: 'longText',
            label: '¿Qué cambiarías para el próximo proyecto?',
            description: '',
            required: false,
          },
        ],
      },
    ],
  };
}
