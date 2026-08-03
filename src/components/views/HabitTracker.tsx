import { useState } from 'react';
import { Plus, Flame, Trash2, Check, Calendar, Repeat, BookMarked, Pencil, Info, AlertTriangle } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Habit, HabitFrequency } from '@/types';
import { calculateStreak, calculateBestStreak, periodKey } from '@/lib/dates';
import { PRESET_CATEGORIES, PresetHabit } from '@/lib/presets';
import { Modal } from '@/components/ui/Modal';
import { getMissPenaltyMultiplier } from '@/lib/habitPenalties';

export function HabitTracker({ store }: { store: AppStore }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'choice' | 'preset' | 'custom'>('choice');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);

  const resetModal = () => {
    setShowAdd(false);
    setAddMode('choice');
    setName('');
    setFrequency('daily');
  };

  const handleAddCustom = () => {
    if (!name.trim()) return;
    store.addCustomHabit(name.trim(), frequency);
    resetModal();
  };

  const handleAddPreset = (preset: PresetHabit) => {
    store.addPresetHabit(preset);
    resetModal();
  };

  const habits = store.state.habits;
  const todayHabits = habits.filter((h) => !store.isHabitDone(h));
  const completedToday = habits.filter((h) => store.isHabitDone(h));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100">Habit Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Build consistency, one day at a time</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddMode('choice'); }} className="btn-primary">
          <Plus size={18} />
          <span className="hidden sm:inline">New Habit</span>
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="stat-label">Total Habits</div>
          <div className="stat-value mt-1">{habits.length}</div>
        </div>
        <div className="card p-4">
          <div className="stat-label">To Do Today</div>
          <div className="stat-value mt-1 text-secondary-400">{todayHabits.length}</div>
        </div>
        <div className="card p-4">
          <div className="stat-label">Done Today</div>
          <div className="stat-value mt-1 text-primary-400">{completedToday.length}</div>
        </div>
      </div>

      {/* Missed Habit Penalty Info Banner */}
      <div className="p-3.5 bg-bg-800/90 rounded-xl border border-white/5 flex items-start gap-2.5 text-xs text-slate-400">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-slate-200">Tier-Scaled Missed Habit Penalties:</p>
          <p className="leading-relaxed">
            Missing a preset habit deducts points equal to its value (1st miss = -1x).
            For <span className="text-slate-200 font-semibold">Below Diamond tier</span> (Bronze to Platinum), penalty escalation caps at <span className="text-amber-400 font-semibold">1.5x</span>.
            For <span className="text-primary-300 font-semibold">Diamond tier and above</span>, escalation caps at <span className="text-rose-400 font-semibold">2.5x</span>.
            Completing the habit breaks the miss streak and resets the penalty to 1x!
          </p>
        </div>
      </div>
      {habits.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-bg-600 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-slate-600" />
          </div>
          <h3 className="font-display font-bold text-slate-200 text-lg">No habits yet</h3>
          <p className="text-sm text-slate-500 mt-1.5 mb-5">Browse the preset library or create your own to start building streaks.</p>
          <button onClick={() => { setShowAdd(true); setAddMode('choice'); }} className="btn-primary mx-auto">
            <Plus size={18} /> Add Your First Habit
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {todayHabits.length > 0 && (
            <div>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-secondary-500" />
                To Do
              </h2>
              <div className="space-y-2.5">
                {todayHabits.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} store={store} onDelete={() => setConfirmDelete(habit)} />
                ))}
              </div>
            </div>
          )}

          {completedToday.length > 0 && (
            <div>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                Completed Today
              </h2>
              <div className="space-y-2.5">
                {completedToday.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} store={store} onDelete={() => setConfirmDelete(habit)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add habit modal */}
      <Modal open={showAdd} onClose={resetModal} title="Add Habit" maxWidth="max-w-lg">
        {addMode === 'choice' && (
          <div className="space-y-3">
            <button
              onClick={() => setAddMode('preset')}
              className="card p-4 card-hover w-full flex items-center gap-3 text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
                <BookMarked size={22} className="text-primary-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-bold text-slate-100">Browse Preset Habits</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose from a curated library. Preset habits earn points.</p>
              </div>
            </button>
            <button
              onClick={() => setAddMode('custom')}
              className="card p-4 card-hover w-full flex items-center gap-3 text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-bg-600 flex items-center justify-center shrink-0">
                <Pencil size={22} className="text-slate-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-bold text-slate-100">Create Custom Habit</h3>
                <p className="text-xs text-slate-500 mt-0.5">Track personal goals. Custom habits don't earn points.</p>
              </div>
            </button>
          </div>
        )}

        {addMode === 'preset' && (
          <div className="space-y-4">
            <button onClick={() => setAddMode('choice')} className="btn-ghost text-xs mb-1">
              ← Back
            </button>
            {PRESET_CATEGORIES.map((category) => (
              <div key={category.name}>
                <h3 className="text-sm font-display font-bold text-slate-300 mb-2">{category.name}</h3>
                <div className="space-y-1.5">
                  {category.habits.map((preset) => {
                    const alreadyAdded = habits.some((h) => h.name === preset.name && h.isPreset);
                    return (
                      <button
                        key={preset.name}
                        onClick={() => !alreadyAdded && handleAddPreset(preset)}
                        disabled={alreadyAdded}
                        className={`card p-3 card-hover w-full flex items-center gap-3 text-left ${
                          alreadyAdded ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-200">{preset.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">
                              {preset.frequency === 'daily' ? 'Daily' : 'Weekly'}
                            </span>
                            <span className="text-xs text-primary-400">+{preset.points} pts</span>
                          </div>
                        </div>
                        {alreadyAdded ? (
                          <Check size={16} className="text-primary-400 shrink-0" />
                        ) : (
                          <Plus size={16} className="text-slate-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {addMode === 'custom' && (
          <div className="space-y-4">
            <button onClick={() => setAddMode('choice')} className="btn-ghost text-xs mb-1">
              ← Back
            </button>
            <div>
              <label className="label">Habit Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                placeholder="e.g. Call my mom"
                className="input"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Frequency</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFrequency('daily')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    frequency === 'daily'
                      ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
                      : 'bg-bg-700 text-slate-400 border border-white/5'
                  }`}
                >
                  <Calendar size={16} /> Daily
                </button>
                <button
                  onClick={() => setFrequency('weekly')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    frequency === 'weekly'
                      ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
                      : 'bg-bg-700 text-slate-400 border border-white/5'
                  }`}
                >
                  <Repeat size={16} /> Weekly
                </button>
              </div>
            </div>
            {/* No-points notice */}
            <div className="card bg-bg-700 p-3 flex items-start gap-2 border-l-2 border-slate-600">
              <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Custom habits help you track personal goals but <span className="text-slate-300 font-medium">don't earn points</span>.
                Only preset habits from the library award points. This keeps the points system fair.
              </p>
            </div>
            <button onClick={handleAddCustom} className="btn-secondary w-full">
              Create Custom Habit
            </button>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Habit">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Are you sure you want to delete <span className="text-slate-200 font-medium">{confirmDelete?.name}</span>? This will remove all its streak history.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              onClick={() => {
                if (confirmDelete) store.deleteHabit(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="btn-danger flex-1"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function HabitCard({ habit, store, onDelete }: { habit: Habit; store: AppStore; onDelete: () => void }) {
  const done = store.isHabitDone(habit);
  const streak = calculateStreak(habit.completions, habit.frequency);
  const bestStreak = calculateBestStreak(habit.completions, habit.frequency);

  return (
    <div className={`card p-4 card-hover group ${done ? 'opacity-75' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => store.toggleHabit(habit.id)}
          className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90 ${
            done
              ? 'bg-primary-500 text-white'
              : 'bg-bg-600 text-slate-500 hover:bg-bg-500 hover:text-slate-300 border border-white/5'
          }`}
        >
          <Check size={22} className={done ? 'animate-scale-in' : ''} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium truncate ${done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
              {habit.name}
            </h3>
            <span className="badge bg-bg-600 text-slate-400 shrink-0">
              {habit.frequency === 'daily' ? 'Daily' : 'Weekly'}
            </span>
            {!habit.isPreset && (
              <span className="badge bg-slate-700/50 text-slate-500 shrink-0">
                Custom
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Flame size={13} className="text-secondary-500" />
                <span className="text-secondary-400 font-medium">{streak} day{streak !== 1 ? 's' : ''}</span>
              </div>
            )}
            {bestStreak > 0 && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Best: {bestStreak}</span>
              </div>
            )}
            {habit.isPreset ? (
              <div className="text-xs text-primary-400">+{habit.points} pts</div>
            ) : (
              <div className="text-xs text-slate-600">No points</div>
            )}
          </div>

          {/* Consecutive Miss Penalty Warning */}
          {habit.isPreset && (habit.consecutiveMisses ?? 0) > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 w-fit font-medium">
              <AlertTriangle size={11} className="shrink-0" />
              <span>
                {habit.consecutiveMisses} consecutive miss{(habit.consecutiveMisses ?? 0) > 1 ? 'es' : ''} (Next miss = {getMissPenaltyMultiplier((habit.consecutiveMisses ?? 0) + 1, store.state.totalPoints)}x penalty)
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onDelete}
          className="shrink-0 p-2 rounded-lg text-slate-600 hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
