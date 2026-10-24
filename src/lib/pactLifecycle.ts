import { Habit, SharedChallenge } from '@/types';
import { todayKey, previousPeriodKey, calculateElapsedDays, getNow } from './dates';
import { sameName } from './uniqueNames';
import { PRESET_CATEGORIES, type PresetHabit } from './presets';

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
 * The status this device shows. Completed once the joint days reach the length. Ended ('expired')
 * when the server says so, or once this viewer's own last day is over: the partner may still be on
 * theirs, so the stored status is the server's alone (shared_challenges_guard and the hourly pact
 * expiry wait for both members) and the app never sends one (saveSharedChallengeSupabase).
 */
function displayedPactStatus(
  challenge: SharedChallenge,
  totalCompleted: number,
  targetNow: Date
): SharedChallenge['status'] {
  if (totalCompleted >= challenge.durationDays) return 'completed';
  if (challenge.status === 'expired') return 'expired';
  return calculateElapsedDays(challenge.createdAt, targetNow) > challenge.durationDays ? 'expired' : 'active';
}

/**
 * Evaluates a shared challenge's lifecycle for display:
 * 1. Checks if totalJointDaysCompleted >= durationDays (Pact Won)
 * 2. Ended when the server stored it, or once this viewer's own last day is over (displayedPactStatus)
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

  const status = displayedPactStatus(challenge, totalCompleted, targetNow);

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
  const status = displayedPactStatus(target, totalCompleted, targetNow);

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

  // Parsed, not compared as text: the same instant can arrive as '…Z' or '…+00:00'.
  const toMs = (v: unknown) => {
    const ms = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
    return Number.isFinite(ms) ? ms : 0;
  };
  const baseTime = toMs(baseC.createdAt);
  const incTime = toMs(incC.createdAt);
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

// ── Habit-linked pacts ────────────────────────────────────────────────────────────────────────
// A side of a pact is linked to a habit when its goal text is that habit's name (the same name
// rule as everywhere else: trimmed, inner spaces collapsed, any case). Only daily habits link:
// a pact is ticked day by day. The Reading habit links too: reading logs tick it (any page or
// chapter logged today, a Finish that fills unread pages included), and its pacts with it.

/** One side's goal text, the text its habit link is read from. */
export function pactSideGoal(challenge: SharedChallenge, isUser1: boolean): string {
  return (isUser1 ? challenge.user1Target : challenge.user2Target) || challenge.targetHabitName || '';
}

/** Whether this habit can be linked to a pact. */
export function isPactLinkableHabit(habit: Habit): boolean {
  return habit.frequency === 'daily';
}

/** The linkable habit this goal text names, if any (the New challenge dialog's habit picker). */
export function habitForPactGoal(goal: string, habits: readonly Habit[]): Habit | null {
  if (!goal.trim()) return null;
  return habits.find((h) => isPactLinkableHabit(h) && sameName(h.name, goal)) ?? null;
}

/** The habit this side of the pact is linked to, if any. */
export function linkedHabitFor(
  challenge: SharedChallenge,
  isUser1: boolean,
  habits: readonly Habit[]
): Habit | null {
  const category = (isUser1 ? challenge.user1Category : challenge.user2Category) || 'habit';
  if (category !== 'habit') return null;
  return habitForPactGoal(pactSideGoal(challenge, isUser1), habits);
}

// Name of the Reading habit (turned on from the Reading page, store.toggleReadingHabit).
const READING_HABIT_NAME = 'Reading (Books)';

/** How "Add as a daily habit" adds the habit a pact side's goal names, through the normal add paths. */
export type PactHabitToAdd =
  | { kind: 'custom'; name: string }
  | { kind: 'preset'; preset: PresetHabit }
  | { kind: 'reading' };

/**
 * What adding the viewer's goal as a daily habit would add, so the side links by name (the minute
 * repair pass then keeps today in step). Null when nothing is offered: the pact is finished, the
 * side is not a habit goal or is already linked, or a habit (any frequency) already has that name.
 * Also null while the side is ticked today: the new habit starts not done, and the repair pass
 * would take today's tick back (the offer returns tomorrow). A Library name is added as that
 * preset (as the Add habit dialog requires), only if it is daily.
 */
export function pactHabitToAdd(
  challenge: SharedChallenge,
  isUser1: boolean,
  habits: readonly Habit[],
  today: string
): PactHabitToAdd | null {
  if (challenge.status !== 'active' || pactSideDoneOn(challenge, isUser1, today)) return null;
  if (((isUser1 ? challenge.user1Category : challenge.user2Category) || 'habit') !== 'habit') return null;
  const goal = pactSideGoal(challenge, isUser1).trim().replace(/\s+/g, ' ');
  if (!goal || habits.some((h) => sameName(h.name, goal))) return null;
  if (sameName(goal, READING_HABIT_NAME)) {
    return habits.some((h) => h.linkedModule === 'reading') ? null : { kind: 'reading' };
  }
  const preset = PRESET_CATEGORIES.flatMap((c) => c.habits).find((h) => sameName(h.name, goal));
  if (preset) return preset.frequency === 'daily' ? { kind: 'preset', preset } : null;
  return { kind: 'custom', name: goal };
}

/** A linked pact ticked or unticked here, to be saved: the pact as it now is and the viewer's side. */
export interface LinkedPactTick {
  updated: SharedChallenge;
  isUser1: boolean;
}

/**
 * A habit's today changed (done or not): every running pact whose viewer side links to it takes
 * the same state for today. The partner's side is never touched (their device ticks theirs).
 */
export function tickLinkedPacts(
  challenges: readonly SharedChallenge[],
  /** The viewer's side of a pact, or null when its partnership is not known here. */
  sideOf: (challenge: SharedChallenge) => boolean | null,
  habit: Habit,
  done: boolean
): { challenges: SharedChallenge[]; ticks: LinkedPactTick[] } {
  const ticks: LinkedPactTick[] = [];
  const next = challenges.map((challenge) => {
    // A finished pact takes no more ticks.
    if (challenge.status !== 'active') return challenge;
    const isUser1 = sideOf(challenge);
    if (isUser1 === null || !linkedHabitFor(challenge, isUser1, [habit])) return challenge;
    const { updated } = applyPledgeToggle(challenge, isUser1, done);
    ticks.push({ updated, isUser1 });
    return updated;
  });
  return { challenges: next, ticks };
}

/** The delete / stop warning for a habit that running pacts tick (empty when none do). */
export function pactUnlinkNote(runningLinked: number): string {
  if (runningLinked <= 0) return '';
  const one = runningLinked === 1;
  return ` ${runningLinked} running challenge${one ? ' uses' : 's use'} this habit; ${one ? 'it keeps' : 'they keep'} going and you tick ${one ? 'it' : 'them'} by hand.`;
}

/** Whether a daily habit is done on this day (today unless given). */
export function habitDoneOn(habit: Habit, day: string = todayKey()): boolean {
  const completions = habit.completions as Habit['completions'] | string[] | undefined;
  if (!completions) return false;
  if (Array.isArray(completions)) return completions.includes(day);
  return completions[day]?.done === true;
}

/** Whether this side of the pact has this day ticked. */
export function pactSideDoneOn(challenge: SharedChallenge, isUser1: boolean, day: string): boolean {
  const norm = normalizeChallengeDates(challenge);
  return (isUser1 ? norm.user1DoneDates : norm.user2DoneDates).includes(day);
}

export interface LinkedPactReconcileInput {
  challenges: readonly SharedChallenge[];
  habits: readonly Habit[];
  /** The viewer's side of a pact, or null when its partnership is not known here. */
  sideOf: (challenge: SharedChallenge) => boolean | null;
  /** The viewer's local day. */
  today: string;
  /** Pacts with one of our own writes on its way: left alone until it settles. */
  isBusy: (challengeId: string) => boolean;
  /** Pacts that differed from their habit on the previous pass. */
  divergedBefore: ReadonlySet<string>;
  /** Day of the last repair attempt per pact. */
  attemptedOn: ReadonlyMap<string, string>;
  /** Pacts whose last save from a habit tick failed today: sent again on every pass. */
  retry: ReadonlySet<string>;
}

export interface LinkedPactRepair {
  challenge: SharedChallenge;
  isUser1: boolean;
  /** What today should be on the viewer's side: the habit's state. */
  done: boolean;
  /** A resend of a failed save (not a repair, so it does not use up the day's attempt). */
  isRetry: boolean;
}

/**
 * One pass of keeping running, habit-linked pacts in step with their habit (the viewer's own side
 * only; the partner's device does theirs). A pact that differs from its habit is repaired only
 * when it also differed on the previous pass (about a minute earlier), so a habit change still on
 * its way from another device is not undone; and at most once per pact per day, so a day the
 * server will not take (device day not the server's day) is not sent again every minute. A failed
 * save from a habit tick is resent on every pass until it goes through.
 */
export function planLinkedPactRepairs(input: LinkedPactReconcileInput): {
  repairs: LinkedPactRepair[];
  diverged: Set<string>;
} {
  const repairs: LinkedPactRepair[] = [];
  const diverged = new Set<string>();
  for (const challenge of input.challenges) {
    if (challenge.status !== 'active' || input.isBusy(challenge.id)) continue;
    const isUser1 = input.sideOf(challenge);
    if (isUser1 === null) continue;
    const habit = linkedHabitFor(challenge, isUser1, input.habits);
    if (!habit) continue;
    const done = habitDoneOn(habit, input.today);
    if (input.retry.has(challenge.id)) {
      repairs.push({ challenge, isUser1, done, isRetry: true });
      continue;
    }
    if (pactSideDoneOn(challenge, isUser1, input.today) === done) continue;
    diverged.add(challenge.id);
    if (input.divergedBefore.has(challenge.id) && input.attemptedOn.get(challenge.id) !== input.today) {
      repairs.push({ challenge, isUser1, done, isRetry: false });
    }
  }
  return { repairs, diverged };
}

/**
 * Whether the server left out the viewer's tick or untick for their day: the pact guard only
 * changes the viewer's side for today in their profile time zone, and never on a finished pact.
 * Compared on the viewer's own side for the device's day, the one day the app ever changes.
 */
export function pactTickRefused(
  sent: SharedChallenge,
  stored: SharedChallenge,
  isUser1: boolean,
  deviceToday: string
): boolean {
  return pactSideDoneOn(sent, isUser1, deviceToday) !== pactSideDoneOn(stored, isUser1, deviceToday);
}
