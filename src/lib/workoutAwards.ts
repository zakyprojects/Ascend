import type { PointsEntry, WorkoutLog } from '@/types';
import { WORKOUT_POINTS, calculateWorkoutPoints } from './pointsConfig';
import { todayKey } from './dates';

/**
 * Workout points are written by the server (supabase/migrations/20261015140000_server_workout_awards.sql):
 * one row per local day, the day's workouts' points up to the daily cap. The app computes the same
 * row only to show it before the server's copy arrives; it never uploads it, and the server skips
 * any app write to it. Change both sides together.
 */

/** First local day whose workout points come from the server; older app-written rows stay. */
export const WORKOUT_AWARDS_SERVER_SINCE = '2026-10-15';

export const workoutAwardId = (day: string) => `workout_award_${day}`;

/** Point entry ids only the server writes: workout awards and missed weekly-target penalties. */
export const isServerOwnedWorkoutPointId = (id: string): boolean =>
  id.startsWith('workout_award_') || id.startsWith('exercise_missed_');

const localDayOf = (timestamp: string): string | null => {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

/** A workout award the app wrote itself ("Workout logged"), on the local day it was logged. */
const appWrittenAwardDay = (entry: PointsEntry): string | null =>
  !(entry.id || '').startsWith('workout_award_') && entry.source === 'exercise' && entry.amount > 0
    ? localDayOf(entry.timestamp)
    : null;

/** The day's award row: the server's own, or one the app wrote for a day the server owns. */
export const isWorkoutDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.id === workoutAwardId(day) || (day >= WORKOUT_AWARDS_SERVER_SINCE && appWrittenAwardDay(entry) === day);

/** An app-written workout award for a day the server owns: the server retired every such row. */
export const isRetiredAppWorkoutAward = (entry: PointsEntry): boolean => {
  const day = appWrittenAwardDay(entry);
  return day !== null && day >= WORKOUT_AWARDS_SERVER_SINCE;
};

const timeOf = (value: string): number => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * Mirror of ascend_recompute_workout_awards: the award entry of one local day (null when the
 * day earns nothing), and each workout's share of the cap in log order (shown on the workout).
 */
export function computeWorkoutAwards(
  workouts: WorkoutLog[],
  day: string,
  dayStartMs: number,
  nowMs: number
): { entry: PointsEntry | null; workoutPoints: Map<string, number> } {
  const dayWorkouts = workouts
    .filter((w) => w && w.date === day)
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const workoutPoints = new Map<string, number>();
  let used = 0;
  for (const w of dayWorkouts) {
    const { pointsToAward } = calculateWorkoutPoints(w.unit, w.amount, w.durationMinutes, WORKOUT_POINTS.dailyCap - used);
    workoutPoints.set(w.id, pointsToAward);
    used += pointsToAward;
  }
  if (used <= 0) return { entry: null, workoutPoints };

  const lastMs = timeOf(dayWorkouts[dayWorkouts.length - 1].createdAt);
  const at = Math.min(Math.max(Number.isFinite(lastMs) ? lastMs : nowMs, dayStartMs), nowMs);
  const id = workoutAwardId(day);
  return {
    entry: {
      id,
      amount: used,
      reason: `Workouts logged (${dayWorkouts.length})`,
      source: 'exercise',
      timestamp: new Date(at).toISOString(),
      metadata: { date: day, workouts: dayWorkouts.length },
    },
    workoutPoints,
  };
}
