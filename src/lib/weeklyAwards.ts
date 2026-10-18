import type { PointsEntry, WeeklyGoalItem } from '@/types';
import { getWeekDates } from './dates';
import { WEEKLY_GOALS_POINTS, getCountedWeeklyGoals, getWeeklyGoalCompletionTime } from './pointsConfig';

/**
 * Weekly goal and reflection points are written by the server
 * (supabase/migrations/20261015220000_server_weekly_awards.sql) from the week's weekly_goals row:
 * weekly_goal_<weekKey> (and weekly_goal_<weekKey>_s<N> in a week a season starts) for the current
 * and previous week, and weekly_review_<weekKey> / weekly_review_rev_<weekKey> inside the week's
 * Reflection Window. The app computes the same rows only to show them before the server's copies
 * arrive; it never uploads them. Change both sides together.
 */

/**
 * When a week's goal points row is stamped (Zakria 2026-10-15): the completion time of its last
 * counted goal, kept between `notBefore` (the week's start, or the season start for a season's
 * split row) and now. The season total floors at 0 in time order, so a row stamped when it was
 * earned shows every check and uncheck. Must match ascend_recompute_weekly_goal_awards.
 */
export function weeklyGoalAwardTimestamp(goals: WeeklyGoalItem[], notBefore: Date, now: Date): string {
  const { countedGoals } = getCountedWeeklyGoals(goals);
  const last = countedGoals[countedGoals.length - 1];
  const completedAt = last ? getWeeklyGoalCompletionTime(last) : Number.NaN;
  const at = Number.isFinite(completedAt) ? Math.min(completedAt, now.getTime()) : now.getTime();
  return new Date(Math.max(at, notBefore.getTime())).toISOString();
}

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

/** A goal the week's points row counted, and when it was achieved (row metadata.counted). */
export interface CountedGoalRef {
  id: string;
  at: string;
}

const instantMs = (value: unknown): number => {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  return new Date(value).getTime();
};

/**
 * Goals the week's points row (`entry`) counted on an earlier day, i.e. achieved before
 * `todayStartMs` (Zakria 2026-10-18: an earlier day's points never drop). They stay counted for
 * the week even when unticked, deleted or no longer linked. Mirror of the `held` set in
 * ascend_recompute_weekly_goal_awards (20261018150000_earlier_points_never_drop.sql).
 */
export function heldCountedGoals(entry: PointsEntry | null | undefined, todayStartMs: number): CountedGoalRef[] {
  const counted = entry?.metadata?.counted;
  if (!Array.isArray(counted)) return [];
  return counted.filter(
    (c): c is CountedGoalRef =>
      !!c && typeof c === 'object' && typeof c.id === 'string' && c.id !== '' && instantMs(c.at) < todayStartMs
  );
}

/**
 * A row written before metadata.counted existed: the points it held before today (all of them when
 * it was stamped before today, else all but the goal stamped today). 0 for rows with metadata.counted.
 */
export function legacyHeldWeeklyPoints(entry: PointsEntry | null | undefined, todayStartMs: number): number {
  if (!entry || Array.isArray(entry.metadata?.counted) || typeof entry.amount !== 'number') return 0;
  return instantMs(entry.timestamp) < todayStartMs ? entry.amount : Math.max(entry.amount - WEEKLY_GOALS_POINTS.pointsPerGoal, 0);
}

/**
 * The goals the week is scored on: the achieved goals, each held goal at its earlier completion
 * time, and held goals that are no longer achieved (or no longer exist) added back as achieved.
 * calculateWeeklyGoalsPoints / weeklyGoalAwardTimestamp take this list.
 */
export function weeklyScoringGoals(goals: WeeklyGoalItem[], held: CountedGoalRef[]): WeeklyGoalItem[] {
  if (held.length === 0) return goals;
  const heldById = new Map(held.map((h) => [h.id, h]));
  const isAchieved = (g: WeeklyGoalItem) => !!g && !g.archived && (g.completed === true || g.done === true);
  const used = new Set<string>();
  const scoring = (goals || []).map((g) => {
    const h = g && isAchieved(g) ? heldById.get(g.id) : undefined;
    if (!h) return g;
    used.add(h.id);
    return instantMs(h.at) < getWeeklyGoalCompletionTime(g) ? { ...g, completedAt: h.at } : g;
  });
  const missing = held
    .filter((h) => !used.has(h.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((h): WeeklyGoalItem => ({ id: h.id, title: '', priority: 'medium', completed: true, done: true, completedAt: h.at, createdAt: h.at }));
  return [...scoring, ...missing];
}

/** The counted goals of a scoring list, as stored in the row's metadata.counted. */
export function countedGoalRefs(scoringGoals: WeeklyGoalItem[]): CountedGoalRef[] {
  return getCountedWeeklyGoals(scoringGoals).countedGoals.map((g) => ({
    id: g.id,
    at: new Date(getWeeklyGoalCompletionTime(g)).toISOString(),
  }));
}
