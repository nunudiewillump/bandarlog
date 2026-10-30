export const tutorialEventNames = [
  'tutorial_shown',
  'tutorial_started',
  'tutorial_skipped',
  'tutorial_completed',
  'tutorial_reopened',
  'tutorial_abandoned',
  'tutorial_checklist_used',
  'tutorial_update_published',
  'tutorial_task_completed',
  'tutorial_undo_used',
] as const;
export type TutorialEvent = (typeof tutorialEventNames)[number];
export type PracticeStatus = 'pending' | 'in_progress' | 'blocked' | 'done';
export type TutorialProgress = {
  events: Partial<Record<TutorialEvent, string>>;
  taskStatus: PracticeStatus;
  previousStatus: PracticeStatus | null;
  steps: boolean[];
  version: number;
  lastActivityAt: string | null;
};
export function emptyTutorial(): TutorialProgress {
  return {
    events: {},
    taskStatus: 'pending',
    previousStatus: null,
    steps: [false, false],
    version: 0,
    lastActivityAt: null,
  };
}
export const tutorialStepIds = ['practice-water', 'practice-light'] as const;
