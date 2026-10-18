import { AlertTriangle, CheckCircle2, SkipForward } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { formatTime12h } from '@/lib/timeTracker';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/userMessage';
import { getSkipToastMessage } from '../scheduleMessages';
import { ActivityTile, StopScheduleButton, blockRange, blockTitle, type Theme } from './shared';

/** A block whose end has passed without being marked done or skipped: the schedule waits for an answer. */
export function ScheduleOverdue({
  store,
  day,
  theme,
  block,
  activity,
  onStop,
}: {
  store: AppStore;
  day: string;
  theme: Theme;
  block: TimeTrackerBlock;
  activity?: TimeTrackerActivity | null;
  onStop: () => void;
}) {
  const { showSuccessToast, showErrorToast } = useToast();
  const title = blockTitle(block, activity, 'this block');

  const complete = () => {
    try {
      store.toggleDailyTimeBlockCompleted(day, block.id);
      showSuccessToast('Block completed', 'Marked as completed.');
    } catch (err) {
      showErrorToast("Couldn't complete block", toUserMessage(err, 'Try again.'));
    }
  };
  const skip = () => {
    try {
      store.markDailyTimeBlockSkipped(day, block.id);
      const toast = getSkipToastMessage(activity);
      showSuccessToast(toast.title, toast.subtitle);
    } catch (err) {
      showErrorToast("Couldn't skip block", toUserMessage(err, 'Try again.'));
    }
  };

  return (
    <div className="rounded-xl border border-rose-500/40 p-4 sm:p-6 text-center space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-rose-500/20 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="badge bg-rose-500/15 text-error-text border border-rose-500/30 text-2xs font-medium flex items-center gap-1.5 px-2.5 py-1">
            <AlertTriangle size={12} aria-hidden="true" />
            Block overdue
          </span>
          <span className="text-micro text-content-muted tabular-nums">{blockRange(block)}</span>
        </div>
        <StopScheduleButton onClick={onStop} tone="danger" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl sm:text-2xl font-semibold leading-tight text-content-primary">This block is overdue</h3>
        <p className="text-sm text-content-tertiary max-w-lg mx-auto break-words [overflow-wrap:anywhere]">
          Did you finish <strong className="text-error-text font-semibold">{title}</strong>?
        </p>
        <div className="inline-flex max-w-full items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs">
          <ActivityTile activity={activity} theme={theme} fallbackColor="#f43f5e" />
          <span className="item-name !text-content-secondary truncate">{blockTitle(block, activity)}</span>
          <span className="text-2xs text-rose-theme tabular-nums shrink-0">Ended {formatTime12h(block.endTime)}</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="figure text-5xl sm:text-7xl text-rose-theme">00:00</div>
        <p className="text-xs text-content-muted">Paused until you mark this block done or skip it.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
        <button type="button" onClick={complete} className="btn-primary w-full sm:flex-1 min-h-11">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>Mark completed</span>
        </button>
        <button type="button" onClick={skip} className="btn-secondary w-full sm:w-auto min-h-11">
          <SkipForward size={16} aria-hidden="true" />
          <span>Skip block</span>
        </button>
      </div>
    </div>
  );
}
