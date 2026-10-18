import { ArrowRight, CalendarDays, CheckCircle2, Play } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { TimeTrackerActivity } from '@/types';
import { formatTime12h, timeStringToMinutes } from '@/lib/timeTracker';
import { EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/userMessage';
import { formatClock } from '../focusSession';
import type { CurrentScheduleBlock } from '../scheduleBlocks';
import { getEarlyCompletionContextualMessage, getSkipContextualMessage } from '../scheduleMessages';
import { ActivityTile, ResolvedBlockBanner, StopScheduleButton, blockRange, blockTitle, hhmm, type Theme } from './shared';

/** No block running: free time, a block finished or skipped early, or the day's blocks are done. */
export function ScheduleGap({
  store,
  day,
  now,
  theme,
  activityMap,
  current,
  hasBlocks,
  onStop,
}: {
  store: AppStore;
  day: string;
  now: Date;
  theme: Theme;
  activityMap: Map<string, TimeTrackerActivity>;
  current: CurrentScheduleBlock;
  hasBlocks: boolean;
  onStop: () => void;
}) {
  const { showSuccessToast, showErrorToast } = useToast();
  const { nextBlock, currentResolvedBlock: resolved, resolvedBlockForDisplay: shown, gapTriggerBlock } = current;
  const resolvedActivity = resolved ? activityMap.get(resolved.activityId) : null;
  const shownActivity = shown ? activityMap.get(shown.activityId) : null;
  const nextActivity = nextBlock ? activityMap.get(nextBlock.activityId) : null;

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const untilNext = nextBlock ? Math.max(0, timeStringToMinutes(nextBlock.startTime) * 60 - nowSecs) : 0;
  const minsUntilNext = Math.max(1, Math.ceil(untilNext / 60));

  const status = resolved?.skipped ? 'Block skipped' : resolved?.completed ? 'Finished early' : 'Free time';

  const undo = () => {
    if (!resolved) return;
    try {
      store.undoDailyTimeBlockResolution(day, resolved.id);
      showSuccessToast('Status undone', resolved.skipped ? 'The block is no longer skipped.' : 'The block is no longer completed.');
    } catch (err) {
      showErrorToast("Couldn't undo", toUserMessage(err, 'Try again.'));
    }
  };

  const pullForward = (mode: 'shift' | 'stretch') => {
    if (!nextBlock) return;
    const at = hhmm(now);
    try {
      store.pullForwardDailyTimeBlock(day, nextBlock.id, at, mode, gapTriggerBlock?.id);
      showSuccessToast(mode === 'shift' ? 'Block moved to now' : 'Block extended to now', `Started early at ${formatTime12h(at)}.`);
    } catch (err) {
      showErrorToast(mode === 'shift' ? "Couldn't move block" : "Couldn't extend block", toUserMessage(err, 'Try again.'));
    }
  };

  const banner = resolved ? <ResolvedBlockBanner block={resolved} activity={resolvedActivity} theme={theme} onUndo={undo} /> : null;

  return (
    <div className="space-y-5 text-center">
      <div className="flex items-center justify-between gap-3 border-b border-overlay-subtle pb-3 text-xs">
        <span className="badge text-2xs px-2.5 py-1 bg-overlay-subtle text-content-tertiary">{status}</span>
        <StopScheduleButton onClick={onStop} />
      </div>

      {nextBlock ? (
        <div className="max-w-lg mx-auto space-y-5">
          <div className="space-y-1">
            <h3 className="section-title">{status}</h3>
            <p className="text-xs text-content-muted">
              Next block starts in <strong className="figure text-success-text">{minsUntilNext} min</strong>
            </p>
            {shown && (
              <p className="text-xs sm:text-sm text-content-muted max-w-md mx-auto pt-1">
                {shown.skipped ? getSkipContextualMessage(shownActivity) : getEarlyCompletionContextualMessage(shownActivity)}
              </p>
            )}
          </div>

          <div className="figure text-5xl sm:text-6xl text-content-primary">{formatClock(untilNext)}</div>

          {banner}

          <div className="p-4 rounded-xl border border-overlay-default text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full min-w-0">
              <ActivityTile activity={nextActivity} theme={theme} size="lg" fallbackColor="#10b981" />
              <div className="min-w-0 flex-1">
                <div className="item-name text-xs truncate">{blockTitle(nextBlock, nextActivity, 'Next block')}</div>
                <div className="text-micro text-content-muted tabular-nums">{blockRange(nextBlock)}</div>
              </div>
            </div>
            <div className="flex flex-col min-[400px]:flex-row w-full sm:w-auto gap-2 shrink-0">
              <button
                type="button"
                onClick={() => pullForward('shift')}
                title="Start now and end earlier, keeping the same length"
                className="w-full sm:w-auto min-h-10 px-3 rounded-lg text-xs font-semibold bg-overlay-subtle hover:bg-overlay-default text-content-tertiary flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowRight size={12} aria-hidden="true" />
                <span>Start now, same length</span>
              </button>
              <button
                type="button"
                onClick={() => pullForward('stretch')}
                title="Start now and keep the planned end time"
                className="w-full sm:w-auto min-h-10 px-3 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-success-text flex items-center justify-center gap-1.5 transition-colors"
              >
                <Play size={12} aria-hidden="true" />
                <span>Start now, same end</span>
              </button>
            </div>
          </div>
        </div>
      ) : hasBlocks ? (
        <div className="max-w-md mx-auto space-y-4 py-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-success-text flex items-center justify-center mx-auto">
            <CheckCircle2 size={22} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="section-title">All blocks done for today</h3>
            <p className="text-xs text-content-muted">Every block on today&apos;s schedule is completed or skipped.</p>
          </div>
          {banner}
        </div>
      ) : (
        <EmptyState
          surface={false}
          icon={CalendarDays}
          title="No blocks scheduled today"
          description="Open Time Tracker to apply a blueprint or add blocks for today."
        />
      )}
    </div>
  );
}
