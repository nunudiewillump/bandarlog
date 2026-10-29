/** Types describe projects; they never determine hierarchy or permissions. */
export const storedProjectTypes = ['general', 'camp', 'event', 'other', 'ronda'] as const;
export const projectTypes = [
  { id: 'general', name: 'General' },
  { id: 'camp', name: 'Campamento' },
  { id: 'event', name: 'Evento' },
  { id: 'other', name: 'Otro' },
] as const;
export function projectType(value?: string | null) {
  return value === 'ronda' || !value
    ? 'general'
    : projectTypes.some((type) => type.id === value)
      ? value
      : 'other';
}
export function projectTypeName(value?: string | null) {
  return projectTypes.find((type) => type.id === projectType(value))!.name;
}
export function projectView(view: string) {
  return ['camps', 'rounds'].includes(view) ? 'projects' : view;
}
