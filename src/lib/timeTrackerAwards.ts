import type { PointsEntry, TimeTrackerBlock } from '@/types';
import { calculateTimeTrackerDailyPoints } from './pointsConfig';
import { addDays, todayKey } from './dates';

/**
 * Time tracker points are written by the server (supabase/migrations/20261015250000_server_time_tracker_awards.sql):
 * one row per local day, id time_tracker_<YYYY-MM-DD>, from that day's routine blocks
 * (calculateTimeTrackerDailyPoints). Only today is recomputed, plus yesterday until 02:00 local
 * (the grace window, 20261019150000_time_tracker_grace.sql), so a day's points freeze at 02:00 the
 * next morning, and a past day's blocks saved later earn nothing. The app computes the same row
 * only to show it before the server's copy arrives; it never uploads it. Change both sides together.
 */

export const timeTrackerAwardId = (day: string) => `time_tracker_${day}`;

/** Minutes after local midnight during which yesterday's last block can still be ticked (until 02:00). */
export const TIME_TRACKER_GRACE_MINUTES = 120;

/**
 * Yesterday's date while the grace window runs (local midnight to 02:00), else null. In it the app
 * lets the user tick or untick yesterday's last block (lastBlockOfDay), and the server still
 * recomputes yesterday's points.
 */
export function timeTrackerGraceDay(now: Date): string | null {
  return now.getHours() * 60 + now.getMinutes() < TIME_TRACKER_GRACE_MINUTES ? addDays(todayKey(now), -1) : null;
}

/**
 * Mirror of ascend_recompute_time_tracker_award: the award entry of one local day, or null when
 * the day earns nothing. The percentage is rounded half up with integers, as in SQL. An existing row
 * (existing, the live ledger row) keeps its time when the score changes; a new row is stamped now.
 */
export function computeTimeTrackerAward(
  blocks: TimeTrackerBlock[],
  day: string,
  nowMs: number,
  existing?: PointsEntry | null
): PointsEntry | null {
  const { pointsAwarded, completedCount, effectiveDenominator } = calculateTimeTrackerDailyPoints(blocks || []);
  if (pointsAwarded <= 0 || effectiveDenominator <= 0) return null;

  const percentage = Math.floor((200 * completedCount + effectiveDenominator) / (2 * effectiveDenominator));
  const id = timeTrackerAwardId(day);
  return {
    id,
    amount: pointsAwarded,
    reason: `Time Tracker daily routine completed (${percentage}%): ${pointsAwarded} pts`,
    source: 'time_tracker',
    timestamp: existing && existing.id === id ? existing.timestamp : new Date(nowMs).toISOString(),
    metadata: { date: day, percentage, pointsAwarded },
  };
}
