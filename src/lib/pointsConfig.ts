// src/lib/pointsConfig.ts

export const JOURNAL_POINTS = {
  // store.ts:2378
  entryCompleted: 5,
  // store.ts:2382
  entryCleared: -5,
  // store.ts:2424
  entryDeleted: -5,
} as const;

export const WEEKLY_REFLECTION_POINTS = {
  // store.ts:1006
  awarded: 20,
  // store.ts:1017
  reversed: -20,
} as const;

export const WORKOUT_POINTS = {
  // store.ts:2647-2655, duplicated at 2719-2723
  multipliers: {
    sets: 10,
    km: 10,
    sessions: 30,
    minsOrReps: 1,
  },
  // store.ts:2663, 2715
  dailyCap: 60,
} as const;

export const SKILLS_POINTS = {
  // store.ts:3437
  pointsPerMinute: 1,
  // store.ts:3438
  dailyCap: 60,
} as const;

export const PFC_POINTS = {
  // store.ts:4147
  focus: {
    minuteRate: 0.6,
    floorPoints: 5,
  },
  // store.ts:4213
  decision: 15,
  // store.ts:4229
  emotion: 5,
} as const;

export const READING_POINTS = {
  // store.ts:2887
  unlinkedDailyLog: 5,
  // store.ts:2961
  presetHabitFallback: 12,
  // store.ts:3058, 3135
  customBookBonus: 30,
  // store.ts:3270
  curatedBookFallback: 40,
} as const;

export const BAD_HABIT_POINTS = {
  // store.ts:3590
  resistBase: 10,
  // store.ts:3609 (multiplied by escalation)
  occurBase: 10,
  // habitPenalties.ts:436 (multiplied by escalation)
  noReportBase: 5,
} as const;

export const SOBRIETY_MILESTONE_POINTS = {
  // store.ts:3882
  '24h': 20,
  // store.ts:3895
  '1w': 50,
  // store.ts:3908
  '1m': 150,
} as const;

/**
 * Resolves the unit multiplier for workout point calculations.
 */
export function getWorkoutMultiplier(unit?: string): number {
  const normalized = (unit || 'mins').trim().toLowerCase();
  if (normalized === 'sets' || normalized === 'km') {
    return WORKOUT_POINTS.multipliers.sets;
  }
  if (normalized === 'sessions') {
    return WORKOUT_POINTS.multipliers.sessions;
  }
  return WORKOUT_POINTS.multipliers.minsOrReps;
}

/**
 * Calculates raw points and capped awarded points for a workout.
 */
export function calculateWorkoutPoints(
  unit?: string,
  amount?: number,
  durationMinutes?: number,
  dailyCapRemaining: number = WORKOUT_POINTS.dailyCap
): { rawPoints: number; pointsToAward: number; multiplier: number } {
  const mult = getWorkoutMultiplier(unit);
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? Math.max(0, Number(amount)) : undefined;
  const safeDuration = Math.max(0, Number(durationMinutes) || 0);
  const effectiveAmount = safeAmount !== undefined ? safeAmount : safeDuration;

  const rawPoints = Math.round(effectiveAmount * mult);
  const pointsToAward = Math.min(rawPoints, Math.max(0, dailyCapRemaining));

  return { rawPoints, pointsToAward, multiplier: mult };
}
