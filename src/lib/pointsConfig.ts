// src/lib/pointsConfig.ts

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
  awarded: 20,
  // store.ts:1017
  reversed: -20,
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
  customBookBonus: 30,
  curatedBookFallback: 40,
} as const;

export const BAD_HABIT_POINTS = {
  // store.ts:4596
  resistBase: 3,
  dailyCap: 6,
  maxDailyResists: 2,
  // store.ts:4616 (multiplied by escalation)
  occurBase: 10,
  // habitPenalties.ts:438 (multiplied by escalation)
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
