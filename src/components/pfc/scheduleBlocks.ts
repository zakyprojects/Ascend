import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { computeLiveSchedule, getBlockTimingAt, timeStringToMinutes } from '@/lib/timeTracker';
import { todayKey } from '@/lib/dates';

/**
 * Which of today's time blocks Follow schedule shows right now. Everything that decides "the
 * block at this moment" lives here, so it can be swapped in one place.
 *
 * "Now", "over" and "upcoming" come from getBlockTimingAt, so blocks ending at midnight (24:00),
 * the split halves of a block across midnight, and old unsplit overnight blocks (23:00–07:00)
 * are judged on their real start and end instants.
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
  const day = todayKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const timing = (b: TimeTrackerBlock) => getBlockTimingAt(b, day, now);
  const unresolved = todayBlocks
    .filter((b) => !b.completed && !b.skipped)
    .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

  const activeBlock = unresolved.find((b) => timing(b) === 'current') ?? null;
  const nextBlock = unresolved.find((b) => timing(b) === 'upcoming') ?? null;
  const activeBlockActivity = activeBlock ? activities.find((a) => a.id === activeBlock.activityId) ?? null : null;
  const overdueBlock = unresolved.find((b) => timing(b) === 'over');

  // Most recently resolved first: the block the user just acted on.
  const currentResolvedBlock = todayBlocks
    .filter((b) => {
      const window = { startTime: b.startTime, endTime: b.trimmedOriginalEndTime || b.originalEndTime || b.endTime };
      return (b.completed || b.skipped) && getBlockTimingAt(window, day, now) === 'current';
    })
    .sort((a, b) => resolvedAt(b) - resolvedAt(a))[0];

  // Latest block finished or skipped early today (it carries trimmedOriginalEndTime).
  const lastEarlyResolved = todayBlocks
    .filter((b) => Boolean(b.trimmedOriginalEndTime) && (b.completed || b.skipped) && timeStringToMinutes(b.endTime) <= nowMinutes)
    .sort((a, b) => resolvedAt(b) - resolvedAt(a) || timeStringToMinutes(b.endTime) - timeStringToMinutes(a.endTime))[0];

  return {
    activeBlock,
    activeBlockActivity,
    nextBlock,
    overdueBlock,
    currentResolvedBlock,
    gapTriggerBlock: currentResolvedBlock?.trimmedOriginalEndTime ? currentResolvedBlock : lastEarlyResolved,
    resolvedBlockForDisplay: currentResolvedBlock || lastEarlyResolved,
    totalScheduledMinutesToday: live.totalScheduledMinutesToday,
  };
}
