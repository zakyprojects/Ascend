import type { AddictionTracker, PointsEntry } from '@/types';
import { RECOVERY_POINTS } from './pointsConfig';
import { addDays, localDayStartMs, todayKey } from '../time/dates';
import { getSeasonEnd, getSeasonStart } from '../time/leagueTime';

/**
 * Recovery points come from a daily "Clean today" check-in, written by the server
 * (supabase/migrations/20261109130000_recovery_daily_checkins.sql, ascend_award_recovery_checkin):
 *   * One check-in per local day across all trackers (recovery_checkins, row id = the day). It earns
 *     RECOVERY_POINTS.perCheckin, as 'recovery_day_<day>' (source 'recovery_checkin').
 *   * Today's check-in, or yesterday's when it was missed (late tap); older or future days are not stored.
 *   * The tracker's first local day (its creation day) and a day the streak (re)started in earn nothing.
 *   * At most RECOVERY_POINTS.seasonCap recovery points a season, old milestone rows included.
 *   * No bonuses, nothing is ever taken back, except the user's own undo of TODAY's check-in
 *     (ascend_revoke_recovery_checkin): it removes today's check-in and today's point while that day
 *     is still today. Yesterday's late tap and earlier days can't be undone. A re-tap after the undo
 *     brings back the same single point (same id), never a second one.
 *   * The award is dated at the tap, a late tap at yesterday's last millisecond.
 * The server stamps the tracker's creation time itself; the app uses the tracker's createdAt, which
 * is the same moment unless the tracker was made offline. The app computes the award only to show
 * it at once; it never uploads it. Change both sides together.
 */

/** Streak markers on the Recovery page (no points). */
export const RECOVERY_MILESTONES = [
  { key: '1w', hours: 168, label: '1 Week Clean' },
  { key: '1m', hours: 720, label: '1 Month Clean' },
  { key: '90d', hours: 2160, label: '90 Days Clean' },
] as const;

export type RecoveryMilestoneKey = (typeof RECOVERY_MILESTONES)[number]['key'];

export const RECOVERY_CHECKIN_SOURCE = 'recovery_checkin';
/** Every source that counts toward the season cap: check-ins and the old milestone rows. */
const RECOVERY_SOURCES = new Set([RECOVERY_CHECKIN_SOURCE, 'recovery_milestone', 'addiction_recovery']);

export const recoveryDayAwardId = (day: string) => `recovery_day_${day}`;

const timeOf = (timestamp: string | undefined): number => {
  const ms = new Date(timestamp || '').getTime();
  return Number.isNaN(ms) ? NaN : ms;
};

/** The tracker's streak start in epoch ms, or null when it does not parse. */
export const trackerStartMs = (tracker: AddictionTracker | null | undefined): number | null => {
  const ms = timeOf(tracker?.startDate);
  return Number.isNaN(ms) ? null : ms;
};

/** The days a check-in can be made for now: today, and yesterday as a late tap. */
export const recoveryCheckinDays = (nowMs: number) => {
  const today = todayKey(new Date(nowMs));
  return { today, yesterday: addDays(today, -1) };
};

/** Only today's check-in can be undone (the tick on the done card); yesterday's late tap and older days never. */
export function canUndoRecoveryCheckin(checkins: { id: string }[] | undefined, day: string, nowMs: number): boolean {
  return day === recoveryCheckinDays(nowMs).today && (checkins || []).some((c) => c?.id === day);
}

/** Recovery points held in the season that contains `atMs` (all recovery sources). */
export function recoveryPointsInSeason(history: PointsEntry[], atMs: number): number {
  const at = new Date(atMs);
  const startMs = getSeasonStart(at).getTime();
  const endMs = getSeasonEnd(at).getTime();
  let held = 0;
  for (const e of history) {
    if (!e || !RECOVERY_SOURCES.has(e.source) || typeof e.amount !== 'number') continue;
    const ms = timeOf(e.timestamp);
    if (ms >= startMs && ms < endMs) held += e.amount;
  }
  return held;
}

/**
 * Why a check-in for `day` earns nothing with this tracker, or null when it earns: 'first-day'
 * (the tracker was created that day or later), 'restarted' (the streak started that day).
 */
export function recoveryCheckinBlock(tracker: AddictionTracker | null | undefined, day: string): 'first-day' | 'restarted' | null {
  const startMs = trackerStartMs(tracker);
  if (!tracker?.id || startMs === null) return 'first-day';
  const createdMs = timeOf(tracker.createdAt);
  const createdDay = todayKey(new Date(Number.isNaN(createdMs) ? startMs : createdMs));
  if (createdDay >= day) return 'first-day';
  return todayKey(new Date(startMs)) === day ? 'restarted' : null;
}

/**
 * Mirror of ascend_award_recovery_checkin: the point row the server writes for a check-in of `day`
 * made at `nowMs` with this tracker, or null when it earns nothing (blocked, already awarded,
 * not today or yesterday, or the season cap is reached).
 */
export function computeRecoveryCheckinAward(
  tracker: AddictionTracker | null | undefined,
  day: string,
  history: PointsEntry[],
  nowMs: number
): PointsEntry | null {
  const { today, yesterday } = recoveryCheckinDays(nowMs);
  if ((day !== today && day !== yesterday) || recoveryCheckinBlock(tracker, day)) return null;
  const id = recoveryDayAwardId(day);
  if (history.some((e) => e?.id === id)) return null;
  const atMs = Math.min(nowMs, localDayStartMs(addDays(day, 1)) - 1);
  const amount = Math.floor(Math.min(RECOVERY_POINTS.perCheckin, Math.max(RECOVERY_POINTS.seasonCap - recoveryPointsInSeason(history, atMs), 0)));
  if (amount <= 0) return null;
  return {
    id,
    amount,
    reason: 'Clean day check-in',
    source: RECOVERY_CHECKIN_SOURCE,
    timestamp: new Date(atMs).toISOString(),
    metadata: { date: day, trackerId: tracker!.id },
  };
}
