import { useMemo, useState } from 'react';
import { byCreatedAsc } from '@/lib/listOrder';
import { ListChecks, Plus } from 'lucide-react';
import { AppStore, runningPactsLinkedTo } from '@/lib/store';
import { pactUnlinkNote } from '@/lib/pactLifecycle';
import { Habit } from '@/types';
import { getNow, weekKey, formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { getEffectiveSeasonPoints } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { actionFeedback } from '@/lib/actionFeedback';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { HowItWorksButton, HowItWorksDialog, useHowItWorks } from '@/components/ui/HowItWorks';
import { habitsGuide } from '@/components/howItWorks/habits';
import { PageHero } from '@/components/ui/PageHero';
import { EmptyState, PageColumns } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { dailyHabitCompletions, lastDayKeys } from '@/lib/weeklyActivity';
import { HabitRow } from '@/components/habits/HabitRow';
import { AddHabitDialog } from '@/components/habits/AddHabitDialog';
import { isReadingLinked } from '@/components/habits/HabitCheck';

import { RenameDialog } from '@/components/ui/RenameDialog';
import { canRenameHabit, habitNameProblem, HABIT_NAME_MAX, HABIT_PACT_RENAME_MESSAGE } from '@/lib/itemEdits';
const WEEK_DAYS = 7;

export function HabitTracker({ store }: { store: AppStore }) {
  const guide = useHowItWorks();
  const { showSuccessToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  // Habits ticked here: their check pops even though the row moves from To do to Done (remounts).
  // Rename (custom habits only). The habit stays set while the dialog closes.
  const [renameTarget, setRenameTarget] = useState<Habit | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [popIds, setPopIds] = useState<ReadonlySet<string>>(() => new Set());
  // Re-render at local midnight (and a new week), so rows never show yesterday's state.
  const today = useLocalDayKey();

  // Oldest first on every device (the state array's order depends on the device).
  const habits = useMemo(() => [...store.state.habits].sort(byCreatedAsc), [store.state.habits]);
  const isDone = (h: Habit) => store.isHabitDone(h);
  const toDo = habits.filter((h) => !isDone(h));
  const done = habits.filter(isDone);
  const hasDailyHabits = habits.some((h) => h.frequency === 'daily');
  // Read once for every row's miss cost (the same value as the season league's points).
  const seasonPoints = getEffectiveSeasonPoints(store.state, leagueNow());

  const weekDays = useMemo(
    () => dailyHabitCompletions(habits, lastDayKeys(WEEK_DAYS, today)),
    [habits, today]
  );
  const activeDays = weekDays.filter((d) => d.done > 0).length;

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

  const toggle = (habit: Habit) => {
    if (isReadingLinked(habit)) return;
    const wasDone = isDone(habit);
    setPopIds((prev) => {
      const next = new Set(prev);
      if (wasDone) next.delete(habit.id);
      else next.add(habit.id);
      return next;
    });
    if (!wasDone) actionFeedback('tick');
    store.toggleHabit(habit.id);
  };

  const renderRow = (habit: Habit) => {
    const habitDone = isDone(habit);
    return (
      <HabitRow
        key={habit.id}
        habit={habit}
        done={habitDone}
        seasonPoints={seasonPoints}
        popClass={habitDone && popIds.has(habit.id) ? 'animate-pop' : ''}
        onToggle={() => toggle(habit)}
        onDelete={() => setConfirmDelete(habit)}
      />
    );
  };

  const deleteDescription = (habit: Habit | null): string => {
        onEdit={
          canRenameHabit(habit)
            ? () => {
                setRenameTarget(habit);
                setRenameOpen(true);
              }
            : undefined
        }
    if (!habit) return '';
    const earns = habit.points > 0 && !isReadingLinked(habit);
    const points = earns
      ? " Only today's points from it are removed; earlier points and penalties stay."
      : ' It earns no points, so your points stay the same.';
    const goals =
      linkedGoalsCount > 0
        ? ` ${linkedGoalsCount} linked weekly goal${linkedGoalsCount > 1 ? 's' : ''} for this week and later go too.`
        : '';
    const pacts = pactUnlinkNote(runningPactsLinkedTo(store.state, habit));
    return `This removes its history and streak.${points}${goals}${pacts}`;
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Habits</h1>
          <p className="page-subtitle">Build consistency, one day at a time.</p>
          <HowItWorksButton onClick={guide.show} />
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="btn-primary sm:shrink-0">
          <Plus size={18} aria-hidden="true" />
          <span>New habit</span>
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Today's habits"
          ring={{
            value: done.length,
            max: habits.length,
            label: `Habits done: ${done.length} of ${habits.length}`,
            center: (
              <>
                {done.length}
                <span className="text-sm font-medium text-content-muted">/{habits.length}</span>
              </>
            ),
            caption: 'done',
          }}
          lead={{
            label: 'To do',
            value: <CountUp value={toDo.length} />,
            valueClassName: 'text-brand-text',
            hint:
              habits.length === 0
                ? 'Add a habit to start.'
                : toDo.length === 0
                  ? 'All clear for today.'
                  : undefined,
          }}
          stats={[
            { label: 'Habits', value: <CountUp value={habits.length} /> },
            ...(hasDailyHabits
              ? [{ label: 'Last 7 days', value: <><CountUp value={activeDays} />/{WEEK_DAYS}</>, hint: 'active days' }]
              : []),
          ]}
          side={<CapMeterConnected state={store.state} capId="presetHabits" bare onExplain={guide.showPoints} />}
        />
      </Reveal>

      <PageColumns
        stickyAside
        aside={hasDailyHabits && <WeekConsistencyCard days={weekDays} activeDays={activeDays} />}
      >
        {habits.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No habits yet"
            description="Pick from the library or create your own."
            action={
              <button type="button" onClick={() => setShowAdd(true)} className="btn-primary mx-auto">
                <Plus size={18} aria-hidden="true" /> Add a habit
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            {toDo.length > 0 && (
              <section aria-labelledby="habits-todo">
                <h2 id="habits-todo" className="section-title mb-3">
                  To do <span className="figure font-normal text-content-muted">· {toDo.length}</span>
                </h2>
                <div className="space-y-2.5">{toDo.map(renderRow)}</div>
              </section>
            )}

            {done.length > 0 && (
              <section aria-labelledby="habits-done">
                <h2 id="habits-done" className="section-title mb-3">
                  Done <span className="figure font-normal text-content-muted">· {done.length}</span>
                </h2>
                <div className="space-y-2.5">{done.map(renderRow)}</div>
              </section>
            )}
          </div>
        )}
      </PageColumns>

      <AddHabitDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        habits={habits}
        onAddPreset={(preset) => {
          store.addPresetHabit(preset);
          showSuccessToast('Habit added', preset.name, `habit_add_${preset.name}`);
        }}
        onAddCustom={(name, frequency) => {
          store.addCustomHabit(name, frequency);
          showSuccessToast('Habit added', name);
        }}
      />

      <ConfirmDeleteModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await store.deleteHabit(confirmDelete.id);
            setConfirmDelete(null);
            showSuccessToast(`Deleted ${confirmDelete.name}`, undefined, `habit_${confirmDelete.id}`);
          }
        }}
        title="Delete habit?"
        itemName={confirmDelete?.name}
        description={deleteDescription(confirmDelete)}
      />
      <HowItWorksDialog open={guide.open} onClose={guide.close} guide={habitsGuide} focus={guide.focus} />
    </div>
  );
}

/** Share of daily habits done on each of the last 7 days, today highlighted. */
function WeekConsistencyCard({ days, activeDays }: { days: ReturnType<typeof dailyHabitCompletions>; activeDays: number }) {
      {renameTarget && (
        <RenameDialog
          key={renameTarget.id}
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          title="Rename habit"
          description={
            runningPactsLinkedTo(store.state, renameTarget) > 0
              ? HABIT_PACT_RENAME_MESSAGE
              : 'Its streak, history and points stay as they are.'
          }
          label="Habit name"
          initialName={renameTarget.name}
          inputId="habit-rename-input"
          maxLength={HABIT_NAME_MAX}
          validate={(name) => habitNameProblem(name, renameTarget, store.state.habits, runningPactsLinkedTo(store.state, renameTarget))}
          onSave={(name) => {
            store.renameHabit(renameTarget.id, name);
            showSuccessToast('Habit renamed', name.trim());
          }}
        />
      )}

  return (
    <div className="card flex flex-col justify-between gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="stat-label">Last 7 days</h2>
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
