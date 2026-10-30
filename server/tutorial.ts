import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { tutorialProgress } from './schema.js';
import { emptyTutorial, type TutorialProgress, type TutorialEvent } from '../shared/tutorial.js';
const version = { expectedVersion: z.number().int().min(0) };
export const tutorialCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shown') }).strict(),
  z.object({ action: z.literal('open'), restart: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('skip') }).strict(),
  z
    .object({
      action: z.literal('check'),
      index: z.union([z.literal(0), z.literal(1)]),
      done: z.boolean(),
      ...version,
    })
    .strict(),
  z.object({ action: z.literal('update'), ...version }).strict(),
  z
    .object({
      action: z.literal('status'),
      status: z.enum(['pending', 'in_progress', 'blocked', 'done']),
      ...version,
    })
    .strict(),
  z.object({ action: z.literal('undo'), ...version }).strict(),
]);
export type TutorialCommand = z.infer<typeof tutorialCommand>;
export class TutorialError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;
export function isAbandoned(p: TutorialProgress, now: number) {
  return (
    !!p.events.tutorial_started &&
    !p.events.tutorial_completed &&
    !p.events.tutorial_skipped &&
    !!p.lastActivityAt &&
    now - Date.parse(p.lastActivityAt) >= ABANDON_AFTER_MS
  );
}
export function advanceTutorial(
  previous: TutorialProgress,
  command: TutorialCommand,
  now = new Date().toISOString(),
) {
  const p: TutorialProgress = structuredClone(previous);
  let celebrate = false;
  const record = (name: TutorialEvent) => {
    p.events[name] ||= now;
  };
  if (isAbandoned(p, Date.parse(now))) record('tutorial_abandoned');
  if ('expectedVersion' in command && command.expectedVersion !== p.version)
    throw new TutorialError(
      409,
      'La misión ha cambiado en otra ventana. Actualiza el tutorial antes de continuar.',
    );
  if (['check', 'update', 'status', 'undo'].includes(command.action) && !p.events.tutorial_started)
    throw new TutorialError(409, 'Abre primero Tu primera misión.');
  switch (command.action) {
    case 'shown':
      record('tutorial_shown');
      break;
    case 'open':
      record('tutorial_shown');
      if (p.events.tutorial_started || p.events.tutorial_skipped) record('tutorial_reopened');
      record('tutorial_started');
      if (command.restart) {
        p.taskStatus = 'pending';
        p.previousStatus = null;
        p.steps = [false, false];
      }
      p.lastActivityAt = now;
      break;
    case 'skip':
      if (!p.events.tutorial_completed) {
        record('tutorial_shown');
        record('tutorial_skipped');
        p.lastActivityAt = now;
      }
      break;
    case 'check':
      p.steps[command.index] = command.done;
      record('tutorial_checklist_used');
      p.lastActivityAt = now;
      break;
    case 'update':
      record('tutorial_update_published');
      p.lastActivityAt = now;
      break;
    case 'status':
      if (command.status === 'done' && p.taskStatus !== 'done') {
        p.previousStatus = p.taskStatus;
        celebrate = !p.events.tutorial_completed;
        record('tutorial_task_completed');
        record('tutorial_completed');
      } else if (command.status !== 'done') p.previousStatus = null;
      p.taskStatus = command.status;
      p.lastActivityAt = now;
      break;
    case 'undo':
      if (p.taskStatus === 'done' && p.previousStatus) {
        p.taskStatus = p.previousStatus;
        p.previousStatus = null;
        record('tutorial_undo_used');
        p.lastActivityAt = now;
      }
      break;
  }
  if (JSON.stringify(p) !== JSON.stringify(previous)) p.version++;
  return { progress: p, celebrate };
}
export async function expireTutorials(db: any, now = new Date().toISOString(), userId?: string) {
  const conditions = sql`${tutorialProgress.events}->>'tutorial_started' is not null
    and ${tutorialProgress.events}->>'tutorial_completed' is null
    and ${tutorialProgress.events}->>'tutorial_skipped' is null
    and ${tutorialProgress.events}->>'tutorial_abandoned' is null
    and ${tutorialProgress.lastActivityAt} <= ${new Date(Date.parse(now) - ABANDON_AFTER_MS).toISOString()}::timestamptz`;
  await db
    .update(tutorialProgress)
    .set({
      events: sql`jsonb_set(${tutorialProgress.events}, '{tutorial_abandoned}', to_jsonb(${now}::text))`,
      version: sql`${tutorialProgress.version}+1`,
    })
    .where(userId ? and(eq(tutorialProgress.userId, userId), conditions) : conditions);
}
export async function readTutorial(db: any, userId: string) {
  await expireTutorials(db, new Date().toISOString(), userId);
  const [row] = await db.select().from(tutorialProgress).where(eq(tutorialProgress.userId, userId));
  if (!row) return emptyTutorial();
  const { userId: _, ...progress } = row;
  return progress as TutorialProgress;
}
export async function writeTutorial(tx: any, userId: string, command: TutorialCommand) {
  await tx.insert(tutorialProgress).values({ userId }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(tutorialProgress)
    .where(eq(tutorialProgress.userId, userId))
    .for('update');
  const { userId: _, ...previous } = row;
  const result = advanceTutorial(previous, command);
  await tx.update(tutorialProgress).set(result.progress).where(eq(tutorialProgress.userId, userId));
  return result;
}
export function summarizeTutorial(rows: TutorialProgress[], now = Date.now()) {
  const count = (event: TutorialEvent) => rows.filter((p) => !!p.events[event]).length;
  const shown = count('tutorial_shown'),
    started = count('tutorial_started'),
    skipped = count('tutorial_skipped'),
    completed = count('tutorial_completed');
  const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const times = rows
    .filter((p) => p.events.tutorial_completed && p.events.tutorial_started)
    .map((p) => Date.parse(p.events.tutorial_completed!) - Date.parse(p.events.tutorial_started!))
    .sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  return {
    shown,
    started,
    skipped,
    completed,
    reopened: count('tutorial_reopened'),
    abandoned: count('tutorial_abandoned'),
    neverStarted: rows.filter(
      (p) => p.events.tutorial_shown && !p.events.tutorial_started && !p.events.tutorial_skipped,
    ).length,
    currentlyAbandoned: rows.filter((p) => isAbandoned(p, now)).length,
    active: rows.filter(
      (p) =>
        p.events.tutorial_started &&
        !p.events.tutorial_completed &&
        !p.events.tutorial_skipped &&
        !isAbandoned(p, now),
    ).length,
    rates: {
      started: ratio(started, shown),
      skipped: ratio(skipped, shown),
      completed: ratio(completed, shown),
      completedAmongStarted: ratio(completed, started),
    },
    medianCompletionMs: times.length
      ? times.length % 2
        ? times[middle]
        : (times[middle - 1] + times[middle]) / 2
      : null,
    features: {
      checklist: count('tutorial_checklist_used'),
      update: count('tutorial_update_published'),
      completed: count('tutorial_task_completed'),
      undo: count('tutorial_undo_used'),
    },
  };
}
