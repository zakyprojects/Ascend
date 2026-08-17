import { SharedChallenge } from '@/types';
import { todayKey, previousPeriodKey, parseDate, calculateElapsedDays, getNow } from './dates';

const safeNum = (val: any): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Normalizes all historical completion dates for a shared challenge,
 * ensuring backward compatibility with legacy single-date fields (user1DoneDate / user2DoneDate).
 */
export function normalizeChallengeDates(c: SharedChallenge): {
  user1DoneDates: string[];
  user2DoneDates: string[];
  jointDates: string[];
  totalCompleted: number;
  latestU1?: string;
  latestU2?: string;
  latestJoint?: string;
} {
  const u1Raw = [
    ...(c.user1DoneDates || []),
    ...(c.user1DoneDate ? [c.user1DoneDate] : []),
  ];
  const u2Raw = [
    ...(c.user2DoneDates || []),
    ...(c.user2DoneDate ? [c.user2DoneDate] : []),
  ];

  const user1DoneDates = Array.from(new Set(u1Raw.filter(Boolean))).sort();
  const user2DoneDates = Array.from(new Set(u2Raw.filter(Boolean))).sort();
  const u2Set = new Set(user2DoneDates);
  const jointDates = user1DoneDates.filter((d) => u2Set.has(d)).sort();

  const hasDateArrays = (c.user1DoneDates && c.user1DoneDates.length > 0) || (c.user2DoneDates && c.user2DoneDates.length > 0);
  const totalCompleted = hasDateArrays
    ? jointDates.length
    : Math.max(jointDates.length, safeNum(c.totalJointDaysCompleted));
  const latestU1 = user1DoneDates.length > 0 ? user1DoneDates[user1DoneDates.length - 1] : undefined;
  const latestU2 = user2DoneDates.length > 0 ? user2DoneDates[user2DoneDates.length - 1] : undefined;
  const latestJoint = jointDates.length > 0 ? jointDates[jointDates.length - 1] : c.lastJointCompletionDate;

  return {
    user1DoneDates,
    user2DoneDates,
    jointDates,
    totalCompleted,
    latestU1,
    latestU2,
    latestJoint,
  };
}

/**
 * Calculates consecutive streak from joint completion dates.
 * - If today is jointly done: counts consecutive days backwards from today.
 * - If today is not yet jointly done: checks if yesterday was jointly done (streak is preserved awaiting today).
 * - If yesterday was missed: streak is broken (0).
 */
export function calculateJointStreak(jointDates: string[], targetNow: Date = getNow()): number {
  const jointSet = new Set(jointDates);
  const todayStr = todayKey(targetNow);
  const yesterdayStr = previousPeriodKey('daily', 1, targetNow);

  if (jointSet.has(todayStr)) {
    // Both completed today: count consecutive days backwards starting today
    let streak = 0;
    let curr = new Date(targetNow.getTime());
    while (jointSet.has(todayKey(curr))) {
      streak += 1;
      curr.setDate(curr.getDate() - 1);
    }
    return streak;
  }

  if (jointSet.has(yesterdayStr)) {
    // Yesterday completed, waiting for today: count consecutive days backwards starting yesterday
    let streak = 0;
    let curr = new Date(targetNow.getTime());
    curr.setDate(curr.getDate() - 1);
    while (jointSet.has(todayKey(curr))) {
      streak += 1;
      curr.setDate(curr.getDate() - 1);
    }
    return streak;
  }

  // Streak broken / no active consecutive completions
  return 0;
}

/**
 * Evaluates a shared challenge's lifecycle:
 * 1. Checks if totalJointDaysCompleted >= durationDays (Pact Won)
 * 2. Checks if elapsed calendar days > durationDays (Expired if not won)
 * 3. Evaluates consecutive streak continuity for active pacts
 */
export function reconcileSharedChallengeLifecycle(
  challenge: SharedChallenge,
  targetNow: Date = getNow()
): SharedChallenge {
  const norm = normalizeChallengeDates(challenge);
  const jointDates = norm.jointDates;
  const totalCompleted = norm.totalCompleted;
  const currentStreak = calculateJointStreak(jointDates, targetNow);

  const elapsedDays = calculateElapsedDays(challenge.createdAt, targetNow);

  let status: SharedChallenge['status'] = challenge.status;
  if (totalCompleted >= challenge.durationDays) {
    status = 'completed';
  } else if (elapsedDays > challenge.durationDays) {
    status = 'expired';
  } else {
    status = 'active';
  }

  return {
    ...challenge,
    user1DoneDates: norm.user1DoneDates,
    user2DoneDates: norm.user2DoneDates,
    user1DoneDate: norm.latestU1,
    user2DoneDate: norm.latestU2,
    jointStreak: currentStreak,
    totalJointDaysCompleted: totalCompleted,
    lastJointCompletionDate: norm.latestJoint,
    status,
  };
}

/**
 * Calculates updated SharedChallenge when a user checks or unchecks today's pledge.
 * Historical records for past days remain completely immutable.
 */
export function applyPledgeToggle(
  target: SharedChallenge,
  isUser1: boolean,
  isDoneToday: boolean,
  targetNow: Date = getNow()
): { updated: SharedChallenge; becameCompleted: boolean; wasBothCompletedNow: boolean } {
  const today = todayKey(targetNow);
  const norm = normalizeChallengeDates(target);

  const u1Set = new Set(norm.user1DoneDates);
  const u2Set = new Set(norm.user2DoneDates);

  if (isUser1) {
    if (isDoneToday) {
      u1Set.add(today);
    } else {
      u1Set.delete(today);
    }
  } else {
    if (isDoneToday) {
      u2Set.add(today);
    } else {
      u2Set.delete(today);
    }
  }

  const updatedU1Dates = Array.from(u1Set).sort();
  const updatedU2Dates = Array.from(u2Set).sort();
  const jointDates = updatedU1Dates.filter((d) => u2Set.has(d)).sort();

  const wereBothDoneBefore = norm.user1DoneDates.includes(today) && norm.user2DoneDates.includes(today);
  const areBothDoneNow = u1Set.has(today) && u2Set.has(today);

  const totalCompleted = jointDates.length;
  const newStreak = calculateJointStreak(jointDates, targetNow);
  const newLastJointDate = jointDates.length > 0 ? jointDates[jointDates.length - 1] : undefined;

  const isCompleted = totalCompleted >= target.durationDays;
  const elapsed = calculateElapsedDays(target.createdAt, targetNow);
  const status: SharedChallenge['status'] = isCompleted
    ? 'completed'
    : elapsed > target.durationDays
    ? 'expired'
    : 'active';

  const latestU1 = updatedU1Dates.length > 0 ? updatedU1Dates[updatedU1Dates.length - 1] : undefined;
  const latestU2 = updatedU2Dates.length > 0 ? updatedU2Dates[updatedU2Dates.length - 1] : undefined;

  const updated: SharedChallenge = {
    ...target,
    user1DoneDates: updatedU1Dates,
    user2DoneDates: updatedU2Dates,
    user1DoneDate: latestU1,
    user2DoneDate: latestU2,
    jointStreak: newStreak,
    totalJointDaysCompleted: totalCompleted,
    lastJointCompletionDate: newLastJointDate,
    status,
  };

  return {
    updated,
    becameCompleted: isCompleted && target.status !== 'completed',
    wasBothCompletedNow: areBothDoneNow && !wereBothDoneBefore,
  };
}

/**
 * Merges two SharedChallenge objects, safely merging incoming authoritative database updates
 * without resurrecting undone pledge dates.
 */
export function mergeSharedChallenge(baseC: SharedChallenge, incC: SharedChallenge): SharedChallenge {
  const normBase = normalizeChallengeDates(baseC);
  const normInc = normalizeChallengeDates(incC);

  // Authoritative date arrays from incoming record (which carries DB / broadcast state)
  const u1Dates = Array.isArray(incC.user1DoneDates)
    ? normInc.user1DoneDates
    : normBase.user1DoneDates;
  const u2Dates = Array.isArray(incC.user2DoneDates)
    ? normInc.user2DoneDates
    : normBase.user2DoneDates;

  const u2Set = new Set(u2Dates);
  const jointDates = u1Dates.filter((d) => u2Set.has(d)).sort();
  const totalCompleted = jointDates.length;

  const baseTime = baseC.createdAt || '';
  const incTime = incC.createdAt || '';
  const primary = incTime >= baseTime ? incC : baseC;
  const secondary = incTime >= baseTime ? baseC : incC;

  const latestU1 = u1Dates.length > 0 ? u1Dates[u1Dates.length - 1] : undefined;
  const latestU2 = u2Dates.length > 0 ? u2Dates[u2Dates.length - 1] : undefined;
  const latestJoint = jointDates.length > 0 ? jointDates[jointDates.length - 1] : undefined;

  const merged: SharedChallenge = {
    ...secondary,
    ...primary,
    user1DoneDates: u1Dates,
    user2DoneDates: u2Dates,
    user1DoneDate: latestU1,
    user2DoneDate: latestU2,
    totalJointDaysCompleted: totalCompleted,
    lastJointCompletionDate: latestJoint,
  };

  return reconcileSharedChallengeLifecycle(merged);
}
