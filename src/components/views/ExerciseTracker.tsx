import { useState, useMemo } from 'react';
import { Activity, Calendar, Dumbbell, Flame, Plus, Trash2 } from 'lucide-react';
import { AppStore, CLEAR_WORKOUTS_MAX } from '@/lib/store';
import { ledgerPointsByDay } from '@/lib/ledgerDayPoints';
import { isRetiredAppWorkoutAward } from '@/lib/workoutAwards';
import { ptsText } from '@/lib/leagues';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { WORKOUT_POINTS, calculateWorkoutPoints } from '@/lib/pointsConfig';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { WorkoutLog } from '@/types';
import { todayKey, formatDateLong, startOfWeek, formatWeekdayDate } from '@/lib/dates';
import { trustedNow } from '@/lib/clock';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, Form, Input, NumberField, PageColumns, useFormController } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';

const DEFAULT_WORKOUT_TYPES = ['Running', 'Walking', 'Push-ups', 'Weightlifting', 'Cycling', 'Yoga', 'Swimming', 'HIIT'];

type Measure = 'mins' | 'reps' | 'sets' | 'km';
const MEASURES: { id: Measure; label: string; start: number }[] = [
  { id: 'mins', label: 'Minutes', start: 30 },
  { id: 'reps', label: 'Reps', start: 30 },
  { id: 'sets', label: 'Sets', start: 5 },
  { id: 'km', label: 'Km', start: 5 },
];
const DAYS_PAGE = 7;

const measureOf = (w: WorkoutLog): Measure => {
  const u = (w.unit || 'mins').trim().toLowerCase();
  return u === 'reps' || u === 'sets' || u === 'km' ? u : 'mins';
};
const amountOf = (w: WorkoutLog): number =>
  measureOf(w) === 'mins' ? (w.amount && w.amount > 0 ? w.amount : w.durationMinutes || 0) : w.amount ?? 0;
const formatAmount = (value: number, measure: Measure): string => {
  const n = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return measure === 'mins' ? `${n} min` : `${n} ${measure}`;
};

/** Days in a row with a workout, ending today (or yesterday while today has none yet). */
function workoutStreak(workoutDays: Set<string>, today: string): number {
  const cursor = trustedNow();
  if (!workoutDays.has(today)) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (workoutDays.has(todayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function ExerciseTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [deleteModalWorkout, setDeleteModalWorkout] = useState<WorkoutLog | null>(null);
  const [workoutName, setWorkoutName] = useState('');
  const [measure, setMeasure] = useState<Measure>('mins');
  const [amount, setAmount] = useState<number>(30);
  const [daysShown, setDaysShown] = useState(DAYS_PAGE);
  const [clearOpen, setClearOpen] = useState(false);

  const workouts = store.state.workouts;
  // Day points come from the ledger, so deleting or clearing an earlier day's workout never
  // shows that day's points going down (they stay on the server).
  const pointsHistory = store.state.pointsHistory;
  const ledgerDayPoints = useMemo(() => ledgerPointsByDay(pointsHistory, 'exercise', isRetiredAppWorkoutAward), [pointsHistory]);
  const today = useLocalDayKey();

  // Newest first, then grouped by day.
  const sorted = useMemo(
    () => [...workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [workouts]
  );
  const todayWorkouts = sorted.filter((w) => w.date === today);
  const earlierDays = useMemo(() => {
    const byDay = new Map<string, WorkoutLog[]>();
    for (const w of sorted) {
      if (w.date === today) continue;
      byDay.set(w.date, [...(byDay.get(w.date) || []), w]);
    }
    return Array.from(byDay.entries());
  }, [sorted, today]);

  // Recent distinct workouts, for one-tap "log again".
  const recentWorkouts = useMemo(() => {
    const seen = new Set<string>();
    const list: WorkoutLog[] = [];
    for (const w of sorted) {
      const key = `${w.type.trim().toLowerCase()}|${measureOf(w)}`;
      if (!w.type.trim() || seen.has(key)) continue;
      seen.add(key);
      list.push(w);
      if (list.length === 6) break;
    }
    return list;
  }, [sorted]);

  const nameSuggestions = useMemo(
    () => Array.from(new Set([...recentWorkouts.map((w) => w.type.trim()), ...DEFAULT_WORKOUT_TYPES])).slice(0, 8),
    [recentWorkouts]
  );

  // This week (Mon–Sun)
  const weekStart = startOfWeek();
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayLabel, idx) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    const key = todayKey(d);
    const dayWorkouts = workouts.filter((w) => w.date === key);
    return {
      dayLabel,
      key,
      count: dayWorkouts.length,
      points: ledgerDayPoints.get(key) || 0,
      isToday: key === today,
    };
  });
  // "Clear older logs" removes everything before this week, so this week's goals keep counting.
  const weekStartKey = todayKey(weekStart);
  const olderLogCount = workouts.filter((w) => w.date < weekStartKey).length;
  const workoutsThisWeek = weekDays.reduce((sum, d) => sum + d.count, 0);
  const activeDaysThisWeek = weekDays.filter((d) => d.count > 0).length;
  const todayChartIndex = weekDays.findIndex((d) => d.isToday);
  const maxPointsInChart = Math.max(WORKOUT_POINTS.dailyCap, ...weekDays.map((d) => d.points));

  const streak = useMemo(() => workoutStreak(new Set(workouts.map((w) => w.date)), today), [workouts, today]);
  const pointsEarnedToday = todayWorkouts.reduce((sum, w) => sum + (w.pointsAwarded || 0), 0);

  // Points preview for the dialog
  const remainingCap = Math.max(0, WORKOUT_POINTS.dailyCap - pointsEarnedToday);
  const { rawPoints: previewRaw, pointsToAward: previewPoints } = calculateWorkoutPoints(measure, amount, measure === 'mins' ? amount : 0, remainingCap);

  const logForm = useUnsavedChanges(logModalOpen, { workoutName, measure, amount });
  const logIssues = useFormController();

  // Every open starts clean (or from the workout being logged again).
  const openLogModal = (from?: WorkoutLog) => {
    const m = from ? measureOf(from) : 'mins';
    setWorkoutName(from ? from.type.trim() : '');
    setMeasure(m);
    setAmount(from ? amountOf(from) || MEASURES.find((x) => x.id === m)!.start : 30);
    setLogModalOpen(true);
  };

  const pickMeasure = (next: Measure) => {
    if (next === measure) return;
    setMeasure(next);
    setAmount(MEASURES.find((m) => m.id === next)!.start);
  };

  const { isLoading: isLogging, executeFn: executeLog } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = workoutName.trim();
    if (!name) {
      logIssues.showError('Write what you did, like Running.', 'workout-name-input');
      return;
    }
    if (!(amount > 0)) {
      logIssues.showError('Enter how much you did.', 'workout-amount-input');
      return;
    }
    await executeLog(async () => {
      await store.logWorkout(name, measure === 'mins' ? amount : 0, amount, measure);
      setLogModalOpen(false);
      showSuccessToast('Workout logged', previewPoints > 0 ? ptsText(previewPoints, true) : `${name} saved.`);
    });
  };

  const renderRow = (w: WorkoutLog) => (
    <div key={w.id} className="enter-item p-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-overlay-subtle">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-success-text shrink-0">
          <Activity size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="item-name text-sm text-content-secondary truncate">{w.type}</h3>
          <p className="figure text-xs text-content-muted">{formatAmount(amountOf(w), measureOf(w))}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(w.pointsAwarded || 0) > 0 && (
          <span className="figure text-xs text-success-text whitespace-nowrap">{ptsText(w.pointsAwarded, true)}</span>
        )}
        <button
          onClick={() => setDeleteModalWorkout(w)}
          aria-label={`Delete ${w.type}, ${formatAmount(amountOf(w), measureOf(w))}`}
          title={`Delete ${w.type}, ${formatAmount(amountOf(w), measureOf(w))}`}
          className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  const deletingToday = deleteModalWorkout?.date === today;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Exercise</h1>
          <p className="page-subtitle">Log what you did today. The more you move, the more points.</p>
        </div>
        <button onClick={() => openLogModal()} className="btn-primary sm:shrink-0">
          <Plus size={18} />
          <span>Log workout</span>
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your exercise today"
          ring={{
            value: pointsEarnedToday,
            max: WORKOUT_POINTS.dailyCap,
            label: `Points today: ${pointsEarnedToday} of ${WORKOUT_POINTS.dailyCap}`,
            center: (
              <>
                {pointsEarnedToday}
                <span className="text-sm font-medium text-content-muted">/{WORKOUT_POINTS.dailyCap}</span>
              </>
            ),
            caption: 'points today',
          }}
          lead={{
            label: 'Workouts this week',
            value: <CountUp value={workoutsThisWeek} />,
            hint: `${activeDaysThisWeek} of 7 days active`,
            valueClassName: 'text-success-text',
          }}
          stats={[
            {
              label: 'Streak',
              value: <CountUp value={streak} />,
              hint: streak === 1 ? 'day in a row' : 'days in a row',
              valueClassName: 'text-brand-text',
            },
          ]}
          side={<CapMeterConnected state={store.state} capId="exercise" bare />}
        />
      </Reveal>

      <PageColumns
        stickyAside
        aside={
          <>
            <Reveal index={1} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2">
                  <Calendar size={18} className="text-brand-text" />
                  This week
                </h2>
                <span className="text-xs text-content-muted">points a day</span>
              </div>
              {/* Scaled to the daily cap so a capped day reads as a full bar. */}
              <BarChart
                data={weekDays.map((d) => ({ label: d.dayLabel, value: d.points }))}
                label={`Workout points per day this week, daily cap ${WORKOUT_POINTS.dailyCap}`}
                highlightIndex={todayChartIndex >= 0 ? todayChartIndex : undefined}
                max={maxPointsInChart}
                height={140}
                formatTooltip={(datum, i) => `${formatWeekdayDate(weekDays[i].key)}: ${ptsText(datum.value)}`}
              />
            </Reveal>
            <Disclosure title="How points work">
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  <span className="figure">{WORKOUT_POINTS.units.minsPerPoint}</span> minutes, <span className="figure">{WORKOUT_POINTS.units.repsPerPoint}</span> reps, 1 set or 1 km ={' '}
                  <span className="figure text-success-text">1 pt</span>.
                </li>
                <li>
                  Up to <span className="figure">{WORKOUT_POINTS.dailyCap}</span> pts a day. More workouts still save, without points.
                </li>
                <li>You can only log today's workouts.</li>
                <li>Deleting today's workout takes its points back. Earlier days keep their points.</li>
                <li>Deleting old logs can break your exercise streak.</li>
              </ul>
            </Disclosure>
          </>
        }
      >
        {workouts.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No workouts yet"
            description="Did a run, some push-ups or a gym session today? Log it and earn points."
            action={
              <button onClick={() => openLogModal()} className="btn-primary mx-auto">
                <Plus size={18} /> Log your first workout
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            {recentWorkouts.length > 0 && (
              <div>
                <h2 className="section-title mb-3">Log again</h2>
                <div className="flex flex-wrap gap-2">
                  {recentWorkouts.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => openLogModal(w)}
                      className="min-h-10 flex items-center gap-1.5 rounded-xl border border-overlay-subtle px-3 py-1.5 text-sm text-content-secondary hover:bg-overlay-subtle hover:border-overlay-strong transition-colors"
                    >
                      <Plus size={14} className="text-success-text" />
                      <span className="item-name">{w.type}</span>
                      <span className="figure text-xs text-content-muted">{formatAmount(amountOf(w), measureOf(w))}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="section-title mb-3 flex items-center gap-2">
                Today
                {streak > 1 && (
                  <span className="flex items-center gap-1 text-xs font-normal text-brand-text">
                    <Flame size={13} />
                    <span className="figure">{streak} days in a row</span>
                  </span>
                )}
              </h2>
              {todayWorkouts.length === 0 ? (
                <p className="card p-4 text-sm text-content-muted">Nothing logged today yet.</p>
              ) : (
                <div className="card overflow-hidden divide-y divide-overlay-subtle">{todayWorkouts.map(renderRow)}</div>
              )}
            </div>

            {earlierDays.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="section-title">Earlier</h2>
                  {olderLogCount > 0 && (
                    <button type="button" onClick={() => setClearOpen(true)} className="btn-ghost text-xs text-content-muted hover:text-rose-theme flex items-center gap-1.5 max-sm:px-2 max-sm:py-1">
                      <Trash2 size={14} /> Clear older logs
                    </button>
                  )}
                </div>
                {earlierDays.slice(0, daysShown).map(([day, list]) => {
                  const dayPoints = ledgerDayPoints.get(day) || 0;
                  return (
                    <div key={day}>
                      <div className="flex items-center justify-between mb-1.5 px-1 text-xs text-content-muted">
                        <span>{formatDateLong(day)}</span>
                        {dayPoints > 0 && <span className="figure">{ptsText(dayPoints, true)}</span>}
                      </div>
                      <div className="card overflow-hidden divide-y divide-overlay-subtle">{list.map(renderRow)}</div>
                    </div>
                  );
                })}
                {earlierDays.length > daysShown && (
                  <button type="button" onClick={() => setDaysShown((n) => n + DAYS_PAGE)} className="btn-secondary w-full">
                    Show older days
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </PageColumns>

      <Dialog
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        dirty={logForm.dirty}
        title="Log workout"
        preventClose={isLogging}
        footer={
          <>
            <button type="button" disabled={isLogging} onClick={() => logForm.confirmDiscard(() => setLogModalOpen(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="workout-log-form" disabled={isLogging} className="btn-primary">
              {isLogging ? <AscendLoadingIndicator size="sm" /> : null}
              <span>{isLogging ? 'Saving…' : 'Save workout'}</span>
            </button>
          </>
        }
      >
        <Form id="workout-log-form" onSubmit={handleLogSubmit} controller={logIssues} className="space-y-5">
          <div className="space-y-2">
            <Input
              id="workout-name-input"
              label="What did you do?"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              placeholder="e.g. Running"
              maxLength={60}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-1.5">
              {nameSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setWorkoutName(name)}
                  aria-pressed={workoutName.trim() === name}
                  className={cx(
                    'min-h-9 sm:min-h-0 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    workoutName.trim() === name
                      ? 'bg-primary-500/15 text-brand-text border-primary-500/40'
                      : 'text-content-muted border-overlay-subtle hover:border-overlay-strong hover:text-content-secondary'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div role="group" aria-labelledby="workout-measure-label">
            <p id="workout-measure-label" className="block label mb-1.5">Count it in</p>
            <div className="grid grid-cols-4 gap-2">
              {MEASURES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMeasure(m.id)}
                  aria-pressed={measure === m.id}
                  className={cx(
                    'min-h-11 rounded-xl border text-sm font-medium transition-colors',
                    measure === m.id
                      ? 'bg-primary-500/15 border-primary-500/60 text-brand-text'
                      : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            key={measure}
            id="workout-amount-input"
            label={measure === 'mins' ? 'How many minutes?' : measure === 'km' ? 'How many km?' : `How many ${measure}?`}
            decimal={measure === 'mins' || measure === 'km'}
            min={measure === 'km' ? 0.1 : 1}
            max={measure === 'mins' ? 300 : 100000}
            value={amount}
            onValueChange={setAmount}
            enterKeyHint="done"
          />

          <div className="rounded-xl p-3 text-xs text-content-muted flex items-center justify-between gap-3 border border-overlay-default">
            <span>
              {remainingCap === 0
                ? `Today's ${WORKOUT_POINTS.dailyCap} pts are reached. It still saves.`
                : previewRaw > previewPoints
                ? `Only ${ptsText(remainingCap)} left today.`
                : 'You earn'}
            </span>
            <span className="figure text-success-text shrink-0">{ptsText(previewPoints, true)}</span>
          </div>
        </Form>
      </Dialog>

      <ConfirmDeleteModal
        open={!!deleteModalWorkout}
        onClose={() => setDeleteModalWorkout(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteModalWorkout) return;
          const target = deleteModalWorkout;
          await executeDelete(async () => {
            await store.deleteWorkout(target.id);
            setDeleteModalWorkout(null);
            showSuccessToast('Workout deleted', `${target.type} removed.`, `workout_${target.id}`);
          });
        }}
        title="Delete workout?"
        itemName={deleteModalWorkout ? `${deleteModalWorkout.type} (${formatAmount(amountOf(deleteModalWorkout), measureOf(deleteModalWorkout))})` : ''}
        description={
          deletingToday
            ? "Its points come off today's total. Your exercise streak and exercise minutes may go down."
            : 'The points you earned that day stay. Your exercise streak and exercise minutes may go down.'
        }
      />

      <ConfirmDeleteModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          await executeDelete(async () => {
            await store.clearWorkoutsBefore(weekStartKey);
            setClearOpen(false);
            showSuccessToast(
              'Older logs cleared',
              olderLogCount > CLEAR_WORKOUTS_MAX
                ? `${CLEAR_WORKOUTS_MAX} cleared. Tap Clear older logs again for the rest. Your points stay.`
                : 'Your points stay as they were.',
              'workouts_cleared'
            );
          });
        }}
        title="Clear older logs?"
        itemName={
          olderLogCount > CLEAR_WORKOUTS_MAX
            ? `${CLEAR_WORKOUTS_MAX} of the ${olderLogCount} workouts before this week`
            : `${olderLogCount} ${olderLogCount === 1 ? 'workout' : 'workouts'} before this week`
        }
        description={`The points you earned stay. Your exercise streak can break, and the exercise minutes on your profile go down. This week's logs are kept.${
          olderLogCount > CLEAR_WORKOUTS_MAX ? ` Up to ${CLEAR_WORKOUTS_MAX} go at a time: tap again for the rest.` : ''
        }`}
        confirmText="Clear logs"
      />
    </div>
  );
}
