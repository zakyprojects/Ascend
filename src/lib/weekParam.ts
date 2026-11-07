import { getWeekDates, parseDate, weekKey } from './dates';

/**
 * Weekly Goals can be opened at a week: `/weekly-goals?week=2026-W46` (the Sunday planning
 * notice opens next week this way). The key is the app's own week key (dates.ts `weekKey`, the
 * same numbering as the server's `ascend_week_key`), not an ISO week.
 */
export const WEEK_PARAM = 'week';

/** A week key in the app's format that names a real week (it reads back to itself). */
export function isWeekKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-W\d{2}$/.test(value)) return false;
  return weekKey(getWeekDates(value).start) === value;
}

/**
 * The week a `?week=` value opens: the named week when it is this week or later, else this week
 * (missing, malformed, a week the app's numbering doesn't have, or already past).
 */
export function weekFromParam(value: string | null | undefined, currentWeekKey: string): string {
  if (!isWeekKey(value)) return currentWeekKey;
  return value < currentWeekKey ? currentWeekKey : value;
}

/** `?week=<key>` for a valid key, else '' (the page opens on this week). */
export function weekSearch(key: string | null | undefined): string {
  return isWeekKey(key) ? `?${WEEK_PARAM}=${key}` : '';
}

/**
 * The week a Sunday planning notice is about: the server's `planWeekKey` (the week starting the
 * Monday after that Sunday), else, for notices sent before it carried one, the week of the day
 * after the notice was created (local time). Null when neither can be read.
 */
export function planningWeekKey(payload: Record<string, unknown> | undefined, createdAt: string | undefined): string | null {
  const fromServer = payload?.planWeekKey;
  if (isWeekKey(fromServer)) return fromServer;
  const created = parseDate(createdAt ?? null);
  if (!created) return null;
  const nextDay = new Date(created);
  nextDay.setDate(nextDay.getDate() + 1);
  return weekKey(nextDay);
}
