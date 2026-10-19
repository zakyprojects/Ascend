import { AlertTriangle, Check, Flame, Trash2, Undo2, X } from 'lucide-react';
import type { BadHabit, BadHabitLog } from '@/types';
import { todayKey, parseDate, calculateStreak, calculateBestStreak } from '@/lib/dates';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { badHabitCreatedDay, getBadHabitBadDaysBefore, getMissPenaltyMultiplier } from '@/lib/habitPenalties';
import { ptsText } from '@/lib/leagues';
import { lastDayKeys } from '@/lib/weeklyActivity';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { cx, FOCUS_RING, TAP_TARGET, TRANSITION } from '@/components/ui/primitives/shared';

const HISTORY_DAYS = 7;

type TodayStatus = 'resisted' | 'occurred' | undefined;

/** Days resisted in a row, ending today (or yesterday while today is not logged yet). */
function resistStreaks(logs: BadHabitLog[], today: string): { current: number; best: number } {
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  const resisted = [...byDate.keys()].filter((date) => byDate.get(date) === 'resisted');
  // A slip (or no report) logged today ends the run now; an unlogged today still counts from yesterday.
  const todayStatus = byDate.get(today);
  const current = todayStatus && todayStatus !== 'resisted' ? 0 : calculateStreak(resisted, 'daily', parseDate(today)!);
  return { current, best: Math.max(calculateBestStreak(resisted, 'daily'), current) };
}

/**
 * Slips and unlogged days in a row before today (the server's walk, getBadHabitBadDaysBefore);
 * slipping today is penalised at this count + 1.
 */
function slipsInARow(habit: BadHabit, logs: BadHabitLog[], today: string): number {
  return getBadHabitBadDaysBefore(logs, habit.id, today, badHabitCreatedDay(habit.createdAt));
}

/** What slipping today would cost: the server's formula and rounding (D-B1). */
function slipCost(slipsBefore: number, seasonPoints: number): number {
  return Math.round(BAD_HABIT_POINTS.occurBase * getMissPenaltyMultiplier(slipsBefore + 1, seasonPoints));
}

interface BadHabitCheckProps {
  name: string;
  status: TodayStatus;
  onResist: () => void;
  onUndo: () => void;
  iconClassName?: string;
}

/**
 * The bad-habit tick, built like HabitCheck: one toggle button. Not logged: "Mark … resisted
 * today". Resisted: pressed, emerald check, tap undoes. Slipped: rose cross on the same control,
 * tap undoes.
 */
export function BadHabitCheck({ name, status, onResist, onUndo, iconClassName }: BadHabitCheckProps) {
  const label = status === 'occurred' ? `${name}: slipped today, undo` : `Mark ${name} resisted today`;
  return (
    <button
      type="button"
      onClick={status ? onUndo : onResist}
      aria-pressed={status === 'occurred' ? undefined : status === 'resisted'}
      aria-label={label}
      className={cx(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
        status === 'resisted'
          ? 'border-primary-500/50 bg-primary-500 text-on-brand'
          : status === 'occurred'
            ? 'border-rose-500/40 bg-rose-500/15 text-rose-theme hover:bg-rose-500/25'
            : 'border-overlay-default bg-bg-600 text-content-muted hover:bg-bg-500 hover:text-content-secondary active:scale-90 motion-reduce:active:scale-100',
        FOCUS_RING,
        TRANSITION
      )}
    >
      {status === 'occurred' ? (
        <X size={22} aria-hidden="true" />
      ) : (
        <Check size={22} aria-hidden="true" className={iconClassName} />
      )}
    </button>
  );
}

/** The last seven days, oldest first: resisted, slipped, not logged, or before the habit existed. */
function BadHabitHistory({ habit, logs, today, className }: { habit: BadHabit; logs: BadHabitLog[]; today: string; className?: string }) {
  const createdDate = parseDate(habit.createdAt);
  const created = createdDate ? todayKey(createdDate) : '';
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  const days = lastDayKeys(HISTORY_DAYS, today).map((key) => ({
    key,
    status: byDate.get(key),
    before: Boolean(created) && key < created,
    current: key === today,
  }));
  const counted = days.filter((d) => !d.before);
  const resisted = counted.filter((d) => d.status === 'resisted').length;
  const slipped = counted.filter((d) => d.status === 'occurred').length;
  const notLogged = counted.filter((d) => !d.current && (!d.status || d.status === 'no_report')).length;
  const parts = [`${resisted} resisted`, `${slipped} slipped`, `${notLogged} not logged`];
  return (
    <div
      role="img"
      aria-label={`Last ${counted.length} ${counted.length === 1 ? 'day' : 'days'}: ${parts.join(', ')}`}
      className={cx('items-center gap-1 shrink-0', className)}
    >
      {days.map((d) =>
        d.before ? (
          <span key={d.key} className="flex h-2.5 w-2.5 items-center justify-center">
            <span className="h-px w-2 rounded-full bg-overlay-strong" />
          </span>
        ) : (
          <span
            key={d.key}
            className={cx(
              'h-2.5 w-2.5 rounded-[3px] transition-colors duration-base',
              d.status === 'resisted'
                ? 'bg-primary-500'
                : d.status === 'occurred'
                  ? 'bg-rose-500'
                  : d.current
                    ? 'bg-overlay-default ring-1 ring-inset ring-overlay-strong'
                    : 'bg-overlay-default ring-1 ring-inset ring-rose-500/50'
            )}
          />
        )
      )}
    </div>
  );
}

interface BadHabitRowProps {
  habit: BadHabit;
  /** This habit's logs (every day). */
  logs: BadHabitLog[];
  todayLog: BadHabitLog | undefined;
  today: string;
  earnsPoints: boolean;
  resistCapped: boolean;
  seasonPoints: number;
  /** Check pop class, kept by the page so it survives the move from To log to Logged. */
  popClass: string;
  onResist: () => void;
  onSlip: () => void;
  onUndo: () => void;
  onDelete: () => void;
}

/** One bad habit: tick, name, streak and points, the slip cost, the last seven days, slip/undo, delete. */
export function BadHabitRow({
  habit,
  logs,
  todayLog,
  today,
  earnsPoints,
  resistCapped,
  seasonPoints,
  popClass,
  onResist,
  onSlip,
  onUndo,
  onDelete,
}: BadHabitRowProps) {
  const status = todayLog?.status === 'no_report' ? undefined : todayLog?.status;
  const { current, best } = resistStreaks(logs, today);
  const slips = earnsPoints && !status ? slipsInARow(habit, logs, today) : 0;
  const points = todayLog?.pointsAwardedOrDeducted ?? 0;

  const pointsLabel = status
    ? points !== 0
      ? ptsText(points, true)
      : earnsPoints && status === 'resisted'
        ? '0 pts, daily cap reached'
        : 'No points'
    : !earnsPoints
      ? 'Tracking only'
      : resistCapped
        ? 'Daily cap reached'
        : ptsText(BAD_HABIT_POINTS.resistBase, true);
  const pointsTone = points < 0 ? 'text-rose-theme' : (status ? points > 0 : earnsPoints && !resistCapped) ? 'text-brand-text' : '';

  return (
    <SwipeRow
      right={
        status
          ? { label: 'Undo', icon: Undo2, tone: 'bg-bg-600 text-content-secondary', onCommit: onUndo }
          : { label: 'Resisted', icon: Check, tone: 'bg-primary-500 text-on-brand', onCommit: onResist }
      }
      left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: onDelete }}
    >
      <div className="card enter-item card-hover p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <BadHabitCheck name={habit.name} status={status} onResist={onResist} onUndo={onUndo} iconClassName={popClass} />

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start gap-3">
              <h3
                className={cx(
                  'item-name min-w-0 flex-1 break-words line-clamp-2',
                  status ? '!text-content-tertiary' : '!text-content-primary'
                )}
              >
                {habit.name}
              </h3>
              <BadHabitHistory habit={habit} logs={logs} today={today} className="mt-1.5 hidden sm:flex" />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
              {status && (
                <span className={cx('font-medium', status === 'resisted' ? 'text-success-text' : 'text-rose-theme')}>
                  {status === 'resisted' ? 'Resisted today' : 'Slipped today'}
                </span>
              )}
              {current > 0 && (
                <span className="flex items-center gap-1 text-brand-text">
                  <Flame size={13} aria-hidden="true" />
                  <span className="figure">
                    {current} {current === 1 ? 'day' : 'days'}
                  </span>
                  <span className="sr-only"> resisted in a row</span>
                </span>
              )}
              {best > 0 && <span className="figure">Best {best}</span>}
              <span className={cx('figure', pointsTone)}>{pointsLabel}</span>
            </div>

            {slips > 0 && (
              <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-rose-theme">
                <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />
                <span>
                  {slips} bad {slips === 1 ? 'day' : 'days'} in a row. Slipping today costs{' '}
                  <span className="figure">{ptsText(-slipCost(slips, seasonPoints))}</span>.
                </span>
              </p>
            )}

            <BadHabitHistory habit={habit} logs={logs} today={today} className="mt-2 flex sm:hidden" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {status ? (
              <button
                type="button"
                onClick={onUndo}
                aria-label={`Undo today's log for ${habit.name}`}
                className={cx(
                  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-overlay-default bg-bg-600 px-2.5 text-xs font-medium text-content-secondary hover:bg-bg-500 hover:text-content-primary',
                  TAP_TARGET,
                  FOCUS_RING,
                  TRANSITION
                )}
              >
                <Undo2 size={14} aria-hidden="true" />
                <span>Undo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSlip}
                aria-label={`Slipped on ${habit.name} today`}
                className={cx(
                  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-theme hover:bg-rose-500/20',
                  TAP_TARGET,
                  FOCUS_RING,
                  TRANSITION
                )}
              >
                <X size={14} aria-hidden="true" />
                <span>Slipped</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${habit.name}`}
              className={cx(
                'rounded-lg p-2 text-content-muted hover:bg-error/10 hover:text-error',
                TAP_TARGET,
                FOCUS_RING,
                TRANSITION
              )}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </SwipeRow>
  );
}
