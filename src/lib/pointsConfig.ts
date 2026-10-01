// src/lib/pointsConfig.ts
import { WeeklyGoalItem } from '@/types';

/**
 * Set to the production push date (YYYY-MM-DD, local date key) BEFORE pushing.
 * Days/weeks before this date are never scored retroactively.
 */
export const POINTS_V2_START_DATE_KEY = '2026-10-01';
export const RETRO_SCORING_WINDOW_DAYS = 7;

export const PRESET_HABIT_POINTS = {
  dailyCap: 10,
} as const;

export interface PresetHabitCapItem {
  id: string;
  nominalPoints: number;
  updatedAt: string;
}

/**
 * Pure allocation function for today's preset habits cap.
 * Allocates nominal points to each habit in ascending updatedAt order
 * until PRESET_HABIT_POINTS.dailyCap is reached.
 * Returns a map of habitId -> allocatedPoints.
 */
export function recomputeTodayPresetPoints(
  items: PresetHabitCapItem[],
  cap: number = PRESET_HABIT_POINTS.dailyCap
): Record<string, number> {
  const sorted = [...items].sort((a, b) => {
    const timeA = new Date(a.updatedAt).getTime();
    const timeB = new Date(b.updatedAt).getTime();
    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const allocation: Record<string, number> = {};
  let accumulated = 0;

  for (const item of sorted) {
    const nominal = Math.max(0, item.nominalPoints);
    const remaining = Math.max(0, cap - accumulated);
    const allocated = Math.min(nominal, remaining);
    allocation[item.id] = allocated;
    accumulated += allocated;
  }

  return allocation;
}

export const JOURNAL_POINTS = {
  // store.ts:3204
  entryCompleted: 2,
  // store.ts:3208
  entryCleared: -2,
  // store.ts:3255
  entryDeleted: -2,
} as const;

export const WEEKLY_REFLECTION_POINTS = {
  // store.ts:1006
  awarded: 5,
  // store.ts:1017
  reversed: -5,
} as const;

export const WEEKLY_GOALS_POINTS = {
  pointsPerGoal: 5,
  maxGoalsCounted: 3,
  maxWeeklyPoints: 15,
} as const;

export const WORKOUT_POINTS = {
  // 6 min = 1pt, 10 reps = 1pt, 1 set = 1pt, 1 km = 1pt
  units: {
    minsPerPoint: 6,
    repsPerPoint: 10,
    pointsPerSet: 1,
    pointsPerKm: 1,
  },
  dailyCap: 10,
} as const;

export const SKILLS_POINTS = {
  // 1hr (60m) = 5pts, 2hr (120m) = 10pts -> 1pt per 12 mins
  minutesPerPoint: 12,
  dailyCap: 10,
} as const;

export const PFC_POINTS = {
  // 25m = 2pts, 50m = 5pts, 90m = 10pts (tiered)
  focus: {
    tiers: [
      { minMinutes: 90, points: 10 },
      { minMinutes: 50, points: 5 },
      { minMinutes: 25, points: 2 },
    ] as const,
    dailyCap: 10,
  },
  decision: 15,
  emotion: 5,
} as const;

export const READING_POINTS = {
  // 2 pages = 1pt, cap 10pts/day (reached at 20 pages/day)
  pagesPerPoint: 2,
  dailyCap: 10,
  completionBonus: 15,
} as const;

export const BAD_HABIT_POINTS = {
  eligibleSlots: 2,
  // store.ts:4596
  resistBase: 3,
  dailyCap: 6,
  maxDailyResists: 2,
  // store.ts:4616 (multiplied by escalation)
  occurBase: 10,
  // habitPenalties.ts:438 (multiplied by escalation)
  noReportBase: 5,
} as const;

export function allocateResistPoints(
  sameDayResistLogs: ReadonlyArray<{ id: string; createdAt?: string }>
): Map<string, number> {
  const sorted = [...sameDayResistLogs].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  let cumulativePoints = 0;
  const result = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    let logPts = 0;
    if (i < BAD_HABIT_POINTS.maxDailyResists && cumulativePoints + BAD_HABIT_POINTS.resistBase <= BAD_HABIT_POINTS.dailyCap) {
      logPts = BAD_HABIT_POINTS.resistBase;
      cumulativePoints += logPts;
    }
    result.set(sorted[i].id, logPts);
  }
  return result;
}

export const SOBRIETY_MILESTONE_POINTS = {
  '1w': 10,
  '1m': 25,
  '90d': 50,
} as const;

export const RECOVERY_POINTS = { seasonCap: 85 } as const;

export function wouldExceedRecoverySeasonCap(heldSeasonPoints: number, milestonePoints: number): boolean {
  return heldSeasonPoints + milestonePoints > RECOVERY_POINTS.seasonCap;
}

/**
 * Calculates raw points and capped awarded points for a workout.
 * Rounding rule: Math.floor for mins and reps divisions.
 */
export function calculateWorkoutPoints(
  unit?: string,
  amount?: number,
  durationMinutes?: number,
  dailyCapRemaining: number = WORKOUT_POINTS.dailyCap
): { rawPoints: number; pointsToAward: number; multiplier: number } {
  const normalized = (unit || 'mins').trim().toLowerCase();
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? Math.max(0, Number(amount)) : undefined;
  const safeDuration = Math.max(0, Number(durationMinutes) || 0);

  let rawPoints = 0;
  if (normalized === 'sets') {
    const val = safeAmount !== undefined ? safeAmount : safeDuration;
    rawPoints = Math.floor(val * WORKOUT_POINTS.units.pointsPerSet);
  } else if (normalized === 'km') {
    const val = safeAmount !== undefined ? safeAmount : safeDuration;
    rawPoints = Math.floor(val * WORKOUT_POINTS.units.pointsPerKm);
  } else if (normalized === 'reps') {
    const val = safeAmount !== undefined ? safeAmount : 0;
    rawPoints = Math.floor(val / WORKOUT_POINTS.units.repsPerPoint);
  } else {
    // default 'mins' or sessions
    const val = safeAmount !== undefined && safeAmount > 0 ? safeAmount : safeDuration;
    rawPoints = Math.floor(val / WORKOUT_POINTS.units.minsPerPoint);
  }

  const pointsToAward = Math.min(rawPoints, Math.max(0, dailyCapRemaining));
  return { rawPoints, pointsToAward, multiplier: 1 };
}

/**
 * Calculates raw points for a skill practice session.
 * 12 minutes = 1 point (Math.floor).
 */
export function calculateSkillPoints(
  durationMinutes: number,
  dailyCapRemaining: number = SKILLS_POINTS.dailyCap
): { rawPoints: number; pointsToAward: number } {
  const safeDuration = Math.max(0, Number(durationMinutes) || 0);
  const rawPoints = Math.floor(safeDuration / SKILLS_POINTS.minutesPerPoint);
  const pointsToAward = Math.min(rawPoints, Math.max(0, dailyCapRemaining));
  return { rawPoints, pointsToAward };
}

/**
 * Calculates raw points for a PFC focus session using tiered lookup.
 * 25m = 2pts, 50m = 5pts, 90m = 10pts.
 */
export function calculateFocusPoints(
  durationMinutes: number,
  dailyCapRemaining: number = PFC_POINTS.focus.dailyCap
): { rawPoints: number; pointsToAward: number } {
  const safeDuration = Math.max(0, Number(durationMinutes) || 0);
  let rawPoints = 0;
  for (const tier of PFC_POINTS.focus.tiers) {
    if (safeDuration >= tier.minMinutes) {
      rawPoints = tier.points;
      break;
    }
  }
  const pointsToAward = Math.min(rawPoints, Math.max(0, dailyCapRemaining));
  return { rawPoints, pointsToAward };
}

export const TIME_TRACKER_POINTS = {
  dailyCap: 5,
  tiers: {
    high: { minPercent: 80, points: 5 },
    medium: { minPercent: 50, points: 3 },
    low: { minPercent: 0, points: 0 },
  },
  skipExclusionRatio: 0.3,
  maxExcludedSkips: 3,
  smallRoutineThreshold: 3,
} as const;

/**
 * Calculates raw points for reading pages.
 * 2 pages = 1 point (Math.floor).
 */
export function calculateReadingPoints(
  pagesRead: number,
  dailyCapRemaining: number = READING_POINTS.dailyCap
): { rawPoints: number; pointsToAward: number } {
  const safePages = Math.max(0, Number(pagesRead) || 0);
  const rawPoints = Math.floor(safePages / READING_POINTS.pagesPerPoint);
  const pointsToAward = Math.min(rawPoints, Math.max(0, dailyCapRemaining));
  return { rawPoints, pointsToAward };
}

/**
 * Calculates the percentage of routine completed and the corresponding points awarded.
 * Formula:
 * totalBlocks = count of all blocks in today's dailyLogs[date]
 * actualSkippedCount = count of blocks where skipped === true
 * skipExclusionCap = totalBlocks <= 3 ? 0 : Math.floor(0.3 * totalBlocks)
 * skipExclusionCap = Math.min(skipExclusionCap, 3)
 * excludedSkips = Math.min(actualSkippedCount, skipExclusionCap)
 * effectiveDenominator = totalBlocks - excludedSkips
 * completedCount = count of blocks where completed === true
 * percentage = effectiveDenominator > 0 ? (completedCount / effectiveDenominator) * 100 : 0
 *
 * Points tiers:
 * percentage >= 80 -> 5pts
 * percentage >= 50 -> 3pts
 * percentage < 50 -> 0pts
 * totalBlocks === 0 (no routine) -> 0pts
 */
export function calculateTimeTrackerDailyPoints(blocks: Array<{ completed?: boolean; skipped?: boolean }>): {
  percentage: number;
  pointsAwarded: number;
} {
  const totalBlocks = (blocks || []).length;
  if (totalBlocks === 0) {
    return { percentage: 0, pointsAwarded: 0 };
  }

  const actualSkippedCount = blocks.filter((b) => b && b.skipped === true).length;
  const rawCap =
    totalBlocks <= TIME_TRACKER_POINTS.smallRoutineThreshold
      ? 0
      : Math.floor(TIME_TRACKER_POINTS.skipExclusionRatio * totalBlocks);
  const skipExclusionCap = Math.min(rawCap, TIME_TRACKER_POINTS.maxExcludedSkips);
  const excludedSkips = Math.min(actualSkippedCount, skipExclusionCap);
  const effectiveDenominator = totalBlocks - excludedSkips;

  const completedCount = blocks.filter((b) => b && b.completed === true).length;
  const percentage = effectiveDenominator > 0 ? (completedCount / effectiveDenominator) * 100 : 0;

  let pointsAwarded = 0;
  if (percentage >= TIME_TRACKER_POINTS.tiers.high.minPercent) {
    pointsAwarded = TIME_TRACKER_POINTS.tiers.high.points;
  } else if (percentage >= TIME_TRACKER_POINTS.tiers.medium.minPercent) {
    pointsAwarded = TIME_TRACKER_POINTS.tiers.medium.points;
  } else {
    pointsAwarded = TIME_TRACKER_POINTS.tiers.low.points;
  }

  return { percentage, pointsAwarded };
}

/**
 * Calculates points awarded for achieved weekly goals.
 * Formula:
 * - Filter goals in the target week that are completed === true (or done === true).
 * - Sort chronologically by completion timestamp (completedAt -> createdAt fallback).
 * - Award 5pts per goal, capped at 3 goals max (15pts max).
 */
export function calculateWeeklyGoalsPoints(goals: WeeklyGoalItem[]): {
  pointsAwarded: number;
  completedGoalsCount: number;
  countedGoalsCount: number;
} {
  const activeGoals = (goals || []).filter((g) => !g.archived);
  const completedGoals = activeGoals.filter((g) => g && (g.completed === true || g.done === true));

  completedGoals.sort((a, b) => {
    const timeA = a.completedAt ? new Date(a.completedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.completedAt ? new Date(b.completedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return timeA - timeB;
  });

  const completedGoalsCount = completedGoals.length;
  const countedGoalsCount = Math.min(completedGoalsCount, WEEKLY_GOALS_POINTS.maxGoalsCounted);
  const pointsAwarded = countedGoalsCount * WEEKLY_GOALS_POINTS.pointsPerGoal;

  return {
    pointsAwarded,
    completedGoalsCount,
    countedGoalsCount,
  };
}
