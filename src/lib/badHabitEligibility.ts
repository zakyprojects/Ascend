import { BadHabit } from '@/types';
import { BAD_HABIT_POINTS } from './pointsConfig';

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

/**
 * Returns a Set of bad habit IDs that occupy the first N eligible slots.
 */
export function getPointEligibleHabitIds(badHabits: BadHabit[]): Set<string> {
  const activeOrdered = getActiveBadHabitsOrdered(badHabits);
  const eligible = activeOrdered.slice(0, BAD_HABIT_POINTS.eligibleSlots);
  return new Set(eligible.map((h) => h.id).filter(Boolean));
}

/**
 * Returns 1-based slot assignment and total slot count among eligible habits,
 * or null if the habit is tracking-only (outside the top N slots) or not active.
 */
export function getBadHabitSlot(
  badHabits: BadHabit[],
  badHabitId: string
): { slot: number; total: number } | null {
  const activeOrdered = getActiveBadHabitsOrdered(badHabits);
  const index = activeOrdered.findIndex((h) => h.id === badHabitId);
  if (index === -1 || index >= BAD_HABIT_POINTS.eligibleSlots) {
    return null;
  }
  return {
    slot: index + 1,
    total: BAD_HABIT_POINTS.eligibleSlots,
  };
}
