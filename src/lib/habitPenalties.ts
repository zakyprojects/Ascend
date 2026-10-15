import { AppState, Habit, BadHabitLog, ExerciseGoal, WorkoutLog } from '@/types';
import { todayKey, periodKey, previousPeriodKey, weekKey, parseDate, addDays, addWeeks, getNow } from './dates';
import { getEffectiveSeasonPoints } from './leagues';
import { applyPenaltyDeductionInternal } from './pointsLedger';
import { BAD_HABIT_POINTS } from './pointsConfig';
import { getPointEligibleHabitIds } from './badHabitEligibility';
import { trustedNow, trustedNowMs } from './clock';

export { applyPenaltyDeductionInternal };

export const MAX_RETROACTIVE_PENALTY_DAYS = 90;

// Ids shared with the hourly server job (supabase/migrations/20261015000000_server_side_penalties.sql):
// whichever side issues a penalty first, the other writes the same row and nothing doubles.
const habitMissedEntryId = (habitId: string, period: string) => `habit_missed_${habitId}_${period}`;
const noReportLogId = (badHabitId: string, date: string) => `no_report_${badHabitId}_${date}`;
const noReportEntryId = (badHabitId: string, date: string) => `bad_habit_no_report_${badHabitId}_${date}`;
const exerciseMissedEntryId = (week: string) => `exercise_missed_${week}`;
const MAX_RETROACTIVE_PENALTY_WEEKS = 52;

/**
 * First local day of the daily penalty window ending at `yesterday`: the most recent
 * MAX_RETROACTIVE_PENALTY_DAYS days, never before the habit's creation day.
 * The window moves with the calendar, so habits of any age keep being evaluated.
 */
function getDailyPenaltyWindowStart(createdDay: Date, yesterday: Date): Date {
  const earliest = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() - (MAX_RETROACTIVE_PENALTY_DAYS - 1));
  return createdDay > earliest ? createdDay : earliest;
}

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

/**
 * Derives the consecutive missed weeks for weekly ExerciseGoal from AppState.workouts.
 * Steps backwards week-by-week starting from the most recently finished ISO week:
 * - Increments for each week where workout count < exerciseGoal.targetWeeklySessions
 * - Stops when a week meets targetWeeklySessions
 * - Stops at exerciseGoal.createdAt (hard lower bound — does not count weeks before goal existed)
 */
export function getExerciseGoalConsecutiveMisses(
  exerciseGoal: ExerciseGoal | null | undefined,
  workouts: WorkoutLog[] = [],
  now: Date = getNow()
): number {
  if (!exerciseGoal || !exerciseGoal.targetWeeklySessions || exerciseGoal.targetWeeklySessions <= 0) {
    return 0;
  }

  const target = exerciseGoal.targetWeeklySessions;
  const createdWeekKey = exerciseGoal.createdAt
    ? weekKey(parseDate(exerciseGoal.createdAt) || now)
    : undefined;

  let misses = 0;
  for (let i = 1; i <= 52; i++) {
    const wKey = previousPeriodKey('weekly', i, now);
    if (createdWeekKey && wKey < createdWeekKey) {
      break;
    }

    const count = (workouts || []).filter((w) => {
      const d = parseDate(w.date);
      return d && weekKey(d) === wKey;
    }).length;

    if (count >= target) {
      break;
    }
    misses++;
  }

  return misses;
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

export function getPastDuePeriods(habit: Habit, now: Date = trustedNow()): string[] {
  const pastPeriods: string[] = [];
  const freq = habit.frequency;

  if (freq === 'daily') {
    const createdDate = parseDate(habit.createdAt) || trustedNow();
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) return [];

    const cursor = getDailyPenaltyWindowStart(start, yesterday);
    while (cursor <= yesterday) {
      const key = todayKey(cursor);
      if (key !== todayKey(now)) {
        pastPeriods.push(key);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const currentWeekKey = periodKey('weekly', now);
    const lastWeekKey = previousPeriodKey('weekly', 1, now);
    const parsedCreated = parseDate(habit.createdAt);
    const createdWeekKey = habit.createdAtPeriod || periodKey('weekly', parsedCreated || now);

    if (createdWeekKey === currentWeekKey) return [];

    // Most recent MAX_RETROACTIVE_PENALTY_WEEKS weeks ending last week, never before creation.
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * MAX_RETROACTIVE_PENALTY_WEEKS);
    const cursor = parsedCreated && parsedCreated > windowStart ? new Date(parsedCreated) : windowStart;
    for (let i = 0; i < MAX_RETROACTIVE_PENALTY_WEEKS; i++) {
      const key = periodKey('weekly', cursor);
      if (key !== currentWeekKey) {
        if (!pastPeriods.includes(key)) {
          pastPeriods.push(key);
        }
      }
      if (key === lastWeekKey) break;
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  return pastPeriods;
}

export function processHabitPenalties(state: AppState, now: Date = trustedNow()): AppState {
  let updatedState = state;
  let habitsChanged = false;

  const updatedHabits = state.habits.map((habit) => {
    if (!habit.isPreset || habit.points <= 0) return habit;

    const missedPeriods = habit.missedPeriods ? [...habit.missedPeriods] : [];
    let habitModified = false;

    const pastPeriods = getPastDuePeriods(habit, now);

    for (const p of pastPeriods) {
      const isCompleted = isHabitPeriodCompleted(habit, p);
      const isAlreadyMissed =
        missedPeriods.includes(p) ||
        (updatedState.pointsHistory || []).some(
          (entry) =>
            entry.source === 'habit_missed' &&
            entry.metadata?.habitId === habit.id &&
            entry.metadata?.period === p
        );

      if (isCompleted) {
        // Completed period breaks the streak; nothing to penalize
      } else if (!isAlreadyMissed) {
        const consecutiveMisses = getHabitConsecutiveMissesUpToPeriod(habit, p, now);
        const seasonPts = getAppStateSeasonPoints(updatedState, now);
        const multiplier = getMissPenaltyMultiplier(consecutiveMisses, seasonPts);
        const penaltyAmount = Math.round(habit.points * multiplier);

        missedPeriods.push(p);
        habitModified = true;

        // The server penalty job sends the missed-habit notifications (user + partner).
        // Apply 30-day TTL + 50-item cap pruning
        const thirtyDaysAgoIso = new Date(trustedNowMs() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const prunedNotifs = (updatedState.notifications || [])
          .filter((n) => !n.createdAt || n.createdAt >= thirtyDaysAgoIso)
          .slice(0, 50);

        const penaltyUpdate = applyPenaltyDeductionInternal(
          updatedState,
          penaltyAmount,
          `Missed habit (${multiplier}x penalty): ${habit.name}`,
          'habit_missed',
          {
            habitId: habit.id,
            habitName: habit.name,
            period: p,
            multiplier,
          },
          undefined,
          habitMissedEntryId(habit.id, p)
        );

        updatedState = {
          ...updatedState,
          notifications: prunedNotifs,
          ...penaltyUpdate,
        };
      }
    }

    if (habitModified) {
      habitsChanged = true;
      return {
        ...habit,
        missedPeriods,
      };
    }

    return habit;
  });

  if (!habitsChanged) return state;

  return {
    ...updatedState,
    habits: updatedHabits,
  };
}

export function processBadHabitNoReports(state: AppState, now: Date = trustedNow()): AppState {
  let updatedState = state;
  const badHabits = updatedState.badHabits || [];
  if (badHabits.length === 0) return updatedState;

  const eligibleIds = getPointEligibleHabitIds(badHabits);

  const activeHabits = badHabits
    .filter((h) => !h.isCompleted)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let newLogs = [...(updatedState.badHabitLogs || [])];
  let logsAdded = false;
  // A no-report day the user deleted stays deleted (the server keeps that row deleted too).
  const deletedIds = new Set(updatedState.deletedEntityIds || []);

  for (const habit of activeHabits) {
    const createdDate = parseDate(habit.createdAt) || now;
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) continue;

    const cursor = getDailyPenaltyWindowStart(start, yesterday);
    while (cursor <= yesterday) {
      const key = todayKey(cursor);

      const existingLog = newLogs.find((l) => l.badHabitId === habit.id && l.date === key);
      if (!existingLog && !deletedIds.has(noReportLogId(habit.id, key))) {
        const pastLogs = newLogs
          .filter((l) => l.badHabitId === habit.id && l.date < key)
          .sort((a, b) => b.date.localeCompare(a.date));

        let consecutiveOccurrences = 1;
        for (const l of pastLogs) {
          if (l.status === 'occurred' || l.status === 'no_report') {
            consecutiveOccurrences++;
          } else {
            break;
          }
        }

        const isEligible = eligibleIds.has(habit.id);
        const seasonPts = isEligible ? getAppStateSeasonPoints(updatedState, now) : 0;
        const multiplier = isEligible ? getMissPenaltyMultiplier(consecutiveOccurrences, seasonPts) : 1;
        const penaltyAmount = isEligible ? Math.round(BAD_HABIT_POINTS.noReportBase * multiplier) : 0;

        const newLog: BadHabitLog = {
          id: noReportLogId(habit.id, key),
          badHabitId: habit.id,
          date: key,
          status: 'no_report',
          consecutiveOccurrences,
          pointsAwardedOrDeducted: -penaltyAmount,
          createdAt: trustedNow().toISOString(),
        };

        newLogs.unshift(newLog);
        logsAdded = true;

        if (penaltyAmount > 0) {
          // The server penalty job sends the no-report notification.
          const penaltyUpdate = applyPenaltyDeductionInternal(
            updatedState,
            penaltyAmount,
            `No-report bad habit penalty (${multiplier}x penalty): ${habit.name}`,
            'bad_habit_no_report',
            {
              badHabitId: habit.id,
              badHabitName: habit.name,
              date: key,
              multiplier,
            },
            undefined,
            noReportEntryId(habit.id, key)
          );

          updatedState = {
            ...updatedState,
            ...penaltyUpdate,
          };
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (!logsAdded) return state;

  return {
    ...updatedState,
    badHabitLogs: newLogs,
  };
}

export function processExerciseTargetPenalties(state: AppState, now: Date = trustedNow()): AppState {
  if (!state.exerciseGoal || !state.exerciseGoal.targetWeeklySessions || state.exerciseGoal.targetWeeklySessions <= 0) {
    return state;
  }

  const lastWeekKey = previousPeriodKey('weekly', 1, now);
  if (state.exerciseGoal.lastEvaluatedWeek === lastWeekKey) {
    return state;
  }

  const loggedInLastWeek = (state.workouts || []).filter((w) => {
    const d = parseDate(w.date);
    return d && weekKey(d) === lastWeekKey;
  }).length;

  const target = state.exerciseGoal.targetWeeklySessions;
  let updatedState = state;
  // The server job may already have issued this week's penalty.
  const alreadyPenalized = (state.pointsHistory || []).some(
    (e) => e && (e.id === exerciseMissedEntryId(lastWeekKey) || (e.source === 'exercise_missed' && e.metadata?.weekKey === lastWeekKey))
  );

  if (loggedInLastWeek < target && !alreadyPenalized) {
    const consecutiveMisses = getExerciseGoalConsecutiveMisses(state.exerciseGoal, state.workouts, now);
    const seasonPts = getAppStateSeasonPoints(state, now);
    const multiplier = getMissPenaltyMultiplier(consecutiveMisses, seasonPts);
    // Base award derived from user's average logged workout duration (or 30 mins default from ExerciseTracker log form state)
    const avgDuration = state.workouts.length > 0
      ? Math.round(state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0) / state.workouts.length)
      : 30;
    const baseAward = avgDuration;
    const penaltyAmount = Math.round(baseAward * multiplier);

    // The server penalty job sends the missed-target notification.
    const penaltyUpdate = applyPenaltyDeductionInternal(
      updatedState,
      penaltyAmount,
      `Missed weekly workout goal (${loggedInLastWeek}/${target} sessions, ${multiplier}x penalty)`,
      'exercise_missed',
      {
        weekKey: lastWeekKey,
        logged: loggedInLastWeek,
        target,
        multiplier,
      },
      undefined,
      exerciseMissedEntryId(lastWeekKey)
    );

    updatedState = {
      ...updatedState,
      ...penaltyUpdate,
    };
  }

  return {
    ...updatedState,
    exerciseGoal: {
      ...state.exerciseGoal,
      lastEvaluatedWeek: lastWeekKey,
    },
  };
}
