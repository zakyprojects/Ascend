import { Habit, PointsEntry } from '@/types';
import { addDays, parseDate, todayKey } from './dates';

/** The last `count` local date keys, oldest first, ending today. */
export function lastDayKeys(count: number, today = todayKey()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

export interface DayPoints {
  day: string;
  earned: number;
  /** Penalties as a positive number. */
  lost: number;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The local day an entry belongs to. Missed-habit and unreported bad-habit penalties are issued
 * just after the day ends, so they count on the day that was missed (their metadata names it);
 * a weekly habit's period is a week, so it keeps its issue day. Everything else: its timestamp.
 * Display only: league points read the server ledger and never this.
 */
function entryDay(entry: PointsEntry): string | null {
  const meta = entry.metadata;
  const missedDay =
    entry.source === 'habit_missed' ? meta?.period : entry.source === 'bad_habit_no_report' ? meta?.date : undefined;
  if (typeof missedDay === 'string' && DAY_KEY.test(missedDay)) return missedDay;
  const date = parseDate(entry.timestamp);
  return date ? todayKey(date) : null;
}

/** Points earned and lost per local day, from the points ledger. */
export function dailyPoints(history: PointsEntry[], days: string[]): DayPoints[] {
  const byDay = new Map<string, DayPoints>(days.map((day) => [day, { day, earned: 0, lost: 0 }]));
  for (const entry of history) {
    if (!entry || !Number.isFinite(entry.amount)) continue;
    const key = entryDay(entry);
    const bucket = key ? byDay.get(key) : undefined;
    if (!bucket) continue;
    if (entry.amount >= 0) bucket.earned += entry.amount;
    else bucket.lost -= entry.amount;
  }
  return days.map((day) => byDay.get(day)!);
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
