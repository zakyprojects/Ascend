import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { WEEKLY_REFLECTION_POINTS, WEEKLY_GOALS_POINTS, calculateWeeklyGoalsPoints } from '@/lib/pointsConfig';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CapMeter } from '@/components/ui/CapMeter';
import { weeklyGoalsCapNote } from '@/lib/capCopy';
import { EmptyState, PageColumns } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { weekKey, getWeekDates, offsetWeekKey, formatWeekRange, getNow, parseDate } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { isReflectionWindowOpen } from '@/lib/weeklyAwards';
import { WeeklyGoalItem } from '@/types';
import { computeLinkedGoalProgress, GoalProgressResult } from '@/lib/linkedGoalMetrics';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { toUserMessage } from '@/lib/userMessage';
import { GoalRow } from '@/components/weekly/GoalRow';
import { GoalFormDialog, type GoalPayload } from '@/components/weekly/GoalFormDialog';
import { ReflectionsCard } from '@/components/weekly/ReflectionsCard';
import { CarryOverCard, type UnfinishedGoal } from '@/components/weekly/CarryOverCard';
import { isGoalAchieved, pointsLostOnDelete, weekLabel, weekLabelInline, weekPointsFromLedger } from '@/components/weekly/weekMeta';

const TREND_WEEKS = 8;
const CARRY_OVER_LOOKBACK_WEEKS = 4;
const WEEK_POINTS_MAX = WEEKLY_GOALS_POINTS.maxWeeklyPoints + WEEKLY_REFLECTION_POINTS.awarded;

export function WeeklyGoalsView({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  // Re-renders at local midnight, so Monday 00:00 starts the new week with the page open (C5).
  const today = useLocalDayKey();
  const currentWeekKey = weekKey(parseDate(today) ?? undefined);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(currentWeekKey);
  // A page that was on "this week" moves to the new week (like Time Tracker's day).
  const previousWeekKeyRef = useRef(currentWeekKey);
  useEffect(() => {
    const previous = previousWeekKeyRef.current;
    if (previous === currentWeekKey) return;
    previousWeekKeyRef.current = currentWeekKey;
    setSelectedWeekKey((selected) => (selected === previous ? currentWeekKey : selected));
  }, [currentWeekKey]);

  const isPastWeek = selectedWeekKey < currentWeekKey;
  const isFutureWeek = selectedWeekKey > currentWeekKey;
  const isCurrentWeek = selectedWeekKey === currentWeekKey;
  const previousWeekKey = offsetWeekKey(currentWeekKey, -1);
  const selectedLabel = weekLabel(selectedWeekKey, currentWeekKey);
  const selectedText = weekLabelInline(selectedWeekKey, currentWeekKey);

  useEffect(() => {
    store.syncLinkedWeeklyGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weeklyGoals = store.state.weeklyGoals;

  const getGoalProgress = useCallback(
    (item: WeeklyGoalItem, targetWeekKey: string): GoalProgressResult =>
      computeLinkedGoalProgress(item, store.state, getWeekDates(targetWeekKey).dateStrings),
    [store.state]
  );

  const weekGoals = useMemo(
    () => (weeklyGoals.find((w) => w.weekKey === selectedWeekKey)?.goals ?? []).filter((g) => !g.archived),
    [weeklyGoals, selectedWeekKey]
  );
  const allWeekGoals = useMemo(() => weeklyGoals.find((w) => w.weekKey === selectedWeekKey)?.goals ?? [], [weeklyGoals, selectedWeekKey]);

  const rows = useMemo(
    () =>
      weekGoals.map((goal) => {
        const prog = getGoalProgress(goal, selectedWeekKey);
        return { goal, prog, achieved: isGoalAchieved(goal, prog, isPastWeek) };
      }),
    [weekGoals, getGoalProgress, selectedWeekKey, isPastWeek]
  );

  const stats = useMemo(() => {
    const achieved = rows.filter((r) => r.achieved);
    const high = rows.filter((r) => r.goal.priority === 'high');
    return {
      total: rows.length,
      achieved: achieved.length,
      averagePercent: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.prog.percent, 0) / rows.length) : 0,
      highTotal: high.length,
      highAchieved: high.filter((r) => r.achieved).length,
    };
  }, [rows]);

  const ledgerPoints = weekPointsFromLedger(store.state, selectedWeekKey);
  const weekPoints = Math.max(0, ledgerPoints.goals + ledgerPoints.reflection);
  // Before the server's row arrives, the meter shows what the week's goals earn (same rule).
  const goalPointsPreview = calculateWeeklyGoalsPoints(allWeekGoals);

  // Average progress of each of the last 8 weeks, oldest first.
  const weekTrend = useMemo(
    () =>
      Array.from({ length: TREND_WEEKS }, (_, i) => {
        const key = offsetWeekKey(currentWeekKey, i - (TREND_WEEKS - 1));
        const goals = (weeklyGoals.find((w) => w.weekKey === key)?.goals ?? []).filter((g) => !g.archived);
        const percent = goals.length ? Math.round(goals.reduce((sum, g) => sum + getGoalProgress(g, key).percent, 0) / goals.length) : 0;
        return { key, goals: goals.length, percent };
      }),
    [currentWeekKey, weeklyGoals, getGoalProgress]
  );
  const trendWeeksWithGoals = weekTrend.filter((w) => w.goals > 0).length;
  const selectedTrendIndex = weekTrend.findIndex((w) => w.key === selectedWeekKey);

  // Unfinished goals of the last few weeks, offered on the current week only.
  const unfinishedGoals = useMemo((): UnfinishedGoal[] => {
    if (!isCurrentWeek) return [];
    // Only the last CARRY_OVER_LOOKBACK_WEEKS weeks are offered (Zakria 2026-10-15); older misses are left alone.
    const oldestOffered = offsetWeekKey(currentWeekKey, -CARRY_OVER_LOOKBACK_WEEKS);
    const pastDocs = weeklyGoals.filter((w) => w.weekKey < currentWeekKey && w.weekKey >= oldestOffered);
    const currentGoals = weeklyGoals.find((w) => w.weekKey === currentWeekKey)?.goals ?? [];

    // By id, with the title as the fallback for old data.
    const carriedIds = new Set<string>();
    currentGoals.forEach((g) => g.carriedOverFromGoalId && carriedIds.add(g.carriedOverFromGoalId));
    const currentTitles = new Set(currentGoals.map((g) => g.title.trim().toLowerCase()));
    const supersededKeys = new Set<string>();
    pastDocs.forEach((doc) =>
      doc.goals.forEach((g) => {
        if (g.carriedOverFromGoalId) carriedIds.add(g.carriedOverFromGoalId);
        if (g.carriedOverFromWeekKey) supersededKeys.add(`${g.carriedOverFromWeekKey}:${g.title.trim().toLowerCase()}`);
      })
    );

    const result: UnfinishedGoal[] = [];
    pastDocs.forEach((doc) =>
      doc.goals.forEach((g) => {
        const title = g.title.trim().toLowerCase();
        // Settled: achieved in its week (the flag the points use) or its live progress reached the target.
        const settled = g.completed || g.done || getGoalProgress(g, doc.weekKey).percent >= 100;
        const addressed = carriedIds.has(g.id) || currentTitles.has(title) || supersededKeys.has(`${doc.weekKey}:${title}`);
        if (!settled && !g.archived && !g.carryOverDismissed && !addressed) result.push({ weekKey: doc.weekKey, goal: g });
      })
    );
    return result;
  }, [isCurrentWeek, currentWeekKey, weeklyGoals, getGoalProgress]);

  // Goal form: keyed per open so it always starts clean.
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingGoal, setEditingGoal] = useState<WeeklyGoalItem | null>(null);
  const openForm = (goal: WeeklyGoalItem | null) => {
    setEditingGoal(goal);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };
  const saveGoal = (payload: GoalPayload) => {
    if (editingGoal) store.updateWeeklyGoalItem(selectedWeekKey, editingGoal.id, payload);
    else store.addWeeklyGoalItem(selectedWeekKey, payload);
  };

  const [deletingGoal, setDeletingGoal] = useState<WeeklyGoalItem | null>(null);
  const handleDeleteGoal = async () => {
    if (!deletingGoal) return;
    const goalId = deletingGoal.id;
    await executeWithKey(`delete_weekly_goal_${goalId}`, async () => {
      await store.deleteWeeklyGoalItem(selectedWeekKey, goalId);
      setDeletingGoal(null);
      showSuccessToast('Goal deleted', undefined, `weekly_goal_${goalId}`);
    });
  };
  const deletePoints = deletingGoal && !isFutureWeek ? pointsLostOnDelete(allWeekGoals, deletingGoal.id) : 0;
  const deleteDescription = deletingGoal
    ? [
        deletePoints > 0 ? `It counts toward ${selectedText}'s points, so ${deletePoints} pts come off.` : '',
        deletingGoal.carriedOverFromGoalId ? "Its earlier week won't suggest it again." : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined
    : undefined;

  const toggleGoal = (goal: WeeklyGoalItem, prog: GoalProgressResult, nextAchieved: boolean) => {
    const target = prog.target;
    try {
      if (nextAchieved) {
        store.updateWeeklyGoalItem(selectedWeekKey, goal.id, { completed: true, manualProgress: Math.max(goal.manualProgress || 0, target) });
      } else {
        // Unticking drops progress below the target so the row and its points agree.
        store.updateWeeklyGoalItem(selectedWeekKey, goal.id, {
          completed: false,
          manualProgress: target > 1 ? Math.min(goal.manualProgress || 0, target - 1) : 0,
        });
      }
    } catch (err) {
      showErrorToast("Couldn't update goal", toUserMessage(err, 'Try again.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Weekly Goals</h1>
          <p className="page-subtitle">Pick a few goals, watch them fill in, reflect at the weekend.</p>
        </div>
        {!isPastWeek && (
          <button type="button" onClick={() => openForm(null)} className="btn-primary self-start md:self-auto">
            <Plus size={16} /> Add goal
          </button>
        )}
      </div>

      <nav className="flex items-center gap-2" aria-label="Choose week">
        <button
          type="button"
          onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, -1))}
          className={`rounded-xl border border-overlay-subtle p-2 text-content-muted transition-colors hover:bg-bg-800 hover:text-content-primary ${TAP_TARGET}`}
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 text-center sm:flex-none sm:px-4">
          <div className="text-sm font-medium text-content-primary">{selectedLabel}</div>
          {selectedLabel !== formatWeekRange(selectedWeekKey) && (
            <div className="text-xs text-content-muted">{formatWeekRange(selectedWeekKey)}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, 1))}
          className={`rounded-xl border border-overlay-subtle p-2 text-content-muted transition-colors hover:bg-bg-800 hover:text-content-primary ${TAP_TARGET}`}
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
        {!isCurrentWeek && (
          <button type="button" onClick={() => setSelectedWeekKey(currentWeekKey)} className="btn-secondary px-3 py-1.5 text-xs">
            This week
          </button>
        )}
      </nav>

      <Reveal index={0}>
        <PageHero
          ariaLabel={`${selectedLabel}: goals`}
          ring={{
            value: stats.achieved,
            max: stats.total,
            label: `Goals achieved: ${stats.achieved} of ${stats.total}`,
            center: (
              <>
                {stats.achieved}
                <span className="text-sm font-medium text-content-muted">/{stats.total}</span>
              </>
            ),
            caption: 'achieved',
          }}
          lead={{
            label: isCurrentWeek ? 'Points this week' : 'Points that week',
            value: <CountUp value={weekPoints} />,
            hint: `of ${WEEK_POINTS_MAX} possible`,
            valueClassName: 'text-success-text',
          }}
          stats={[
            { label: 'Average progress', value: <><CountUp value={stats.averagePercent} />%</>, valueClassName: 'text-brand-text' },
            { label: 'High priority', value: <>{stats.highAchieved}/{stats.highTotal}</>, hint: 'achieved', valueClassName: 'text-rose-theme' },
          ]}
          side={
            isFutureWeek ? undefined : (
              <CapMeter
                variant="bar"
                label="Goal points"
                earned={isCurrentWeek ? goalPointsPreview.pointsAwarded : Math.max(0, ledgerPoints.goals)}
                cap={WEEKLY_GOALS_POINTS.maxWeeklyPoints}
                note={weeklyGoalsCapNote()}
              />
            )
          }
        />
      </Reveal>

      <PageColumns
        stickyAside
        lead={
          <>
            <CarryOverCard
              items={unfinishedGoals}
              labelFor={(key) => weekLabelInline(key, currentWeekKey)}
              onCarry={(item, resumeProgress) =>
                store.carryOverGoal(item.weekKey, currentWeekKey, item.goal.id, resumeProgress === undefined ? undefined : { resumeProgress })
              }
              onDismiss={(item) => {
                try {
                  store.updateWeeklyGoalItem(item.weekKey, item.goal.id, { carryOverDismissed: true });
                } catch (err) {
                  showErrorToast("Couldn't dismiss goal", toUserMessage(err, 'Try again.'));
                }
              }}
            />

            <section className="card space-y-4 p-5" aria-label="Goals">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="section-title">Goals</h2>
                {rows.length > 0 && (
                  <span className="figure text-xs text-content-muted">
                    {stats.achieved} of {rows.length} achieved
                  </span>
                )}
              </div>

              {isPastWeek && <p className="text-xs text-content-muted">Past weeks are read-only.</p>}
              {isFutureWeek && <p className="text-xs text-content-muted">Plan ahead here. Progress starts when the week does.</p>}

              {rows.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title={isPastWeek ? `No goals for ${selectedText}` : `No goals for ${selectedText} yet`}
                  description={isPastWeek ? undefined : 'Pick 1 to 3 goals you can measure.'}
                  size="sm"
                  surface={false}
                  action={
                    isPastWeek ? undefined : (
                      <button type="button" onClick={() => openForm(null)} className="btn-secondary text-xs">
                        <Plus size={14} /> Add goal
                      </button>
                    )
                  }
                />
              ) : (
                <div className="divide-y divide-overlay-subtle">
                  {rows.map(({ goal, prog }) => (
                    <GoalRow
                      key={goal.id}
                      item={goal}
                      prog={prog}
                      state={store.state}
                      isPastWeek={isPastWeek}
                      isFutureWeek={isFutureWeek}
                      carriedFromLabel={goal.carriedOverFromWeekKey ? weekLabelInline(goal.carriedOverFromWeekKey, currentWeekKey) : undefined}
                      onToggle={(next) => toggleGoal(goal, prog, next)}
                      onSetProgress={(next) => store.updateWeeklyGoalItem(selectedWeekKey, goal.id, { manualProgress: next })}
                      onEdit={() => openForm(goal)}
                      onDelete={() => setDeletingGoal(goal)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        }
        aside={
          <>
            <ReflectionsCard
              key={selectedWeekKey}
              store={store}
              weekKey={selectedWeekKey}
              weekText={selectedText}
              lastWeekWindowOpen={isCurrentWeek && isReflectionWindowOpen(previousWeekKey, getNow())}
              onOpenLastWeek={() => setSelectedWeekKey(previousWeekKey)}
            />

            {/* Needs at least two planned weeks to say anything. */}
            {trendWeeksWithGoals >= 2 && (
              <Reveal className="card space-y-3 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Last {TREND_WEEKS} weeks</h2>
                  <span className="text-xs text-content-muted">Average progress</span>
                </div>
                <BarChart
                  data={weekTrend.map((w) => ({ label: formatWeekRange(w.key).split(' –')[0], value: w.percent }))}
                  label={`Average goal progress, last ${TREND_WEEKS} weeks`}
                  max={100}
                  highlightIndex={selectedTrendIndex >= 0 ? selectedTrendIndex : undefined}
                  formatTooltip={(_, i) => {
                    const w = weekTrend[i];
                    return w.goals ? `${formatWeekRange(w.key)}: ${w.percent}% across ${w.goals} goal${w.goals > 1 ? 's' : ''}` : `${formatWeekRange(w.key)}: no goals`;
                  }}
                />
              </Reveal>
            )}
          </>
        }
      />

      <GoalFormDialog
        key={formKey}
        open={formOpen}
        editing={editingGoal}
        state={store.state}
        weekText={selectedText}
        onClose={() => setFormOpen(false)}
        onSave={saveGoal}
      />

      <ConfirmDeleteModal
        open={Boolean(deletingGoal)}
        onClose={() => setDeletingGoal(null)}
        onConfirm={handleDeleteGoal}
        isDeleting={deletingGoal ? isKeyLoading(`delete_weekly_goal_${deletingGoal.id}`) : false}
        title="Delete goal?"
        itemName={deletingGoal?.title}
        description={deleteDescription}
        confirmText="Delete goal"
      />
    </div>
  );
}

