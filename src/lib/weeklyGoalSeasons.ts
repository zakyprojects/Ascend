/**
 * weeklyGoalSeasons.ts
 *
 * Weekly Goals weeks are local Monday-Sunday; seasons switch at a global UTC instant.
 * When a season starts mid-week, that week's goal points are split across two ledger entries:
 *   - `weekly_goal_<weekKey>`        earlier season (frozen once the new season starts)
 *   - `weekly_goal_<weekKey>_s<N>`   season N (the season that started during the week)
 */
import { getWeekDates } from './dates';
import { getSeasonNumber, getSeasonStart } from './leagueTime';

const SEASON_SPLIT_ID_PATTERN = /^weekly_goal_(\d{4}-W\d{2})_s(\d+)$/;

export function getWeeklyGoalEntryId(weekKey: string): string {
  return `weekly_goal_${weekKey}`;
}

export function getWeeklyGoalSeasonSplitEntryId(weekKey: string, seasonNumber: number): string {
  return `${getWeeklyGoalEntryId(weekKey)}_s${seasonNumber}`;
}

export function isWeeklyGoalSeasonSplitEntryId(id: unknown): boolean {
  return typeof id === 'string' && SEASON_SPLIT_ID_PATTERN.test(id);
}

/**
 * The season start that falls inside the given local week, or null when the whole week
 * belongs to one season.
 */
export function getSeasonBoundaryInWeek(weekKey: string): { boundary: Date; seasonNumber: number } | null {
  const { start, end } = getWeekDates(weekKey);
  const boundary = getSeasonStart(end);
  if (boundary.getTime() <= start.getTime()) return null;
  return { boundary, seasonNumber: getSeasonNumber(boundary) };
}

/** True when the whole local week ended before `seasonStart` (the week is frozen). */
export function isWeekBeforeSeason(weekKey: string, seasonStart: Date): boolean {
  return getWeekDates(weekKey).end.getTime() < seasonStart.getTime();
}
