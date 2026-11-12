import { useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { pactUnlinkNote, runningPactsLinkedToBadHabit } from '@/lib/pactLifecycle';
import { useToast } from '@/components/ui/Toast';
import { BadHabit } from '@/types';
import { trustedNow } from '@/lib/time/clock';
import { todayKey } from '@/lib/time/dates';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { HowItWorksButton, HowItWorksDialog, useHowItWorks } from '@/components/ui/HowItWorks';
import { badHabitsGuide } from '@/components/howItWorks/badHabits';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { PageHero } from '@/components/ui/PageHero';
import { EmptyState, PageColumns } from '@/components/ui/primitives';
import { getActiveBadHabitsOrdered } from '@/lib/points/badHabitEligibility';
import { applyListOrder, LIST_ORDER_KEYS, savedOrderIds } from '@/lib/listOrder';
import { LazyReorderList, ReorderButton } from '@/components/ui/Reorder';
import { getCapStatus } from '@/lib/points/capStatus';
import { getEffectiveSeasonPoints } from '@/lib/leagues/leagues';
import { leagueNow } from '@/lib/time/leagueTime';
import { actionFeedback } from '@/lib/actionFeedback';
import { useLocalDayKey } from '@/lib/time/useLocalDayKey';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { BadHabitRow } from '@/components/badHabits/BadHabitRow';
import { AddBadHabitDialog } from '@/components/badHabits/AddBadHabitDialog';
import { RenameDialog } from '@/components/ui/RenameDialog';
import { badHabitNameProblem, canRenameBadHabit, HABIT_NAME_MAX, HABIT_PACT_RENAME_MESSAGE } from '@/lib/itemEdits';

export function BadHabitTracker({ store }: { store: AppStore }) {
  const guide = useHowItWorks();
  const { showSuccessToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BadHabit | null>(null);
  // Rename (custom bad habits only). The bad habit stays set while the dialog closes.
  const [renameTarget, setRenameTarget] = useState<BadHabit | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  // Bad habits resisted here: their check pops even though the row moves from To log to Logged.
  const [popIds, setPopIds] = useState<ReadonlySet<string>>(() => new Set());
  // Re-renders at local midnight, so the page never shows yesterday's logs or taps dead rows (B4).
  const today = useLocalDayKey();
  // Display only: the user's order (Reorder), else oldest first; new ones join the end. The
  // penalty order (getActiveBadHabitsOrdered, the server's created_at order) is unchanged.
  const ordered = getActiveBadHabitsOrdered(store.state.badHabits || []);
  const oldest = new Map(ordered.map((h, i) => [h.id, i]));
  const habits = applyListOrder(
    ordered,
    savedOrderIds(store.state.listOrders, LIST_ORDER_KEYS.badHabits),
    (a, b) => oldest.get(a.id)! - oldest.get(b.id)!,
    'end'
  );
  const [reordering, setReordering] = useState(false);
  const logs = store.state.badHabitLogs || [];
  const todayLogOf = (id: string) => logs.find((l) => l.badHabitId === id && l.date === today && l.status !== 'no_report');
  const toLog = habits.filter((h) => !todayLogOf(h.id));
  const logged = habits.filter((h) => todayLogOf(h.id));
  const resistedToday = logged.filter((h) => todayLogOf(h.id)?.status === 'resisted').length;
  const resistRemaining = getCapStatus(store.state, 'badHabitsResisted', trustedNow()).remaining;
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
        resistRemaining={resistRemaining}
        seasonPoints={seasonPoints}
        popClass={todayLog?.status === 'resisted' && popIds.has(habit.id) ? 'animate-pop' : ''}
        onResist={() => resist(habit)}
        onSlip={() => slip(habit)}
        onUndo={() => undo(habit)}
        onDelete={() => setConfirmDelete(habit)}
        onEdit={
          canRenameBadHabit(habit)
            ? () => {
                setRenameTarget(habit);
                setRenameOpen(true);
              }
            : undefined
        }
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bad habits</h1>
          <p className="page-subtitle">Mark each day you resist the habits you're quitting.</p>
          <HowItWorksButton onClick={guide.show} />
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
            valueClassName: 'text-brand-text',
          }}
          stats={[{ label: 'Bad habits', value: <CountUp value={habits.length} /> }]}
          side={<CapMeterConnected state={store.state} capId="badHabitsResisted" bare onExplain={guide.showPoints} />}
        />
      </Reveal>

      <PageColumns>
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
        ) : reordering ? (
          <LazyReorderList
            label="bad habits"
            items={habits.map((h) => ({ id: h.id, title: h.name }))}
            onCancel={() => setReordering(false)}
            onDone={(ids) => {
              store.saveListOrder(LIST_ORDER_KEYS.badHabits, ids);
              setReordering(false);
            }}
          />
        ) : (
          <div className="space-y-6">
            {habits.length >= 2 && (
              <div className="-mb-3 flex justify-end">
                <ReorderButton label="bad habits" onClick={() => setReordering(true)} />
              </div>
            )}
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

      {renameTarget && (
        <RenameDialog
          key={renameTarget.id}
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          title="Rename bad habit"
          description={
            runningPactsLinkedToBadHabit(store.state, renameTarget) > 0
              ? HABIT_PACT_RENAME_MESSAGE
              : 'Its streak, history and points stay as they are.'
          }
          label="Bad habit"
          initialName={renameTarget.name}
          inputId="bad-habit-rename-input"
          maxLength={HABIT_NAME_MAX}
          validate={(name) => badHabitNameProblem(name, renameTarget, habits, runningPactsLinkedToBadHabit(store.state, renameTarget))}
          onSave={(name) => {
            store.renameBadHabit(renameTarget.id, name);
            showSuccessToast('Bad habit renamed', name.trim());
          }}
        />
      )}

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
        description={`This permanently removes its history and streak. Only today's points from it are removed; earlier points and penalties stay.${
          confirmDelete ? pactUnlinkNote(runningPactsLinkedToBadHabit(store.state, confirmDelete), 'bad habit') : ''
        }`}
      />
      <HowItWorksDialog open={guide.open} onClose={guide.close} guide={badHabitsGuide} focus={guide.focus} />
    </div>
  );
}
