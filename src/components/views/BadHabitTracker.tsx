import { useState } from 'react';
import { ShieldAlert, Flame, Plus, Trash2, CheckCircle2, XCircle, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { BadHabit } from '@/types';
import { todayKey, formatDateLong } from '@/lib/dates';
import { getMissPenaltyMultiplier } from '@/lib/habitPenalties';

export function BadHabitTracker({ store }: { store: AppStore }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [habitName, setHabitName] = useState('');

  const badHabits = store.state.badHabits;
  const badHabitLogs = store.state.badHabitLogs;
  const today = todayKey();

  // Generate last 14 days dates array
  const last14Days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last14Days.push(todayKey(d));
  }

  // Calculate stats
  const totalResisted = badHabitLogs.filter((l) => l.status === 'resisted').length;
  const totalOccurred = badHabitLogs.filter((l) => l.status === 'occurred').length;
  const totalLogs = totalResisted + totalOccurred;
  const resistRate = totalLogs > 0 ? Math.round((totalResisted / totalLogs) * 100) : 100;

  // Calculate current "Days Resisted" overall streak
  const sortedDates = [...new Set(badHabitLogs.map((l) => l.date))].sort().reverse();
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
    if (!habitName.trim()) return;
    store.addBadHabit(habitName);
    setAddModalOpen(false);
    setHabitName('');
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
            Track bad habits, build resistance streaks (+10 pts per day resisted), and enforce escalating penalties on occurrences
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
            <div className="text-xs text-slate-500">Days Resisted Streak</div>
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
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Habits Being Reduced</div>
            <div className="text-xl font-display font-bold text-rose-400">
              {badHabits.length} <span className="text-xs font-normal text-slate-400 font-sans">tracked</span>
            </div>
          </div>
        </div>
      </div>

      {/* Penalty Rule Callout */}
      <div className="card p-4 border-l-4 border-amber-500/80 bg-amber-500/5 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-amber-300">Escalating Penalty System Active:</span> Each day resisted awards <span className="font-bold text-emerald-400">+10 pts</span>. Logging an "Occurred" day deducts points using your current tier's escalating penalty rule (1x base = -10 pts, escalating up to 2.5x for repeated consecutive occurrences).
        </div>
      </div>

      {/* Bad Habits List */}
      <div>
        <h2 className="section-title mb-3">Daily Habit Status (Today: {formatDateLong(today)})</h2>

        {badHabits.length === 0 ? (
          <div className="card p-8 text-center">
            <ShieldAlert size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No bad habits defined yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Add a bad habit you want to reduce (e.g. Doomscrolling, Junk Food, Late Night Gaming) to log daily resistance.</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add a Bad Habit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {badHabits.map((bh) => {
              const todayLog = badHabitLogs.find((l) => l.badHabitId === bh.id && l.date === today);
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

              return (
                <div key={bh.id} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-200 text-base flex items-center gap-2">
                        {bh.name}
                        <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                          {habitStreak}d resisted streak
                        </span>
                      </h3>
                    </div>
                    <button
                      onClick={() => store.deleteBadHabit(bh.id)}
                      className="text-slate-600 hover:text-rose-400 p-1"
                      title="Delete Bad Habit"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Daily action buttons */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => store.logBadHabitDay(bh.id, today, 'resisted')}
                      className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                        status === 'resisted'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold shadow-lg shadow-emerald-500/10'
                          : 'bg-bg-700/80 border-white/10 text-slate-300 hover:bg-emerald-500/10 hover:border-emerald-500/40'
                      }`}
                    >
                      <CheckCircle2 size={16} className={status === 'resisted' ? 'text-emerald-400' : 'text-slate-400'} />
                      <span>Resisted Today (+10 pts)</span>
                    </button>

                    <button
                      onClick={() => store.logBadHabitDay(bh.id, today, 'occurred')}
                      className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-medium text-xs transition-all ${
                        status === 'occurred'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold shadow-lg shadow-rose-500/10'
                          : 'bg-bg-700/80 border-white/10 text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/40'
                      }`}
                    >
                      <XCircle size={16} className={status === 'occurred' ? 'text-rose-400' : 'text-slate-400'} />
                      <span>Occurred Today (Deduct Pts)</span>
                    </button>
                  </div>

                  {/* 14-day Trend Matrix */}
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-[10px] text-slate-500 mb-1 font-medium">14-Day Trend History</div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {last14Days.map((d) => {
                        const log = badHabitLogs.find((l) => l.badHabitId === bh.id && l.date === d);
                        const isResisted = log?.status === 'resisted';
                        const isOccurred = log?.status === 'occurred';

                        return (
                          <button
                            type="button"
                            key={d}
                            onClick={() => {
                              if (log) {
                                store.deleteBadHabitLog(bh.id, d);
                              }
                            }}
                            className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                              isResisted
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-pointer hover:border-rose-400'
                                : isOccurred
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 cursor-pointer hover:border-slate-400'
                                : 'bg-bg-700/50 text-slate-600 border border-white/5 cursor-default'
                            }`}
                            title={`${d}: ${isResisted ? 'Resisted (+10 pts) - Click to clear' : isOccurred ? 'Occurred - Click to clear' : 'Not Logged'}`}
                          >
                            {isResisted ? '✓' : isOccurred ? '✕' : '-'}
                          </button>
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

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Start Tracking
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
