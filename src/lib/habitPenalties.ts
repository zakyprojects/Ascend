import { AppState, Habit, BadHabitLog, PartnerNotification } from '@/types';
import { todayKey, periodKey, previousPeriodKey, uid } from './dates';
import { createNotificationSupabase } from './supabase';

export interface StreakSourceInfo {
  days: number;
  source: string;
  priority?: number;
  bestDays?: number;
}

/**
 * Returns the penalty multiplier based on the number of consecutive misses and user's current total points / tier.
 * - Below Diamond tier (< 1000 pts: Bronze, Silver, Gold, Platinum): capped at 1.5x max (1st miss = 1x, 2nd+ miss = 1.5x)
 * - Diamond tier or above (>= 1000 pts: Diamond, Crown, Ace, Conqueror, Legend): capped at 2.5x max (1st miss = 1x, 2nd miss = 2x, 3rd+ miss = 2.5x)
 */
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

/**
 * Computes the single highest streak across all active categories/habits with defined priority tie-breaking:
 * Priority Order: Habit Journey (100) > Exercise (80) > Reading (60) > Bad Habit Resisted (40) > Skill Practice (20).
 */
export function getHighestUserStreak(state: AppState, now: Date = new Date()): StreakSourceInfo {
  if (!state) return { days: 0, source: '' };

  const streaks: StreakSourceInfo[] = [];

  // 1. Regular Habit Journey Habits (Priority 100)
  // Track net completions and active vs deleted status per habit lineage
  interface LineageData {
    name: string;
    category?: string;
    dateNet: Map<string, number>;
  }

  const lineageMap = new Map<string, LineageData>();

  // Process pointsHistory to calculate net completions per date for each habit lineage
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

  // Also fold in active habits from state.habits
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

  // Evaluate streaks for each habit lineage
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

    const sourceLabel = isActive
      ? (activeHabit?.name || lineage.name)
      : `${lineage.name} (deleted)`;

    let currentStreak = 0;
    let bestStreak = 0;
    let runningStreak = 0;

    const todayStr = todayKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = todayKey(yesterdayDate);

    for (let i = 0; i < validDates.length; i++) {
      const currentDate = validDates[i];
      if (i === 0) {
        runningStreak = 1;
      } else {
        const prevDateObj = new Date(validDates[i - 1]);
        const currDateObj = new Date(currentDate);
        const diffDays = Math.round((currDateObj.getTime() - prevDateObj.getTime()) / (1000 * 3600 * 24));

        if (diffDays === 1) {
          runningStreak++;
        } else {
          // Re-add continuation / frozen jump
          runningStreak = runningStreak + 1;
        }
      }
      bestStreak = Math.max(bestStreak, runningStreak);
    }

    if (!isActive) {
      currentStreak = runningStreak;
    } else {
      const lastCompletedDate = validDates[validDates.length - 1];
      if (lastCompletedDate === todayStr || lastCompletedDate === yesterdayStr) {
        currentStreak = runningStreak;
      } else {
        currentStreak = 0;
      }
    }

    if (currentStreak > 0 || bestStreak > 0) {
      streaks.push({
        days: currentStreak,
        source: sourceLabel,
        priority: 100,
        bestDays: bestStreak,
      });
    }
  });

  // 2. Exercise Streak (Workouts) (Priority 80)
  if (state.workouts && state.workouts.length > 0) {
    const workoutDates = Array.from(new Set(state.workouts.map((w) => w.date))).sort();
    let streak = 0;
    let cursor = new Date(now);

    if (!workoutDates.includes(todayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const k = todayKey(cursor);
      if (workoutDates.includes(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    if (streak > 0) {
      streaks.push({ days: streak, source: 'Exercise', priority: 80 });
    }
  }

  // 3. Reading Streak (Priority 60)
  if (state.readingLogs && state.readingLogs.length > 0) {
    const readingDates = Array.from(new Set(state.readingLogs.map((r) => r.date))).sort();
    let streak = 0;
    let cursor = new Date(now);

    if (!readingDates.includes(todayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const k = todayKey(cursor);
      if (readingDates.includes(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    if (streak > 0) {
      streaks.push({ days: streak, source: 'Reading', priority: 60 });
    }
  }

  // 4. Bad Habit Resisted Streaks (Priority 40)
  (state.badHabits || []).filter((bh) => bh && !bh.isCompleted).forEach((bh) => {
    let streak = 0;
    let cursor = new Date(now);
    const logs = (state.badHabitLogs || []).filter((l) => l && l.badHabitId === bh.id);

    const todayStr = todayKey(cursor);
    const todayLog = logs.find((l) => l.date === todayStr);
    if (!todayLog) {
      cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const k = todayKey(cursor);
      const log = logs.find((l) => l.date === k);
      if (log && log.status === 'resisted') {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    if (streak > 0) {
      streaks.push({ days: streak, source: `${bh.name} (Resisted)`, priority: 40 });
    }
  });

  // 5. Skill Practice Streak (Priority 20)
  if (state.skillLogs && state.skillLogs.length > 0) {
    const skillDates = Array.from(new Set(state.skillLogs.map((s) => s.date))).sort();
    let streak = 0;
    let cursor = new Date(now);

    if (!skillDates.includes(todayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const k = todayKey(cursor);
      if (skillDates.includes(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    if (streak > 0) {
      streaks.push({ days: streak, source: 'Skill Practice', priority: 20 });
    }
  }

  if (streaks.length === 0) {
    return { days: 0, source: '' };
  }

  // Tie-breaking: Maximum streak days first, then highest priority source
  streaks.sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days;
    return (b.priority || 0) - (a.priority || 0);
  });

  return streaks[0];
}

/**
 * Get all past due periods for a habit up to yesterday (daily) or last week (weekly).
 */
export function getPastDuePeriods(habit: Habit, now: Date = new Date()): string[] {
  const pastPeriods: string[] = [];
  const freq = habit.frequency;

  if (freq === 'daily') {
    const createdDate = habit.createdAt ? new Date(habit.createdAt) : new Date();
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) return [];

    const cursor = new Date(start);
    // Limit loop to max 90 days
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
    // Weekly habit
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

/**
 * Evaluate all habits for past due missed periods and apply escalating penalties based on user's tier.
 */
export function processHabitPenalties(state: AppState, now: Date = new Date()): AppState {
  let updatedState = state;
  let habitsChanged = false;

  const updatedHabits = state.habits.map((habit) => {
    // Penalties apply ONLY to preset habits that award points (> 0)
    if (!habit.isPreset || habit.points <= 0) return habit;

    const missedPeriods = habit.missedPeriods ? [...habit.missedPeriods] : [];
    let consecutiveMisses = habit.consecutiveMisses ?? 0;
    let habitModified = false;

    const pastPeriods = getPastDuePeriods(habit, now);

    for (const p of pastPeriods) {
      const isCompleted = habit.completions.includes(p);
      const isAlreadyMissed = missedPeriods.includes(p);

      if (isCompleted) {
        // Completion breaks the consecutive miss streak!
        consecutiveMisses = 0;
      } else if (!isAlreadyMissed) {
        // New missed period detected!
        consecutiveMisses += 1;
        const multiplier = getMissPenaltyMultiplier(consecutiveMisses, updatedState.totalPoints);
        const penaltyAmount = Math.round(habit.points * multiplier);

        missedPeriods.push(p);
        habitModified = true;

        // Create partner notification if user has an active partner
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

        // Deduct penalty points from user's total points and record in points history
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

/**
 * Evaluates all active bad habits for past unlogged days and applies retroactive no-report penalties (-5 pts base * multiplier).
 * Breaks resistance streak and escalates future penalties.
 */
export function processBadHabitNoReports(state: AppState, now: Date = new Date()): AppState {
  let updatedState = state;
  const badHabits = updatedState.badHabits || [];
  if (badHabits.length === 0) return updatedState;

  // Active bad habits in creation order
  const activeHabits = badHabits
    .filter((h) => !h.isCompleted)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let newLogs = [...(updatedState.badHabitLogs || [])];
  let logsAdded = false;

  for (let idx = 0; idx < activeHabits.length; idx++) {
    const habit = activeHabits[idx];
    const isPointEligible = idx < 2; // Only first 2 active habits in creation order are point-eligible

    const createdDate = habit.createdAt ? new Date(habit.createdAt) : now;
    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (start > yesterday) continue;

    const cursor = new Date(start);
    let loops = 0;
    while (cursor <= yesterday && loops < 90) {
      const key = todayKey(cursor);

      // Check if a log already exists for this habit on key date
      const existingLog = newLogs.find((l) => l.badHabitId === habit.id && l.date === key);
      if (!existingLog) {
        // Find consecutive occurrences/no_reports before key date
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


