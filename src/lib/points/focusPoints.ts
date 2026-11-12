import { PFC_POINTS } from './pointsConfig';

/**
 * Focus timer points.
 *
 * Current rule (rule 2, Zakria 2026-11-09): 1 pt per 12 active minutes (paused time never counts).
 * The active minutes of ALL of a day's rule-2 sessions are added up, then floored: a day earns
 * floor(minutes / 12), so 120 min = 10. A session counts only from 25 active minutes (one under 25
 * is never saved and adds 0 minutes). No finish bonus: every length (25 / 50 / 90 / 120 or custom)
 * uses the same rule. The server stamps each new row points_rule = 2 at insert
 * (supabase/migrations/20261109140000_focus_points_12min.sql); mirror src/lib/focusAwards.ts.
 *
 * Older rows keep the rule they were logged under (points_rule NULL), so an earlier day never changes:
 * - Rule R1 (rows with a planned length, 2026-11-04 to the rule-2 switch; ascend_focus_r1_points in
 *   20261104140000_focus_partial_points.sql): 2 pts at 25 min, +1 at 35, 45 ... 85, and a finish
 *   bonus (+1 for plans of 50 to 89 min, +2 for 90 or more).
 * - Rows without a planned length keep the old tiers (pointsConfig PFC_POINTS.focus.tiers).
 * A day with rows of both kinds earns min(10, old-rule points + floor(rule-2 minutes / 12)).
 */

/** Active minutes per point under rule 2. */
export const FOCUS_MINUTES_PER_POINT = PFC_POINTS.focus.minutesPerPoint;

/**
 * Active minutes of each milestone, in order; the first is the minimum that saves a session. The
 * timer still records these crossings (they place a session's minutes on each side of midnight);
 * only R1 rows earn points at them.
 */
export const FOCUS_MILESTONES = [25, 35, 45, 55, 65, 75, 85] as const;
export const FOCUS_MIN_MINUTES = FOCUS_MILESTONES[0];
export const FOCUS_FIRST_MILESTONE_POINTS = 2;
export const FOCUS_STEP_POINTS = 1;
export const FOCUS_STEP_MINUTES = 10;
/** R1 only: finish bonus by planned length, longest first. */
export const FOCUS_FINISH_BONUS = [
  { minPlanned: 90, points: 2 },
  { minPlanned: 50, points: 1 },
] as const;
export const FOCUS_DAILY_CAP = PFC_POINTS.focus.dailyCap;

/** R1 only: points of milestone `index` (0 = the 25-min one). */
export const milestonePoints = (index: number): number => (index === 0 ? FOCUS_FIRST_MILESTONE_POINTS : FOCUS_STEP_POINTS);

/** R1 only: bonus for running a session of this planned length to its end. */
export function finishBonus(plannedMinutes: number): number {
  for (const b of FOCUS_FINISH_BONUS) if (plannedMinutes >= b.minPlanned) return b.points;
  return 0;
}

/** Milestones reached with this many active minutes. */
export const milestonesReached = (activeMinutes: number): number =>
  FOCUS_MILESTONES.filter((m) => activeMinutes >= m).length;

/** R1 only: milestone points of this many active minutes (no finish bonus). */
export function milestonePointsFor(activeMinutes: number): number {
  let total = 0;
  for (let i = 0; i < milestonesReached(activeMinutes); i++) total += milestonePoints(i);
  return total;
}

/**
 * R1 points of one session (rows logged before rule 2), before the daily cap. Active minutes are
 * capped at the planned length; the finish bonus needs the whole plan.
 */
export function focusR1Points(activeMinutes: number, plannedMinutes: number): number {
  const planned = Math.max(0, Math.floor(Number(plannedMinutes) || 0));
  const active = Math.min(Math.max(0, Math.floor(Number(activeMinutes) || 0)), planned);
  if (active < FOCUS_MIN_MINUTES) return 0;
  return milestonePointsFor(active) + (active >= planned ? finishBonus(planned) : 0);
}

/** Rule-2 points of a day's added-up session minutes (each session already at least 25 min). */
export function focusPointsForMinutes(totalMinutes: number): number {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  return Math.min(FOCUS_DAILY_CAP, Math.floor(minutes / FOCUS_MINUTES_PER_POINT));
}

/** What one rule-2 session of this many active minutes earns on its own (a day with nothing else). */
export const focusSessionAlonePoints = (activeMinutes: number): number =>
  Math.floor(Number(activeMinutes) || 0) >= FOCUS_MIN_MINUTES ? focusPointsForMinutes(activeMinutes) : 0;

/** A day's focus so far: points of its old-rule rows and the added-up minutes of its rule-2 rows. */
export interface FocusDayTally {
  fixedPoints: number;
  minutes: number;
}

/** A day's focus points: min(cap, old-rule points + floor(rule-2 minutes / 12)). */
export const focusDayPoints = (tally: FocusDayTally): number =>
  Math.min(FOCUS_DAILY_CAP, Math.max(0, tally.fixedPoints) + Math.floor(Math.max(0, tally.minutes) / FOCUS_MINUTES_PER_POINT));

/** What a rule-2 session of `activeMinutes` adds to a day with this tally (0 under 25 min or at the cap). */
export function focusDayGain(activeMinutes: number, tally: FocusDayTally): number {
  const active = Math.max(0, Math.floor(Number(activeMinutes) || 0));
  if (active < FOCUS_MIN_MINUTES) return 0;
  return Math.max(0, focusDayPoints({ ...tally, minutes: tally.minutes + active }) - focusDayPoints(tally));
}

/**
 * The next point a running rule-2 session can add to today: at 25 active minutes (its first
 * minutes count from there), then each minute where today's added-up minutes reach the next
 * multiple of 12. null when it cannot happen within the plan or today's cap is reached.
 */
export function nextFocusReward(
  activeMinutes: number,
  plannedMinutes: number,
  tally: FocusDayTally
): { atMinutes: number; points: number } | null {
  const active = Math.max(0, Math.floor(Number(activeMinutes) || 0));
  const planned = Math.max(0, Math.floor(Number(plannedMinutes) || 0));
  const minutes = Math.max(0, Math.floor(tally.minutes));
  const atMinutes =
    active < FOCUS_MIN_MINUTES
      ? FOCUS_MIN_MINUTES
      : (Math.floor((minutes + active) / FOCUS_MINUTES_PER_POINT) + 1) * FOCUS_MINUTES_PER_POINT - minutes;
  if (atMinutes > planned) return null;
  const points = focusDayGain(atMinutes, tally) - focusDayGain(active, tally);
  return points > 0 ? { atMinutes, points } : null;
}

/** One line for copy: "1 pt per 12 min of focus, from 25 min, up to 10 a day". */
export const FOCUS_RULE_SHORT = `1 pt per ${FOCUS_MINUTES_PER_POINT} min of focus, from ${FOCUS_MIN_MINUTES} min, up to ${FOCUS_DAILY_CAP} a day`;
