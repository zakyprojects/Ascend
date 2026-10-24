import { AppState, BadHabitLog, Habit } from '@/types';
import { todayKey, periodKey, previousPeriodKey, addDays, addWeeks, getNow } from './dates';
import { getEffectiveSeasonPoints } from './leagues';

/**
 * Penalties are issued only by the server (ascend_process_penalties, hourly cron). This file keeps the
 * pieces the app shows before the server's rows arrive, and must change together with the SQL:
 * getMissPenaltyMultiplier = ascend_miss_multiplier, getHabitConsecutiveMissesUpToPeriod = the preset
 * miss walk, getBadHabitBadDaysBefore = ascend_bad_habit_bad_days_before (no-report and occurred).
 */
export const MAX_RETROACTIVE_PENALTY_DAYS = 90;

export function getAppStateSeasonPoints(state: AppState, now: Date): number {
  return getEffectiveSeasonPoints(state, now);
}

export interface StreakSourceInfo {
  days: number;
  source: string;
  priority?: number;
  bestDays?: number;
}

export { getMissPenaltyMultiplier } from './missPenalty';

/**
 * Checks if a habit was completed for a given period key.
 * Supports both modern dictionary format { [key]: { done: true } } and legacy array format.
 */
export function isHabitPeriodCompleted(habit: Habit, pKey: string): boolean {
  if (!habit || !habit.completions) return false;
  if (Array.isArray(habit.completions)) {
    return (habit.completions as string[]).includes(pKey);
  }
  return habit.completions[pKey]?.done === true;
}

/**
 * Derives the consecutive miss streak ending at a specific historical period.
 * Steps backwards period-by-period starting from targetPeriod:
 * - Increments for each missed/uncompleted period
 * - Stops immediately when a completed period is encountered
 * - Stops immediately when stepping prior to habit.createdAtPeriod
 */
export function getHabitConsecutiveMissesUpToPeriod(
  habit: Habit,
  targetPeriod: string,
  now: Date = getNow()
): number {
  if (!habit) return 0;
  const freq = habit.frequency || 'daily';
  const createdKey = habit.createdAtPeriod || periodKey(freq, habit.createdAt ? new Date(habit.createdAt) : now);

  if (targetPeriod < createdKey) return 0;

  let misses = 0;
  let currentP = targetPeriod;
  const maxLookback = freq === 'daily' ? MAX_RETROACTIVE_PENALTY_DAYS : 52;

  for (let i = 0; i < maxLookback; i++) {
    if (currentP < createdKey) {
      break;
    }
    if (isHabitPeriodCompleted(habit, currentP)) {
      break;
    }
    misses++;
    currentP = freq === 'daily' ? addDays(currentP, -1) : addWeeks(currentP, -1);
  }

  return misses;
}

/**
 * Derives the current active consecutive miss count for a habit.
 * - If current period is already completed, the miss streak is broken (returns 0).
 * - Otherwise, derives consecutive misses starting from the most recent finished period.
 */
export function getHabitConsecutiveMisses(habit: Habit, now: Date = getNow()): number {
  if (!habit) return 0;
  const freq = habit.frequency || 'daily';
  const currentKey = periodKey(freq, now);

  if (isHabitPeriodCompleted(habit, currentKey)) {
    return 0;
  }

  const mostRecentFinishedPeriod = previousPeriodKey(freq, 1, now);
  return getHabitConsecutiveMissesUpToPeriod(habit, mostRecentFinishedPeriod, now);
}

/** A bad habit's first local day, or null when createdAt is missing or invalid (ascend_local_date). */
export function badHabitCreatedDay(createdAt: string | undefined): string | null {
  const value = (createdAt || '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : todayKey(new Date(ms));
}

/**
 * Mirror of ascend_bad_habit_bad_days_before: bad days in a row before `day` (slipped, no-report or
 * not logged at all), walking back day by day to the habit's first day (max 90) and stopping at a
 * Resisted day. A slip or no-report on `day` is charged at this count + 1 (getMissPenaltyMultiplier).
 */
export function getBadHabitBadDaysBefore(
  logs: BadHabitLog[],
  badHabitId: string,
  day: string,
  createdDay: string | null
): number {
  if (!createdDay) return 0;
  const resisted = new Set(
    (logs || [])
      .filter((l) => l && l.badHabitId === badHabitId && l.status === 'resisted' && l.date < day)
      .map((l) => l.date)
  );
  let count = 0;
  let cursor = addDays(day, -1);
  for (let i = 0; i < MAX_RETROACTIVE_PENALTY_DAYS; i++) {
    if (cursor < createdDay || resisted.has(cursor)) break;
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
