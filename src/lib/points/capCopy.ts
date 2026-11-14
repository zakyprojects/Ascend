import { CapId } from '@/lib/points/capStatus';

/** The CapMeter labels and the cap-reached line. The rules themselves are in each page's How it
 *  works (components/howItWorks/). */
export const capLabels: Record<CapId, string> = {
  exercise: 'Exercise points today',
  reading: 'Reading points today',
  skills: 'Skill points today',
  pfc: 'Focus points today',
  presetHabits: 'Habit points today',
  journal: 'Journal points today',
  badHabitsResisted: 'Resist points today',
};

export function capReachedText(earned: number, cap: number): string {
  return `Daily cap reached (${earned}/${cap}). More activity today won't earn points. Resets at midnight.`;
}
