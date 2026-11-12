import type { WorkoutLog } from '@/types';

/** Workouts offered before the user has a history: Exercise page suggestions and the weekly goal form. */
export const DEFAULT_WORKOUT_TYPES = ['Running', 'Walking', 'Push-ups', 'Weightlifting', 'Cycling', 'Yoga', 'Swimming', 'HIIT'];

/** How one workout log is counted. Logs saved without a unit are minutes (the Exercise page's rule). */
export type WorkoutMeasure = 'mins' | 'reps' | 'sets' | 'km';

export const workoutMeasureOf = (w: Pick<WorkoutLog, 'unit'>): WorkoutMeasure => {
  const u = (w.unit || 'mins').trim().toLowerCase();
  return u === 'reps' || u === 'sets' || u === 'km' ? u : 'mins';
};

/** A log's amount in its own measure; minutes logs saved before amounts existed hold it in durationMinutes. */
export const workoutAmountOf = (w: Pick<WorkoutLog, 'unit' | 'amount' | 'durationMinutes'>): number =>
  workoutMeasureOf(w) === 'mins' ? (w.amount && w.amount > 0 ? w.amount : w.durationMinutes || 0) : w.amount ?? 0;

/** The same workout whatever its spelling: case, spaces and punctuation are ignored ("Push ups" = "Push-ups" = "pushups"). */
export const workoutTypeKey = (name: string | undefined): string => (name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Workout names from the history (newest spelling first) and then the defaults, one per workoutTypeKey. */
export function workoutTypeNames(workouts: WorkoutLog[], defaults: string[] = DEFAULT_WORKOUT_TYPES): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const newestFirst = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  for (const name of [...newestFirst.map((w) => (w.type || '').trim()), ...defaults]) {
    const key = workoutTypeKey(name);
    if (!key || seen.has(key) || name === 'Other') continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
