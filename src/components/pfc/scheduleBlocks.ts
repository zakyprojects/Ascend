import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { computeLiveSchedule, timeStringToMinutes } from '@/lib/timeTracker';

/**
 * Which of today's time blocks Follow schedule shows right now. Everything that decides "the
 * block at this moment" lives here, so it can be swapped in one place.
 *
 * Known gap (audit P4, left for the shared Time Tracker helper): blocks are read as same-day
 * ranges, so an overnight block (end before start, e.g. Sleep 23:00–07:00) is never active at
 * night and counts as overdue from its end time in the morning.
 */
export interface CurrentScheduleBlock {
  activeBlock: TimeTrackerBlock | null;
  activeBlockActivity: TimeTrackerActivity | null;
  nextBlock: TimeTrackerBlock | null;
  /** An unresolved block whose end has passed: the HUD asks to mark it done or skip it. */
  overdueBlock: TimeTrackerBlock | undefined;
  /** A block resolved (done/skipped) whose own time window we are still inside. */
  currentResolvedBlock: TimeTrackerBlock | undefined;
  /** The early-resolved block that opened the current gap (pull-forward links to it). */
  gapTriggerBlock: TimeTrackerBlock | undefined;
  /** The resolved block the gap screen's message is about. */
  resolvedBlockForDisplay: TimeTrackerBlock | undefined;
  totalScheduledMinutesToday: number;
}

const resolvedAt = (b: TimeTrackerBlock): number => {
  const stamp = b.completedAt || b.skippedAt;
  return stamp ? new Date(stamp).getTime() : 0;
};

export function currentScheduleBlock(
  todayBlocks: TimeTrackerBlock[],
  activities: TimeTrackerActivity[],
  now: Date
): CurrentScheduleBlock {
  const live = computeLiveSchedule(todayBlocks, activities, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowSeconds = nowMinutes * 60 + now.getSeconds();

  const overdueBlock = todayBlocks.find(
    (b) => !b.completed && !b.skipped && nowSeconds >= timeStringToMinutes(b.endTime) * 60
  );

  // Most recently resolved first: the block the user just acted on.
  const currentResolvedBlock = todayBlocks
    .filter((b) => {
      const start = timeStringToMinutes(b.startTime);
      const end = timeStringToMinutes(b.trimmedOriginalEndTime || b.originalEndTime || b.endTime);
      return nowMinutes >= start && nowMinutes < end && (b.completed || b.skipped);
    })
    .sort((a, b) => resolvedAt(b) - resolvedAt(a))[0];

  // Latest block finished or skipped early today (it carries trimmedOriginalEndTime).
  const lastEarlyResolved = todayBlocks
    .filter((b) => Boolean(b.trimmedOriginalEndTime) && (b.completed || b.skipped) && timeStringToMinutes(b.endTime) <= nowMinutes)
    .sort((a, b) => resolvedAt(b) - resolvedAt(a) || timeStringToMinutes(b.endTime) - timeStringToMinutes(a.endTime))[0];

  return {
    activeBlock: live.activeBlock,
    activeBlockActivity: live.activeBlockActivity,
    nextBlock: live.nextBlock,
    overdueBlock,
    currentResolvedBlock,
    gapTriggerBlock: currentResolvedBlock?.trimmedOriginalEndTime ? currentResolvedBlock : lastEarlyResolved,
    resolvedBlockForDisplay: currentResolvedBlock || lastEarlyResolved,
    totalScheduledMinutesToday: live.totalScheduledMinutesToday,
  };
}
