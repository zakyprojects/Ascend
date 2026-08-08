import { AppState, Habit, BadHabitLog, PartnerNotification } from '@/types';
import { todayKey, periodKey, previousPeriodKey, uid } from './dates';
import { createNotificationSupabase } from './supabase';

export interface StreakInfo {
  days: number;
  category: string;
}

export interface CurrentStreakInfo extends StreakInfo {
  isActive: boolean;
  label: string;
}

export interface BestStreakInfo extends StreakInfo {
  label: 'Best Streak';
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

export function getHighestUserStreak(state: AppState, now: Date = new Date()): StreakInfoPair {
  const candidates: Array<{
    currentDays: number;
    bestDays: number;
    category: string;
    priority: number;
    isActive: boolean;
  }> = [];

  // 1. Regular Habit Journey Habits (Priority 100)
  interface LineageData {
    name: string;
    category?: string;
    dateNet: Map<string, number>;
  }

  const lineageMap = new Map<string, LineageData>();

  (state.pointsHistory || []).forEach((e) => {
    if (!e || !e.timestamp) return;

    const isCompleted =
      e.source === 'habit_completed' ||
      e.source === 'habit' ||
      (e.reason && (e.reason.startsWith('Habit completed:') || e.reason.startsWith('Completed habit:')));

    const isUnchecked =
      e.source === 'habit_unchecked' ||
      (e.reason && (e.reason.startsWith('Habit unchecked:') || e.reason.startsWith('Unchecked habit:')));

    if (!isCompleted && !isUnchecked) return;

    let habitName = e.metadata?.habitName;
    if (!habitName && e.reason) {
      habitName = e.reason
        .replace(/^(Habit completed:|Completed habit:|Habit unchecked:|Unchecked habit:)\s*/i, '')
        .trim();
    }
    if (!habitName || habitName === 'Habit') habitName = 'Habit Journey';

    const dateKey = todayKey(new Date(e.timestamp));

    if (!lineageMap.has(habitName)) {
      lineageMap.set(habitName, {
        name: habitName,
        category: e.metadata?.category,
        dateNet: new Map<string, number>(),
      });
    }

    const lineage = lineageMap.get(habitName)!;
    if (!lineage.category && e.metadata?.category) {
      lineage.category = e.metadata.category;
    }

    const currentNet = lineage.dateNet.get(dateKey) || 0;
    lineage.dateNet.set(dateKey, currentNet + (isCompleted ? 1 : -1));
  });

  (state.habits || []).forEach((h) => {
    if (!h) return;
    const name = h.name || 'Habit Journey';
    if (!lineageMap.has(name)) {
      lineageMap.set(name, {
        name,
        category: h.category,
        dateNet: new Map<string, number>(),
      });
    }
    const lineage = lineageMap.get(name)!;
    if (!lineage.category && h.category) lineage.category = h.category;

    (h.completions || []).forEach((cDate) => {
      if (!lineage.dateNet.has(cDate)) {
        lineage.dateNet.set(cDate, 1);
      }
    });
  });

  lineageMap.forEach((lineage) => {
    const validDates = Array.from(lineage.dateNet.entries())
      .filter(([_, net]) => net > 0)
      .map(([date]) => date)
      .sort();

    if (validDates.length === 0) return;

    const activeHabit = (state.habits || []).find(
      (h) => h.name.toLowerCase() === lineage.name.toLowerCase()
    );
    const isActive = !!activeHabit;

    const category = (activeHabit?.category || lineage.category || 'Habit Journey').trim();

    const current = getCurrentStreakFromSortedDates(validDates, now);
    const best = getBestStreakFromSortedDates(validDates);

    const finalCurrent = isActive ? current : best;

    if (finalCurrent > 0 || best > 0) {
      candidates.push({
        currentDays: finalCurrent,
        bestDays: best,
        category,
        priority: 100,
        isActive,
      });
    }
  });

  // 2. Exercise Streak (Workouts) (Priority 80)
  if (state.workouts && state.workouts.length > 0) {
    const workoutDates = Array.from(new Set(state.workouts.map((w) => w.date))).sort();
    const current = getCurrentStreakFromSortedDates(workoutDates, now);
    const best = getBestStreakFromSortedDates(workoutDates);
    if (current > 0 || best > 0) {
      candidates.push({
        currentDays: current,
        bestDays: best,
        category: 'Exercise',
        priority: 80,
        isActive: true,
      });
    }
  }

  // 3. Reading Streak (Priority 60)
  if (state.readingLogs && state.readingLogs.length > 0) {
    const readingDates = Array.from(new Set(state.readingLogs.map((r) => r.date))).sort();
    const current = getCurrentStreakFromSortedDates(readingDates, now);
    const best = getBestStreakFromSortedDates(readingDates);
    if (current > 0 || best > 0) {
      candidates.push({
        currentDays: current,
        bestDays: best,
        category: 'Reading',
        priority: 60,
        isActive: true,
      });
    }
  }

  // 4. Bad Habit Resisted Streaks (Priority 40)
  (state.badHabits || []).filter((bh) => bh && !bh.isCompleted).forEach((bh) => {
    const logs = (state.badHabitLogs || []).filter((l) => l && l.badHabitId === bh.id);
    const resistedDates = logs
      .filter((l) => l.status === 'resisted')
      .map((l) => l.date)
      .sort();
    if (resistedDates.length === 0) return;

    const current = getCurrentStreakFromSortedDates(resistedDates, now);
    const best = getBestStreakFromSortedDates(resistedDates);

    if (current > 0 || best > 0) {
      candidates.push({
        currentDays: current,
        bestDays: best,
        category: 'Resisted',
        priority: 40,
        isActive: true,
      });
    }
  });

  // 5. Skill Practice Streak (Priority 20)
  if (state.skillLogs && state.skillLogs.length > 0) {
    const skillDates = Array.from(new Set(state.skillLogs.map((s) => s.date))).sort();
    const current = getCurrentStreakFromSortedDates(skillDates, now);
    const best = getBestStreakFromSortedDates(skillDates);
    if (current > 0 || best > 0) {
      candidates.push({
        currentDays: current,
        bestDays: best,
        category: 'Skill Practice',
        priority: 20,
        isActive: true,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      currentStreak: {
        days: 0,
        category: '',
        isActive: true,
        label: 'Current Streak',
      },
      bestStreak: {
        days: 0,
        category: '',
        label: 'Best Streak',
      },
    };
  }

  const sortedForCurrent = [...candidates].sort((a, b) => {
    if (b.currentDays !== a.currentDays) return b.currentDays - a.currentDays;
    return b.priority - a.priority;
  });

  const topCurrent = sortedForCurrent[0];

  const sortedForBest = [...candidates].sort((a, b) => {
    if (b.bestDays !== a.bestDays) return b.bestDays - a.bestDays;
    return b.priority - a.priority;
  });

  const topBest = sortedForBest[0];

  return {
    currentStreak: {
      days: topCurrent.currentDays,
      category: topCurrent.category,
      isActive: topCurrent.isActive,
      label: topCurrent.isActive ? 'Current Streak' : 'Current Streak · Frozen (deleted)',
    },
    bestStreak: {
      days: topBest.bestDays,
      category: topBest.category,
      label: 'Best Streak',
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
    while (cursor <= yesterday && loops < 90) {
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

        let newNotifications = updatedState.partnerNotifications || [];
        if (updatedState.partnership) {
          const partnerUsername =
            updatedState.partnership.user1Username === updatedState.username
              ? updatedState.partnership.user2Username
              : updatedState.partnership.user1Username;

          const partnerUserId =
            updatedState.partnership.user1Id === updatedState.currentUser?.id
              ? updatedState.partnership.user2Id
              : updatedState.partnership.user1Id;

          const notif: PartnerNotification = {
            id: uid(),
            userId: updatedState.currentUser?.id || 'user_current',
            partnerId: 'partner',
            partnerUsername,
            message: `Your partner ${updatedState.username} missed their habit "${habit.name}". Reach out to encourage them!`,
            habitName: habit.name,
            type: 'missed_habit',
            read: false,
            createdAt: new Date().toISOString(),
          };
          newNotifications = [notif, ...newNotifications];

          if (partnerUserId) {
            createNotificationSupabase({
              recipientId: partnerUserId,
              actorId: updatedState.currentUser?.id,
              actorUsername: updatedState.username,
              actorAvatar: updatedState.currentUser?.avatar || '🧑',
              type: 'missed_habit',
              title: 'Streak Risk Warning',
              message: `Your partner ${updatedState.username} missed their habit "${habit.name}". Reach out to encourage them!`,
              payload: { habitName: habit.name },
            });
          }
        }

        updatedState = {
          ...updatedState,
          partnerNotifications: newNotifications,
          totalPoints: Math.max(0, updatedState.totalPoints - penaltyAmount),
          pointsHistory: [
            {
              id: uid(),
              amount: -penaltyAmount,
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
    while (cursor <= yesterday && loops < 90) {
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
          updatedState = {
            ...updatedState,
            totalPoints: Math.max(0, updatedState.totalPoints - penaltyAmount),
            pointsHistory: [
              {
                id: uid(),
                amount: -penaltyAmount,
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
