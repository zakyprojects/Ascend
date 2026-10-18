import { AlertTriangle, CheckCircle2, SkipForward } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { formatTime12h } from '@/lib/timeTracker';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/userMessage';
import { getSkipToastMessage } from '../scheduleMessages';
import { cx } from '@/components/ui/primitives/shared';
import { ActivityTile, SCHEDULE_ACTION, StopScheduleButton, blockRange, blockTitle, type Theme } from './shared';

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

  // Same layout as the live block (no inner box); red only on the badge, the timer and text accents.
  return (
    <div className="space-y-5 text-center">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-overlay-subtle pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="badge badge-rose text-2xs font-medium flex items-center gap-1.5 px-2.5 py-1">
            <AlertTriangle size={12} aria-hidden="true" />
            Block overdue
          </span>
          <span className="text-micro text-content-muted tabular-nums">{blockRange(block)}</span>
        </div>
        <StopScheduleButton onClick={onStop} />
      </div>

      <div className="space-y-2">
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 text-xs">
          <ActivityTile activity={activity} theme={theme} fallbackColor="#f43f5e" />
          <span className="item-name !text-content-secondary truncate min-w-0 max-w-full">{blockTitle(block, activity)}</span>
          <span className="text-2xs text-rose-theme tabular-nums shrink-0">Ended {formatTime12h(block.endTime)}</span>
        </div>
        <h3 className="text-2xl sm:text-4xl font-semibold leading-tight text-content-primary">This block is overdue</h3>
        <p className="text-xs sm:text-sm text-content-muted max-w-lg mx-auto break-words [overflow-wrap:anywhere]">
          Did you finish <strong className="text-error-text font-semibold">{title}</strong>?
        </p>
      </div>

      <div className="space-y-1">
        <div className="figure text-6xl sm:text-7xl text-rose-theme">00:00</div>
        <p className="text-xs text-content-muted">Paused until you mark this block done or skip it.</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={skip}
          className={cx(SCHEDULE_ACTION, 'bg-overlay-subtle text-content-muted hover:text-content-secondary hover:bg-overlay-default')}
        >
          <SkipForward size={13} aria-hidden="true" />
          <span>Skip block</span>
        </button>
        <button type="button" onClick={complete} className={cx(SCHEDULE_ACTION, 'bg-primary-600 hover:bg-primary-700 text-on-brand')}>
          <CheckCircle2 size={13} aria-hidden="true" />
          <span>Mark completed</span>
        </button>
      </div>
    </div>
  );
}
