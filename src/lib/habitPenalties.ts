import { AppState, Habit, BadHabitLog, ExerciseGoal, WorkoutLog } from '@/types';
import { todayKey, periodKey, previousPeriodKey, weekKey, parseDate, uid, addDays, addWeeks, getNow } from './dates';
import { createNotificationSupabase } from './supabase';
import { getEffectiveSeasonPoints } from './leagues';
import { applyPenaltyDeductionInternal } from './pointsLedger';
import { BAD_HABIT_POINTS } from './pointsConfig';

export { applyPenaltyDeductionInternal };

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
  const isDiamondOrAbove = seasonPoints >= 1000;

  if (!isDiamondOrAbove) {
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

export function getHighestUserStreak(state: AppState, now: Date = new Date()): StreakInfoPair {
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

export function getPastDuePeriods(habit: Habit, now: Date = new Date()): string[] {
  const pastPeriods: string[] = [];
  const freq = habit.frequency;

  if (freq === 'daily') {
    const createdDate = parseDate(habit.createdAt) || new Date();
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) return [];

    const cursor = new Date(start);
    let loops = 0;
    while (cursor <= yesterday && loops < MAX_RETROACTIVE_PENALTY_DAYS) {
      const key = todayKey(cursor);
      if (key !== todayKey(now)) {
        pastPeriods.push(key);
      }
      cursor.setDate(cursor.getDate() + 1);
      loops++;
    }
  } else {
    const currentWeekKey = periodKey('weekly', now);
    const lastWeekKey = previousPeriodKey('weekly', 1, now);
    const parsedCreated = parseDate(habit.createdAt);
    const createdWeekKey = habit.createdAtPeriod || periodKey('weekly', parsedCreated || now);

    if (createdWeekKey === currentWeekKey) return [];

    let cursor = parsedCreated ? new Date(parsedCreated) : new Date();
    for (let i = 0; i < 52; i++) {
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

export function processHabitPenalties(state: AppState, now: Date = new Date()): AppState {
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

        if (updatedState.partnership) {
          const partnerUserId =
            updatedState.partnership.user1Id === updatedState.currentUser?.id
              ? updatedState.partnership.user2Id
              : updatedState.partnership.user1Id;

          if (partnerUserId) {
            const partnerDedupKey = `partner_missed_habit_${habit.id}_${p}`;
            createNotificationSupabase({
              recipientId: partnerUserId,
              actorId: updatedState.currentUser?.id,
              actorUsername: updatedState.username,
              actorAvatar: updatedState.currentUser?.avatar || '🧑',
              type: 'partner_missed_habit',
              title: 'Streak Risk Warning',
              message: `Your partner ${updatedState.username} missed their habit "${habit.name}". Reach out to encourage them!`,
              payload: { habitId: habit.id, habitName: habit.name, period: p, dedupKey: partnerDedupKey },
            });
          }
        }

        if (updatedState.currentUser?.id) {
          const userId = updatedState.currentUser.id;
          const dedupKey = `missed_habit_${habit.id}_${p}`;
          const alreadyNotified = (updatedState.notifications || []).some(
            (n) => n.payload?.dedupKey === dedupKey || (n.payload?.habitId === habit.id && n.payload?.period === p)
          );
          if (!alreadyNotified) {
            createNotificationSupabase({
              recipientId: userId,
              type: 'missed_habit',
              title: 'Habit Missed Penalty',
              message: `You missed your habit "${habit.name}" for period ${p}. ${penaltyAmount > 0 ? `${penaltyAmount} points deducted.` : ''}`,
              payload: { habitId: habit.id, habitName: habit.name, period: p, dedupKey },
            });
          }
        }

        // Apply 30-day TTL + 50-item cap pruning
        const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
          }
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

export function processBadHabitNoReports(state: AppState, now: Date = new Date()): AppState {
  let updatedState = state;
  const badHabits = updatedState.badHabits || [];
  if (badHabits.length === 0) return updatedState;

  const activeHabits = badHabits
    .filter((h) => !h.isCompleted)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let newLogs = [...(updatedState.badHabitLogs || [])];
  let logsAdded = false;

  for (let idx = 0; idx < activeHabits.length; idx++) {
    const habit = activeHabits[idx];
    const isPointEligible = idx < 2;

    const createdDate = parseDate(habit.createdAt) || now;
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) continue;

    const cursor = new Date(start);
    let loops = 0;
    while (cursor <= yesterday && loops < MAX_RETROACTIVE_PENALTY_DAYS) {
      const key = todayKey(cursor);

      const existingLog = newLogs.find((l) => l.badHabitId === habit.id && l.date === key);
      if (!existingLog) {
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

        const seasonPts = getAppStateSeasonPoints(updatedState, now);
        const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, seasonPts);
        const penaltyAmount = isPointEligible ? Math.round(BAD_HABIT_POINTS.noReportBase * multiplier) : 0;

        const newLog: BadHabitLog = {
          id: uid(),
          badHabitId: habit.id,
          date: key,
          status: 'no_report',
          consecutiveOccurrences,
          pointsAwardedOrDeducted: -penaltyAmount,
          createdAt: new Date().toISOString(),
        };

        newLogs.unshift(newLog);
        logsAdded = true;

        if (penaltyAmount > 0) {
          if (updatedState.currentUser?.id) {
            const userId = updatedState.currentUser.id;
            const alreadyNotified = (updatedState.notifications || []).some(
              (n) => n.payload?.badHabitId === habit.id && n.payload?.date === key
            );
            if (!alreadyNotified) {
              const dedupKey = `bad_habit_${habit.id}_${key}`;
              createNotificationSupabase({
                recipientId: userId,
                type: 'bad_habit_no_report',
                title: 'Bad Habit No-Report Penalty',
                message: `No status reported for "${habit.name}" on ${key}. ${penaltyAmount > 0 ? `${penaltyAmount} points deducted.` : ''}`,
                payload: { badHabitId: habit.id, badHabitName: habit.name, date: key, dedupKey },
              });
            }
          }

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
            }
          );

          updatedState = {
            ...updatedState,
            ...penaltyUpdate,
          };
        }
      }

      cursor.setDate(cursor.getDate() + 1);
      loops++;
    }
  }

  if (!logsAdded) return state;

  return {
    ...updatedState,
    badHabitLogs: newLogs,
  };
}

export function processExerciseTargetPenalties(state: AppState, now: Date = new Date()): AppState {
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

  if (loggedInLastWeek < target) {
    const consecutiveMisses = getExerciseGoalConsecutiveMisses(state.exerciseGoal, state.workouts, now);
    const seasonPts = getAppStateSeasonPoints(state, now);
    const multiplier = getMissPenaltyMultiplier(consecutiveMisses, seasonPts);
    // Base award derived from user's average logged workout duration (or 30 mins default from ExerciseTracker log form state)
    const avgDuration = state.workouts.length > 0
      ? Math.round(state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0) / state.workouts.length)
      : 30;
    const baseAward = avgDuration;
    const penaltyAmount = Math.round(baseAward * multiplier);

    if (updatedState.currentUser?.id) {
      const dedupKey = `missed_exercise_${lastWeekKey}`;
      const recipientId = updatedState.currentUser.id;
      setTimeout(() => {
        void createNotificationSupabase({
          recipientId,
          type: 'missed_exercise_target',
          title: 'Exercise Goal Missed',
          message: `You logged ${loggedInLastWeek}/${target} workout sessions for week ${lastWeekKey}. ${penaltyAmount > 0 ? `${penaltyAmount} points deducted.` : ''}`,
          payload: { weekKey: lastWeekKey, logged: loggedInLastWeek, target, dedupKey },
        });
      }, 0);
    }

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
      }
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
