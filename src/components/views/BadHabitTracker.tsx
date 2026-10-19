import { useState } from 'react';
import { Info, Plus, ShieldAlert } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { BadHabit } from '@/types';
import { getNow, todayKey } from '@/lib/dates';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { PageHero } from '@/components/ui/PageHero';
import { Disclosure, EmptyState, PageColumns } from '@/components/ui/primitives';
import { getActiveBadHabitsOrdered, getPointEligibleHabitIds } from '@/lib/badHabitEligibility';
import { getCapStatus } from '@/lib/capStatus';
import { getEffectiveSeasonPoints, ptsText } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { actionFeedback } from '@/lib/actionFeedback';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { BadHabitRow } from '@/components/badHabits/BadHabitRow';
import { AddBadHabitDialog } from '@/components/badHabits/AddBadHabitDialog';

export function BadHabitTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BadHabit | null>(null);
  // Bad habits resisted here: their check pops even though the row moves from To log to Logged.
  const [popIds, setPopIds] = useState<ReadonlySet<string>>(() => new Set());
  // Re-renders at local midnight, so the page never shows yesterday's logs or taps dead rows (B4).
  const today = useLocalDayKey();
  const habits = getActiveBadHabitsOrdered(store.state.badHabits || []);
  const logs = store.state.badHabitLogs || [];
  // Only these can lose points (slipped, not logged); every bad habit earns its resist points.
  const penalised = getPointEligibleHabitIds(store.state.badHabits || []);
  const todayLogOf = (id: string) => logs.find((l) => l.badHabitId === id && l.date === today && l.status !== 'no_report');
  const toLog = habits.filter((h) => !todayLogOf(h.id));
  const logged = habits.filter((h) => todayLogOf(h.id));
  const resistedToday = logged.filter((h) => todayLogOf(h.id)?.status === 'resisted').length;
  const resistRemaining = getCapStatus(store.state, 'badHabitsResisted', getNow()).remaining;
  // Read once for every row's slip cost (the same value as the season league's points).
  const seasonPoints = getEffectiveSeasonPoints(store.state, leagueNow());

  const openAdd = () => setShowAdd(true);

  const setPopping = (id: string, popping: boolean) =>
    setPopIds((prev) => {
      if (prev.has(id) === popping) return prev;
      const next = new Set(prev);
      if (popping) next.add(id);
      else next.delete(id);
      return next;
    });

  const resist = (habit: BadHabit) => {
    setPopping(habit.id, true);
    actionFeedback('tick');
    // The day at the tap, not at the last render: just after midnight the store would refuse a stale date.
    store.logBadHabitDay(habit.id, todayKey(), 'resisted');
  };
  const slip = (habit: BadHabit) => {
    setPopping(habit.id, false);
    store.logBadHabitDay(habit.id, todayKey(), 'occurred');
  };
  const undo = (habit: BadHabit) => {
    setPopping(habit.id, false);
    store.undoTodayBadHabitLog(habit.id);
  };

  const renderRow = (habit: BadHabit) => {
    const todayLog = todayLogOf(habit.id);
    return (
      <BadHabitRow
        key={habit.id}
        habit={habit}
        logs={logs.filter((l) => l.badHabitId === habit.id)}
        todayLog={todayLog}
        today={today}
        penalised={penalised.has(habit.id)}
        resistRemaining={resistRemaining}
        seasonPoints={seasonPoints}
        popClass={todayLog?.status === 'resisted' && popIds.has(habit.id) ? 'animate-pop' : ''}
        onResist={() => resist(habit)}
        onSlip={() => slip(habit)}
        onUndo={() => undo(habit)}
        onDelete={() => setConfirmDelete(habit)}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bad habits</h1>
          <p className="page-subtitle">Resist each day, one day at a time.</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary sm:shrink-0">
          <Plus size={18} aria-hidden="true" />
          <span>New bad habit</span>
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Today's bad habits"
          ring={{
            value: resistedToday,
            max: habits.length,
            label: `Resisted today: ${resistedToday} of ${habits.length}`,
            center: (
              <>
                {resistedToday}
                <span className="text-sm font-medium text-content-muted">/{habits.length}</span>
              </>
            ),
            caption: 'resisted today',
          }}
          lead={{
            label: 'To log today',
            value: <CountUp value={toLog.length} />,
            hint: toLog.length === 0 && habits.length > 0 ? 'All logged for today.' : undefined,
          }}
          stats={[{ label: 'Bad habits', value: <CountUp value={habits.length} /> }]}
          side={<CapMeterConnected state={store.state} capId="badHabitsResisted" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <Disclosure title="How points work" icon={Info}>
            <ul className="list-disc space-y-1 pl-4 text-content-muted">
              <li>
                Resisted: library bad habits earn their own points (shown when you add them), custom ones{' '}
                <span className="figure">{ptsText(BAD_HABIT_POINTS.customResist, true)}</span>. Up to{' '}
                <span className="figure">{ptsText(BAD_HABIT_POINTS.dailyCap)}</span> a day for all of them together; the ones
                you log first count first.
              </li>
              <li>
                Only your <span className="figure">{BAD_HABIT_POINTS.eligibleSlots}</span> oldest bad habits lose points. The
                others never do.
              </li>
              <li>
                Slipped: <span className="figure">{ptsText(-BAD_HABIT_POINTS.occurBase)}</span>. A day you don&apos;t log:{' '}
                <span className="figure">{ptsText(-BAD_HABIT_POINTS.noReportBase)}</span>, charged after midnight, counting from
                the day you added the habit.
              </li>
              <li>
                Each bad day in a row (slipped or not logged) costs more: ×1.5; from Performer rank ×2 for the 2nd and ×2.5
                from the 3rd (rounded). Resisting resets the count.
              </li>
              <li>Deleting a bad habit removes only today&apos;s points from it. Earlier points and penalties stay.</li>
            </ul>
          </Disclosure>
        }
      >
        {habits.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No bad habits yet"
            description="Add something you want to cut back on, like doomscrolling or junk food, and log each day you resist it."
            action={
              <button type="button" onClick={openAdd} className="btn-primary mx-auto">
                <Plus size={18} aria-hidden="true" /> Add a bad habit
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            {toLog.length > 0 && (
              <section aria-labelledby="bad-habits-to-log">
                <h2 id="bad-habits-to-log" className="section-title mb-3">
                  To log <span className="figure font-normal text-content-muted">· {toLog.length}</span>
                </h2>
                <div className="space-y-2.5">{toLog.map(renderRow)}</div>
              </section>
            )}
            {logged.length > 0 && (
              <section aria-labelledby="bad-habits-logged">
                <h2 id="bad-habits-logged" className="section-title mb-3">
                  Logged today <span className="figure font-normal text-content-muted">· {logged.length}</span>
                </h2>
                <div className="space-y-2.5">{logged.map(renderRow)}</div>
              </section>
            )}
          </div>
        )}
      </PageColumns>

      <AddBadHabitDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        habits={habits}
        onAddPreset={(preset) => {
          store.addBadHabit(preset.name, true);
          showSuccessToast('Bad habit added', preset.name, `bad_habit_add_${preset.name}`);
        }}
        onAddCustom={(name) => {
          store.addBadHabit(name);
          showSuccessToast('Bad habit added', name);
        }}
      />

      <ConfirmDeleteModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await store.deleteBadHabit(confirmDelete.id);
            setConfirmDelete(null);
            showSuccessToast(`Deleted ${confirmDelete.name}`, undefined, `bad_habit_${confirmDelete.id}`);
          }
        }}
        title="Delete bad habit?"
        itemName={confirmDelete?.name}
        description="This permanently removes its history and streak. Only today's points from it are removed; earlier points and penalties stay."
      />
    </div>
  );
}
