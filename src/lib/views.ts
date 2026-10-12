/** Every page of the app. The URL hash carries one of these (`#/habits`). */
export const VIEWS = [
  'dashboard',
  'habits',
  'time-tracker',
  'weekly-goals',
  'projects-goals',
  'journal',
  'exercise',
  'reading',
  'skills',
  'bad-habits',
  'recovery',
  'prefrontal',
  'neuroplasticity',
  'lessons',
  'plans',
  'partner',
  'leagues',
  'tiers',
  'settings',
] as const;

export type View = (typeof VIEWS)[number];

export const DEFAULT_VIEW: View = 'dashboard';

export function isView(value: string): value is View {
  return (VIEWS as readonly string[]).includes(value);
}
