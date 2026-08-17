import { AppState, Habit, BadHabitLog } from '@/types';
import { todayKey, periodKey, previousPeriodKey, weekKey, parseDate, uid } from './dates';
import { createNotificationSupabase } from './supabase';

export const MAX_RETROACTIVE_PENALTY_DAYS = 90;

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
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));
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
    const prev = new Date(sortedDates[i]);
    const curr = new Date(sortedDates[i + 1]);
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function getMissPenaltyMultiplier(consecutiveMisses: number, totalPoints: number = 0): number {
  const isDiamondOrAbove = totalPoints >= 1000;

  if (!isDiamondOrAbove) {
    if (consecutiveMisses <= 1) return 1.0;
    return 1.5;
  } else {
    if (consecutiveMisses <= 1) return 1.0;
    if (consecutiveMisses === 2) return 2.0;
    return 2.5;
  }
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
    const createdDate = habit.createdAt ? new Date(habit.createdAt) : new Date();
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
    const createdWeekKey = habit.createdAtPeriod || periodKey('weekly', habit.createdAt ? new Date(habit.createdAt) : now);

    if (createdWeekKey === currentWeekKey) return [];

    let cursor = habit.createdAt ? new Date(habit.createdAt) : new Date();
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
    let consecutiveMisses = habit.consecutiveMisses ?? 0;
    let habitModified = false;

    const pastPeriods = getPastDuePeriods(habit, now);

    for (const p of pastPeriods) {
      const isCompleted = habit.completions.includes(p);
      const isAlreadyMissed = missedPeriods.includes(p);

      if (isCompleted) {
        consecutiveMisses = 0;
      } else if (!isAlreadyMissed) {
        consecutiveMisses += 1;
        const multiplier = getMissPenaltyMultiplier(consecutiveMisses, updatedState.totalPoints);
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

        const prevTotalPts = updatedState.totalPoints;
        const newTotalPts = Math.max(0, prevTotalPts - penaltyAmount);
        const actualDeduction = prevTotalPts - newTotalPts;

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
              message: `You missed your habit "${habit.name}" for period ${p}. ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
              payload: { habitId: habit.id, habitName: habit.name, period: p, dedupKey },
            });
          }
        }

        // Apply 30-day TTL + 50-item cap pruning
        const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const prunedNotifs = (updatedState.notifications || [])
          .filter((n) => !n.createdAt || n.createdAt >= thirtyDaysAgoIso)
          .slice(0, 50);

        updatedState = {
          ...updatedState,
          notifications: prunedNotifs,
          totalPoints: newTotalPts,
          pointsHistory: [
            {
              id: uid(),
              amount: -actualDeduction,
              reason: `Missed habit (${multiplier}x penalty): ${habit.name}`,
              source: 'habit_missed',
              timestamp: new Date().toISOString(),
            },
            ...updatedState.pointsHistory,
          ].slice(0, 500),
        };
      }
    }

    if (habitModified || consecutiveMisses !== (habit.consecutiveMisses ?? 0)) {
      habitsChanged = true;
      return {
        ...habit,
        missedPeriods,
        consecutiveMisses,
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

    const createdDate = habit.createdAt ? new Date(habit.createdAt) : now;
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

        const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, updatedState.totalPoints);
        const penaltyAmount = isPointEligible ? Math.round(5 * multiplier) : 0;

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
          const prevTotalPts = updatedState.totalPoints;
          const newTotalPts = Math.max(0, prevTotalPts - penaltyAmount);
          const actualDeduction = prevTotalPts - newTotalPts;

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
                message: `No status reported for "${habit.name}" on ${key}. ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
                payload: { badHabitId: habit.id, badHabitName: habit.name, date: key, dedupKey },
              });
            }
          }

          updatedState = {
            ...updatedState,
            totalPoints: newTotalPts,
            pointsHistory: [
              {
                id: uid(),
                amount: -actualDeduction,
                reason: `No-report bad habit penalty (${multiplier}x penalty): ${habit.name}`,
                source: 'bad_habit_no_report',
                timestamp: new Date().toISOString(),
              },
              ...updatedState.pointsHistory,
            ].slice(0, 500),
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
  let consecutiveMisses = state.exerciseGoal.consecutiveMisses || 0;
  let updatedState = state;

  if (loggedInLastWeek < target) {
    consecutiveMisses += 1;
    const multiplier = getMissPenaltyMultiplier(consecutiveMisses, state.totalPoints);
    // Base award derived from user's average logged workout duration (or 30 mins default from ExerciseTracker log form state)
    const avgDuration = state.workouts.length > 0
      ? Math.round(state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0) / state.workouts.length)
      : 30;
    const baseAward = avgDuration;
    const penaltyAmount = Math.round(baseAward * multiplier);

    const prevPts = updatedState.totalPoints;
    const newPts = Math.max(0, prevPts - penaltyAmount);
    const actualDeduction = prevPts - newPts;

    if (updatedState.currentUser?.id) {
      const dedupKey = `missed_exercise_${lastWeekKey}`;
      const recipientId = updatedState.currentUser.id;
      setTimeout(() => {
        void createNotificationSupabase({
          recipientId,
          type: 'missed_exercise_target',
          title: 'Exercise Goal Missed',
          message: `You logged ${loggedInLastWeek}/${target} workout sessions for week ${lastWeekKey}. ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
          payload: { weekKey: lastWeekKey, logged: loggedInLastWeek, target, dedupKey },
        });
      }, 0);
    }

    updatedState = {
      ...updatedState,
      totalPoints: newPts,
      pointsHistory: [
        {
          id: uid(),
          amount: -actualDeduction,
          reason: `Missed weekly workout goal (${loggedInLastWeek}/${target} sessions, ${multiplier}x penalty)`,
          source: 'exercise_missed',
          timestamp: new Date().toISOString(),
        },
        ...updatedState.pointsHistory,
      ].slice(0, 500),
    };
  } else {
    consecutiveMisses = 0;
  }

  return {
    ...updatedState,
    exerciseGoal: {
      ...state.exerciseGoal,
      consecutiveMisses,
      lastEvaluatedWeek: lastWeekKey,
    },
  };
}

export function processReadingTargetPenalties(state: AppState, now: Date = new Date()): AppState {
  if (!state.readingGoal) return state;

  let updatedState = state;
  const goal = state.readingGoal;

  if (goal.cadence === 'daily') {
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = todayKey(yesterdayDate);

    if (goal.lastEvaluatedPeriod === yesterdayStr) return state;

    const hasReadingLog = (state.readingLogs || []).some((l) => l.date === yesterdayStr);
    let consecutiveMisses = goal.consecutiveMisses || 0;

    if (!hasReadingLog) {
      consecutiveMisses += 1;
      const multiplier = getMissPenaltyMultiplier(consecutiveMisses, state.totalPoints);
      const baseAward = 5;
      const penaltyAmount = Math.round(baseAward * multiplier);

      const prevPts = updatedState.totalPoints;
      const newPts = Math.max(0, prevPts - penaltyAmount);
      const actualDeduction = prevPts - newPts;

      if (updatedState.currentUser?.id) {
        const dedupKey = `missed_reading_daily_${yesterdayStr}`;
        const recipientId = updatedState.currentUser.id;
        setTimeout(() => {
          void createNotificationSupabase({
            recipientId,
            type: 'missed_reading_target',
            title: 'Daily Reading Target Missed',
            message: `No reading logged on ${yesterdayStr}. ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
            payload: { date: yesterdayStr, dedupKey },
          });
        }, 0);
      }

      updatedState = {
        ...updatedState,
        totalPoints: newPts,
        pointsHistory: [
          {
            id: uid(),
            amount: -actualDeduction,
            reason: `Missed daily reading target on ${yesterdayStr} (${multiplier}x penalty)`,
            source: 'reading_missed',
            timestamp: new Date().toISOString(),
          },
          ...updatedState.pointsHistory,
        ].slice(0, 500),
      };
    } else {
      consecutiveMisses = 0;
    }

    return {
      ...updatedState,
      readingGoal: {
        ...goal,
        consecutiveMisses,
        lastEvaluatedPeriod: yesterdayStr,
      },
    };
  }

  if (goal.targetPages && goal.targetPages > 0) {
    const lastWeekKey = previousPeriodKey('weekly', 1, now);
    if (goal.lastEvaluatedPeriod === lastWeekKey) return state;

    const totalPagesLastWeek = (state.readingLogs || [])
      .filter((l) => {
        const d = parseDate(l.date);
        return d && weekKey(d) === lastWeekKey;
      })
      .reduce((sum, l) => sum + (l.progressAmount || 0), 0);

    let consecutiveMisses = goal.consecutiveMisses || 0;

    if (totalPagesLastWeek < goal.targetPages) {
      consecutiveMisses += 1;
      const multiplier = getMissPenaltyMultiplier(consecutiveMisses, state.totalPoints);
      // Base award derived from 7 days of daily reading log awards (5 pts/day in store.ts line 1071 = 35 pts/week)
      const baseAward = 35;
      const penaltyAmount = Math.round(baseAward * multiplier);

      const prevPts = updatedState.totalPoints;
      const newPts = Math.max(0, prevPts - penaltyAmount);
      const actualDeduction = prevPts - newPts;

      if (updatedState.currentUser?.id) {
        const dedupKey = `missed_reading_weekly_${lastWeekKey}`;
        const recipientId = updatedState.currentUser.id;
        setTimeout(() => {
          void createNotificationSupabase({
            recipientId,
            type: 'missed_reading_target',
            title: 'Weekly Reading Goal Missed',
            message: `Read ${totalPagesLastWeek}/${goal.targetPages} pages in week ${lastWeekKey}. ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
            payload: { weekKey: lastWeekKey, logged: totalPagesLastWeek, target: goal.targetPages, dedupKey },
          });
        }, 0);
      }

      updatedState = {
        ...updatedState,
        totalPoints: newPts,
        pointsHistory: [
          {
            id: uid(),
            amount: -actualDeduction,
            reason: `Missed weekly reading goal (${totalPagesLastWeek}/${goal.targetPages} pages, ${multiplier}x penalty)`,
            source: 'reading_missed',
            timestamp: new Date().toISOString(),
          },
          ...updatedState.pointsHistory,
        ].slice(0, 500),
      };
    } else {
      consecutiveMisses = 0;
    }

    return {
      ...updatedState,
      readingGoal: {
        ...goal,
        consecutiveMisses,
        lastEvaluatedPeriod: lastWeekKey,
      },
    };
  }

  return state;
}

export function processBookDeadlinePenalties(state: AppState, now: Date = new Date()): AppState {
  const books = state.books || [];
  const todayStr = todayKey(now);
  let updatedState = state;
  let booksChanged = false;

  const updatedBooks = books.map((book) => {
    if (book.isFinished || !book.targetFinishDate) return book;

    if (book.targetFinishDate < todayStr && book.lastPenalizedDate !== todayStr) {
      const consecutiveMisses = (book.consecutiveMisses || 0) + 1;
      const multiplier = getMissPenaltyMultiplier(consecutiveMisses, updatedState.totalPoints);
      const baseAward = 30;
      const penaltyAmount = Math.round(baseAward * multiplier);

      const prevPts = updatedState.totalPoints;
      const newPts = Math.max(0, prevPts - penaltyAmount);
      const actualDeduction = prevPts - newPts;

      if (updatedState.currentUser?.id) {
        const dedupKey = `missed_book_${book.id}_${todayStr}`;
        createNotificationSupabase({
          recipientId: updatedState.currentUser.id,
          type: 'missed_book_deadline',
          title: 'Book Deadline Passed',
          message: `Target finish date (${book.targetFinishDate}) passed for "${book.title}". ${actualDeduction > 0 ? `${actualDeduction} points deducted.` : ''}`,
          payload: { bookId: book.id, bookTitle: book.title, targetFinishDate: book.targetFinishDate, dedupKey },
        });
      }

      updatedState = {
        ...updatedState,
        totalPoints: newPts,
        pointsHistory: [
          {
            id: uid(),
            amount: -actualDeduction,
            reason: `Missed book completion deadline for "${book.title}" (${multiplier}x penalty)`,
            source: 'book_deadline_missed',
            timestamp: new Date().toISOString(),
          },
          ...updatedState.pointsHistory,
        ].slice(0, 500),
      };

      booksChanged = true;
      return {
        ...book,
        consecutiveMisses,
        lastPenalizedDate: todayStr,
      };
    }

    return book;
  });

  if (!booksChanged) return updatedState;

  return {
    ...updatedState,
    books: updatedBooks,
  };
}
