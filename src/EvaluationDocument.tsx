import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EvaluationStructure } from '../shared/evaluations';
import { Neckerchief } from './ProfilePanel';
import type { ScoutGroup } from './types';
import './evaluation-document.css';

type Distribution = { value: string | number | boolean; count: number };
export type EvaluationSummary = {
  assigned: number;
  submitted: number;
  questions: Record<string, { answered: number; distribution: Distribution[] }>;
};

const date = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function EvaluationStatistics({
  structure,
  summary,
}: {
  structure: EvaluationStructure;
  summary: EvaluationSummary;
}) {
  return structure.sections.map((section) => (
    <section key={section.id} className="evaluation-section">
      <h2>{section.title}</h2>
      {section.questions.map((question) => {
        const stats = summary.questions[question.id];
        if (!stats) return null;
        const numeric = question.type === 'numberScale' || question.type === 'nps';
        const sum = numeric
          ? stats.distribution.reduce(
              (total, entry) => total + Number(entry.value) * entry.count,
              0,
            )
          : 0;
        return (
          <div key={question.id} className="evaluation-question">
            <h3>{question.label}</h3>
            <p>
              {stats.answered} respuestas · {summary.submitted - stats.answered} omitidas
              {numeric && stats.answered > 0 && ' · Media ' + number.format(sum / stats.answered)}
            </p>
            {stats.distribution.length > 0 && (
              <ul>
                {stats.distribution.map(({ value, count }) => (
                  <li key={JSON.stringify(value)}>
                    {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value} · {count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  ));
}

export type EvaluationAnnex = {
  name: string;
  answers: Record<string, string | number | boolean | string[]>;
}[];

export type EvaluationReport = {
  title: string;
  dueAt: string;
  templateRevision: number;
  structure: EvaluationStructure;
  body: string | null;
  actions?: { id: string; title: string }[];
};

export function EvaluationDocument({
  report,
  annex,
  summary,
  group,
  onBack,
}: {
  report: EvaluationReport;
  summary: EvaluationSummary;
  annex?: EvaluationAnnex;
  group?: ScoutGroup;
  onBack: () => void;
}) {
  return (
    <EvaluationPrintPreview group={group} onBack={onBack}>
      <EvaluationReportContent report={report} summary={summary} annex={annex} />
    </EvaluationPrintPreview>
  );
}

export function EvaluationMemoDocument({
  reports,
  group,
  onBack,
}: {
  reports: (EvaluationReport & { id: string; summary: EvaluationSummary })[];
  group?: ScoutGroup;
  onBack: () => void;
}) {
  return (
    <EvaluationPrintPreview group={group} onBack={onBack}>
      <h1>Memoria de evaluaciones</h1>
      <p>{reports.length} evaluaciones cerradas</p>
      {reports.map((report) => (
        <section key={report.id} className="evaluation-memo-report">
          <EvaluationReportContent report={report} summary={report.summary} />
        </section>
      ))}
    </EvaluationPrintPreview>
  );
}

function EvaluationReportContent({
  report,
  summary,
  annex,
}: {
  report: EvaluationReport;
  summary: EvaluationSummary;
  annex?: EvaluationAnnex;
}) {
  return (
    <>
      <h1>{report.title}</h1>
      <p>
        Versión {report.templateRevision} · Plazo {date.format(new Date(report.dueAt))}
      </p>
      <p>
        {summary.submitted} de {summary.assigned} participantes han enviado su evaluación.
      </p>
      {report.body && (
        <section>
          <h2>Conclusiones de Coordinación</h2>
          <p className="evaluation-document-conclusions">{report.body}</p>
        </section>
      )}
      {!!report.actions?.length && (
        <section>
          <h2>Acciones de mejora</h2>
          <ul>
            {report.actions.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </section>
      )}
      <EvaluationStatistics structure={report.structure} summary={summary} />
      {annex && (
        <section>
          <h2>Anexo de respuestas identificadas</h2>
          {!annex.length && <p>No hay respuestas enviadas.</p>}
          {annex.map(({ name, answers }, index) => (
            <section key={index}>
              <h3>{name}</h3>
              {report.structure.sections.map((section) => (
                <dl key={section.id}>
                  {section.questions.map((question) => {
                    const answer = answers[question.id];
                    return (
                      <div key={question.id} className="evaluation-question">
                        <dt>{question.label}</dt>
                        <dd className="evaluation-document-conclusions">
                          {answer === undefined
                            ? 'Sin respuesta'
                            : Array.isArray(answer)
                              ? answer.join(', ')
                              : typeof answer === 'boolean'
                                ? answer
                                  ? 'Sí'
                                  : 'No'
                                : answer}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ))}
            </section>
          ))}
        </section>
      )}
    </>
  );
}

export function BlankEvaluationDocument({
  structure,
  group,
  onBack,
}: {
  structure: EvaluationStructure;
  group?: ScoutGroup;
  onBack: () => void;
}) {
  return (
    <EvaluationPrintPreview group={group} onBack={onBack}>
      <h1>{structure.title}</h1>
      {structure.description && <p>{structure.description}</p>}
      {structure.sections.map((section) => (
        <section key={section.id}>
          <h2>{section.title}</h2>
          {section.description && <p>{section.description}</p>}
          {section.questions.map((question) => {
            const options =
              'options' in question
                ? question.options
                : question.type === 'yesNo'
                  ? ['Sí', 'No']
                  : null;
            return (
              <div className="evaluation-question" key={question.id}>
                <h3>
                  {question.label}
                  {question.required ? ' (obligatoria)' : ''}
                </h3>
                {question.description && <p>{question.description}</p>}
                {options ? (
                  <ul className="evaluation-document-options">
                    {options.map((option) => (
                      <li key={option}>{option}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {'min' in question && (
                      <p>
                        Escala de {question.min} a {question.max}
                      </p>
                    )}
                    {question.type === 'nps' && <p>Escala de 0 a 10</p>}
                    <div className="evaluation-document-line" aria-hidden="true" />
                    {question.type === 'longText' && (
                      <div className="evaluation-document-line" aria-hidden="true" />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </EvaluationPrintPreview>
  );
}

function EvaluationPrintPreview({
  children,
  group,
  onBack,
}: {
  children: ReactNode;
  group?: ScoutGroup;
  onBack: () => void;
}) {
  const content = (
    <article className="evaluation-document">
      <header>
        <div className="evaluation-document-brand">
          <img src="/brand-mark.webp" width="36" height="36" alt="" />
          <span>Bandarlog</span>
        </div>
        {group && (
          <div className="evaluation-document-group">
            <Neckerchief group={group} />
            <span>{group.name}</span>
          </div>
        )}
      </header>
      {children}
    </article>
  );
  return (
    <>
      <div className="evaluation-controls">
        <button type="button" className="secondary" onClick={onBack}>
          Volver
        </button>
        <button type="button" className="primary" onClick={() => window.print()}>
          Imprimir o guardar PDF
        </button>
      </div>
      {content}
      {createPortal(
        <div className="evaluation-print" aria-hidden="true">
          <style media="print">{'@page { size: A4; margin: 18mm; }'}</style>
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
