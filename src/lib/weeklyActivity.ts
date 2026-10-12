import { Habit, PointsEntry } from '@/types';
import { addDays, parseDate, startOfWeek, todayKey } from './dates';

/** The ledger keeps only the newest entries (pointsLedger.ts caps it at 500). */
const POINTS_HISTORY_CAP = 500;

/** The last `count` local date keys, oldest first, ending today. */
export function lastDayKeys(count: number, today = todayKey()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

/**
 * Day keys for a calendar grid of `weeks` Monday-start weeks ending with the current one,
 * oldest first, column by column. Days after today are `null` so the grid keeps its shape.
 */
export function weekGridDayKeys(weeks: number, now = new Date()): (string | null)[] {
  const today = todayKey(now);
  const firstMonday = addDays(todayKey(startOfWeek(now)), -(weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const key = addDays(firstMonday, i);
    return key > today ? null : key;
  });
}

export interface DayPoints {
  day: string;
  earned: number;
  /** Penalties as a positive number. */
  lost: number;
}

/**
 * Points earned and lost per local day, from the points ledger. `partial` is true when the
 * ledger is at its cap and its oldest kept entry falls inside the window, so the earliest
 * days may be missing entries.
 */
export function dailyPoints(history: PointsEntry[], days: string[]): { days: DayPoints[]; partial: boolean } {
  const byDay = new Map<string, DayPoints>(days.map((day) => [day, { day, earned: 0, lost: 0 }]));
  let oldest: string | null = null;
  for (const entry of history) {
    const date = parseDate(entry?.timestamp);
    if (!date || !Number.isFinite(entry.amount)) continue;
    const key = todayKey(date);
    if (oldest === null || key < oldest) oldest = key;
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (entry.amount >= 0) bucket.earned += entry.amount;
    else bucket.lost -= entry.amount;
  }
  const partial = history.length >= POINTS_HISTORY_CAP && oldest !== null && oldest > days[0];
  return { days: days.map((day) => byDay.get(day)!), partial };
}

export interface DayHabits {
  day: string;
  done: number;
  /** Daily habits that existed on that day. */
  total: number;
}

/**
 * Daily habits completed per local day. Weekly habits are left out: they are done once per
 * week, so they have no per-day completion to count.
 */
export function dailyHabitCompletions(habits: Habit[], days: string[]): DayHabits[] {
  const daily = habits.filter((h) => h.frequency === 'daily');
  return days.map((day) => {
    let done = 0;
    let total = 0;
    for (const habit of daily) {
      if (habit.createdAtPeriod && habit.createdAtPeriod > day) continue;
      total++;
      const completions = habit.completions as Habit['completions'] | string[] | undefined;
      // Legacy accounts stored completions as an array of keys (store.isHabitDone handles both).
      const isDone = Array.isArray(completions) ? completions.includes(day) : completions?.[day]?.done === true;
      if (isDone) done++;
    }
    return { day, done, total };
  });
}

/**
 * A per-day total from any log dated with a YYYY-MM-DD key (skill minutes, pages read,
 * workout minutes), one number per entry of `days`.
 */
export function sumPerDay<T extends { date: string }>(logs: T[], days: string[], amount: (log: T) => number): number[] {
  const byDay = new Map(days.map((day) => [day, 0]));
  for (const log of logs) {
    const current = log ? byDay.get(log.date) : undefined;
    const value = current === undefined ? NaN : amount(log);
    if (current !== undefined && Number.isFinite(value)) byDay.set(log.date, current + value);
  }
  return days.map((day) => byDay.get(day)!);
}
