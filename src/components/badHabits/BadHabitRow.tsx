import { AlertTriangle, Check, Flame, Pencil, Trash2, Undo2, X } from 'lucide-react';
import type { BadHabit, BadHabitLog } from '@/types';
import { todayKey, parseDate, calculateStreak, calculateBestStreak } from '@/lib/dates';
import { badHabitCreatedDay, getBadHabitBadDaysBefore } from '@/lib/habitPenalties';
import { ptsText } from '@/lib/leagues';
import { badHabitPenalty, badHabitResistPoints } from '@/lib/badHabitAwards';
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

/** Today's log status as the row shows it: a no-report row counts as not logged. */
export function badHabitTodayStatus(todayLog: BadHabitLog | undefined): TodayStatus {
  return todayLog?.status === 'no_report' ? undefined : todayLog?.status;
}

/**
 * The points text a bad habit shows today: what its log earned or lost, or (not logged) what
 * resisting now would earn under today's cap. Shared by the Bad habits row and the partner card.
 */
export function badHabitPointsInfo(
  habit: BadHabit,
  todayLog: BadHabitLog | undefined,
  resistRemaining: number
): { label: string; tone: string } {
  const status = badHabitTodayStatus(todayLog);
  const points = todayLog?.pointsAwardedOrDeducted ?? 0;
  // What resisting now would earn: its points, or what is left of today's cap.
  const resistNow = Math.min(badHabitResistPoints(habit), resistRemaining);
  // A slip outside the day's largest penalties (BAD_HABIT_POINTS.dailyPenaltyLimit) costs 0.
  const label = status
    ? points !== 0
      ? ptsText(points, true)
      : status === 'resisted'
        ? '0 pts, daily cap reached'
        : '0 pts, daily limit reached'
    : resistNow <= 0
      ? 'Daily cap reached'
      : ptsText(resistNow, true);
  const tone = points < 0 ? 'text-rose-theme' : (status ? points > 0 : resistNow > 0) ? 'text-brand-text' : '';
  return { label, tone };
}

/**
 * "N bad days in a row. Slipping today costs −X." Shown only while today is not logged and the
 * habit has bad days before today (the row's warning; the partner card shows the same one).
 */
export function BadHabitSlipWarning({
  habit,
  logs,
  today,
  logged,
  seasonPoints,
  className,
}: {
  habit: BadHabit;
  /** This habit's logs (every day). */
  logs: BadHabitLog[];
  today: string;
  logged: boolean;
  seasonPoints: number;
  className?: string;
}) {
  const slips = logged ? 0 : slipsInARow(habit, logs, today);
  if (slips <= 0) return null;
  return (
    <p className={cx('flex items-start gap-1 text-xs font-medium text-rose-theme', className)}>
      <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />
      <span>
        {slips} bad {slips === 1 ? 'day' : 'days'} in a row. Slipping today costs{' '}
        <span className="figure">{ptsText(-badHabitPenalty(habit, slips + 1, seasonPoints))}</span>.
      </span>
    </p>
  );
}

const DAY_ACTION_CLASS = cx('inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs', TAP_TARGET, FOCUS_RING, TRANSITION);

/** Slipped while today is not logged, Undo once it is: the row's right-hand action. */
export function BadHabitDayAction({
  name,
  logged,
  onSlip,
  onUndo,
}: {
  name: string;
  logged: boolean;
  onSlip: () => void;
  onUndo: () => void;
}) {
  return logged ? (
    <button
      type="button"
      onClick={onUndo}
      aria-label={`Undo today's log for ${name}`}
      className={cx(
        DAY_ACTION_CLASS,
        'border-overlay-default bg-bg-600 font-medium text-content-secondary hover:bg-bg-500 hover:text-content-primary'
      )}
    >
      <Undo2 size={14} aria-hidden="true" />
      <span>Undo</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={onSlip}
      aria-label={`Slipped on ${name} today`}
      className={cx(DAY_ACTION_CLASS, 'border-rose-500/40 bg-rose-500/10 font-semibold text-rose-theme hover:bg-rose-500/20')}
    >
      <X size={14} aria-hidden="true" />
      <span>Slipped</span>
    </button>
  );
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
  /** Resist points still left under today's cap. */
  resistRemaining: number;
  seasonPoints: number;
  /** Check pop class, kept by the page so it survives the move from To log to Logged. */
  popClass: string;
  onResist: () => void;
  onSlip: () => void;
  onUndo: () => void;
  onDelete: () => void;
  /** Rename (custom bad habits only; the page leaves it out for Library ones). */
  onEdit?: () => void;
}

/** One bad habit: tick, name, streak and points, the slip cost, the last seven days, slip/undo, delete. */
export function BadHabitRow({
  habit,
  logs,
  todayLog,
  today,
  resistRemaining,
  seasonPoints,
  popClass,
  onResist,
  onSlip,
  onUndo,
  onDelete,
  onEdit,
}: BadHabitRowProps) {
  const status = badHabitTodayStatus(todayLog);
  const { current, best } = resistStreaks(logs, today);
  const { label: pointsLabel, tone: pointsTone } = badHabitPointsInfo(habit, todayLog, resistRemaining);

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

            <BadHabitSlipWarning habit={habit} logs={logs} today={today} logged={Boolean(status)} seasonPoints={seasonPoints} className="mt-1.5" />

            <BadHabitHistory habit={habit} logs={logs} today={today} className="mt-2 flex sm:hidden" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <BadHabitDayAction name={habit.name} logged={Boolean(status)} onSlip={onSlip} onUndo={onUndo} />
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Rename ${habit.name}`}
                title="Rename"
                className={cx(
                  '-mr-2 rounded-lg p-2 text-content-muted hover:bg-overlay-subtle hover:text-content-secondary',
                  TAP_TARGET,
                  FOCUS_RING,
                  TRANSITION
                )}
              >
                <Pencil size={16} aria-hidden="true" />
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
