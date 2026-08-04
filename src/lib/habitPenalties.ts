import { AppState, Habit, PartnerNotification } from '@/types';
import { todayKey, periodKey, previousPeriodKey, uid } from './dates';
import { createNotificationSupabase } from './supabase';

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

