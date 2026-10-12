import { useState, useMemo } from 'react';
import { Plus, Flame, Trash2, Check, Calendar, Repeat, BookMarked, Pencil, Info, AlertTriangle, BookOpen, Lock, Undo2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Habit, HabitFrequency } from '@/types';
import { calculateStreak, calculateBestStreak, getNow, weekKey, previousPeriodKey, formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { PRESET_CATEGORIES, PresetHabit } from '@/lib/presets';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { getMissPenaltyMultiplier, getHabitConsecutiveMisses } from '@/lib/habitPenalties';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { useToast } from '@/components/ui/Toast';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, PageColumns } from '@/components/ui/primitives';
import { useCompletionPop } from '@/lib/useCompletionPop';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { dailyHabitCompletions, lastDayKeys } from '@/lib/weeklyActivity';

export function HabitTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
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

  const linkedGoalsCount = useMemo(() => {
    if (!confirmDelete) return 0;
    const currentWeekKey = weekKey(getNow());
    let count = 0;
    store.state.weeklyGoals.forEach((doc) => {
      if (doc.weekKey < currentWeekKey) return;
      doc.goals.forEach((g) => {
        if (g.linkedModule === 'habit' && g.linkedItemId === confirmDelete.id) {
          count++;
        }
      });
    });
    return count;
  }, [confirmDelete, store.state.weeklyGoals]);

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
  const hasDailyHabits = habits.some((h) => h.frequency === 'daily');

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Habit Tracker</h1>
          <p className="page-subtitle">Build consistency, one day at a time.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddMode('choice'); }} className="btn-primary sm:shrink-0">
          <Plus size={18} />
          <span>New Habit</span>
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Today's habits"
          ring={{
            value: completedToday.length,
            max: habits.length,
            label: `Habits done today: ${completedToday.length} of ${habits.length}`,
            center: (
              <>
                {completedToday.length}
                <span className="text-sm font-medium text-content-muted">/{habits.length}</span>
              </>
            ),
            caption: 'done today',
          }}
          lead={{
            label: 'To do today',
            value: <CountUp value={todayHabits.length} />,
            hint: todayHabits.length === 0 && habits.length > 0 ? 'All clear for today.' : undefined,
          }}
          stats={[{ label: 'Total habits', value: <CountUp value={habits.length} /> }]}
          side={<CapMeterConnected state={store.state} capId="presetHabits" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <>
            {hasDailyHabits && <WeekConsistencyCard habits={habits} />}

            {/* Missed Habit Penalty Info */}
            <Disclosure title="Missed habit penalties by tier">
              <p>
                Missing a preset habit deducts points equal to its value (1st miss = -1x).
                For <span className="text-content-secondary font-medium">Below Performer tier</span> (Beginner to Achiever), penalty escalation caps at <span className="figure text-content-secondary">1.5x</span>.
                For <span className="text-content-secondary font-medium">Performer tier and above</span>, escalation caps at <span className="figure text-content-secondary">2.5x</span>.
                Completing the habit breaks the miss streak and resets the penalty to 1x.
              </p>
            </Disclosure>
          </>
        }
      >
        {habits.length === 0 ? (
          <EmptyState
            title="No habits yet"
            description="Browse the preset library or create your own to start building streaks."
            action={
              <button onClick={() => { setShowAdd(true); setAddMode('choice'); }} className="btn-primary mx-auto">
                <Plus size={18} /> Add Your First Habit
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {todayHabits.length > 0 && (
              <div>
                <h2 className="section-title mb-3">
                  To do
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
                <h2 className="section-title mb-3">
                  Completed today
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
      </PageColumns>

      {/* Add habit modal */}
      <Dialog open={showAdd} onClose={resetModal} title="Add Habit" maxWidth="max-w-lg">
        {addMode === 'choice' && (
          <div className="space-y-3">
            <button
              onClick={() => setAddMode('preset')}
              className="card p-4 card-hover w-full flex items-center gap-3 text-left border-overlay-medium shadow-sm"
            >
              <BookMarked size={18} className="text-content-muted shrink-0" />
              <div className="flex-1">
                <h3 className="item-name">Browse preset habits</h3>
                <p className="text-xs text-content-disabled mt-0.5">Pick from the library. Preset habits earn points.</p>
              </div>
            </button>
            <button
              onClick={() => setAddMode('custom')}
              className="card p-4 card-hover w-full flex items-center gap-3 text-left border-overlay-medium shadow-sm"
            >
              <Pencil size={18} className="text-content-muted shrink-0" />
              <div className="flex-1">
                <h3 className="item-name">Create a custom habit</h3>
                <p className="text-xs text-content-disabled mt-0.5">Track personal goals. Custom habits don't earn points.</p>
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
                <h3 className="stat-label mb-2">{category.name}</h3>
                <div className="space-y-1.5">
                  {category.habits.map((preset) => {
                    const alreadyAdded = habits.some((h) => h.name === preset.name && h.isPreset);
                    return (
                      <button
                        key={preset.name}
                        onClick={() => !alreadyAdded && handleAddPreset(preset)}
                        disabled={alreadyAdded}
                        className={`card p-3 w-full flex items-center gap-3 text-left border-overlay-medium shadow-sm transition-all ${
                          alreadyAdded
                            ? 'opacity-70 cursor-not-allowed bg-bg-700/60'
                            : 'card-hover cursor-pointer'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="item-name text-sm text-content-secondary">{preset.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-content-disabled">
                              {preset.frequency === 'daily' ? 'Daily' : 'Weekly'}
                            </span>
                            <span className="figure text-xs text-brand-text">+{preset.points} pts</span>
                          </div>
                        </div>
                        {alreadyAdded ? (
                          <Check size={16} className="text-success-text shrink-0" />
                        ) : (
                          <Plus size={16} className="text-content-disabled shrink-0" />
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
              <label className="label" htmlFor="habit-name-input">Habit name</label>
              <input
                id="habit-name-input"
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
                      ? 'bg-overlay-default text-content-primary border border-overlay-strong'
                      : 'bg-bg-700 text-content-secondary border border-overlay-medium shadow-sm'
                  }`}
                >
                  <Calendar size={16} /> Daily
                </button>
                <button
                  onClick={() => setFrequency('weekly')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    frequency === 'weekly'
                      ? 'bg-overlay-default text-content-primary border border-overlay-strong'
                      : 'bg-bg-700 text-content-secondary border border-overlay-medium shadow-sm'
                  }`}
                >
                  <Repeat size={16} /> Weekly
                </button>
              </div>
            </div>
            {/* No-points notice */}
            <div className="rounded-xl border border-overlay-default p-3 flex items-start gap-2">
              <Info size={14} className="text-content-disabled mt-0.5 shrink-0" />
              <p className="text-xs text-content-muted leading-relaxed">
                Custom habits <span className="text-content-tertiary font-medium">don't earn points</span>.
                Only preset habits from the library do, which keeps points fair.
              </p>
            </div>
            <button onClick={handleAddCustom} className="btn-secondary w-full">
              Create Custom Habit
            </button>
          </div>
        )}
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDeleteModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await store.deleteHabit(confirmDelete.id);
            setConfirmDelete(null);
            showSuccessToast('Habit Deleted', 'Habit removed successfully.', `habit_${confirmDelete.id}`);
          }
        }}
        title="Delete Habit?"
        itemName={confirmDelete?.name}
        description={`Delete this habit? This permanently removes its history and streak.${
          linkedGoalsCount > 0
            ? ` Deleting this habit will also delete ${linkedGoalsCount} linked Weekly Goal${linkedGoalsCount > 1 ? 's' : ''} from this week and upcoming weeks (past weeks are kept).`
            : ''
        }`}
      />
    </div>
  );
}

const WEEK_DAYS = 7;

/** Share of daily habits done on each of the last 7 days, today highlighted; compact, for the stats row. */
function WeekConsistencyCard({ habits }: { habits: Habit[] }) {
  const days = useMemo(() => dailyHabitCompletions(habits, lastDayKeys(WEEK_DAYS)), [habits]);
  const activeDays = days.filter((d) => d.done > 0).length;

  return (
    <div className="card p-4 flex flex-col justify-between gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="stat-label">Last 7 days</div>
        <span className="figure text-2xs text-content-muted">
          <CountUp value={activeDays} />/{WEEK_DAYS} active
        </span>
      </div>
      <BarChart
        data={days.map((d) => ({ label: formatWeekdayShort(d.day), value: d.total > 0 ? (d.done / d.total) * 100 : 0 }))}
        max={100}
        height={36}
        highlightIndex={WEEK_DAYS - 1}
        label={`Daily habits done, last 7 days: ${activeDays} active days`}
        formatTooltip={(_, i) => {
          const d = days[i];
          const date = formatWeekdayDate(d.day);
          return d.total > 0 ? `${date}: ${d.done}/${d.total} habits` : `${date}: no daily habits`;
        }}
      />
    </div>
  );
}

const HISTORY_PERIODS = 7;

/** The habit's last seven periods (days or weeks), oldest first, current one last. */
function HabitHistory({ habit }: { habit: Habit }) {
  const unit = habit.frequency === 'daily' ? 'day' : 'week';
  const periods = Array.from({ length: HISTORY_PERIODS }, (_, i) => {
    const key = previousPeriodKey(habit.frequency, HISTORY_PERIODS - 1 - i);
    const completions = habit.completions as Habit['completions'] | string[] | undefined;
    const done = Array.isArray(completions) ? completions.includes(key) : completions?.[key]?.done === true;
    return { key, done, current: i === HISTORY_PERIODS - 1 };
  });
  const doneCount = periods.filter((p) => p.done).length;
  return (
    <div
      role="img"
      aria-label={`Done ${doneCount} of the last ${HISTORY_PERIODS} ${unit}s`}
      className="hidden sm:flex items-center gap-1 shrink-0"
    >
      {periods.map((p) => (
        <span
          key={p.key}
          className={cx(
            'h-2.5 w-2.5 rounded-[3px] transition-colors duration-base',
            p.done ? 'bg-primary-500' : 'bg-overlay-default',
            p.current && !p.done && 'ring-1 ring-inset ring-overlay-strong'
          )}
        />
      ))}
    </div>
  );
}

function HabitCard({ habit, store, onDelete }: { habit: Habit; store: AppStore; onDelete: () => void }) {
  const done = store.isHabitDone(habit);
  const streak = calculateStreak(habit.completions, habit.frequency);
  const bestStreak = calculateBestStreak(habit.completions, habit.frequency);
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const isLinked = habit.isSystemLinked || habit.linkedModule === 'reading';

  const { arm: armCompletionPop, popClass } = useCompletionPop(done);

  const handleToggle = () => {
    if (isLinked) return;
    if (!done) armCompletionPop();
    store.toggleHabit(habit.id);
  };

  return (
    <SwipeRow
      right={{
        label: done ? 'Undo' : 'Done',
        icon: done ? Undo2 : Check,
        tone: done ? 'bg-bg-600 text-content-secondary' : 'bg-primary-500 text-on-brand',
        onCommit: handleToggle,
        disabled: isLinked,
      }}
      left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: onDelete }}
    >
    <div className={`card enter-item p-4 card-hover group ${done ? 'opacity-75' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={isLinked}
          title={isLinked ? 'Automatically tracked by logging pages in Reading Hub' : undefined}
          className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isLinked ? 'cursor-default' : 'active:scale-90'
          } ${
            done
              ? 'bg-primary-500 text-on-brand'
              : isLinked
              ? 'bg-bg-600/60 text-content-subtle border border-overlay-subtle'
              : 'bg-bg-600 text-content-disabled hover:bg-bg-500 hover:text-content-tertiary border border-overlay-subtle'
          }`}
        >
          {isLinked && !done ? (
            <Lock size={18} className="text-content-disabled" />
          ) : (
            <Check size={22} className={popClass} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isLinked && (
              <BookOpen size={14} className="text-content-subtle shrink-0" />
            )}
            <h3 className={`item-name truncate ${done ? 'text-content-disabled line-through' : 'text-content-secondary'}`}>
              {habit.name}
            </h3>
            {isLinked ? (
              <span className="text-xs text-content-muted shrink-0">
                Reading Hub
              </span>
            ) : (
              <span className="text-xs text-content-muted shrink-0">
                {habit.frequency === 'daily' ? 'Daily' : 'Weekly'}
              </span>
            )}
            {!habit.isPreset && !isLinked && (
              <span className="text-xs text-content-subtle shrink-0">
                Custom
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Flame size={13} className="text-content-subtle" />
                <span className="figure text-content-secondary">{streak} day{streak !== 1 ? 's' : ''}</span>
              </div>
            )}
            {bestStreak > 0 && (
              <div className="flex items-center gap-1 text-xs text-content-disabled">
                <span className="figure">Best: {bestStreak}</span>
              </div>
            )}
            {isLinked ? (
              <div className="text-xs text-content-muted flex items-center gap-1">
                <span>Auto-synced</span>
                {habit.points === 0 ? (
                  <span className="text-content-subtle">For habit tracking, no points</span>
                ) : (
                  <span className="figure text-brand-text">+{habit.points} pts</span>
                )}
              </div>
            ) : habit.isPreset ? (
              <div className="figure text-xs text-brand-text">+{habit.points} pts</div>
            ) : (
              <div className="text-xs text-content-subtle">No points</div>
            )}
          </div>

          {/* Consecutive Miss Penalty Warning */}
          {(() => {
            const consecutiveMisses = getHabitConsecutiveMisses(habit);
            if (!habit.isPreset || consecutiveMisses <= 0) return null;
            return (
              <div className="mt-1.5 flex items-center gap-1 text-micro text-rose-theme w-fit font-medium">
                <AlertTriangle size={11} className="shrink-0" />
                <span>
                  {consecutiveMisses} consecutive miss{consecutiveMisses > 1 ? 'es' : ''} (Next miss = {getMissPenaltyMultiplier(consecutiveMisses + 1, seasonPoints)}x penalty)
                </span>
              </div>
            );
          })()}
        </div>

        <HabitHistory habit={habit} />

        <button
          onClick={onDelete}
          aria-label="Delete habit"
          className={`shrink-0 p-2 rounded-lg text-content-disabled hover:text-error hover:bg-error/10 transition-colors ${TAP_TARGET}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
    </SwipeRow>
  );
}
