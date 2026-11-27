export const welcomeVersion = 1;
export const welcomeActions = ['view', 'complete', 'skip', 'reopen'] as const;
export type WelcomeAction = (typeof welcomeActions)[number];
export type WelcomeProgress = {
  viewedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  reopenedAt: string | null;
};
