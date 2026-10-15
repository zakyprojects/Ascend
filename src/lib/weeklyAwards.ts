import { getWeekDates } from './dates';

/**
 * Weekly goal and reflection points are written by the server
 * (supabase/migrations/20261015220000_server_weekly_awards.sql) from the week's weekly_goals row:
 * weekly_goal_<weekKey> (and weekly_goal_<weekKey>_s<N> in a week a season starts) for the current
 * and previous week, and weekly_review_<weekKey> / weekly_review_rev_<weekKey> inside the week's
 * Reflection Window. The app computes the same rows only to show them before the server's copies
 * arrive; it never uploads them. Change both sides together.
 */

/** Point entry ids only the server writes. */
export const isServerOwnedWeeklyPointId = (id: string): boolean =>
  id.startsWith('weekly_goal_') || id.startsWith('weekly_review_');

/**
 * A week's Reflection Window (Zakria 2026-10-15): from Friday 06:00 of the week until the end of
 * the following Monday, local time. Reflections are written, changed and rewarded only inside it.
 */
export function reflectionWindow(targetWeekKey: string): { opensAt: Date; closesAt: Date } {
  const { start } = getWeekDates(targetWeekKey);
  const opensAt = new Date(start);
  opensAt.setDate(opensAt.getDate() + 4); // Friday
  opensAt.setHours(6, 0, 0, 0);
  const closesAt = new Date(start);
  closesAt.setDate(closesAt.getDate() + 8); // the Tuesday after: the window covers all of Monday
  closesAt.setHours(0, 0, 0, 0);
  return { opensAt, closesAt };
}

export function isReflectionWindowOpen(targetWeekKey: string, now: Date): boolean {
  const { opensAt, closesAt } = reflectionWindow(targetWeekKey);
  return now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime();
}
