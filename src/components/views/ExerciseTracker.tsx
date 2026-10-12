import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { WORKOUT_POINTS, calculateWorkoutPoints } from '@/lib/pointsConfig';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { WorkoutLog } from '@/types';
import { todayKey, formatDateLong, parseDate, startOfWeek, formatWeekdayDate } from '@/lib/dates';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, EmptyState, PageColumns } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { AutoNum, CountUp, Reveal } from '@/components/ui/Motion';

const DEFAULT_WORKOUT_TYPES = [
  'Running',
  'Cycling',
  'Weightlifting',
  'HIIT',
  'Yoga',
  'Swimming',
  'Walking',
  'Boxing',
  'Pilates',
];

export function ExerciseTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [deleteModalWorkout, setDeleteModalWorkout] = useState<WorkoutLog | null>(null);
  const [workoutType, setWorkoutType] = useState('Running');
  const [customType, setCustomType] = useState('');
  const [metricType, setMetricType] = useState<string>('mins');
  const [amount, setAmount] = useState<number>(30);
  const [duration, setDuration] = useState(30);

  const availableWorkoutTypes = useMemo(() => {
    const fromHistory = (store.state.workouts || [])
      .map((w) => (w.type || '').trim())
      .filter((t) => Boolean(t) && t !== 'Other');
    return Array.from(new Set([...fromHistory, ...DEFAULT_WORKOUT_TYPES]));
  }, [store.state.workouts]);

  const exerciseGoal = store.state.exerciseGoal;
  const [targetSessionsInput, setTargetSessionsInput] = useState<number>(exerciseGoal?.targetWeeklySessions || 3);

  const workouts = store.state.workouts;
  const today = todayKey();

  // Compute stats for current week
  const startOfWeekDate = startOfWeek();

  const thisWeekWorkouts = workouts.filter((w) => (parseDate(w.date) || new Date(0)) >= startOfWeekDate);
  const totalWeeklySessions = thisWeekWorkouts.length;

  // Dynamic weekly stats computation: group by unit, find dominant unit
  const weeklyUnitTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const w of thisWeekWorkouts) {
      const u = (w.unit || 'mins').trim().toLowerCase();
      const val = typeof w.amount === 'number' && !isNaN(w.amount)
        ? w.amount
        : (w.durationMinutes || 0);
      totals[u] = (totals[u] || 0) + val;
    }
    return totals;
  }, [thisWeekWorkouts]);

  const dominantUnitInfo = useMemo(() => {
    const entries = Object.entries(weeklyUnitTotals);
    if (entries.length === 0) {
      return { label: "This Week's Minutes", value: 0, unit: 'mins' };
    }
    entries.sort((a, b) => {
      const ptsB = calculateWorkoutPoints(b[0], b[1], b[1], 9999).rawPoints;
      const ptsA = calculateWorkoutPoints(a[0], a[1], a[1], 9999).rawPoints;
      return ptsB - ptsA;
    });
    const [bestUnit, bestAmount] = entries[0];
    const unitTitle = bestUnit.charAt(0).toUpperCase() + bestUnit.slice(1);
    const displayAmount = Number.isInteger(bestAmount) ? bestAmount : Math.round(bestAmount * 100) / 100;
    return {
      label: `This Week's ${unitTitle}`,
      value: displayAmount,
      unit: bestUnit,
    };
  }, [weeklyUnitTotals]);

  // Build daily breakdown for Mon - Sun (7 days) plotting points
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyPoints = daysOfWeek.map((dayLabel, idx) => {
    const d = new Date(startOfWeekDate);
    d.setDate(startOfWeekDate.getDate() + idx);
    const key = todayKey(d);
    const points = workouts
      .filter((w) => w.date === key)
      .reduce((sum, w) => sum + (w.pointsAwarded || 0), 0);
    return { dayLabel, key, points, isToday: key === today };
  });
  const todayChartIndex = dailyPoints.findIndex((d) => d.isToday);

  const maxPointsInChart = Math.max(WORKOUT_POINTS.dailyCap, ...dailyPoints.map((d) => d.points));

  // Daily points earned today
  const pointsEarnedToday = workouts
    .filter((w) => w.date === today)
    .reduce((sum, w) => sum + (w.pointsAwarded || 0), 0);

  // Dynamic preview points calculation for the modal
  const effectiveInputValue = metricType === 'mins' ? duration : amount;
  const remainingCap = Math.max(0, WORKOUT_POINTS.dailyCap - pointsEarnedToday);
  const { pointsToAward: previewPointsToEarn } = calculateWorkoutPoints(
    metricType,
    effectiveInputValue,
    effectiveInputValue,
    remainingCap
  );

  const { isLoading: isLogging, executeFn: executeLog } = useAsyncAction();
  const { isLoading: isSavingGoal, executeFn: executeGoalSave } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalType = workoutType === 'Other' ? customType : workoutType;
    if (!finalType.trim()) return;

    if (metricType === 'mins') {
      if (duration <= 0) return;
    } else {
      if (amount <= 0) return;
    }

    const finalAmount = metricType === 'mins' ? Number(duration) : Number(amount);
    const finalDuration = metricType === 'mins' ? Number(duration) : 0;

    await executeLog(async () => {
      await store.logWorkout(finalType, finalDuration, finalAmount, metricType);
      setLogModalOpen(false);
      setCustomType('');
      setDuration(30);
      setAmount(30);
      setMetricType('mins');
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Exercise</h1>
          <p className="page-subtitle">Log workouts and keep your weekly rhythm.</p>
        </div>
        <div className="page-header-actions">
          <button
            onClick={() => {
              setTargetSessionsInput(exerciseGoal?.targetWeeklySessions || 3);
              setGoalModalOpen(true);
            }}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <span>{exerciseGoal ? `Goal: ${exerciseGoal.targetWeeklySessions}/wk` : 'Set Weekly Goal'}</span>
          </button>
          <button
            onClick={() => setLogModalOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            <span>Log Workout</span>
          </button>
        </div>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your training this week"
          ring={
            exerciseGoal
              ? {
                  value: totalWeeklySessions,
                  max: exerciseGoal.targetWeeklySessions,
                  label: `Weekly sessions: ${totalWeeklySessions} of ${exerciseGoal.targetWeeklySessions}`,
                  center: (
                    <>
                      {totalWeeklySessions}
                      <span className="text-sm font-medium text-content-muted">/{exerciseGoal.targetWeeklySessions}</span>
                    </>
                  ),
                  caption: 'weekly goal',
                }
              : undefined
          }
          lead={{
            label: dominantUnitInfo.label,
            value: <AutoNum text={String(dominantUnitInfo.value)} />,
            hint: dominantUnitInfo.unit,
          }}
          stats={[
            { label: 'Sessions this week', value: <CountUp value={totalWeeklySessions} /> },
            { label: 'Points today', value: <CountUp value={pointsEarnedToday} />, hint: `of ${WORKOUT_POINTS.dailyCap} a day` },
          ]}
          side={<CapMeterConnected state={store.state} capId="exercise" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <>
            {/* Weekly Activity Chart */}
            <Reveal index={1} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">
                  This week
                </h2>
                <span className="text-xs text-content-disabled">Mon–Sun, points</span>
              </div>

              {/* Scaled to the daily cap so a capped day reads as a full bar. */}
              <BarChart
                data={dailyPoints.map((d) => ({ label: d.dayLabel, value: d.points }))}
                label={`Workout points per day this week, daily cap ${WORKOUT_POINTS.dailyCap}`}
                highlightIndex={todayChartIndex >= 0 ? todayChartIndex : undefined}
                max={maxPointsInChart}
                height={140}
                formatTooltip={(datum, i) => `${formatWeekdayDate(dailyPoints[i].key)}: ${datum.value} pts`}
              />
            </Reveal>
          </>
        }
      >
        {/* Workout Logs List */}
        <div>
          <h2 className="section-title mb-3">Recent workouts</h2>

          {workouts.length === 0 ? (
            <EmptyState
              title="No workouts logged yet"
              description="Log a workout to start earning points."
              action={
                <button onClick={() => setLogModalOpen(true)} className="btn-primary mx-auto">
                  Log Your First Workout
                </button>
              }
            />
          ) : (
            <div className="card overflow-hidden divide-y divide-overlay-subtle">
              {workouts.map((w) => (
                <div key={w.id} className="enter-item p-3.5 flex items-center justify-between transition-colors hover:bg-overlay-subtle">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="item-name text-sm text-content-secondary">{w.type}</h3>
                      <p className="text-xs text-content-disabled">
                        {formatDateLong(w.date)} • {w.amount !== undefined && w.unit && w.unit !== 'mins' ? (
                          <span className="figure text-content-muted">{w.amount} {w.unit}</span>
                        ) : (
                          <span className="figure text-content-muted">{w.amount ?? w.durationMinutes} mins</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="figure text-xs text-success-text">
                      +{w.pointsAwarded} pts
                    </span>
                    <button
                      onClick={() => setDeleteModalWorkout(w)}
                      aria-label="Delete workout"
                      className={`p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-all ${TAP_TARGET}`}
                      title="Delete workout"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageColumns>

      {/* Log Workout Modal */}
      <Dialog open={logModalOpen} onClose={() => setLogModalOpen(false)} title="Log Workout">
        <form onSubmit={handleLogSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="workout-type-select">Workout type</label>
            <select
              id="workout-type-select"
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value)}
              className="input mb-2"
            >
              {availableWorkoutTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="Other">Other…</option>
            </select>

            {workoutType === 'Other' && (
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Workout name"
                className="input"
                required
              />
            )}
          </div>

          {metricType === 'mins' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="workout-metric-type">Measure</label>
                <select
                  id="workout-metric-type"
                  value={metricType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMetricType(val);
                    if (val === 'mins') setDuration(30);
                    else if (val === 'reps') setAmount(30);
                    else if (val === 'sets') setAmount(5);
                    else if (val === 'km') setAmount(5);
                  }}
                  className="input w-full"
                >
                  <option value="mins">Minutes (mins)</option>
                  <option value="reps">Reps (repetitions)</option>
                  <option value="sets">Sets</option>
                  <option value="km">Distance (km)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="workout-duration-input">
                  Duration (minutes)
                </label>
                <input
                  id="workout-duration-input"
                  type="number"
                  step="any"
                  min="1"
                  max="300"
                  value={duration}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDuration(val);
                  }}
                  className="input w-full"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="workout-metric-type">Measure</label>
                <select
                  id="workout-metric-type"
                  value={metricType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMetricType(val);
                    if (val === 'mins') setDuration(30);
                    else if (val === 'reps') setAmount(30);
                    else if (val === 'sets') setAmount(5);
                    else if (val === 'km') setAmount(5);
                  }}
                  className="input w-full"
                >
                  <option value="mins">Minutes (mins)</option>
                  <option value="reps">Reps (repetitions)</option>
                  <option value="sets">Sets</option>
                  <option value="km">Distance (km)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="workout-amount-input">
                  Amount ({metricType})
                </label>
                <input
                  id="workout-amount-input"
                  type="number"
                  step="any"
                  min="0.1"
                  max="100000"
                  value={amount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAmount(val);
                  }}
                  placeholder={metricType === 'reps' ? 'e.g. 30' : metricType === 'km' ? 'e.g. 5' : 'Amount'}
                  className="input w-full"
                  required
                />
              </div>
            </div>
          )}

          <div className="rounded-xl p-3 text-xs text-content-muted flex items-center justify-between border border-overlay-default">
            <span>Points to earn:</span>
            <span className="figure text-success-text">+{previewPointsToEarn} pts</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setLogModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isLogging} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isLogging ? <AscendLoadingIndicator size="sm" /> : null}
              <span>{isLogging ? 'Saving...' : 'Save Workout'}</span>
            </button>
          </div>
        </form>
      </Dialog>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalWorkout}
        onClose={() => setDeleteModalWorkout(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (deleteModalWorkout) {
            await executeDelete(async () => {
              await store.deleteWorkout(deleteModalWorkout.id);
              setDeleteModalWorkout(null);
              showSuccessToast('Workout Deleted', 'Workout removed successfully.', `workout_${deleteModalWorkout.id}`);
            });
          }
        }}
        title="Delete Workout Log?"
        itemName={deleteModalWorkout ? `${deleteModalWorkout.type} (${deleteModalWorkout.amount && deleteModalWorkout.unit && deleteModalWorkout.unit !== 'mins' ? `${deleteModalWorkout.amount} ${deleteModalWorkout.unit}` : `${deleteModalWorkout.durationMinutes} mins`})` : ''}
        description={`Delete this ${deleteModalWorkout?.type} workout? Any points awarded (+${deleteModalWorkout?.pointsAwarded || 0} pts) will be reversed.`}
      />

      {/* Target Weekly Goal Modal */}
      <Dialog open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Set Weekly Goal">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await executeGoalSave(async () => {
              store.setExerciseGoal(targetSessionsInput);
              setGoalModalOpen(false);
            });
          }}
          className="space-y-4"
        >
          <p className="text-xs text-content-muted">
            Set how many workouts you aim for each week. Finishing the week below your target applies a miss penalty.
          </p>
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="target-sessions-input">Workouts per week</label>
            <input
              id="target-sessions-input"
              type="number"
              min="0"
              max="21"
              value={targetSessionsInput}
              onChange={(e) => setTargetSessionsInput(Number(e.target.value))}
              className="input"
              required
            />
            <span className="text-micro text-content-disabled mt-1 block">Set to 0 to turn off the weekly penalty.</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setGoalModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isSavingGoal} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSavingGoal ? <AscendLoadingIndicator size="sm" /> : null}
              <span>{isSavingGoal ? 'Saving...' : 'Save Goal'}</span>
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
