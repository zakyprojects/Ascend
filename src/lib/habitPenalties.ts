import { AppState, Habit } from '@/types';
import { todayKey, periodKey, previousPeriodKey, parseDate, addDays, addWeeks, getNow } from './dates';
import { getEffectiveSeasonPoints } from './leagues';
import { trustedNow } from './clock';

export const MAX_RETROACTIVE_PENALTY_DAYS = 90;

export function getAppStateSeasonPoints(state: AppState, now: Date): number {
  return getEffectiveSeasonPoints(state, now);
}

export interface StreakInfo {
  days: number;
  category: string;
}

export interface CurrentStreakInfo extends StreakInfo {
  isActive: boolean;
  label: string;
}

export interface BestStreakInfo extends StreakInfo {
  label: string;
}

export interface StreakInfoPair {
  currentStreak: CurrentStreakInfo;
  bestStreak: BestStreakInfo;
}

export interface StreakSourceInfo {
  days: number;
  source: string;
  priority?: number;
  bestDays?: number;
}

function getBestStreakFromSortedDates(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let best = 0;
  let running = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      running = 1;
    } else {
      const prev = parseDate(sortedDates[i - 1]);
      const curr = parseDate(sortedDates[i]);
      const diff = prev && curr ? Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24)) : 0;
      if (diff === 1) {
        running++;
      } else {
        running = 1;
      }
    }
    if (running >= best) {
      best = running;
    }
  }
  return best;
}

function getCurrentStreakFromSortedDates(sortedDates: string[], now: Date): number {
  if (sortedDates.length === 0) return 0;
  const todayStr = todayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = todayKey(yesterdayDate);

  const last = sortedDates[sortedDates.length - 1];
  if (last !== todayStr && last !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = sortedDates.length - 2; i >= 0; i--) {
    const prev = parseDate(sortedDates[i]);
    const curr = parseDate(sortedDates[i + 1]);
    const diff = prev && curr ? Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24)) : 0;
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function getMissPenaltyMultiplier(consecutiveMisses: number, seasonPoints: number = 0): number {
  const isPerformerOrAbove = seasonPoints >= 2000;

  if (!isPerformerOrAbove) {
    if (consecutiveMisses <= 1) return 1.0;
    return 1.5;
  } else {
    if (consecutiveMisses <= 1) return 1.0;
    if (consecutiveMisses === 2) return 2.0;
    return 2.5;
  }
}

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

import { calculateUnifiedStreak } from './streakLogic';

export function getHighestUserStreak(state: AppState, now: Date = trustedNow()): StreakInfoPair {
  const unified = calculateUnifiedStreak(state, todayKey(now));

  return {
    currentStreak: {
      days: unified.currentStreakDays,
      category: unified.currentStreakCategory,
      isActive: unified.currentStreakIsActive,
      label: 'Current Streak',
    },
    bestStreak: {
      days: unified.currentStreakDays,
      category: unified.currentStreakCategory,
      label: 'Current Streak',
    },
  };
}
