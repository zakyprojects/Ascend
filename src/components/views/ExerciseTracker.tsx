import { useState, useMemo } from 'react';
import { Activity, Dumbbell, Flame, Plus, Trash2, Calendar, Award } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { WORKOUT_POINTS, calculateWorkoutPoints, getWorkoutMultiplier } from '@/lib/pointsConfig';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { WorkoutLog } from '@/types';
import { todayKey, formatDateLong, parseDate, startOfWeek } from '@/lib/dates';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';

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
    entries.sort((a, b) => (b[1] * getUnitMultiplier(b[0])) - (a[1] * getUnitMultiplier(a[0])));
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
    return { dayLabel, points, isToday: key === today };
  });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <Activity className="text-success-text" size={26} />
            Exercise Tracker
          </h1>
          <p className="text-sm text-content-disabled mt-1">
            Log workouts, track weekly activity, and earn points (up to {WORKOUT_POINTS.dailyCap} pts/day)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTargetSessionsInput(exerciseGoal?.targetWeeklySessions || 3);
              setGoalModalOpen(true);
            }}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <span>{exerciseGoal ? `Goal: ${exerciseGoal.targetWeeklySessions}/wk` : 'Set Target Goal'}</span>
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

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-success-text shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">{dominantUnitInfo.label}</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {dominantUnitInfo.value} <span className="text-xs font-normal text-content-muted">{dominantUnitInfo.unit}</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-theme shrink-0">
            <Dumbbell size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Weekly Sessions</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {totalWeeklySessions} <span className="text-xs font-normal text-content-muted">sessions</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-hierarchy shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Points Today</div>
            <div className="text-xl font-display font-bold text-brand-text">
              {pointsEarnedToday} <span className="text-xs font-normal text-content-disabled">/ {WORKOUT_POINTS.dailyCap} pts cap</span>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title flex items-center gap-2">
            <Calendar size={18} className="text-brand-text" />
            Weekly Activity Summary
          </h2>
          <span className="text-xs text-content-disabled">Mon - Sun (Points)</span>
        </div>

        <div className="grid grid-cols-7 gap-2 items-end h-40 pt-6 pb-2 border-b border-overlay-subtle">
          {dailyPoints.map((d) => {
            const heightPercent = Math.round((d.points / maxPointsInChart) * 100);
            return (
              <div key={d.dayLabel} className="flex flex-col items-center h-full justify-end group relative">
                {/* Tooltip */}
                <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-700 text-content-secondary text-[10px] px-1.5 py-0.5 rounded border border-overlay-default pointer-events-none whitespace-nowrap z-10">
                  {d.points} pts
                </div>
                {/* Bar */}
                <div className="w-full max-w-[28px] bg-bg-700/60 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      d.isToday ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-primary-500/40 hover:bg-primary-500/60'
                    }`}
                    style={{ height: `${Math.max(d.points > 0 ? 10 : 0, heightPercent)}%` }}
                  />
                </div>
                <span className={`text-[11px] mt-2 font-medium ${d.isToday ? 'text-success-text font-bold' : 'text-content-disabled'}`}>
                  {d.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workout Logs List */}
      <div>
        <h2 className="section-title mb-3">Recent Workout Logs</h2>

        {workouts.length === 0 ? (
          <div className="card p-8 text-center">
            <Dumbbell size={32} className="mx-auto text-content-subtle mb-2" />
            <p className="text-sm font-medium text-content-muted">No workouts logged yet</p>
            <p className="text-xs text-content-disabled mt-1 mb-4">Start logging your physical activity to earn points and stay fit.</p>
            <button onClick={() => setLogModalOpen(true)} className="btn-primary mx-auto">
              Log Your First Workout
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {workouts.map((w) => (
              <div key={w.id} className="card p-3.5 flex items-center justify-between card-hover">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-success-text shrink-0">
                    <Activity size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-content-secondary">{w.type}</h3>
                    <p className="text-xs text-content-disabled">
                      {formatDateLong(w.date)} • {w.amount !== undefined && w.unit && w.unit !== 'mins' ? (
                        <span className="text-success-text font-medium">{w.amount} {w.unit}</span>
                      ) : (
                        <span className="text-content-muted">{w.amount ?? w.durationMinutes} mins</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-success-text bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    +{w.pointsAwarded} pts
                  </span>
                  <button
                    onClick={() => setDeleteModalWorkout(w)}
                    className="p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-all"
                    title="Delete Workout"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log Workout Modal */}
      <Modal open={logModalOpen} onClose={() => setLogModalOpen(false)} title="Log Workout Session">
        <form onSubmit={handleLogSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Workout Type</label>
            <select
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value)}
              className="input mb-2"
            >
              {availableWorkoutTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="Other">Custom / Other...</option>
            </select>

            {workoutType === 'Other' && (
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Enter workout name..."
                className="input"
                required
              />
            )}
          </div>

          {metricType === 'mins' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1">Metric Type</label>
                <select
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
                <label className="block text-xs font-medium text-content-muted mb-1">
                  Duration (Minutes)
                </label>
                <input
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
                <label className="block text-xs font-medium text-content-muted mb-1">Metric Type</label>
                <select
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
                <label className="block text-xs font-medium text-content-muted mb-1">
                  Amount ({metricType})
                </label>
                <input
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

          <div className="card p-3 bg-bg-800 text-xs text-content-muted flex items-center justify-between border border-overlay-subtle">
            <span>Points to earn:</span>
            <span className="font-bold text-success-text">+{previewPointsToEarn} pts</span>
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
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalWorkout}
        onClose={() => setDeleteModalWorkout(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (deleteModalWorkout) {
            await executeDelete(async () => {
              store.deleteWorkout(deleteModalWorkout.id);
              setDeleteModalWorkout(null);
            });
          }
        }}
        title="Delete Workout Log?"
        itemName={deleteModalWorkout ? `${deleteModalWorkout.type} (${deleteModalWorkout.amount && deleteModalWorkout.unit && deleteModalWorkout.unit !== 'mins' ? `${deleteModalWorkout.amount} ${deleteModalWorkout.unit}` : `${deleteModalWorkout.durationMinutes} mins`})` : ''}
        description={`Are you sure you want to delete this ${deleteModalWorkout?.type} workout log? Any points awarded (+${deleteModalWorkout?.pointsAwarded || 0} pts) will be reversed.`}
      />

      {/* Target Weekly Goal Modal */}
      <Modal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Set Weekly Exercise Target">
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
            Set a target number of workout sessions per week. If you complete fewer sessions than your target by the end of the week, a miss penalty will be applied.
          </p>
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Target Workout Sessions / Week</label>
            <input
              type="number"
              min="0"
              max="21"
              value={targetSessionsInput}
              onChange={(e) => setTargetSessionsInput(Number(e.target.value))}
              className="input"
              required
            />
            <span className="text-[11px] text-content-disabled mt-1 block">Set to 0 to disable weekly target penalty checks.</span>
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
      </Modal>
    </div>
  );
}
