import type { WorkoutLog } from '@/types';
import { compactNumber } from '../leagues/numberFormat';
import { workoutAmountOf, workoutMeasureOf, workoutTypeKey, type WorkoutMeasure } from '../content/workoutTypes';

/**
 * Exercise amounts in their own unit, the way the member card shows them, and the client mirror of
 * the card's exercise ranking (ascend_member_card) for any range of days. Display only: points,
 * caps and the ledger never read this.
 */

/** Minutes as "45 min", or hours with one decimal from an hour up ("6.5 h"). */
export function minutesText(min: number): string {
  if (min < 60) return `${compactNumber(min)} min`;
  return `${compactNumber(Math.round((min / 60) * 10) / 10)} h`;
}

/** An exercise amount in its own unit: "45 min", "1.5 h", "5.75 km", "1 rep", "12.5k reps", "5 sets". */
export function exerciseAmountText(n: number, unit: WorkoutMeasure): string {
  if (unit === 'mins') return minutesText(Math.round(n));
  if (unit === 'km') return `${compactNumber(n)} km`;
  return `${compactNumber(n)} ${n === 1 ? unit.slice(0, -1) : unit}`;
}

export interface WorkoutTotal {
  /** Newest spelling, at most 40 characters ("Workout" when blank). */
  name: string;
  unit: WorkoutMeasure;
  /** Sum in the unit, rounded to 2 decimals. */
  total: number;
  /** Days with at least one log. */
  days: number;
  /** Largest one-day total, rounded to 2 decimals. */
  best: number;
  /** Logs. */
  sessions: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Workouts dated fromKey..toKey (inclusive, YYYY-MM-DD), one row per exercise and unit (never added
 * across units), ranked like the member card: most days, then most logs, then the newest.
 */
export function topWorkouts(workouts: WorkoutLog[], fromKey: string, toKey: string): WorkoutTotal[] {
  interface Group {
    unit: WorkoutMeasure;
    perDay: Map<string, number>;
    sessions: number;
    stamp: string;
    name: string;
  }
  const groups = new Map<string, Group>();
  for (const w of workouts) {
    const day = w.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || day < fromKey || day > toKey) continue;
    const unit = workoutMeasureOf(w);
    const id = `${workoutTypeKey(w.type)}|${unit}`;
    const amount = Math.max(Number(workoutAmountOf(w)) || 0, 0);
    const stamp = `${day}|${w.createdAt || ''}`;
    const name = (w.type || '').trim().slice(0, 40) || 'Workout';
    const g = groups.get(id);
    if (!g) {
      groups.set(id, { unit, perDay: new Map([[day, amount]]), sessions: 1, stamp, name });
      continue;
    }
    g.perDay.set(day, (g.perDay.get(day) || 0) + amount);
    g.sessions += 1;
    if (stamp > g.stamp) {
      g.stamp = stamp;
      g.name = name;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.perDay.size - a.perDay.size || b.sessions - a.sessions || b.stamp.localeCompare(a.stamp))
    .map((g) => {
      const amounts = [...g.perDay.values()];
      return {
        name: g.name,
        unit: g.unit,
        total: round2(amounts.reduce((s, n) => s + n, 0)),
        days: g.perDay.size,
        best: round2(Math.max(...amounts)),
        sessions: g.sessions,
      };
    });
}
