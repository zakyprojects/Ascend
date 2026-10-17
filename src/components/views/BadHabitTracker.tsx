import { useState } from 'react';
import { AlertTriangle, Check, Flame, Plus, ShieldAlert, Trash2, Undo2, X } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { BadHabit, BadHabitLog } from '@/types';
import { todayKey, getNow } from '@/lib/dates';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, Form, Input, PageColumns } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { getActiveBadHabitsOrdered, getPointEligibleHabitIds } from '@/lib/badHabitEligibility';
import { getMissPenaltyMultiplier } from '@/lib/habitPenalties';
import { getCapStatus } from '@/lib/capStatus';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { useCompletionPop } from '@/lib/useCompletionPop';
import { trustedNow } from '@/lib/clock';

/** Days resisted in a row, ending today (or yesterday while today is not logged yet). */
function resistStreaks(logs: BadHabitLog[], today: string): { current: number; best: number } {
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  let current = 0;
  const cursor = trustedNow();
  if (!byDate.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (byDate.get(todayKey(cursor)) === 'resisted') {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of [...byDate.keys()].sort()) {
    if (byDate.get(date) !== 'resisted') {
      run = 0;
    } else {
      const next = prev ? new Date(`${prev}T12:00:00`) : null;
      next?.setDate(next.getDate() + 1);
      run = next && todayKey(next) === date ? run + 1 : 1;
    }
    best = Math.max(best, run);
    prev = date;
  }
  return { current, best: Math.max(best, current) };
}

/** Slips and unlogged days in a row before today; the next slip is penalised at this count + 1. */
function slipsInARow(logs: BadHabitLog[], today: string): number {
  let count = 0;
  for (const log of logs.filter((l) => l.date < today).sort((a, b) => b.date.localeCompare(a.date))) {
    if (log.status !== 'occurred' && log.status !== 'no_report') break;
    count++;
  }
  return count;
}

export function BadHabitTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<BadHabit | null>(null);
  const addForm = useUnsavedChanges(showAdd, [name]);

  const today = todayKey();
  const habits = getActiveBadHabitsOrdered(store.state.badHabits || []);
  const logs = store.state.badHabitLogs || [];
  const eligible = getPointEligibleHabitIds(store.state.badHabits || []);
  const todayLogOf = (id: string) => logs.find((l) => l.badHabitId === id && l.date === today && l.status !== 'no_report');
  const toLog = habits.filter((h) => !todayLogOf(h.id));
  const logged = habits.filter((h) => todayLogOf(h.id));
  const resistedToday = logged.filter((h) => todayLogOf(h.id)?.status === 'resisted').length;
  const resistCapped = getCapStatus(store.state, 'badHabitsResisted', getNow()).isCapped;
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;

  const openAdd = () => {
    setName('');
    setShowAdd(true);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    store.addBadHabit(name.trim());
    setShowAdd(false);
  };

  const renderRow = (habit: BadHabit) => (
    <BadHabitRow
      key={habit.id}
      habit={habit}
      logs={logs.filter((l) => l.badHabitId === habit.id)}
      todayLog={todayLogOf(habit.id)}
      today={today}
      earnsPoints={eligible.has(habit.id)}
      resistCapped={resistCapped}
      seasonPoints={seasonPoints}
      store={store}
      onDelete={() => setConfirmDelete(habit)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bad Habits</h1>
          <p className="page-subtitle">Resist each day, one day at a time.</p>
        </div>
        <button onClick={openAdd} className="btn-primary sm:shrink-0">
          <Plus size={18} />
          <span>New Bad Habit</span>
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
            valueClassName: 'text-secondary-400',
            hint: toLog.length === 0 && habits.length > 0 ? 'All logged for today.' : undefined,
          }}
          stats={[{ label: 'Bad habits', value: <CountUp value={habits.length} /> }]}
          side={<CapMeterConnected state={store.state} capId="badHabitsResisted" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <Disclosure title="How points work" icon={AlertTriangle} tone="warning">
            <ul className="list-disc pl-4 space-y-0.5 text-content-muted">
              <li>
                Your <span className="figure">{BAD_HABIT_POINTS.eligibleSlots}</span> oldest bad habits earn points. The rest are tracking only.
              </li>
              <li>
                Resisted: <span className="figure text-success-text">+{BAD_HABIT_POINTS.resistBase} pts</span>, up to <span className="figure">+{BAD_HABIT_POINTS.dailyCap}</span> pts a day.
              </li>
              <li>
                Slipped, or a day not logged: a penalty that grows with each one in a row (up to 1.5x, or 2.5x from Performer tier). Resisting resets it.
              </li>
              <li>Deleting a bad habit removes only today's points from it. Earlier points and penalties stay.</li>
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
              <button onClick={openAdd} className="btn-primary mx-auto">
                <Plus size={18} /> Add Your First Bad Habit
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {toLog.length > 0 && (
              <div>
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-secondary-500" />
                  To log
                </h2>
                <div className="space-y-2.5">{toLog.map(renderRow)}</div>
              </div>
            )}
            {logged.length > 0 && (
              <div>
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-500" />
                  Logged today
                </h2>
                <div className="space-y-2.5">{logged.map(renderRow)}</div>
              </div>
            )}
          </div>
        )}
      </PageColumns>

      <Dialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        dirty={addForm.dirty}
        title="Add bad habit"
        footer={
          <>
            <button type="button" onClick={() => addForm.confirmDiscard(() => setShowAdd(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="bad-habit-add-form" className="btn-primary">
              Add bad habit
            </button>
          </>
        }
      >
        <Form id="bad-habit-add-form" onSubmit={handleAdd} className="space-y-4">
          <Input
            id="bad-habit-name-input"
            label="Bad habit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Doomscrolling"
            maxLength={80}
            enterKeyHint="done"
            autoComplete="off"
            required
          />
        </Form>
      </Dialog>

      <ConfirmDeleteModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await store.deleteBadHabit(confirmDelete.id);
            setConfirmDelete(null);
            showSuccessToast('Bad habit deleted', 'Bad habit removed.', `bad_habit_${confirmDelete.id}`);
          }
        }}
        title="Delete bad habit?"
        itemName={confirmDelete?.name}
        description="This permanently removes its history and streak. Only today's points from it are removed; earlier points and penalties stay."
      />
    </div>
  );
}

function BadHabitRow({
  habit,
  logs,
  todayLog,
  today,
  earnsPoints,
  resistCapped,
  seasonPoints,
  store,
  onDelete,
}: {
  habit: BadHabit;
  logs: BadHabitLog[];
  todayLog: BadHabitLog | undefined;
  today: string;
  earnsPoints: boolean;
  resistCapped: boolean;
  seasonPoints: number;
  store: AppStore;
  onDelete: () => void;
}) {
  const status = todayLog?.status;
  const { current, best } = resistStreaks(logs, today);
  const slips = earnsPoints ? slipsInARow(logs, today) : 0;
  const { arm: armPop, popClass } = useCompletionPop(status === 'resisted');
  const points = todayLog?.pointsAwardedOrDeducted ?? 0;

  const resist = () => {
    armPop();
    store.logBadHabitDay(habit.id, today, 'resisted');
  };
  const slip = () => store.logBadHabitDay(habit.id, today, 'occurred');
  const undo = () => store.undoTodayBadHabitLog(habit.id);

  const pointsLabel = status
    ? points > 0
      ? `+${points} pts`
      : points < 0
        ? `${points} pts`
        : earnsPoints && status === 'resisted'
          ? '0 pts, daily cap reached'
          : 'No points'
    : !earnsPoints
      ? 'Tracking only'
      : resistCapped
        ? 'Daily cap reached'
        : `+${BAD_HABIT_POINTS.resistBase} pts`;

  return (
    <SwipeRow
      right={
        status
          ? { label: 'Undo', icon: Undo2, tone: 'bg-bg-600 text-content-secondary', onCommit: undo }
          : { label: 'Resisted', icon: Check, tone: 'bg-primary-500 text-on-brand', onCommit: resist }
      }
      left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: onDelete }}
    >
      <div className={cx('card enter-item p-4 card-hover', status && 'opacity-75')}>
        <div className="flex items-center gap-3">
          {status ? (
            <div
              className={cx(
                'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center',
                status === 'resisted' ? 'bg-primary-500 text-on-brand' : 'bg-rose-500/15 text-rose-theme border border-rose-500/30'
              )}
              aria-hidden
            >
              {status === 'resisted' ? <Check size={22} className={popClass} /> : <X size={22} />}
            </div>
          ) : (
            <button
              onClick={resist}
              aria-label={`Resisted ${habit.name} today`}
              title="Resisted today"
              className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90 bg-bg-600 text-content-disabled hover:bg-bg-500 hover:text-content-tertiary border border-overlay-subtle"
            >
              <Check size={22} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={cx('item-name truncate', status ? 'text-content-disabled' : 'text-content-secondary')}>{habit.name}</h3>
              {status && (
                <span className={cx('text-xs shrink-0', status === 'resisted' ? 'text-success-text' : 'text-rose-theme')}>
                  {status === 'resisted' ? 'Resisted' : 'Slipped'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {current > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <Flame size={13} className="text-brand-text" />
                  <span className="figure text-brand-text">{current} day{current !== 1 ? 's' : ''}</span>
                </div>
              )}
              {best > 0 && <span className="figure text-xs text-content-disabled">Best: {best}</span>}
              <span className={cx('figure text-xs', points < 0 ? 'text-rose-theme' : earnsPoints ? 'text-brand-text' : 'text-content-subtle')}>
                {pointsLabel}
              </span>
            </div>
            {!status && slips > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-micro text-rose-theme bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20 w-fit font-medium">
                <AlertTriangle size={11} className="shrink-0" />
                <span>
                  {slips} bad day{slips > 1 ? 's' : ''} in a row (next = {getMissPenaltyMultiplier(slips + 1, seasonPoints)}x penalty)
                </span>
              </div>
            )}
          </div>

          {status ? (
            <button
              onClick={undo}
              aria-label={`Undo today's log for ${habit.name}`}
              title="Undo today"
              className={`shrink-0 p-2 rounded-lg text-content-disabled hover:text-content-secondary hover:bg-overlay-subtle transition-colors ${TAP_TARGET}`}
            >
              <Undo2 size={16} />
            </button>
          ) : (
            <button
              onClick={slip}
              aria-label={`Slipped on ${habit.name} today`}
              title={earnsPoints ? 'Slipped today (penalty)' : 'Slipped today'}
              className={`shrink-0 p-2 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
            >
              <X size={18} />
            </button>
          )}

          <button
            onClick={onDelete}
            aria-label={`Delete ${habit.name}`}
            className={`shrink-0 p-2 rounded-lg text-content-disabled hover:text-error hover:bg-error/10 transition-colors ${TAP_TARGET}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </SwipeRow>
  );
}
