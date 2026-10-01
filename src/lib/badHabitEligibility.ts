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
 * Checks whether a specific bad habit ID is currently point-eligible.
 */
export function isBadHabitPointEligible(
  badHabits: BadHabit[],
  badHabitId: string
): boolean {
  const eligibleIds = getPointEligibleHabitIds(badHabits);
  return eligibleIds.has(badHabitId);
}

/**
 * Allocates resist points considering habit eligibility slots and two-group priority.
 * Candidates are logs where the habit is currently point-eligible OR the log already earned points (>0).
 * Ordering:
 * 1. Group (a): Stored points > 0, sorted by createdAt ascending (tie: id string ascending).
 * 2. Group (b): Stored points <= 0, sorted by createdAt ascending (tie: id string ascending).
 * Iterates Group (a) then Group (b), awarding BAD_HABIT_POINTS.resistBase while within
 * BAD_HABIT_POINTS.maxDailyResists and BAD_HABIT_POINTS.dailyCap.
 * Every input log id is guaranteed to have an entry in the returned Map (non-candidates / capped get 0).
 */
export function allocateEligibleResistPoints(
  sameDayResistLogs: ReadonlyArray<{
    id: string;
    badHabitId: string;
    createdAt?: string;
    pointsAwardedOrDeducted?: number;
  }>,
  badHabits: BadHabit[]
): Map<string, number> {
  const eligibleIds = getPointEligibleHabitIds(badHabits);
  const candidates = (sameDayResistLogs || []).filter(
    (log) => eligibleIds.has(log.badHabitId) || (log.pointsAwardedOrDeducted || 0) > 0
  );

  const sortByTimeAndId = (
    a: { id: string; createdAt?: string },
    b: { id: string; createdAt?: string }
  ) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return compareIds(a.id || '', b.id || '');
  };

  const groupA = [...candidates.filter((log) => (log.pointsAwardedOrDeducted || 0) > 0)].sort(
    sortByTimeAndId
  );
  const groupB = [...candidates.filter((log) => (log.pointsAwardedOrDeducted || 0) <= 0)].sort(
    sortByTimeAndId
  );

  const orderedCandidates = [...groupA, ...groupB];

  let cumulativePoints = 0;
  let awardedCount = 0;
  const candidateMap = new Map<string, number>();

  for (const log of orderedCandidates) {
    let logPts = 0;
    if (
      awardedCount < BAD_HABIT_POINTS.maxDailyResists &&
      cumulativePoints + BAD_HABIT_POINTS.resistBase <= BAD_HABIT_POINTS.dailyCap
    ) {
      logPts = BAD_HABIT_POINTS.resistBase;
      cumulativePoints += logPts;
      awardedCount++;
    }
    candidateMap.set(log.id, logPts);
  }

  const result = new Map<string, number>();
  for (const log of sameDayResistLogs || []) {
    result.set(log.id, candidateMap.get(log.id) ?? 0);
  }
  return result;
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
