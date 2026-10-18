import { PowerOff, RotateCcw } from 'lucide-react';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { formatTime12h, getActivityDisplayColor } from '@/lib/timeTracker';
import { cx, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { ActivityIcon } from '@/components/views/timeTracker/ActivityIcon';

export type Theme = 'dark' | 'light';

/** "HH:mm" of a moment, the format time blocks use. */
export const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const blockTitle = (block: TimeTrackerBlock, activity?: TimeTrackerActivity | null, fallback = 'Scheduled block'): string =>
  block.customTitle || activity?.name || fallback;

export const blockRange = (block: TimeTrackerBlock): string =>
  `${formatTime12h(block.startTime)} – ${formatTime12h(block.endTime)}`;

export function ActivityTile({
  activity,
  theme,
  size = 'sm',
  fallbackColor,
}: {
  activity?: TimeTrackerActivity | null;
  theme: Theme;
  size?: 'sm' | 'md' | 'lg';
  fallbackColor?: string;
}) {
  const color = getActivityDisplayColor(activity, theme, fallbackColor);
  const box = size === 'lg' ? 'w-10 h-10 rounded-xl' : size === 'md' ? 'w-7 h-7 rounded-lg' : 'w-5 h-5 rounded-lg';
  const icon = size === 'lg' ? 18 : size === 'md' ? 14 : 12;
  return (
    <div className={cx(box, 'flex items-center justify-center shrink-0')} style={{ backgroundColor: `${color}25`, color }} aria-hidden="true">
      <ActivityIcon iconName={activity?.icon || 'Clock'} size={icon} />
    </div>
  );
}

export function StopScheduleButton({ onClick, tone = 'neutral' }: { onClick: () => void; tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Stop following schedule"
      title="Stop following schedule"
      className={cx(
        'shrink-0 min-h-10 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors',
        tone === 'danger'
          ? 'text-error-text hover:text-content-primary hover:bg-rose-500/20'
          : 'text-content-muted hover:text-rose-theme hover:bg-rose-500/10'
      )}
    >
      <PowerOff size={14} aria-hidden="true" />
      <span className="hidden sm:inline">Stop</span>
    </button>
  );
}

/** A block finished or skipped whose time window is still running, with Undo. */
export function ResolvedBlockBanner({
  block,
  activity,
  theme,
  onUndo,
}: {
  block: TimeTrackerBlock;
  activity?: TimeTrackerActivity | null;
  theme: Theme;
  onUndo: () => void;
}) {
  return (
    <div className="p-3 px-4 rounded-xl bg-overlay-subtle border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
      <div className="flex items-center gap-3 w-full min-w-0">
        <ActivityTile activity={activity} theme={theme} size="md" fallbackColor="#10b981" />
        <div className="min-w-0 flex-1">
          <div className="item-name text-xs !text-content-secondary truncate">{blockTitle(block, activity)}</div>
          <div className="text-micro text-content-muted tabular-nums">
            {block.skipped ? 'Skipped' : 'Completed'} ({blockRange(block)})
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onUndo}
        className={cx(
          'bg-cyan-500/15 w-full sm:w-auto min-h-10 px-3 rounded-lg text-xs font-semibold text-content-primary border border-cyan-500/30 hover:bg-cyan-500/25 flex items-center justify-center gap-1.5 transition-colors shrink-0',
          TAP_TARGET_Y
        )}
      >
        <RotateCcw size={12} aria-hidden="true" />
        <span>{block.skipped ? 'Undo skip' : 'Undo completion'}</span>
      </button>
    </div>
  );
}
