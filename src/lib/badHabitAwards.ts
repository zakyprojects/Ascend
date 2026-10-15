import type { BadHabit, BadHabitLog, PointsEntry } from '@/types';
import { BAD_HABIT_POINTS } from './pointsConfig';
import { getPointEligibleHabitIds } from './badHabitEligibility';
import { getMissPenaltyMultiplier } from './habitPenalties';

/**
 * Bad-habit points are written by the server (supabase/migrations/20261015130000_server_bad_habit_awards.sql).
 * The app computes the same rows only to show them before the server's copy arrives; it never
 * uploads them, and the server skips any app write to them. Change both sides together.
 */

/** First local day whose bad-habit points come from the server; older app-written rows stay. */
export const BAD_HABIT_AWARDS_SERVER_SINCE = '2026-10-15';

export const badHabitResistId = (badHabitId: string, day: string) => `bad_habit_resist_${badHabitId}_${day}`;
export const badHabitOccurredId = (badHabitId: string, day: string) => `bad_habit_occurred_${badHabitId}_${day}`;
export const badHabitDeleteId = (badHabitId: string) => `bad_habit_delete_${badHabitId}`;

/** Bad-habit logs only the server writes (no-report days). */
export const isServerOwnedBadHabitLogId = (id: string): boolean => id.startsWith('no_report_');

const APP_WRITTEN_DAY_SOURCES = new Set(['bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_undo']);

/** A resist/occurred row of one day: the server's own, or one the app wrote before it. */
export const isBadHabitDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.metadata?.date === day &&
  ((entry.id || '').startsWith('bad_habit_resist_') ||
    (entry.id || '').startsWith('bad_habit_occurred_') ||
    (!(entry.id || '').startsWith('bad_habit_') && APP_WRITTEN_DAY_SOURCES.has(entry.source)));

/** An app-written resist/occurred row for a day the server owns: the server retired every such row. */
export const isRetiredAppBadHabitAward = (entry: PointsEntry): boolean =>
  !(entry.id || '').startsWith('bad_habit_') &&
  APP_WRITTEN_DAY_SOURCES.has(entry.source) &&
  typeof entry.metadata?.date === 'string' &&
  entry.metadata.date >= BAD_HABIT_AWARDS_SERVER_SINCE;

const timeOf = (value?: string): number => {
  const ms = new Date(value || 0).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const byTimeThenId = (a: BadHabitLog, b: BadHabitLog) =>
  timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** One log per bad habit (the earliest) among the day's logs of a status. */
function firstLogPerHabit(logs: BadHabitLog[], liveIds: Set<string>, day: string, status: BadHabitLog['status']) {
  const first = new Map<string, BadHabitLog>();
  for (const log of [...logs].filter((l) => l && l.date === day && l.status === status).sort(byTimeThenId)) {
    if (liveIds.has(log.badHabitId) && !first.has(log.badHabitId)) first.set(log.badHabitId, log);
  }
  return [...first.values()];
}

/**
 * Mirror of ascend_recompute_bad_habit_awards: the resist and occurred rows of one local day,
 * and each of the day's logs' points. Resists: the 2 oldest active habits earn +3 (a log that
 * already earned goes first), at most 2 a day and 6 points. Occurred: a penalty already
 * written keeps its amount; a new one is 5 x the miss multiplier, point-eligible habits only.
 */
export function computeBadHabitAwards(
  badHabits: BadHabit[],
  logs: BadHabitLog[],
  pointsHistory: PointsEntry[],
  day: string,
  dayStartMs: number,
  nowMs: number,
  seasonPoints: number
): { entries: PointsEntry[]; logPoints: Map<string, number> } {
  const eligible = getPointEligibleHabitIds(badHabits);
  const names = new Map(badHabits.filter(Boolean).map((h) => [h.id, h.name]));
  const liveIds = new Set(names.keys());
  const live = new Map((pointsHistory || []).filter(Boolean).map((e) => [e.id, e]));
  const stamp = (log: BadHabitLog) => new Date(Math.min(Math.max(timeOf(log.createdAt), dayStartMs), nowMs)).toISOString();

  const entries: PointsEntry[] = [];
  const logPoints = new Map<string, number>();
  for (const log of logs) if (log && log.date === day && log.status !== 'no_report') logPoints.set(log.id, 0);

  // a) Resists.
  const earned = (log: BadHabitLog) => (live.get(badHabitResistId(log.badHabitId, day))?.amount || 0) > 0;
  const resists = firstLogPerHabit(logs, liveIds, day, 'resisted')
    .filter((log) => earned(log) || eligible.has(log.badHabitId))
    .sort((a, b) => Number(earned(b)) - Number(earned(a)) || byTimeThenId(a, b));
  let used = 0;
  let count = 0;
  for (const log of resists) {
    if (count >= BAD_HABIT_POINTS.maxDailyResists || used + BAD_HABIT_POINTS.resistBase > BAD_HABIT_POINTS.dailyCap) continue;
    count++;
    used += BAD_HABIT_POINTS.resistBase;
    logPoints.set(log.id, BAD_HABIT_POINTS.resistBase);
    entries.push({
      id: badHabitResistId(log.badHabitId, day),
      amount: BAD_HABIT_POINTS.resistBase,
      reason: `Bad habit resisted: ${names.get(log.badHabitId) ?? ''}`,
      source: 'bad_habit_resisted',
      timestamp: stamp(log),
      metadata: { badHabitId: log.badHabitId, date: day, status: 'resisted' },
    });
  }

  // b) Occurred.
  for (const log of firstLogPerHabit(logs, liveIds, day, 'occurred')) {
    const existing = live.get(badHabitOccurredId(log.badHabitId, day));
    if (existing) {
      entries.push(existing);
      logPoints.set(log.id, existing.amount);
      continue;
    }
    if (!eligible.has(log.badHabitId)) continue;

    let occurrences = 1;
    const before = logs
      .filter((l) => l && l.badHabitId === log.badHabitId && l.date < day)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const l of before) {
      if (l.status !== 'occurred' && l.status !== 'no_report') break;
      occurrences++;
    }
    const multiplier = getMissPenaltyMultiplier(occurrences, seasonPoints);
    const penalty = Math.round(BAD_HABIT_POINTS.occurBase * multiplier);
    if (penalty <= 0) continue;
    logPoints.set(log.id, -penalty);
    entries.push({
      id: badHabitOccurredId(log.badHabitId, day),
      amount: -penalty,
      reason: `Bad habit occurred (${multiplier}x penalty): ${names.get(log.badHabitId) ?? ''}`,
      source: 'bad_habit_occurred',
      timestamp: stamp(log),
      metadata: { badHabitId: log.badHabitId, date: day, status: 'occurred' },
    });
  }
  return { entries, logPoints };
}

/** The deleteBadHabit refund of app-written resist points (before the server owned them). */
export function legacyResistRefund(logs: BadHabitLog[], badHabitId: string): number {
  return logs
    .filter(
      (l) =>
        l &&
        l.badHabitId === badHabitId &&
        l.status === 'resisted' &&
        l.date < BAD_HABIT_AWARDS_SERVER_SINCE &&
        (l.pointsAwardedOrDeducted || 0) > 0
    )
    .reduce((sum, l) => sum + (l.pointsAwardedOrDeducted || 0), 0);
}
