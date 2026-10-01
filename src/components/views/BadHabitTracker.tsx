import { useState } from 'react';
import {
  ShieldAlert,
  Flame,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  CheckCheck,
  Award,
  Lock,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { BadHabit } from '@/types';
import { todayKey, formatDateLong, getNow } from '@/lib/dates';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { getBadHabitSlot } from '@/lib/badHabitEligibility';
import { getCapStatus } from '@/lib/capStatus';

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
    const d = new Date();
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
  let cursor = new Date();
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
      store.deleteBadHabit(habitId);
      setDeleteModalHabit(null);
      showSuccessToast('Habit Deleted', 'Bad habit record removed.', `bad_habit_${habitId}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <ShieldAlert className="text-rose-theme" size={26} />
            Bad Habit Reduction Tracker
          </h1>
          <p className="text-sm text-content-disabled mt-1">
            Earn points on your first {BAD_HABIT_POINTS.eligibleSlots} active habits (+{BAD_HABIT_POINTS.resistBase} per resist, max +{BAD_HABIT_POINTS.dailyCap}/day), enforce rank-tiered escalating penalties on those habits, and complete 75%+ commitments.
          </p>
        </div>
        <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span>Add Bad Habit</span>
        </button>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-success-text shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Overall Resisted Streak</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {overallStreak} <span className="text-xs font-normal text-content-muted">consecutive days</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-theme shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Resist Success Rate</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {resistRate}% <span className="text-xs font-normal text-content-muted">({totalResisted} vs {totalOccurred})</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-hierarchy shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Active Bad Habits</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {activeHabits.length}
            </div>
          </div>
        </div>
      </div>

      <CapMeterConnected state={store.state} capId="badHabitsResisted" />

        <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-500/5 flex items-start gap-3">
        <AlertTriangle size={20} className="text-warning-text shrink-0 mt-0.5" />
        <div className="text-xs text-content-tertiary leading-relaxed space-y-1">
          <div>
            <span className="font-bold text-warning-text">Escalating Penalty & Point Cap System Active:</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-content-muted">
            <li>
              <span className="text-content-secondary">Daily Resists & Cap:</span> Only the first <span className="text-success-text font-semibold">{BAD_HABIT_POINTS.eligibleSlots} active habits</span> (oldest first) are point-eligible. Each eligible resist earns <span className="text-success-text font-semibold">+{BAD_HABIT_POINTS.resistBase} pts</span> (max +{BAD_HABIT_POINTS.dailyCap} pts/day). Other habits are tracking-only (streak only, 0 pts for resist, occurred, and missed days).
            </li>
            <li>
              <span className="text-content-secondary">Occurred & Miss Penalties:</span> Logging Occurred or missing a day applies rank-tiered escalating penalties to <span className="text-rose-theme font-semibold">point-eligible habits only</span>. Deleting an eligible habit refunds its resist points and today's Occurred penalty (earlier penalties stay); completing keeps everything. Promoting the next eligible habit recalculates today's resists. Undo is available for today's action.
            </li>
            <li>
              <span className="text-content-secondary">Completion Unlock:</span> Unlocks when resisted streak reaches <span className="text-brand-text font-semibold">75%</span> of commitment duration. Completing preserves points earned!
            </li>
          </ul>
        </div>
      </div>

      {/* Active Bad Habits List */}
      <div>
        <h2 className="section-title mb-3">Active Bad Habits (Today: {formatDateLong(today)})</h2>

        {activeHabits.length === 0 ? (
          <div className="card p-8 text-center">
            <ShieldAlert size={32} className="mx-auto text-content-subtle mb-2" />
            <p className="text-sm font-medium text-content-muted">No active bad habits being tracked</p>
            <p className="text-xs text-content-disabled mt-1 mb-4">Add a bad habit you want to reduce (e.g. Doomscrolling, Junk Food, Late Night Gaming) to log daily resistance.</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add a Bad Habit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeHabits.map((bh) => {
              const todayLog = badHabitLogs
                .filter((l) => l.badHabitId === bh.id && l.date === today)
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
              const status = todayLog?.status;

              // Calculate habit-specific resisted streak
              let habitStreak = 0;
              let c = new Date();
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
                <div key={bh.id} className="card p-4 space-y-4">
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-overlay-subtle pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-content-primary text-base">{bh.name}</h3>
                        {slotInfo ? (
                          <span className="text-[10px] bg-emerald-500/15 text-success-text border border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                            Point-Eligible (Slot {slotInfo.slot}/{slotInfo.total})
                          </span>
                        ) : (
                          <span className="text-[10px] bg-bg-700 text-content-muted border border-overlay-subtle px-2 py-0.5 rounded font-semibold">
                            Tracking Only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-content-disabled mt-0.5">
                        Commitment: <span className="text-content-tertiary font-semibold">{commitmentDays} days</span> • Created: {new Date(bh.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Complete Habit Button */}
                      <button
                        onClick={() => store.completeBadHabit(bh.id)}
                        disabled={!isCompleteUnlocked}
                        className={`btn text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all ${
                          isCompleteUnlocked
                            ? 'bg-emerald-500/20 text-success-text border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-bg-700/50 text-content-disabled border border-overlay-subtle cursor-not-allowed opacity-60'
                        }`}
                        title={
                          isCompleteUnlocked
                            ? 'Streak reached 75%+ threshold! Click to complete habit.'
                            : `Requires ${unlockThreshold}d streak (75% of ${commitmentDays}d commitment) to unlock complete.`
                        }
                      >
                        {isCompleteUnlocked ? <CheckCheck size={14} /> : <Lock size={14} />}
                        <span>Complete Habit</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setDeleteModalHabit(bh)}
                        className="p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-all"
                        title="Delete Bad Habit (resist points and today's Occurred penalty are reversed; earlier penalties stay)"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Streak & Commitment Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-content-muted flex items-center gap-1">
                        <Flame size={14} className="text-success-text" />
                        <span className="font-bold text-content-secondary">{habitStreak}d</span> resisted streak
                      </span>
                      <span className="text-content-disabled">
                        {isCompleteUnlocked ? (
                          <span className="text-success-text font-semibold">✓ 75%+ Complete Unlocked ({habitStreak}/{commitmentDays}d)</span>
                        ) : (
                          <span>Unlocks Complete at <strong className="text-warning-text">{unlockThreshold}d</strong> ({habitStreak}/{commitmentDays}d)</span>
                        )}
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-bg-700 rounded-full overflow-hidden relative border border-overlay-subtle">
                      {/* 75% Threshold Marker Line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400/70 z-10"
                        style={{ left: '75%' }}
                        title={`75% unlock line (${unlockThreshold} days)`}
                      />
                      {/* Progress Fill */}
                      <div
                        className={`h-full transition-all duration-500 ${
                          isCompleteUnlocked
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-primary-600 to-primary-400'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Daily Action & Undo Buttons */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => store.logBadHabitDay(bh.id, today, 'resisted')}
                        disabled={!!todayLog}
                        className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                          status === 'resisted'
                            ? 'bg-emerald-500/20 border-emerald-500 text-success-text font-bold shadow-lg shadow-emerald-500/10'
                            : todayLog
                            ? 'bg-bg-800 border-overlay-subtle text-content-subtle cursor-not-allowed opacity-60'
                            : 'bg-bg-700/80 border-overlay-default text-content-tertiary hover:bg-emerald-500/10 hover:border-emerald-500/40'
                        }`}
                      >
                        <CheckCircle2 size={16} className={status === 'resisted' ? 'text-success-text' : 'text-content-muted'} />
                        <span>
                          Resisted Today {status === 'resisted' ? `(${todayLog?.pointsAwardedOrDeducted && todayLog.pointsAwardedOrDeducted > 0 ? `+${todayLog.pointsAwardedOrDeducted} pts` : '0 pts'})` : !slotInfo ? '(0 pts, Tracking Only)' : isResistCapped ? '(0 pts, Cap Reached)' : `(+${BAD_HABIT_POINTS.resistBase} pts)`}
                        </span>
                      </button>

                      <button
                        onClick={() => store.logBadHabitDay(bh.id, today, 'occurred')}
                        disabled={!!todayLog}
                        className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                          status === 'occurred'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-theme font-bold shadow-lg shadow-rose-500/10'
                            : todayLog
                            ? 'bg-bg-800 border-overlay-subtle text-content-subtle cursor-not-allowed opacity-60'
                            : 'bg-bg-700/80 border-overlay-default text-content-tertiary hover:bg-rose-500/10 hover:border-rose-500/40'
                        }`}
                      >
                        <XCircle size={16} className={status === 'occurred' ? 'text-rose-theme' : 'text-content-muted'} />
                        <span>{slotInfo ? 'Occurred Today (Deduct Pts)' : 'Occurred Today (Tracking Only)'}</span>
                      </button>
                    </div>

                    {/* Today's Log Status & Undo Bar */}
                    {todayLog && (
                      <div className="flex items-center justify-between bg-bg-800/80 p-2 px-3 rounded-lg border border-overlay-subtle text-xs">
                        <span className="text-content-muted flex items-center gap-1.5">
                          <Lock size={12} className="text-content-disabled" />
                          Today's action locked ({todayLog.status === 'resisted' ? 'Resisted' : todayLog.status === 'occurred' ? 'Occurred' : 'No Report Penalty'})
                          {todayLog.pointsAwardedOrDeducted !== 0 && (
                            <span className={todayLog.pointsAwardedOrDeducted > 0 ? 'text-success-text font-bold' : 'text-rose-theme font-bold'}>
                              ({todayLog.pointsAwardedOrDeducted > 0 ? `+${todayLog.pointsAwardedOrDeducted}` : todayLog.pointsAwardedOrDeducted} pts)
                            </span>
                          )}
                        </span>

                        {todayLog.status !== 'no_report' ? (
                          <button
                            onClick={() => store.undoTodayBadHabitLog(bh.id)}
                            className="text-warning-text hover:opacity-80 flex items-center gap-1 text-[11px] font-semibold transition-colors"
                          >
                            <RotateCcw size={12} />
                            <span>Undo Today's Action</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-content-disabled italic">No-report penalties cannot be undone</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 14-day Trend Matrix */}
                  <div className="pt-2 border-t border-overlay-subtle">
                    <div className="text-[10px] text-content-disabled mb-1 font-medium flex items-center justify-between">
                      <span>14-Day Trend History</span>
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
                            className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                              isResisted
                                ? 'bg-emerald-500/20 text-success-text border border-emerald-500/40'
                                : isOccurred
                                ? 'bg-rose-500/20 text-rose-theme border border-rose-500/40'
                                : isNoReport
                                ? 'bg-amber-500/20 text-warning-text border border-amber-500/40'
                                : 'bg-bg-700/50 text-content-subtle border border-overlay-subtle'
                            }`}
                            title={`${d}: ${
                              isResisted
                                ? `Resisted (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                : isOccurred
                                ? `Occurred (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                : isNoReport
                                ? (log?.pointsAwardedOrDeducted ?? 0) === 0
                                  ? 'No-Report Missed (0 pts, tracking only)'
                                  : `No-Report Missed (${log?.pointsAwardedOrDeducted ?? 0} pts penalty)`
                                : 'Not Logged'
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
            Completed Bad Habits ({completedHabits.length})
          </h2>

          <div className="space-y-3">
            {completedHabits.map((bh) => {
              const bhLogs = badHabitLogs.filter((l) => l.badHabitId === bh.id);
              const totalResistedCount = bhLogs.filter((l) => l.status === 'resisted').length;

              return (
                <div key={bh.id} className="card p-4 bg-bg-800/60 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-content-secondary text-base">{bh.name}</h3>
                      <span className="badge bg-emerald-500/20 text-success-text text-[10px] font-bold">
                        Completed
                      </span>
                    </div>
                    <p className="text-xs text-content-muted mt-1">
                      Commitment: {bh.commitmentDays} days • Total days resisted: <strong className="text-success-text">{totalResistedCount} days</strong>
                    </p>
                    {bh.completedAt && (
                      <p className="text-[11px] text-content-disabled mt-0.5">
                        Completed on {new Date(bh.completedAt).toLocaleDateString()} (Points earned preserved)
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setDeleteModalHabit(bh)}
                    className="btn-secondary text-xs py-1.5 px-3 text-rose-theme hover:bg-rose-500/10 border-rose-500/20"
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

      {/* Add Bad Habit Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Bad Habit to Reduce">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Bad Habit Name</label>
            <input
              type="text"
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              placeholder="e.g. Doomscrolling, Junk Food, Late Night Gaming"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Commitment Duration</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setDurationMode('30')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '30' ? 'bg-primary-500/20 border-primary-500 text-brand-text ring-1 ring-primary-500/40 shadow-sm' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('60')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '60' ? 'bg-primary-500/20 border-primary-500 text-brand-text ring-1 ring-primary-500/40 shadow-sm' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                60 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('90')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '90' ? 'bg-primary-500/20 border-primary-500 text-brand-text ring-1 ring-primary-500/40 shadow-sm' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                90 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('custom')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === 'custom' ? 'bg-primary-500/20 border-primary-500 text-brand-text ring-1 ring-primary-500/40 shadow-sm' : 'bg-bg-700 border-overlay-medium text-content-muted shadow-sm hover:bg-bg-600'
                }`}
              >
                Custom
              </button>
            </div>

            {durationMode === 'custom' && (
              <div className="mt-2">
                <label className="block text-[11px] text-content-disabled mb-1">Custom Duration (Minimum 30 days)</label>
                <input
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
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteModalHabit} onClose={() => setDeleteModalHabit(null)} title="Delete Bad Habit?">
        {deleteModalHabit && (
          <div className="space-y-4">
            {deleteModalHabit.isCompleted ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-content-secondary space-y-2">
                <p className="font-bold text-success-text flex items-center gap-1.5">
                  <CheckCheck size={16} />
                  Mastered Bad Habit
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
                <p className="font-bold text-rose-theme flex items-center gap-1.5">
                  <AlertTriangle size={16} />
                  Warning: Earlier Penalties Stay
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
      </Modal>
    </div>
  );
}
