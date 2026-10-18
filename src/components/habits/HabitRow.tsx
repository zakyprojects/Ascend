import { AlertTriangle, Check, Flame, Trash2, Undo2 } from 'lucide-react';
import type { Habit } from '@/types';
import { calculateBestStreak, calculateStreak, periodKey, previousPeriodKey } from '@/lib/dates';
import { getHabitConsecutiveMisses, getMissPenaltyMultiplier } from '@/lib/habitPenalties';
import { ptsText } from '@/lib/leagues';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { cx, FOCUS_RING, TAP_TARGET, TRANSITION } from '@/components/ui/primitives/shared';
import { HabitCheck, isReadingLinked } from './HabitCheck';

const HISTORY_PERIODS = 7;

type Completions = Habit['completions'] | string[] | undefined;

/** Legacy accounts stored completions as an array of keys; every reader accepts both. */
function completionOf(habit: Habit, key: string): { done: boolean; pointsAwarded?: number } {
  const completions = habit.completions as Completions;
  if (Array.isArray(completions)) return { done: completions.includes(key) };
  const c = completions?.[key];
  return { done: c?.done === true, pointsAwarded: c?.pointsAwarded };
}

/**
 * The habit's last seven periods (days or weeks), oldest first, current one last. Periods before
 * the habit existed are faint dashes and are not counted.
 */
function HabitHistory({ habit, className }: { habit: Habit; className?: string }) {
  const unit = habit.frequency === 'daily' ? 'day' : 'week';
  const created = habit.createdAtPeriod || '';
  const periods = Array.from({ length: HISTORY_PERIODS }, (_, i) => {
    const key = previousPeriodKey(habit.frequency, HISTORY_PERIODS - 1 - i);
    return { key, done: completionOf(habit, key).done, current: i === HISTORY_PERIODS - 1, before: !!created && key < created };
  });
  const counted = periods.filter((p) => !p.before);
  const doneCount = counted.filter((p) => p.done).length;
  return (
    <div
      role="img"
      aria-label={`Done ${doneCount} of the last ${counted.length} ${counted.length === 1 ? unit : `${unit}s`}`}
      className={cx('items-center gap-1 shrink-0', className)}
    >
      {periods.map((p) =>
        p.before ? (
          <span key={p.key} className="flex h-2.5 w-2.5 items-center justify-center">
            <span className="h-px w-2 rounded-full bg-overlay-strong" />
          </span>
        ) : (
          <span
            key={p.key}
            className={cx(
              'h-2.5 w-2.5 rounded-[3px] transition-colors duration-base',
              p.done ? 'bg-primary-500' : 'bg-overlay-default',
              p.current && !p.done && 'ring-1 ring-inset ring-overlay-strong'
            )}
          />
        )
      )}
    </div>
  );
}

interface HabitRowProps {
  habit: Habit;
  done: boolean;
  /** Season points for the miss multiplier (read once by the page, not per row). */
  seasonPoints: number;
  /** Check pop class, kept by the page so it survives the move from To do to Done. */
  popClass: string;
  onToggle: () => void;
  onDelete: () => void;
}

/** One habit: tick, name, streak and points, the miss cost, the last seven periods, delete. */
export function HabitRow({ habit, done, seasonPoints, popClass, onToggle, onDelete }: HabitRowProps) {
  const linked = isReadingLinked(habit);
  const weekly = habit.frequency === 'weekly';
  const unit = weekly ? 'week' : 'day';
  const streak = calculateStreak(habit.completions, habit.frequency);
  const best = calculateBestStreak(habit.completions, habit.frequency);
  const current = completionOf(habit, periodKey(habit.frequency));
  // Exactly the server's penalty filter: preset habits that earn points (never the Reading habit).
  const penalised = habit.isPreset && habit.points > 0 && !linked;
  const misses = penalised && !done ? getHabitConsecutiveMisses(habit) : 0;
  // Same formula and rounding as the server's penalty for the next missed period.
  const missCost = misses > 0 ? Math.round(habit.points * getMissPenaltyMultiplier(misses + 1, seasonPoints)) : 0;

  const pointsLabel = linked
    ? habit.points > 0
      ? `Tracked by Reading Hub, ${ptsText(habit.points, true)}`
      : 'Tracked by Reading Hub, no points'
    : !habit.isPreset
      ? 'No points'
      : done && current.pointsAwarded === 0 && habit.points > 0
        ? '0 pts, daily cap reached'
        : ptsText(habit.points, true);
  const earns = !linked && habit.isPreset && habit.points > 0 && !(done && current.pointsAwarded === 0);

  return (
    <SwipeRow
      right={{
        label: done ? 'Undo' : 'Done',
        icon: done ? Undo2 : Check,
        tone: done ? 'bg-bg-600 text-content-secondary' : 'bg-primary-500 text-on-brand',
        onCommit: onToggle,
        disabled: linked,
      }}
      left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: onDelete }}
    >
      <div className="card enter-item card-hover p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <HabitCheck habit={habit} done={done} onToggle={onToggle} iconClassName={popClass} />

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start gap-3">
              <h3
                className={cx(
                  'item-name min-w-0 flex-1 break-words line-clamp-2',
                  done ? '!text-content-tertiary line-through decoration-overlay-strong' : '!text-content-primary'
                )}
              >
                {habit.name}
              </h3>
              <HabitHistory habit={habit} className="mt-1.5 hidden sm:flex" />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
              {streak > 0 && (
                <span className="flex items-center gap-1 text-brand-text">
                  <Flame size={13} aria-hidden="true" />
                  <span className="figure">
                    {streak} {streak === 1 ? unit : `${unit}s`}
                  </span>
                  <span className="sr-only"> streak</span>
                </span>
              )}
              {best > 0 && <span className="figure">Best {best}</span>}
              <span className={cx('figure', earns && 'text-brand-text')}>{pointsLabel}</span>
              {weekly && <span>{done ? 'Done this week' : 'Due this week'}</span>}
              {!habit.isPreset && !linked && <span>Custom</span>}
            </div>

            {misses > 0 && (
              <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-rose-theme">
                <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />
                <span>
                  {misses === 1 ? `Missed ${weekly ? 'last week' : 'yesterday'}.` : `Missed ${misses} ${unit}s in a row.`} Missing{' '}
                  {weekly ? 'this week' : 'today'} costs{' '}
                  <span className="figure">{ptsText(-missCost)}</span>.
                </span>
              </p>
            )}

            <HabitHistory habit={habit} className="mt-2 flex sm:hidden" />
          </div>

          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${habit.name}`}
            className={cx(
              'shrink-0 rounded-lg p-2 text-content-muted hover:bg-error/10 hover:text-error',
              TAP_TARGET,
              FOCUS_RING,
              TRANSITION
            )}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </SwipeRow>
  );
}
