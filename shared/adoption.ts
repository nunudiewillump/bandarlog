export const adoptionActions = [
  'welcome_shown', 'choice_prepare', 'choice_explore', 'choice_replay', 'preparation_shown',
  'preparation_dismissed', 'guide_offered', 'guide_started', 'guide_completed', 'guide_skipped',
  'guide_resumed', 'guide_repeated',
] as const;
export type AdoptionAction = (typeof adoptionActions)[number];
export type AdoptionState = {
  founder: boolean;
  management: boolean;
  legacyGuideDone: boolean;
  events: Partial<Record<AdoptionAction | 'welcome_eligible' | 'guide_eligible' | 'first_choice' | 'mission_eligible', string>>;
};

export function adoptionInvitation(state: AdoptionState | undefined, welcomePending: boolean, priorMissionOffer = false) {
  if (!state) return null;
  const e = state.events;
  if (state.founder && e.welcome_eligible && welcomePending) return 'welcome';
  if (!state.management) return e.mission_eligible || priorMissionOffer ? 'mission' : null;
  if (state.legacyGuideDone || e.guide_completed || e.guide_skipped) return null;
  if (e.guide_started) return 'resume';
  if (state.founder)
    return e.choice_explore && !e.preparation_dismissed ? 'prepare' : null;
  return e.guide_eligible ? 'guide' : null;
}
