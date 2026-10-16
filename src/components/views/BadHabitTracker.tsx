import { useState } from 'react';
import {
  Flame,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  CheckCheck,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { BadHabit } from '@/types';
import { todayKey, formatDateLong, getNow } from '@/lib/dates';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, PageColumns, ProgressBar, SlidingPill } from '@/components/ui/primitives';
import { getBadHabitSlot } from '@/lib/badHabitEligibility';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { getCapStatus } from '@/lib/capStatus';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { trustedNow } from '@/lib/clock';

export function BadHabitTracker({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [habitName, setHabitName] = useState('');
  const [durationMode, setDurationMode] = useState<'30' | '60' | '90' | 'custom'>('30');
  const [customDays, setCustomDays] = useState<number | ''>(30);
  const [durationError, setDurationError] = useState('');

  // Delete Confirmation Modal State
  const [deleteModalHabit, setDeleteModalHabit] = useState<BadHabit | null>(null);

  const badHabits = store.state.badHabits || [];
  const badHabitLogs = store.state.badHabitLogs || [];
  const today = todayKey();

  // Active vs Completed habits
  const activeHabits = badHabits
    .filter((h) => !h.isCompleted)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const completedHabits = badHabits
    .filter((h) => h.isCompleted)
    .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

  const resistCapStatus = getCapStatus(store.state, 'badHabitsResisted', getNow());
  const isResistCapped = resistCapStatus.isCapped;

  // Generate last 14 days dates array
  const last14Days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = trustedNow();
    d.setDate(d.getDate() - i);
    last14Days.push(todayKey(d));
  }

  // Calculate overall stats
  const totalResisted = badHabitLogs.filter((l) => l.status === 'resisted').length;
  const totalOccurred = badHabitLogs.filter((l) => l.status === 'occurred').length;
  const totalLogs = totalResisted + totalOccurred;
  const resistRate = totalLogs > 0 ? Math.round((totalResisted / totalLogs) * 100) : 100;

  // Calculate current "Days Resisted" overall streak
  let overallStreak = 0;
  let cursor = trustedNow();
  const todayStr = todayKey(cursor);
  while (true) {
    const k = todayKey(cursor);
    const logsOnDate = badHabitLogs.filter((l) => l.date === k);
    if (logsOnDate.length > 0) {
      if (logsOnDate.every((l) => l.status === 'resisted')) {
        overallStreak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    } else if (k === todayStr) {
      // Today not logged yet, check yesterday to see if active streak continues
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDurationError('');
    if (!habitName.trim()) return;

    let targetDays = 30;
    if (durationMode === '30') targetDays = 30;
    else if (durationMode === '60') targetDays = 60;
    else if (durationMode === '90') targetDays = 90;
    else if (durationMode === 'custom') {
      const parsed = Number(customDays);
      if (isNaN(parsed) || parsed < 30) {
        setDurationError('Custom duration must be at least 30 days.');
        return;
      }
      targetDays = parsed;
    }

    store.addBadHabit(habitName, targetDays);
    setAddModalOpen(false);
    setHabitName('');
    setDurationMode('30');
    setCustomDays(30);
    setDurationError('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalHabit) return;
    const habitId = deleteModalHabit.id;
    await executeWithKey(`delete_bad_habit_${habitId}`, async () => {
      await store.deleteBadHabit(habitId);
      setDeleteModalHabit(null);
      showSuccessToast('Habit deleted', 'Bad habit record removed.', `bad_habit_${habitId}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Bad Habits</h1>
          <p className="page-subtitle">Resist each day and let the streak do the work.</p>
        </div>
        <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2 sm:shrink-0">
          <Plus size={18} />
          <span>Add Bad Habit</span>
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your resist record"
          lead={{
            label: 'Resisted streak',
            value: <CountUp value={overallStreak} />,
            hint: 'consecutive days',
            valueClassName: overallStreak > 0 ? 'text-success-text' : undefined,
          }}
          stats={[
            { label: 'Success rate', value: <><CountUp value={resistRate} />%</>, hint: `${totalResisted} resisted, ${totalOccurred} occurred`, valueClassName: 'text-blue-theme' },
            { label: 'Active habits', value: <CountUp value={activeHabits.length} />, valueClassName: 'text-purple-hierarchy' },
          ]}
          side={<CapMeterConnected state={store.state} capId="badHabitsResisted" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <>
            <Disclosure title="Penalties and point cap" icon={AlertTriangle} tone="warning">
              <ul className="list-disc pl-4 space-y-0.5 text-content-muted">
                <li>
                  <span className="text-content-secondary">Daily resists and cap:</span> Only the first <span className="text-success-text font-medium"><span className="figure">{BAD_HABIT_POINTS.eligibleSlots}</span> active habits</span> (oldest first) are point-eligible. Each eligible resist earns <span className="figure text-success-text">+{BAD_HABIT_POINTS.resistBase} pts</span> (max <span className="figure">+{BAD_HABIT_POINTS.dailyCap}</span> pts/day). Other habits are tracking-only (streak only, 0 pts for resist, occurred, and missed days).
                </li>
                <li>
                  <span className="text-content-secondary">Occurred and missed-day penalties:</span> Logging Occurred or missing a day applies rank-tiered escalating penalties to <span className="text-rose-theme font-medium">point-eligible habits only</span>. Deleting an eligible habit refunds its resist points and today's Occurred penalty (earlier penalties stay); completing keeps everything. Promoting the next eligible habit recalculates today's resists. Undo is available for today's action.
                </li>
                <li>
                  <span className="text-content-secondary">Completion unlock:</span> Unlocks when resisted streak reaches <span className="figure text-brand-text">75%</span> of commitment duration. Completing keeps the points you earned.
                </li>
              </ul>
            </Disclosure>
          </>
        }
      >
        {/* Active Bad Habits List */}
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="section-title">Active bad habits</h2>
            <span className="text-xs text-content-muted">{formatDateLong(today)}</span>
          </div>

          {activeHabits.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No bad habits tracked yet"
              description="Add a habit you want to cut back on (e.g. doomscrolling, junk food, late-night gaming) and log each day you resist it."
              action={
                <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
                  Add Bad Habit
                </button>
              }
            />
          ) : (
            <div className="space-y-4">
              {activeHabits.map((bh) => {
                const todayLog = badHabitLogs
                  .filter((l) => l.badHabitId === bh.id && l.date === today)
                  .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
                const status = todayLog?.status;

                // Calculate habit-specific resisted streak
                let habitStreak = 0;
                let c = trustedNow();
                while (true) {
                  const k = todayKey(c);
                  const l = badHabitLogs.find((log) => log.badHabitId === bh.id && log.date === k);
                  if (l && l.status === 'resisted') {
                    habitStreak++;
                    c.setDate(c.getDate() - 1);
                  } else if (k === today && !l) {
                    // Today not logged yet, skip to yesterday
                    c.setDate(c.getDate() - 1);
                  } else {
                    break;
                  }
                }

                // Commitment progress
                const commitmentDays = bh.commitmentDays || 30;
                const unlockThreshold = Math.ceil(0.75 * commitmentDays);
                const isCompleteUnlocked = habitStreak >= unlockThreshold;
                const progressPercent = Math.min(100, Math.round((habitStreak / commitmentDays) * 100));
                const slotInfo = getBadHabitSlot(badHabits, bh.id);

                return (
                  <div key={bh.id} className="card enter-item p-4 space-y-4">
                    {/* Top Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-overlay-subtle pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="item-name text-base">{bh.name}</h3>
                          {slotInfo ? (
                            <span className="badge badge-emerald text-2xs">
                              Earns points (slot {slotInfo.slot}/{slotInfo.total})
                            </span>
                          ) : (
                            <span className="text-xs text-content-muted">
                              Tracking only
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-content-disabled mt-0.5">
                          Commitment: <span className="figure text-content-tertiary">{commitmentDays} days</span> • Created: {new Date(bh.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Complete Habit Button */}
                        <button
                          onClick={() => store.completeBadHabit(bh.id)}
                          disabled={!isCompleteUnlocked}
                          className={`btn text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all ${
                            isCompleteUnlocked
                              ? 'bg-emerald-500/15 text-success-text border border-emerald-500/40 hover:bg-emerald-500/25'
                              : 'text-content-disabled border border-overlay-subtle cursor-not-allowed opacity-60'
                          }`}
                          title={
                            isCompleteUnlocked
                              ? 'Streak is at 75% or more. Click to complete the habit.'
                              : `Needs a ${unlockThreshold}d streak (75% of the ${commitmentDays}d commitment) to complete.`
                          }
                        >
                          {isCompleteUnlocked ? <CheckCheck size={14} /> : <Lock size={14} />}
                          <span>Complete Habit</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeleteModalHabit(bh)}
                          aria-label="Delete bad habit"
                          className={`p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-all ${TAP_TARGET}`}
                          title="Delete bad habit (resist points and today's Occurred penalty are reversed; earlier penalties stay)"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Streak & Commitment Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-content-muted flex items-center gap-1">
                          <Flame size={14} className={habitStreak > 0 ? 'text-brand-text' : 'text-content-subtle'} />
                          <span className={`figure ${habitStreak > 0 ? 'text-brand-text' : 'text-content-secondary'}`}>{habitStreak}d</span> resisted streak
                        </span>
                        <span className="text-content-disabled">
                          {isCompleteUnlocked ? (
                            <span className="text-success-text font-medium">Complete unlocked at 75% ({habitStreak}/{commitmentDays}d)</span>
                          ) : (
                            <span>Complete unlocks at <strong className="figure text-warning-text">{unlockThreshold}d</strong> ({habitStreak}/{commitmentDays}d)</span>
                          )}
                        </span>
                      </div>

                      <ProgressBar
                        value={progressPercent}
                        label="Commitment progress"
                        tone={isCompleteUnlocked ? 'success' : 'brand'}
                        size="lg"
                        marker={{ at: 75, label: `75% unlock line (${unlockThreshold} days)` }}
                      />
                    </div>

                    {/* Daily Action & Undo Buttons */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => store.logBadHabitDay(bh.id, today, 'resisted')}
                          disabled={!!todayLog}
                          className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                            status === 'resisted'
                              ? 'bg-emerald-500/15 border-emerald-500/50 text-success-text font-semibold'
                              : todayLog
                              ? 'bg-bg-800 border-overlay-subtle text-content-subtle cursor-not-allowed opacity-60'
                              : 'border-overlay-default text-content-tertiary hover:bg-emerald-500/10 hover:border-emerald-500/40'
                          }`}
                        >
                          <CheckCircle2 size={16} className={status === 'resisted' ? 'text-success-text' : 'text-content-muted'} />
                          <span>
                            Resisted today {status === 'resisted' ? `(${todayLog?.pointsAwardedOrDeducted && todayLog.pointsAwardedOrDeducted > 0 ? `+${todayLog.pointsAwardedOrDeducted} pts` : '0 pts'})` : !slotInfo ? '(0 pts, tracking only)' : isResistCapped ? '(0 pts, cap reached)' : `(+${BAD_HABIT_POINTS.resistBase} pts)`}
                          </span>
                        </button>

                        <button
                          onClick={() => store.logBadHabitDay(bh.id, today, 'occurred')}
                          disabled={!!todayLog}
                          className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                            status === 'occurred'
                              ? 'bg-rose-500/15 border-rose-500/50 text-rose-theme font-semibold'
                              : todayLog
                              ? 'bg-bg-800 border-overlay-subtle text-content-subtle cursor-not-allowed opacity-60'
                              : 'border-overlay-default text-content-tertiary hover:bg-rose-500/10 hover:border-rose-500/40'
                          }`}
                        >
                          <XCircle size={16} className={status === 'occurred' ? 'text-rose-theme' : 'text-content-muted'} />
                          <span>{slotInfo ? 'Occurred today (deducts pts)' : 'Occurred today (tracking only)'}</span>
                        </button>
                      </div>

                      {/* Today's Log Status & Undo Bar */}
                      {todayLog && (
                        <div className="flex items-center justify-between gap-2 px-1 text-xs">
                          <span className="text-content-muted flex items-center gap-1.5">
                            <Lock size={12} className="text-content-disabled" />
                            Today's action locked ({todayLog.status === 'resisted' ? 'Resisted' : todayLog.status === 'occurred' ? 'Occurred' : 'No-report penalty'})
                            {todayLog.pointsAwardedOrDeducted !== 0 && (
                              <span className={todayLog.pointsAwardedOrDeducted > 0 ? 'figure text-success-text' : 'figure text-rose-theme'}>
                                ({todayLog.pointsAwardedOrDeducted > 0 ? `+${todayLog.pointsAwardedOrDeducted}` : todayLog.pointsAwardedOrDeducted} pts)
                              </span>
                            )}
                          </span>

                          {todayLog.status !== 'no_report' ? (
                            <button
                              onClick={() => store.undoTodayBadHabitLog(bh.id)}
                              className="text-warning-text hover:opacity-80 flex items-center gap-1 text-micro font-semibold transition-colors"
                            >
                              <RotateCcw size={12} />
                              <span>Undo today</span>
                            </button>
                          ) : (
                            <span className="text-2xs text-content-disabled italic">No-report penalties cannot be undone</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 14-day Trend Matrix */}
                    <div className="pt-2 border-t border-overlay-subtle">
                      <div className="text-2xs text-content-disabled mb-1 flex items-center justify-between">
                        <span>Last 14 days</span>
                        <span className="text-content-subtle">✓ Resisted • ✕ Occurred • ! Missed</span>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {last14Days.map((d) => {
                          const log = badHabitLogs.find((l) => l.badHabitId === bh.id && l.date === d);
                          const isResisted = log?.status === 'resisted';
                          const isOccurred = log?.status === 'occurred';
                          const isNoReport = log?.status === 'no_report';

                          return (
                            <div
                              key={d}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-bold shrink-0 transition-all ${
                                isResisted
                                  ? 'bg-emerald-500/20 text-success-text'
                                  : isOccurred
                                  ? 'bg-rose-500/20 text-rose-theme'
                                  : isNoReport
                                  ? 'bg-amber-500/20 text-warning-text'
                                  : 'bg-overlay-subtle text-content-subtle'
                              }`}
                              title={`${d}: ${
                                isResisted
                                  ? `Resisted (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                  : isOccurred
                                  ? `Occurred (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                  : isNoReport
                                  ? (log?.pointsAwardedOrDeducted ?? 0) === 0
                                    ? 'Missed, no report (0 pts, tracking only)'
                                    : `Missed, no report (${log?.pointsAwardedOrDeducted ?? 0} pts penalty)`
                                  : 'Not logged'
                              }`}
                            >
                              {isResisted ? '✓' : isOccurred ? '✕' : isNoReport ? '!' : '-'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed Bad Habits Section */}
        {completedHabits.length > 0 && (
          <div className="pt-4 space-y-3 border-t border-overlay-default">
            <h2 className="section-title text-success-text flex items-center gap-2">
              <CheckCheck size={20} />
              Completed bad habits ({completedHabits.length})
            </h2>

            <div className="space-y-3">
              {completedHabits.map((bh) => {
                const bhLogs = badHabitLogs.filter((l) => l.badHabitId === bh.id);
                const totalResistedCount = bhLogs.filter((l) => l.status === 'resisted').length;

                return (
                  <div key={bh.id} className="card p-4 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="item-name text-content-secondary text-base">{bh.name}</h3>
                        <span className="badge badge-emerald text-2xs">
                          Completed
                        </span>
                      </div>
                      <p className="text-xs text-content-muted mt-1">
                        Commitment: {bh.commitmentDays} days • Total days resisted: <strong className="figure text-success-text">{totalResistedCount} days</strong>
                      </p>
                      {bh.completedAt && (
                        <p className="text-micro text-content-disabled mt-0.5">
                          Completed on {new Date(bh.completedAt).toLocaleDateString()} (points kept)
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => setDeleteModalHabit(bh)}
                      className="btn-secondary text-xs py-1.5 px-3 text-rose-theme hover:bg-rose-500/10"
                      title="Delete permanently (points are not changed)"
                    >
                      Delete Record
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PageColumns>

      {/* Add Bad Habit Modal */}
      <Dialog open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Bad Habit">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1" htmlFor="bad-habit-name-input">Habit name</label>
            <input
              id="bad-habit-name-input"
              type="text"
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              placeholder="e.g. Doomscrolling, junk food, late-night gaming"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Commitment length</label>
            <div className="relative isolate grid grid-cols-4 gap-2 mb-2">
              <SlidingPill active={durationMode} className="rounded-xl bg-primary-500/15 border border-primary-500/40" />
              <button
                type="button"
                data-pill-id="30"
                onClick={() => setDurationMode('30')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-colors ${
                  durationMode === '30' ? 'border-transparent text-brand-text' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                data-pill-id="60"
                onClick={() => setDurationMode('60')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-colors ${
                  durationMode === '60' ? 'border-transparent text-brand-text' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                60 Days
              </button>
              <button
                type="button"
                data-pill-id="90"
                onClick={() => setDurationMode('90')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-colors ${
                  durationMode === '90' ? 'border-transparent text-brand-text' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                90 Days
              </button>
              <button
                type="button"
                data-pill-id="custom"
                onClick={() => setDurationMode('custom')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-colors ${
                  durationMode === 'custom' ? 'border-transparent text-brand-text' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                Custom
              </button>
            </div>

            {durationMode === 'custom' && (
              <div className="mt-2">
                <label className="block text-micro text-content-disabled mb-1" htmlFor="bad-habit-custom-days-input">Custom length (at least 30 days)</label>
                <input
                  id="bad-habit-custom-days-input"
                  type="number"
                  min="30"
                  value={customDays}
                  onChange={(e) => {
                    setCustomDays(e.target.value === '' ? '' : Number(e.target.value));
                    setDurationError('');
                  }}
                  className="input"
                  required
                />
              </div>
            )}

            {durationError && <p className="text-xs text-error-text mt-1">{durationError}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setAddModalOpen(false);
                setDurationError('');
              }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Start Tracking
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteModalHabit}
        onClose={() => setDeleteModalHabit(null)}
        preventClose={!!deleteModalHabit && isKeyLoading(`delete_bad_habit_${deleteModalHabit.id}`)}
        title="Delete Bad Habit?"
      >
        {deleteModalHabit && (
          <div className="space-y-4">
            {deleteModalHabit.isCompleted ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-content-secondary space-y-2">
                <p className="font-semibold text-success-text flex items-center gap-1.5">
                  <CheckCheck size={16} />
                  Completed habit
                </p>
                <p>
                  Deleting <strong className="text-content-primary">"{deleteModalHabit.name}"</strong> will permanently remove all logs and streak history.
                </p>
                <p>
                  Your points will not change.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-content-secondary space-y-2">
                <p className="font-semibold text-rose-theme flex items-center gap-1.5">
                  <AlertTriangle size={16} />
                  Earlier penalties stay
                </p>
                <p>
                  Deleting <strong className="text-content-primary">"{deleteModalHabit.name}"</strong> will permanently remove all logs and streak history.
                </p>
                <p>
                  Resist points earned by this habit are reversed and today's Occurred penalty (if any) is refunded. Earlier Occurred and missed-day penalties stay on your score.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isKeyLoading(`delete_bad_habit_${deleteModalHabit.id}`)}
                onClick={() => setDeleteModalHabit(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isKeyLoading(`delete_bad_habit_${deleteModalHabit.id}`)}
                onClick={handleConfirmDelete}
                className="btn-primary bg-rose-600 hover:bg-rose-500 flex-1 flex items-center justify-center gap-2"
              >
                {isKeyLoading(`delete_bad_habit_${deleteModalHabit.id}`) ? (
                  <>
                    <AscendLoadingIndicator size="sm" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  deleteModalHabit.isCompleted ? 'Delete Record' : 'Confirm Delete'
                )}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
