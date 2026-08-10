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
import { BadHabit } from '@/types';
import { todayKey, formatDateLong } from '@/lib/dates';

export function BadHabitTracker({ store }: { store: AppStore }) {
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
  while (true) {
    const k = todayKey(cursor);
    const logsOnDate = badHabitLogs.filter((l) => l.date === k);
    if (logsOnDate.length > 0 && logsOnDate.every((l) => l.status === 'resisted')) {
      overallStreak++;
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

  const handleConfirmDelete = () => {
    if (!deleteModalHabit) return;
    store.deleteBadHabit(deleteModalHabit.id);
    setDeleteModalHabit(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="text-rose-400" size={26} />
            Bad Habit Reduction Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Build resistance streaks (+10 pts per day), enforce rank-tiered escalating penalties, and complete 75%+ commitments.
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
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Overall Resisted Streak</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {overallStreak} <span className="text-xs font-normal text-slate-400">consecutive days</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Resist Success Rate</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {resistRate}% <span className="text-xs font-normal text-slate-400">({totalResisted} vs {totalOccurred})</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Active Bad Habits</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {activeHabits.length} <span className="text-xs font-normal text-slate-400">({Math.min(activeHabits.length, 2)} point-eligible)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rules & System Banner Callout */}
      <div className="card p-4 border-l-4 border-amber-500/80 bg-amber-500/5 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed space-y-1">
          <div>
            <span className="font-bold text-amber-300">Escalating Penalty & Point Cap System Active:</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
            <li>
              <span className="text-slate-200">Point Eligibility:</span> Only the <span className="text-emerald-400 font-semibold">first 2 habits</span> (by creation order) earn/lose points. Slot reassigns automatically upon deletion or completion.
            </li>
            <li>
              <span className="text-slate-200">Daily Actions:</span> Resisted awards <span className="text-emerald-400">+10 pts</span>. Logging Occurred deducts points using rank-tiered escalation (capped at <span className="text-amber-300">1.5x</span> for Bronze–Platinum, <span className="text-rose-400">2.5x</span> for Diamond+). Once logged, action locks for today. Undo is available for today's action.
            </li>
            <li>
              <span className="text-slate-200">No-Report Auto-Penalty:</span> Missing a day applies an automatic <span className="text-rose-400">-5 pts base</span> penalty at local midnight/hydration (scaled by your tier multiplier), breaks streak, and escalates future penalties. Cannot be undone.
            </li>
            <li>
              <span className="text-slate-200">Completion Unlock:</span> Unlocks when resisted streak reaches <span className="text-primary-300 font-semibold">75%</span> of commitment duration. Completing preserves points earned!
            </li>
          </ul>
        </div>
      </div>

      {/* Active Bad Habits List */}
      <div>
        <h2 className="section-title mb-3">Active Bad Habits (Today: {formatDateLong(today)})</h2>

        {activeHabits.length === 0 ? (
          <div className="card p-8 text-center">
            <ShieldAlert size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No active bad habits being tracked</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Add a bad habit you want to reduce (e.g. Doomscrolling, Junk Food, Late Night Gaming) to log daily resistance.</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add a Bad Habit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeHabits.map((bh, idx) => {
              const isPointEligible = idx < 2;
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

              // Net points calculation for delete warning
              const bhLogs = badHabitLogs.filter((l) => l.badHabitId === bh.id);
              const netPoints = bhLogs.reduce((sum, l) => sum + (l.pointsAwardedOrDeducted || 0), 0);

              return (
                <div key={bh.id} className="card p-4 space-y-4">
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-100 text-base">{bh.name}</h3>
                        {isPointEligible ? (
                          <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            Point-Eligible (Slot {idx + 1}/2)
                          </span>
                        ) : (
                          <span className="badge bg-slate-700/60 text-slate-400 text-[10px] font-medium border border-white/10" title="Only first 2 habits earn/lose points">
                            Tracking Only (Point Cap Reached)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Commitment: <span className="text-slate-300 font-semibold">{commitmentDays} days</span> • Created: {new Date(bh.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Complete Habit Button */}
                      <button
                        onClick={() => store.completeBadHabit(bh.id)}
                        disabled={!isCompleteUnlocked}
                        className={`btn text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all ${
                          isCompleteUnlocked
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-bg-700/50 text-slate-500 border border-white/5 cursor-not-allowed opacity-60'
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
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Delete Bad Habit (Reverses net points)"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Streak & Commitment Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Flame size={14} className="text-emerald-400" />
                        <span className="font-bold text-slate-200">{habitStreak}d</span> resisted streak
                      </span>
                      <span className="text-slate-500">
                        {isCompleteUnlocked ? (
                          <span className="text-emerald-400 font-semibold">✓ 75%+ Complete Unlocked ({habitStreak}/{commitmentDays}d)</span>
                        ) : (
                          <span>Unlocks Complete at <strong className="text-amber-300">{unlockThreshold}d</strong> ({habitStreak}/{commitmentDays}d)</span>
                        )}
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-bg-700 rounded-full overflow-hidden relative border border-white/5">
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
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold shadow-lg shadow-emerald-500/10'
                            : todayLog
                            ? 'bg-bg-800 border-white/5 text-slate-600 cursor-not-allowed opacity-60'
                            : 'bg-bg-700/80 border-white/10 text-slate-300 hover:bg-emerald-500/10 hover:border-emerald-500/40'
                        }`}
                      >
                        <CheckCircle2 size={16} className={status === 'resisted' ? 'text-emerald-400' : 'text-slate-400'} />
                        <span>Resisted Today {isPointEligible ? '(+10 pts)' : '(0 pts)'}</span>
                      </button>

                      <button
                        onClick={() => store.logBadHabitDay(bh.id, today, 'occurred')}
                        disabled={!!todayLog}
                        className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                          status === 'occurred'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold shadow-lg shadow-rose-500/10'
                            : todayLog
                            ? 'bg-bg-800 border-white/5 text-slate-600 cursor-not-allowed opacity-60'
                            : 'bg-bg-700/80 border-white/10 text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/40'
                        }`}
                      >
                        <XCircle size={16} className={status === 'occurred' ? 'text-rose-400' : 'text-slate-400'} />
                        <span>Occurred Today {isPointEligible ? '(Deduct Pts)' : '(0 pts)'}</span>
                      </button>
                    </div>

                    {/* Today's Log Status & Undo Bar */}
                    {todayLog && (
                      <div className="flex items-center justify-between bg-bg-800/80 p-2 px-3 rounded-lg border border-white/5 text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Lock size={12} className="text-slate-500" />
                          Today's action locked ({todayLog.status === 'resisted' ? 'Resisted' : todayLog.status === 'occurred' ? 'Occurred' : 'No Report Penalty'})
                          {todayLog.pointsAwardedOrDeducted !== 0 && (
                            <span className={todayLog.pointsAwardedOrDeducted > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              ({todayLog.pointsAwardedOrDeducted > 0 ? `+${todayLog.pointsAwardedOrDeducted}` : todayLog.pointsAwardedOrDeducted} pts)
                            </span>
                          )}
                        </span>

                        {todayLog.status !== 'no_report' ? (
                          <button
                            onClick={() => store.undoTodayBadHabitLog(bh.id)}
                            className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-semibold transition-colors"
                          >
                            <RotateCcw size={12} />
                            <span>Undo Today's Action</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">No-report penalties cannot be undone</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 14-day Trend Matrix */}
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-[10px] text-slate-500 mb-1 font-medium flex items-center justify-between">
                      <span>14-Day Trend History</span>
                      <span className="text-slate-600">✓ Resisted • ✕ Occurred • ! Missed</span>
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
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : isOccurred
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                : isNoReport
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                : 'bg-bg-700/50 text-slate-600 border border-white/5'
                            }`}
                            title={`${d}: ${
                              isResisted
                                ? `Resisted (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                : isOccurred
                                ? `Occurred (${log?.pointsAwardedOrDeducted ?? 0} pts)`
                                : isNoReport
                                ? `No-Report Missed (${log?.pointsAwardedOrDeducted ?? 0} pts penalty)`
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
        <div className="pt-4 space-y-3 border-t border-white/10">
          <h2 className="section-title text-emerald-400 flex items-center gap-2">
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
                      <h3 className="font-bold text-slate-200 text-base">{bh.name}</h3>
                      <span className="badge bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                        Completed
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Commitment: {bh.commitmentDays} days • Total days resisted: <strong className="text-emerald-400">{totalResistedCount} days</strong>
                    </p>
                    {bh.completedAt && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Completed on {new Date(bh.completedAt).toLocaleDateString()} (Points earned preserved)
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setDeleteModalHabit(bh)}
                    className="btn-secondary text-xs py-1.5 px-3 text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
                    title="Delete permanently (reverses net points)"
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Bad Habit Name</label>
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Commitment Duration</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setDurationMode('30')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '30' ? 'bg-primary-500/20 border-primary-500 text-primary-300' : 'bg-bg-700/60 border-white/10 text-slate-400'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('60')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '60' ? 'bg-primary-500/20 border-primary-500 text-primary-300' : 'bg-bg-700/60 border-white/10 text-slate-400'
                }`}
              >
                60 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('90')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === '90' ? 'bg-primary-500/20 border-primary-500 text-primary-300' : 'bg-bg-700/60 border-white/10 text-slate-400'
                }`}
              >
                90 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('custom')}
                className={`py-2 text-xs rounded-xl border font-semibold transition-all ${
                  durationMode === 'custom' ? 'bg-primary-500/20 border-primary-500 text-primary-300' : 'bg-bg-700/60 border-white/10 text-slate-400'
                }`}
              >
                Custom
              </button>
            </div>

            {durationMode === 'custom' && (
              <div className="mt-2">
                <label className="block text-[11px] text-slate-500 mb-1">Custom Duration (Minimum 30 days)</label>
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

            {durationError && <p className="text-xs text-rose-400 mt-1">{durationError}</p>}
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
        {deleteModalHabit && (() => {
          const bhLogs = badHabitLogs.filter((l) => l.badHabitId === deleteModalHabit.id);
          const netPoints = bhLogs.reduce((sum, l) => sum + (l.pointsAwardedOrDeducted || 0), 0);

          return (
            <div className="space-y-4">
              {deleteModalHabit.isCompleted ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-slate-200 space-y-2">
                  <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCheck size={16} />
                    Mastered Bad Habit
                  </p>
                  <p>
                    This habit is Mastered. Deleting this record will clean up your dashboard, but you will safely keep all points earned.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-slate-200 space-y-2">
                  <p className="font-bold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle size={16} />
                    Warning: Strict Point Reversal Rule
                  </p>
                  <p>
                    Deleting <strong className="text-slate-100">"{deleteModalHabit.name}"</strong> will permanently remove all logs and streak history.
                  </p>
                  <p>
                    Current net point contribution: <strong className={netPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{netPoints >= 0 ? `+${netPoints}` : netPoints} pts</strong>.
                  </p>
                  <p className="text-slate-400 italic">
                    Deleting will reverse all {netPoints} pts from your total score so your balance is adjusted as if this habit was never created.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setDeleteModalHabit(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="button" onClick={handleConfirmDelete} className="btn-primary bg-rose-600 hover:bg-rose-500 flex-1">
                  {deleteModalHabit.isCompleted ? 'Delete Record' : 'Confirm Delete & Reverse Pts'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
