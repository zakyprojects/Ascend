import { formatDurationHuman } from '@/lib/timeTracker';
import { TIME_GROUPS, type GroupMinutes } from '@/lib/timeTrackerGroups';
import { cx } from '@/components/ui/primitives/shared';

interface TimeGroupsProps {
  minutes: GroupMinutes;
  /** 'done' shows done time with planned under it (today and past days); 'planned' shows planned only. */
  show: 'done' | 'planned';
  className?: string;
}

/** Hours per group (Productive, Sleep, Rest, Other) from the shown blocks: the Time Tracker hero's last row. */
export function TimeGroups({ minutes, show, className }: TimeGroupsProps) {
  return (
    <dl className={cx('grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-0', className)} aria-label="Time by group">
      {TIME_GROUPS.map((group) => {
        const { planned, done } = minutes[group.id];
        const value = show === 'done' ? done : planned;
        return (
          <div
            key={group.id}
            className="flex min-w-0 flex-col sm:px-5 sm:first:pl-0 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-overlay-subtle"
          >
            <dt className="stat-label">{group.label}</dt>
            <dd className={cx('figure mt-1 text-lg font-medium leading-none', value > 0 ? 'text-brand-text' : 'text-content-muted')}>
              {formatDurationHuman(value)}
            </dd>
            {show === 'done' && <dd className="figure mt-0.5 text-micro text-content-muted">of {formatDurationHuman(planned)} planned</dd>}
          </div>
        );
      })}
    </dl>
  );
}
