import type { PointsEntry, TimeTrackerBlock } from '@/types';
import { calculateTimeTrackerDailyPoints } from './pointsConfig';

/**
 * Time tracker points are written by the server (supabase/migrations/20261015250000_server_time_tracker_awards.sql):
 * one row per local day, id time_tracker_<YYYY-MM-DD>, from that day's routine blocks
 * (calculateTimeTrackerDailyPoints). Only today is recomputed, so a day's points freeze at its
 * midnight, and a past day's blocks saved late earn nothing. The app computes the same row only
 * to show it before the server's copy arrives; it never uploads it. Change both sides together.
 */

export const timeTrackerAwardId = (day: string) => `time_tracker_${day}`;

/**
 * Mirror of ascend_recompute_time_tracker_award: the award entry of one local day, or null when
 * the day earns nothing. The percentage is rounded half up with integers, as in SQL.
 */
export function computeTimeTrackerAward(blocks: TimeTrackerBlock[], day: string, nowMs: number): PointsEntry | null {
  const { pointsAwarded, completedCount, effectiveDenominator } = calculateTimeTrackerDailyPoints(blocks || []);
  if (pointsAwarded <= 0 || effectiveDenominator <= 0) return null;

  const percentage = Math.floor((200 * completedCount + effectiveDenominator) / (2 * effectiveDenominator));
  return {
    id: timeTrackerAwardId(day),
    amount: pointsAwarded,
    reason: `Time Tracker daily routine completed (${percentage}%): ${pointsAwarded} pts`,
    source: 'time_tracker',
    timestamp: new Date(nowMs).toISOString(),
    metadata: { date: day, percentage, pointsAwarded },
  };
}
