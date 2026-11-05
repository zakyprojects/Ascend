/**
 * Focus timer points (rule R1, Zakria 2026-11-04). Mirrored by ascend_focus_r1_points in
 * supabase/migrations/20261104140000_focus_partial_points.sql: change both together.
 *
 * - Active minutes (paused time never counts) in ONE session earn milestones: 2 pts at 25 min,
 *   then +1 at 35, 45, 55, 65, 75 and 85 min (8 at most).
 * - Finishing the planned length adds a bonus: +1 for plans of 50 to 89 min, +2 for 90 min or more.
 * - So the presets still give 2 / 5 / 10 when finished; all focus points share the daily cap of 10.
 * - Sessions logged before this rule (no planned length) keep the old tiers (pointsConfig
 *   PFC_POINTS.focus.tiers: 25 = 2, 50 = 5, 90 = 10).
 */

/** Active minutes of each milestone, in order; the first is the minimum that saves a session. */
export const FOCUS_MILESTONES = [25, 35, 45, 55, 65, 75, 85] as const;
export const FOCUS_MIN_MINUTES = FOCUS_MILESTONES[0];
export const FOCUS_FIRST_MILESTONE_POINTS = 2;
export const FOCUS_STEP_POINTS = 1;
export const FOCUS_STEP_MINUTES = 10;
/** Finish bonus by planned length, longest first. */
export const FOCUS_FINISH_BONUS = [
  { minPlanned: 90, points: 2 },
  { minPlanned: 50, points: 1 },
] as const;
export const FOCUS_DAILY_CAP = 10;

/** Points of milestone `index` (0 = the 25-min one). */
export const milestonePoints = (index: number): number => (index === 0 ? FOCUS_FIRST_MILESTONE_POINTS : FOCUS_STEP_POINTS);

/** Bonus for running a session of this planned length to its end. */
export function finishBonus(plannedMinutes: number): number {
  for (const b of FOCUS_FINISH_BONUS) if (plannedMinutes >= b.minPlanned) return b.points;
  return 0;
}

/** Milestones reached with this many active minutes. */
export const milestonesReached = (activeMinutes: number): number =>
  FOCUS_MILESTONES.filter((m) => activeMinutes >= m).length;

/** Milestone points of this many active minutes (no finish bonus). */
export function milestonePointsFor(activeMinutes: number): number {
  let total = 0;
  for (let i = 0; i < milestonesReached(activeMinutes); i++) total += milestonePoints(i);
  return total;
}

/**
 * R1 points of one session, before the daily cap. Active minutes are capped at the planned
 * length; the finish bonus needs the whole plan.
 */
export function focusR1Points(activeMinutes: number, plannedMinutes: number): number {
  const planned = Math.max(0, Math.floor(Number(plannedMinutes) || 0));
  const active = Math.min(Math.max(0, Math.floor(Number(activeMinutes) || 0)), planned);
  if (active < FOCUS_MIN_MINUTES) return 0;
  return milestonePointsFor(active) + (active >= planned ? finishBonus(planned) : 0);
}

/** Points a session adds today: its own points, at most what today's focus cap has left. */
export function focusPointsWithinCap(sessionPoints: number, earnedToday: number): number {
  const room = Math.max(0, FOCUS_DAILY_CAP - Math.max(0, earnedToday));
  return Math.min(Math.max(0, sessionPoints), room);
}

/** The next thing a running session can earn: a milestone, or the finish bonus. */
export function nextFocusReward(
  activeMinutes: number,
  plannedMinutes: number
): { atMinutes: number; points: number; kind: 'milestone' | 'finish' } | null {
  const next = FOCUS_MILESTONES.find((m) => m > activeMinutes && m < plannedMinutes);
  if (next !== undefined) return { atMinutes: next, points: milestonePoints(FOCUS_MILESTONES.indexOf(next)), kind: 'milestone' };
  if (activeMinutes < plannedMinutes && plannedMinutes >= FOCUS_MIN_MINUTES) {
    // Reaching the plan itself: its milestone (when the plan sits on one) plus the bonus.
    const atPlan = focusR1Points(plannedMinutes, plannedMinutes) - focusR1Points(activeMinutes, plannedMinutes);
    return atPlan > 0 ? { atMinutes: plannedMinutes, points: atPlan, kind: 'finish' } : null;
  }
  return null;
}

/** One line for copy: "2 pts at 25 min, then +1 every 10 min ...". */
export const FOCUS_RULE_SHORT = `${FOCUS_FIRST_MILESTONE_POINTS} pts at ${FOCUS_MIN_MINUTES} min, then +${FOCUS_STEP_POINTS} every ${FOCUS_STEP_MINUTES} min. Finish what you planned: +1 (50 min or more) or +2 (90 min or more)`;
