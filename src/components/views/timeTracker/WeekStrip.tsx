import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TimeTrackerState } from '@/types';
import { addDays, parseDate, startOfWeek, todayKey } from '@/lib/dates';
import { calculateTimeTrackerDailyPoints, TIME_TRACKER_POINTS } from '@/lib/pointsConfig';
import { plannedBlocksForDate } from '@/lib/timeTracker';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';

interface WeekStripProps {
  timeTracker: TimeTrackerState;
  today: string;
  selectedDateKey: string;
  onSelect: (dateKey: string) => void;
}

const shortDate = (dateKey: string) => parseDate(dateKey)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? dateKey;

/**
 * The week around the selected day as seven tappable days: a tick on a day whose blocks reached
 * the top points tier, a line under a day that has a plan. Arrows move a week.
 */
export function WeekStrip({ timeTracker, today, selectedDateKey, onSelect }: WeekStripProps) {
  const monday = todayKey(startOfWeek(parseDate(selectedDateKey) ?? undefined));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const arrow = cx(
    'flex shrink-0 items-center justify-center rounded-xl border border-overlay-subtle p-2 text-content-muted transition-colors hover:bg-overlay-subtle hover:text-content-primary',
    TAP_TARGET
  );

  return (
    <nav className="space-y-2" aria-label="Choose day" data-no-swipe="">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSelect(addDays(selectedDateKey, -7))} className={arrow} aria-label="Previous week">
          <ChevronLeft size={16} />
        </button>
        <span className="figure min-w-0 flex-1 text-center text-sm text-content-secondary sm:flex-none sm:px-2">
          {shortDate(days[0])} – {shortDate(days[6])}
        </span>
        <button type="button" onClick={() => onSelect(addDays(selectedDateKey, 7))} className={arrow} aria-label="Next week">
          <ChevronRight size={16} />
        </button>
        {selectedDateKey !== today && (
          <button type="button" onClick={() => onSelect(today)} className="btn-secondary px-3 py-1.5 text-xs">
            Today
          </button>
        )}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {days.map((dateKey) => {
          const date = parseDate(dateKey);
          const { blocks, source } = plannedBlocksForDate(timeTracker, dateKey, today);
          const reachedTop =
            source === 'saved' &&
            dateKey <= today &&
            blocks.length > 0 &&
            calculateTimeTrackerDailyPoints(blocks).percentage >= TIME_TRACKER_POINTS.tiers.high.minPercent;
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === today;
          const weekday = date?.toLocaleDateString('en-US', { weekday: 'short' }) ?? '';
          const label = `${date?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) ?? dateKey}${isToday ? ', today' : ''}${reachedTop ? ', top score' : blocks.length > 0 ? `, ${blocks.length} blocks` : ''}`;
          return (
            <li key={dateKey} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(dateKey)}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={label}
                className={cx(
                  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 py-1.5 transition-colors',
                  isSelected
                    ? 'border-primary-500/50 bg-primary-500/10 text-content-primary'
                    : 'border-transparent text-content-muted hover:bg-overlay-subtle hover:text-content-secondary'
                )}
              >
                <span className={cx('text-2xs', isToday ? 'font-semibold text-brand-text' : undefined)}>{weekday}</span>
                <span className="figure text-sm font-medium leading-none">{date?.getDate()}</span>
                <span className="flex h-3 items-center" aria-hidden="true">
                  {reachedTop ? (
                    <Check size={11} className="text-brand-text" />
                  ) : blocks.length > 0 ? (
                    <span className={cx('h-0.5 w-3 rounded-full', source === 'saved' ? 'bg-content-muted' : 'bg-overlay-strong')} />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
