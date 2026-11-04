import { BadHabit } from '@/types';

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Filters active bad habits (!isCompleted) and sorts them by:
 * 1. createdAt ascending (earliest created first; invalid/missing timestamps sort last)
 * 2. id string ascending (tie-break)
 * Does not mutate the input array.
 */
export function getActiveBadHabitsOrdered(badHabits: BadHabit[]): BadHabit[] {
  if (!badHabits || !Array.isArray(badHabits)) return [];

  return [...badHabits]
    .filter((h) => h && !h.isCompleted)
    .sort((a, b) => {
      const timeA = a.createdAt ? Date.parse(a.createdAt) : NaN;
      const timeB = b.createdAt ? Date.parse(b.createdAt) : NaN;
      const validA = !Number.isNaN(timeA);
      const validB = !Number.isNaN(timeB);

      if (validA && validB) {
        if (timeA !== timeB) return timeA - timeB;
        return compareIds(a.id || '', b.id || '');
      }
      if (validA && !validB) return -1;
      if (!validA && validB) return 1;
      return compareIds(a.id || '', b.id || '');
    });
}
