import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Target,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Minus,
  Check,
  Circle,
  Zap,
  Edit3,
  Trash2,
  PenLine,
  Clock,
} from 'lucide-react';
import { AppStore, isWeeklyReflectionAwarded } from '@/lib/store';
import { WEEKLY_REFLECTION_POINTS, WEEKLY_GOALS_POINTS, calculateWeeklyGoalsPoints } from '@/lib/pointsConfig';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CapMeter } from '@/components/ui/CapMeter';
import { weeklyGoalsCapNote } from '@/lib/capCopy';
import { Dialog, EmptyState, PageColumns, ProgressBar } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { useCompletionPop } from '@/lib/useCompletionPop';
import {
  weekKey,
  getWeekDates,
  offsetWeekKey,
  formatWeekRange,
  getWeekReflectionCutoff,
  getNow,
} from '@/lib/dates';
import { WeeklyGoalItem, WeeklyGoalPriority, WeeklyGoalLinkedModule, WeeklyGoalReflection } from '@/types';
import { computeLinkedGoalProgress, GoalProgressResult, LINKED_GOAL_METRICS, LinkedModule } from '@/lib/linkedGoalMetrics';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { AutoNum, CountUp, Reveal } from '@/components/ui/Motion';
function GoalItemRow({
  item,
  selectedWeekKey,
  isPastWeek,
  isFutureWeek,
  getGoalProgress,
  store,
  showErrorToast,
  priorityColor,
  openEditModal,
  setDeleteGoalModal,
}: {
  item: WeeklyGoalItem;
  selectedWeekKey: string;
  isPastWeek: boolean;
  isFutureWeek: boolean;
  getGoalProgress: (item: WeeklyGoalItem, targetWeekKey?: string) => GoalProgressResult;
  store: AppStore;
  showErrorToast: (title: string, message?: string) => void;
  priorityColor: (p: WeeklyGoalPriority) => string;
  openEditModal: (item: WeeklyGoalItem) => void;
  setDeleteGoalModal: (item: WeeklyGoalItem) => void;
}) {
  const prog = getGoalProgress(item);
  const isDone = item.completed || prog.percent >= 100;

  // Linked goals complete from other modules' activity, so only the manual
  // checkbox and the + stepper arm the completion pop.
  const { arm: armCompletionPop, popClass } = useCompletionPop(isDone);

  return (
    <div
      key={item.id}
      className={`enter-item py-4 first:pt-0 last:pb-0 transition-colors space-y-3 ${
        isDone ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {item.linkedModule && item.linkedModule !== 'none' ? (
            <div
              title="Auto-synced from linked activity"
              className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-all border cursor-default select-none pointer-events-none ${
                isDone
                  ? 'bg-emerald-500 border-emerald-400 text-bg-900'
                  : 'bg-bg-800 border-overlay-strong text-content-disabled'
              }`}
            >
              {isDone ? <Check size={14} /> : <Circle size={14} />}
            </div>
          ) : (
            <button
              onClick={() => {
                const isFreeformWithStepper = prog.target > 1;
                const nextCompleted = !isDone;
                if (nextCompleted) armCompletionPop();

                try {
                  if (isFreeformWithStepper) {
                    if (nextCompleted) {
                      store.updateWeeklyGoalItem(selectedWeekKey, item.id, {
                        completed: true,
                        manualProgress: Math.max(item.manualProgress || 0, item.targetValue || 1),
                      });
                    } else {
                      store.updateWeeklyGoalItem(selectedWeekKey, item.id, {
                        completed: false,
                      });
                    }
                  } else {
                    store.updateWeeklyGoalItem(selectedWeekKey, item.id, {
                      completed: nextCompleted,
                      manualProgress: nextCompleted ? (item.targetValue || 1) : 0,
                    });
                  }
                } catch (err: any) {
                  showErrorToast('Failed to update goal', err?.message);
                }
              }}
              disabled={isPastWeek || isFutureWeek}
              aria-label={isDone ? `Mark "${item.title}" incomplete` : `Mark "${item.title}" complete`}
              className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                isDone
                  ? 'bg-emerald-500 border-emerald-400 text-bg-900'
                  : 'bg-bg-800 border-overlay-strong text-content-disabled hover:border-overlay-heavy'
              } ${TAP_TARGET}`}
            >
              {isDone ? <Check size={14} className={popClass} /> : <Circle size={14} />}
            </button>
          )}

          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`item-name text-sm ${
                  isDone ? 'line-through text-content-muted' : ''
                }`}
              >
                {item.title}
              </span>

              <span className={`badge text-2xs capitalize border ${priorityColor(item.priority)}`}>
                {item.priority}
              </span>

              {item.carriedOverFromWeekKey && (
                <span className="badge badge-neutral text-2xs">
                  Carried over from {item.carriedOverFromWeekKey}
                </span>
              )}

              {item.linkedModule && item.linkedModule !== 'none' && (
                <span className="badge badge-neutral text-2xs flex items-center gap-1">
                  <Zap size={10} /> Linked: <span className="capitalize">{item.linkedModule}</span>
                </span>
              )}
            </div>

            {item.targetDescription && (
              <p className="text-xs text-content-muted">{item.targetDescription}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => openEditModal(item)}
            disabled={isPastWeek}
            className={`p-1.5 text-content-muted hover:text-content-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted ${TAP_TARGET_Y}`}
            title="Edit Goal"
            aria-label={`Edit goal "${item.title}"`}
          >
            <Edit3 size={15} />
          </button>
          <button
            onClick={() => setDeleteGoalModal(item)}
            disabled={isPastWeek}
            className={`p-1.5 text-content-muted hover:text-rose-theme transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted ${TAP_TARGET_Y}`}
            title="Delete Goal"
            aria-label={`Delete goal "${item.title}"`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* PROGRESS BAR FOR MEASURABLE / LINKED GOALS */}
      <div className="space-y-1.5 pt-1 border-t border-overlay-subtle">
        {prog.needsMetricSelection ? (
          <div className="flex items-center justify-between text-xs text-warning-text bg-warning/10 border border-warning/20 px-2.5 py-1.5 rounded-lg">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={13} />
              <span>Choose what to track for this goal</span>
            </span>
            <button
              onClick={() => openEditModal(item)}
              className="text-micro underline hover:text-content-primary ml-2"
            >
              Choose Metric
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-micro text-content-muted">
              <span>Progress</span>
              <div className="flex items-center gap-2">
                {(!item.linkedModule || item.linkedModule === 'none') && prog.target > 1 && (
                  <div className="flex items-center gap-1 bg-bg-800 px-1.5 py-0.5 rounded-lg border border-overlay-default text-xs">
                    <button
                      onClick={() => {
                        const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                        const newVal = Math.max(0, currentVal - 1);
                        try {
                          store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                        } catch (err: any) {
                          showErrorToast('Failed to update goal', err?.message);
                        }
                      }}
                      disabled={isPastWeek || isFutureWeek || prog.current <= 0}
                      className={`p-0.5 text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted transition-colors ${TAP_TARGET}`}
                      title="Decrement progress"
                      aria-label={`Decrease progress for "${item.title}"`}
                    >
                      <Minus size={12} />
                    </button>
                    <span className="figure text-content-secondary min-w-[16px] text-center">{prog.current}</span>
                    <button
                      onClick={() => {
                        const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                        const newVal = Math.min(prog.target, currentVal + 1);
                        armCompletionPop();
                        try {
                          store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                        } catch (err: any) {
                          showErrorToast('Failed to update goal', err?.message);
                        }
                      }}
                      disabled={isPastWeek || isFutureWeek || prog.current >= prog.target}
                      className={`p-0.5 text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted transition-colors ${TAP_TARGET}`}
                      title="Increment progress"
                      aria-label={`Increase progress for "${item.title}"`}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
                <span className="figure text-content-secondary">
                  {prog.current} / {prog.target} {prog.unit} ({prog.percent}%)
                </span>
              </div>
            </div>

            <ProgressBar value={prog.percent} label="Weekly goal progress" tone={prog.percent >= 100 ? 'success' : 'brand'} />
          </>
        )}
      </div>
    </div>
  );
}

const TREND_WEEKS = 8;

export function WeeklyGoalsView({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const currentWeekKey = weekKey();
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(currentWeekKey);

  const isPastWeek = selectedWeekKey < currentWeekKey;
  const isFutureWeek = selectedWeekKey > currentWeekKey;

  useEffect(() => {
    store.syncLinkedWeeklyGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weeklyGoals = store.state.weeklyGoals;

  // Available unique workout types from history or defaults
  const availableWorkoutTypes = useMemo(() => {
    const fromHistory = (store.state.workouts || [])
      .map((w) => (w.type || '').trim())
      .filter((t) => Boolean(t) && t !== 'Other');
    const defaults = [
      'Running',
      'Cycling',
      'Weightlifting',
      'HIIT',
      'Yoga',
      'Swimming',
      'Walking',
      'Boxing',
      'Pilates',
    ];
    return Array.from(new Set([...fromHistory, ...defaults]));
  }, [store.state.workouts]);

  // Active Goal Document
  const activeGoalDoc = useMemo(() => {
    return (
      weeklyGoals.find((w) => w.weekKey === selectedWeekKey) || {
        id: '',
        weekKey: selectedWeekKey,
        goals: [],
        reflections: [],
        createdAt: new Date().toISOString(),
      }
    );
  }, [weeklyGoals, selectedWeekKey]);

  // Derived progress calculator using registry-based computeLinkedGoalProgress
  const getGoalProgress = useCallback(
    (item: WeeklyGoalItem, targetWeekKey?: string): GoalProgressResult => {
      const weekKeyToUse = targetWeekKey || selectedWeekKey;
      const { dateStrings } = getWeekDates(weekKeyToUse);
      return computeLinkedGoalProgress(item, store.state, dateStrings);
    },
    [selectedWeekKey, store.state]
  );

  // Unaddressed incomplete goals from past weeks
  const unaddressedPastGoals = useMemo(() => {
    if (selectedWeekKey !== currentWeekKey) return [];

    const pastDocs = weeklyGoals.filter((w) => w.weekKey < currentWeekKey);

    // Primary ID-based tracking
    const currentCarriedSourceIds = new Set(
      activeGoalDoc.goals
        .map((g) => g.carriedOverFromGoalId)
        .filter((id): id is string => Boolean(id))
    );
    const supersededSourceGoalIds = new Set<string>();

    // Fallback title-based tracking for legacy data
    const currentGoalTitles = new Set(activeGoalDoc.goals.map((g) => g.title.trim().toLowerCase()));
    const supersededPastGoalKeys = new Set<string>();

    // Collect all past goal instances that were carried forward to a later past week
    pastDocs.forEach((doc) => {
      doc.goals.forEach((g) => {
        if (g.carriedOverFromGoalId) {
          supersededSourceGoalIds.add(g.carriedOverFromGoalId);
        }
        if (g.carriedOverFromWeekKey && g.carriedOverFromWeekKey < currentWeekKey) {
          supersededPastGoalKeys.add(`${g.carriedOverFromWeekKey}:${g.title.trim().toLowerCase()}`);
        }
      });
    });

    const result: { weekKey: string; goal: WeeklyGoalItem }[] = [];

    pastDocs.forEach((doc) => {
      doc.goals.forEach((g) => {
        const titleKey = g.title.trim().toLowerCase();
        const goalKey = `${doc.weekKey}:${titleKey}`;
        const prog = getGoalProgress(g, doc.weekKey);

        const isAddressedById =
          currentCarriedSourceIds.has(g.id) || supersededSourceGoalIds.has(g.id);
        const isAddressedByTitle =
          currentGoalTitles.has(titleKey) || supersededPastGoalKeys.has(goalKey);

        if (
          prog.percent < 100 &&
          !g.archived &&
          !g.carryOverDismissed &&
          !isAddressedById &&
          !isAddressedByTitle
        ) {
          result.push({ weekKey: doc.weekKey, goal: g });
        }
      });
    });

    return result;
  }, [selectedWeekKey, currentWeekKey, weeklyGoals, activeGoalDoc, getGoalProgress]);

  // Carry Over Prompt Modal (Resume vs Start Over)
  const [carryOverPromptModal, setCarryOverPromptModal] = useState<{ pastWeek: string; goal: WeeklyGoalItem } | null>(null);

  // Reflection Local States
  const [showAddReflection, setShowAddReflection] = useState(false);
  const [newReflectionContent, setNewReflectionContent] = useState('');
  const [editingReflection, setEditingReflection] = useState<WeeklyGoalReflection | null>(null);
  const [editReflectionContent, setEditReflectionContent] = useState('');
  const [deleteReflectionModal, setDeleteReflectionModal] = useState<WeeklyGoalReflection | null>(null);

  // Modal State for Create/Edit Goal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<WeeklyGoalItem | null>(null);

  // Modal Form Inputs
  const [title, setTitle] = useState('');
  const [targetDescription, setTargetDescription] = useState('');
  const [priority, setPriority] = useState<WeeklyGoalPriority>('medium');
  const [linkedModule, setLinkedModule] = useState<WeeklyGoalLinkedModule>('none');
  const [linkedItemId, setLinkedItemId] = useState<string>('');
  const [linkedMetricKey, setLinkedMetricKey] = useState<string>('');
  const [targetValue, setTargetValue] = useState<number>(1);
  const [unit, setUnit] = useState<string>('times');

  // Confirmation Modals
  const [deleteGoalModal, setDeleteGoalModal] = useState<WeeklyGoalItem | null>(null);
  const [dismissPastGoalModal, setDismissPastGoalModal] = useState<{ pastWeek: string; goal: WeeklyGoalItem } | null>(null);

  const handleCarryOverClick = (pastWeek: string, goal: WeeklyGoalItem) => {
    const isFreeformStepper =
      (!goal.linkedModule || goal.linkedModule === 'none') &&
      (goal.targetValue || 1) > 1 &&
      (goal.manualProgress || 0) > 0;

    if (isFreeformStepper) {
      setCarryOverPromptModal({ pastWeek, goal });
    } else {
      store.carryOverGoal(pastWeek, currentWeekKey, goal.id);
    }
  };

  const handleCreateReflection = () => {
    if (!newReflectionContent.trim()) return;
    try {
      store.addWeeklyReflection(selectedWeekKey, newReflectionContent);
      setNewReflectionContent('');
      setShowAddReflection(false);
    } catch (err: any) {
      showErrorToast('Failed to add reflection', err?.message);
    }
  };

  const handleUpdateReflection = () => {
    if (!editingReflection || !editReflectionContent.trim()) return;
    try {
      store.updateWeeklyReflection(selectedWeekKey, editingReflection.id, editReflectionContent);
      setEditingReflection(null);
      setEditReflectionContent('');
    } catch (err: any) {
      showErrorToast('Failed to update reflection', err?.message);
    }
  };

  const handleDeleteReflectionConfirm = async () => {
    if (deleteReflectionModal) {
      const reflectionId = deleteReflectionModal.id;
      await executeWithKey(`delete_weekly_reflection_${reflectionId}`, async () => {
        try {
          await store.deleteWeeklyReflection(selectedWeekKey, reflectionId);
          setDeleteReflectionModal(null);
          showSuccessToast('Reflection Deleted', 'Weekly reflection entry removed.', `weekly_reflection_${reflectionId}`);
        } catch (err: any) {
          showErrorToast('Failed to delete reflection', err?.message);
        }
      });
    }
  };

  const handleDeleteGoalConfirm = async () => {
    if (deleteGoalModal) {
      const goalId = deleteGoalModal.id;
      await executeWithKey(`delete_weekly_goal_${goalId}`, async () => {
        try {
          await store.deleteWeeklyGoalItem(selectedWeekKey, goalId);
          setDeleteGoalModal(null);
          showSuccessToast('Goal Deleted', 'Weekly goal removed.', `weekly_goal_${goalId}`);
        } catch (err: any) {
          showErrorToast('Failed to delete goal', err?.message);
        }
      });
    }
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setTitle('');
    setTargetDescription('');
    setPriority('medium');
    setLinkedModule('none');
    setLinkedItemId('');
    setLinkedMetricKey('');
    setTargetValue(1);
    setUnit('times');
    setModalOpen(true);
  };

  const openEditModal = (goal: WeeklyGoalItem) => {
    setEditingGoal(goal);
    setTitle(goal.title);
    setTargetDescription(goal.targetDescription || '');
    setPriority(goal.priority);
    setLinkedModule(goal.linkedModule || 'none');
    setLinkedItemId(goal.linkedItemId || '');
    setLinkedMetricKey(goal.linkedMetricKey || '');
    setTargetValue(goal.targetValue || 1);
    setUnit(goal.unit || 'times');
    setModalOpen(true);
  };

  const handleSaveGoal = () => {
    if (!title.trim()) return;

    if (linkedModule !== 'none') {
      if (linkedModule === 'exercise' && !linkedItemId) {
        showErrorToast('Workout Required', 'Please select a specific workout to link this goal.');
        return;
      }

      if (linkedModule === 'skill' && !linkedItemId) {
        showErrorToast('Skill Required', 'Please select a specific skill to link this goal.');
        return;
      }

      if (linkedModule === 'habit' && !linkedItemId) {
        showErrorToast('Habit Required', 'Please select a specific habit to link this goal.');
        return;
      }

      if (linkedModule === 'reading' && !linkedItemId) {
        showErrorToast('Book Required', 'Please select a specific book to link this goal.');
        return;
      }

      if (!linkedMetricKey) {
        showErrorToast('Metric Required', 'Please select a metric to track for this linked goal.');
        return;
      }
    }

    const payload = {
      title: title.trim(),
      targetDescription: targetDescription.trim(),
      priority,
      linkedModule,
      linkedItemId: linkedModule !== 'none' ? linkedItemId : undefined,
      linkedMetricKey: linkedModule !== 'none' ? linkedMetricKey : undefined,
      targetValue: targetValue && targetValue > 0 ? targetValue : 1,
      unit: linkedModule === 'none' ? (unit.trim() ? unit.trim() : 'times') : undefined,
    };

    try {
      if (editingGoal) {
        store.updateWeeklyGoalItem(selectedWeekKey, editingGoal.id, payload);
      } else {
        store.addWeeklyGoalItem(selectedWeekKey, payload);
      }
      setModalOpen(false);
    } catch (err: any) {
      showErrorToast(editingGoal ? 'Failed to update goal' : 'Failed to add goal', err?.message);
    }
  };

  // Overall Week Completion Summary Stats
  const goalStats = useMemo(() => {
    const activeGoals = activeGoalDoc.goals.filter((g) => !g.archived);
    const total = activeGoals.length;
    if (total === 0) return { total: 0, completed: 0, percent: 0, highPriorityCompleted: 0 };

    let completedCount = 0;
    let highPriorityCompleted = 0;
    let totalPercentSum = 0;

    activeGoals.forEach((g) => {
      const prog = getGoalProgress(g);
      const isDone = g.completed || prog.percent >= 100;
      if (isDone) {
        completedCount++;
        if (g.priority === 'high') highPriorityCompleted++;
      }
      totalPercentSum += prog.percent;
    });

    return {
      total,
      completed: completedCount,
      percent: Math.round(totalPercentSum / total),
      highPriorityCompleted,
    };
  }, [activeGoalDoc.goals, getGoalProgress]);

  // Completion % of the last 8 weeks (same averaging as goalStats), oldest first.
  const weekTrend = useMemo(() => {
    return Array.from({ length: TREND_WEEKS }, (_, i) => {
      const key = offsetWeekKey(currentWeekKey, i - (TREND_WEEKS - 1));
      const goals = (weeklyGoals.find((w) => w.weekKey === key)?.goals ?? []).filter((g) => !g.archived);
      const percent = goals.length
        ? Math.round(goals.reduce((sum, g) => sum + getGoalProgress(g, key).percent, 0) / goals.length)
        : 0;
      return { key, goals: goals.length, percent };
    });
  }, [currentWeekKey, weeklyGoals, getGoalProgress]);
  const trendWeeksWithGoals = weekTrend.filter((w) => w.goals > 0).length;
  const selectedTrendIndex = weekTrend.findIndex((w) => w.key === selectedWeekKey);

  const priorityColor = (p: WeeklyGoalPriority) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500/15 text-rose-theme border-rose-500/30';
      case 'medium':
        return 'bg-overlay-default text-content-secondary border-overlay-medium';
      case 'low':
        return 'bg-overlay-subtle text-content-tertiary border-overlay-default';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & WEEK NAVIGATION CARD */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-overlay-subtle pb-4">
          <div>
            <h1 className="page-title">Weekly Goals</h1>
            <p className="page-subtitle">
              Set the week's goals, watch them fill in, and reflect on Sunday.
            </p>
          </div>

          {/* Week Selector Controls */}
          <div className="flex items-center gap-2 bg-bg-900/60 p-1.5 rounded-xl border border-overlay-subtle self-start md:self-auto">
            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, -1))}
              className={`p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-800 transition-colors ${TAP_TARGET}`}
              title="Previous Week"
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-center px-3">
              <span className="figure text-xs text-content-secondary block">{selectedWeekKey}</span>
              <span className="text-2xs text-content-muted block whitespace-nowrap">
                {formatWeekRange(selectedWeekKey)}
              </span>
            </div>

            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, 1))}
              className={`p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-800 transition-colors ${TAP_TARGET}`}
              title="Next Week"
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>

            {selectedWeekKey !== currentWeekKey && (
              <button
                onClick={() => setSelectedWeekKey(currentWeekKey)}
                className="ml-1 text-micro font-medium text-content-secondary hover:text-content-primary hover:bg-overlay-subtle px-2 py-1 rounded-lg border border-overlay-default transition-colors"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* OVERALL WEEK PROGRESS BAR & SUMMARY BADGES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-content-tertiary flex items-center gap-1.5">
                <BarChart2 size={14} className="text-content-subtle" />
                Weekly goal completion
              </span>
              <span className="figure text-content-secondary">
                <AutoNum text={`${goalStats.percent}%`} /> Complete ({goalStats.completed}/{goalStats.total})
              </span>
            </div>
            <ProgressBar value={goalStats.percent} label="Weekly target completion" size="lg" />
          </div>

          <div className="flex items-center justify-around md:border-l md:border-overlay-subtle">
            <div className="text-center">
              <CountUp value={goalStats.total} className="font-medium text-3xl leading-none text-content-primary block tabular-nums" />
              <span className="stat-label mt-1 block">Total Goals</span>
            </div>
            <div className="w-px h-8 bg-overlay-default" />
            <div className="text-center">
              <CountUp value={goalStats.completed} className="font-medium text-3xl leading-none text-success-text block tabular-nums" />
              <span className="stat-label mt-1 block">Completed</span>
            </div>
            <div className="w-px h-8 bg-overlay-default" />
            <div className="text-center">
              <CountUp value={goalStats.highPriorityCompleted} className="font-medium text-3xl leading-none text-content-primary block tabular-nums" />
              <span className="stat-label mt-1 block">High Pri Done</span>
            </div>
          </div>
        </div>
      </div>

      <PageColumns
        lead={
          <>
            {/* LAST 8 WEEKS TREND (needs at least two planned weeks to say anything) */}
            {trendWeeksWithGoals >= 2 && (
              <Reveal className="card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Last {TREND_WEEKS} Weeks</h2>
                  <span className="text-xs text-content-muted">Weekly target completion</span>
                </div>
                <BarChart
                  data={weekTrend.map((w) => ({ label: formatWeekRange(w.key).split(' –')[0], value: w.percent }))}
                  label={`Weekly goal completion, last ${TREND_WEEKS} weeks`}
                  max={100}
                  highlightIndex={selectedTrendIndex >= 0 ? selectedTrendIndex : undefined}
                  formatTooltip={(_, i) => {
                    const w = weekTrend[i];
                    return w.goals ? `${formatWeekRange(w.key)}: ${w.percent}% of ${w.goals} goal${w.goals > 1 ? 's' : ''}` : `${formatWeekRange(w.key)}: no goals`;
                  }}
                />
              </Reveal>
            )}

            {/* CARRY-OVER PROMPT BANNER FOR INCOMPLETE PAST GOALS */}
            {unaddressedPastGoals.length > 0 && selectedWeekKey === currentWeekKey && (
              <div className="card p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-warning-text shrink-0 mt-0.5" />
                  <div>
                    <h3 className="item-name text-sm !text-warning-text">Unresolved Goals from Previous Weeks</h3>
                    <p className="text-xs text-content-secondary mt-0.5">
                      You have {unaddressedPastGoals.length} incomplete priority goal{unaddressedPastGoals.length > 1 ? 's' : ''} from earlier weeks.
                      Select whether to carry them over into this week or dismiss them.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-overlay-subtle pt-1">
                  {unaddressedPastGoals.map(({ weekKey: pastWeek, goal }) => (
                    <div
                      key={`${pastWeek}-${goal.id}`}
                      className="scroll-rise flex items-center justify-between py-2.5"
                    >
                      <div className="space-y-0.5">
                        <span className="item-name text-xs text-content-secondary block">{goal.title}</span>
                        <span className="text-2xs text-warning-text">
                          From {pastWeek} (<span className="capitalize">{goal.priority}</span> Priority)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCarryOverClick(pastWeek, goal)}
                          className="btn-primary text-micro py-1 px-2.5 flex items-center gap-1"
                        >
                          <ArrowRight size={12} /> Carry Over
                        </button>
                        <button
                          onClick={() => setDismissPastGoalModal({ pastWeek, goal })}
                          className="btn-secondary text-micro py-1 px-2 text-content-muted hover:text-content-secondary"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WEEKLY GOALS LIST SECTION */}
            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-overlay-subtle pb-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Target size={16} className="text-content-subtle shrink-0" />
                  <h3 className="section-title">
                    Target Priorities for {selectedWeekKey}
                  </h3>
                  <span className="figure text-2xs text-content-muted">
                    {calculateWeeklyGoalsPoints(activeGoalDoc.goals).pointsAwarded}/{WEEKLY_GOALS_POINTS.maxWeeklyPoints} pts
                  </span>
                </div>

                <button
                  onClick={openCreateModal}
                  disabled={isPastWeek}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} /> Add Weekly Goal
                </button>
              </div>

              {isPastWeek && (
                <p className="text-micro text-content-muted">Past weeks are read-only.</p>
              )}
              {isFutureWeek && (
                <p className="text-micro text-content-muted">
                  Future weeks are for planning: goals can't be completed and reflections can't be written yet.
                </p>
              )}

              {selectedWeekKey === currentWeekKey && (() => {
                const weeklyGoalsScore = calculateWeeklyGoalsPoints(activeGoalDoc.goals);
                return (
                  <CapMeter
                    variant="bar"
                    label={`Weekly goals points (${weeklyGoalsScore.completedGoalsCount} achieved, ${weeklyGoalsScore.countedGoalsCount} counted)`}
                    earned={weeklyGoalsScore.pointsAwarded}
                    cap={WEEKLY_GOALS_POINTS.maxWeeklyPoints}
                    note={weeklyGoalsCapNote(getWeekReflectionCutoff(selectedWeekKey))}
                  />
                );
              })()}

              {activeGoalDoc.goals.filter((g) => !g.archived).length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="No Weekly Goals Set Yet"
                  description="Pick 1-3 measurable priorities for this week."
                  size="sm"
                  surface={false}
                  action={
                    <button
                      onClick={openCreateModal}
                      disabled={isPastWeek}
                      className="btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} /> Set First Goal
                    </button>
                  }
                />
              ) : (
                <div className="divide-y divide-overlay-subtle">
                  {activeGoalDoc.goals.filter((g) => !g.archived).map((item) => (
                    <GoalItemRow
                      key={item.id}
                      item={item}
                      selectedWeekKey={selectedWeekKey}
                      isPastWeek={isPastWeek}
                      isFutureWeek={isFutureWeek}
                      getGoalProgress={getGoalProgress}
                      store={store}
                      showErrorToast={showErrorToast}
                      priorityColor={priorityColor}
                      openEditModal={openEditModal}
                      setDeleteGoalModal={setDeleteGoalModal}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        }
        aside={
          <>
            {/* SUNDAY EVENING REVIEW & REFLECTIONS CARD */}
            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-overlay-subtle pb-3">
                <div>
                  <h3 className="section-title flex items-center gap-2">
                    <PenLine size={16} className="text-content-subtle" />
                    Weekly Reflections
                  </h3>
                  <p className="text-xs text-content-muted mt-0.5">
                    Reflect on wins, friction, and execution velocity. The first reflection each week awards +{WEEKLY_REFLECTION_POINTS.awarded} pts.
                  </p>
                </div>

                {!showAddReflection && (
                  <button
                    onClick={() => {
                      setShowAddReflection(true);
                      setNewReflectionContent('');
                    }}
                    disabled={isPastWeek || isFutureWeek}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} />
                    <span>Add Reflection</span>
                  </button>
                )}
              </div>

              {/* ADD REFLECTION FORM */}
              {showAddReflection && (
                <div className="p-3.5 bg-bg-800/80 border border-overlay-default rounded-xl space-y-3">
                  <label htmlFor="new-reflection-content" className="block text-xs font-medium text-content-tertiary">
                    New Reflection Entry
                  </label>
                  <textarea
                    id="new-reflection-content"
                    value={newReflectionContent}
                    onChange={(e) => setNewReflectionContent(e.target.value)}
                    placeholder="What went well? What got in the way? What will you change next week?"
                    className="input min-h-[90px] text-xs leading-relaxed"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setShowAddReflection(false)}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateReflection}
                      disabled={isPastWeek || isFutureWeek}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={14} />
                      <span>Save Reflection</span>
                    </button>
                  </div>
                </div>
              )}

              {/* LIST OF REFLECTIONS */}
              <div className="divide-y divide-overlay-subtle">
                {(() => {
                  const reflectionCutoff = getWeekReflectionCutoff(selectedWeekKey);
                  const isBeforeCutoff = getNow() < reflectionCutoff;
                  const reflections = activeGoalDoc.reflections || [];
                  const latestReflection = reflections.length > 0
                    ? reflections.reduce(
                        (prevMax, curr) => (new Date(curr.createdAt).getTime() > new Date(prevMax.createdAt).getTime() ? curr : prevMax),
                        reflections[0]
                      )
                    : null;

                  return (
                    <>
                      {reflections.length === 0 && !showAddReflection && (
                        <EmptyState
                          icon={PenLine}
                          title={selectedWeekKey === currentWeekKey ? `No reflections added for ${selectedWeekKey} yet.` : `No reflections added for ${selectedWeekKey}.`}
                          description={selectedWeekKey === currentWeekKey ? 'Use "+ Add Reflection" above to write one.' : undefined}
                          size="sm"
                          surface={false}
                        />
                      )}

                      {reflections.map((ref) => {
                        const isEditingThis = editingReflection?.id === ref.id;

                        if (isEditingThis) {
                          return (
                            <div key={ref.id} className="py-3.5 first:pt-0 space-y-3">
                              <label htmlFor="edit-reflection-content" className="block text-xs font-medium text-content-tertiary">
                                Edit Reflection
                              </label>
                              <textarea
                                id="edit-reflection-content"
                                value={editReflectionContent}
                                onChange={(e) => setEditReflectionContent(e.target.value)}
                                className="input min-h-[90px] text-xs leading-relaxed"
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setEditingReflection(null)}
                                  className="btn-secondary text-xs py-1.5 px-3"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleUpdateReflection}
                                  disabled={isPastWeek || isFutureWeek}
                                  className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={ref.id}
                            className="py-3.5 first:pt-0 space-y-2"
                          >
                            <div className="flex items-center justify-between text-micro text-content-muted">
                              <div className="flex items-center gap-2">
                                <span className="figure text-content-tertiary">
                                  {new Date(ref.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isWeeklyReflectionAwarded(selectedWeekKey, ref.id, store.state) ? (
                                  <span className="badge badge-emerald figure text-2xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Check size={11} /> +{WEEKLY_REFLECTION_POINTS.awarded} pts
                                  </span>
                                ) : isBeforeCutoff && latestReflection?.id === ref.id ? (
                                  <span
                                    className="badge badge-neutral figure text-2xs px-2 py-0.5 rounded-full flex items-center gap-1"
                                    title="Points will be awarded when cutoff passes on Sunday 17:00"
                                  >
                                    <Clock size={11} /> Pending +{WEEKLY_REFLECTION_POINTS.awarded} pts
                                  </span>
                                ) : null}
                              </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingReflection(ref);
                              setEditReflectionContent(ref.content);
                            }}
                            disabled={isPastWeek || isFutureWeek}
                            className={`p-1 text-content-muted hover:text-content-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted ${TAP_TARGET_Y}`}
                            title="Edit reflection"
                            aria-label="Edit reflection"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteReflectionModal(ref)}
                            disabled={isPastWeek || isFutureWeek}
                            className={`p-1 text-content-muted hover:text-rose-theme transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-content-muted ${TAP_TARGET_Y}`}
                            title="Delete reflection"
                            aria-label="Delete reflection"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-content-secondary leading-relaxed whitespace-pre-wrap">
                        {ref.content}
                      </p>
                    </div>
                  );
                })}
              </>
            );
          })()}
              </div>
            </div>
          </>
        }
      />

      {/* CREATE / EDIT GOAL MODAL */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGoal ? 'Edit Weekly Goal' : 'Add Weekly Goal'}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label htmlFor="goal-title" className="block text-xs font-medium text-content-tertiary mb-1">
              Goal Title <span className="text-rose-theme">*</span>
            </label>
            <input
              id="goal-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete 3 Workouts, Read 50 pages, Run 10km"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="goal-description" className="block text-xs font-medium text-content-tertiary mb-1">
              Description
            </label>
            <textarea
              id="goal-description"
              value={targetDescription}
              onChange={(e) => setTargetDescription(e.target.value)}
              placeholder="Why it matters and when you'll do it"
              className="input min-h-[70px] text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-priority" className="block text-xs font-medium text-content-tertiary mb-1">
                Priority Level
              </label>
              <select
                id="goal-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as WeeklyGoalPriority)}
                className="input w-full bg-bg-800"
              >
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>

            <div>
              <label htmlFor="goal-linked-module" className="block text-xs font-medium text-content-tertiary mb-1">
                Link Tracker Module
              </label>
              <select
                id="goal-linked-module"
                value={linkedModule}
                onChange={(e) => {
                  const mod = e.target.value as WeeklyGoalLinkedModule;
                  setLinkedModule(mod);
                  setLinkedItemId('');
                  setLinkedMetricKey('');
                }}
                className="input w-full bg-bg-800"
              >
                <option value="none">None (Manual)</option>
                <option value="habit">Habit Tracker</option>
                <option value="exercise">Exercise Tracker</option>
                <option value="reading">Reading Logs</option>
                <option value="skill">Skill Tracker</option>
              </select>
            </div>
          </div>

          {/* ITEM SELECTOR DEPENDING ON LINKED MODULE */}
          {linkedModule === 'exercise' && (
            <div>
              <label htmlFor="goal-workout-item" className="block text-xs font-medium text-content-tertiary mb-1">
                Select Workout <span className="text-rose-theme">*</span>
              </label>
              <select
                id="goal-workout-item"
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="" disabled>Select a specific workout...</option>
                {availableWorkoutTypes.map((workoutName) => (
                  <option key={workoutName} value={workoutName}>
                    {workoutName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {linkedModule === 'habit' && (
            <div>
              <label htmlFor="goal-habit-item" className="block text-xs font-medium text-content-tertiary mb-1">
                Select Habit <span className="text-rose-theme">*</span>
              </label>
              <select
                id="goal-habit-item"
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="" disabled>Select a specific habit...</option>
                {store.state.habits.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {linkedModule === 'reading' && (
            <div>
              <label htmlFor="goal-book-item" className="block text-xs font-medium text-content-tertiary mb-1">
                Select Book <span className="text-rose-theme">*</span>
              </label>
              <select
                id="goal-book-item"
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="" disabled>Select a specific book...</option>
                {store.state.libraryBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} {b.status === 'completed' ? '(Completed)' : b.status === 'reading' ? '(Reading)' : '(To Read)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {linkedModule === 'skill' && (
            <div>
              <label htmlFor="goal-skill-item" className="block text-xs font-medium text-content-tertiary mb-1">
                Select Skill <span className="text-rose-theme">*</span>
              </label>
              <select
                id="goal-skill-item"
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="" disabled>Select a specific skill...</option>
                {store.state.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* TARGET VALUE & METRIC / UNIT INPUTS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-target-amount" className="block text-xs font-medium text-content-tertiary mb-1">
                Target Goal Amount
              </label>
              <input
                id="goal-target-amount"
                type="number"
                min="1"
                value={targetValue}
                onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 1)}
                className="input w-full"
              />
            </div>

            {linkedModule !== 'none' ? (
              <div>
                <label htmlFor="goal-metric-key" className="block text-xs font-medium text-content-tertiary mb-1">
                  Select Metric <span className="text-rose-theme">*</span>
                </label>
                <select
                  id="goal-metric-key"
                  value={linkedMetricKey}
                  onChange={(e) => setLinkedMetricKey(e.target.value)}
                  className="input w-full bg-bg-800"
                >
                  <option value="" disabled>Select metric...</option>
                  {(LINKED_GOAL_METRICS[linkedModule as LinkedModule] || []).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="goal-unit-label" className="block text-xs font-medium text-content-tertiary mb-1">
                  Unit Label
                </label>
                <input
                  id="goal-unit-label"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. sessions, mins, pages, posts"
                  className="input w-full"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-overlay-default">
            <button
              onClick={() => setModalOpen(false)}
              className="btn-secondary text-xs flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveGoal}
              disabled={!title.trim() || (linkedModule !== 'none' && !linkedMetricKey)}
              className="btn-primary text-xs flex-1 disabled:opacity-50"
            >
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DELETE GOAL MODAL */}
      <ConfirmDeleteModal
        open={Boolean(deleteGoalModal)}
        onClose={() => setDeleteGoalModal(null)}
        onConfirm={handleDeleteGoalConfirm}
        isDeleting={deleteGoalModal ? isKeyLoading(`delete_weekly_goal_${deleteGoalModal.id}`) : false}
        title="Delete Weekly Goal?"
        itemName={deleteGoalModal?.title}
        description={`Are you sure you want to delete "${deleteGoalModal?.title}"?`}
      />

      {/* CONFIRM DISMISS PAST GOAL MODAL */}
      <ConfirmDeleteModal
        open={Boolean(dismissPastGoalModal)}
        onClose={() => setDismissPastGoalModal(null)}
        onConfirm={() => {
          if (dismissPastGoalModal) {
            try {
              store.updateWeeklyGoalItem(dismissPastGoalModal.pastWeek, dismissPastGoalModal.goal.id, {
                carryOverDismissed: true,
              });
              setDismissPastGoalModal(null);
            } catch (err: any) {
              showErrorToast('Failed to dismiss goal', err?.message);
            }
          }
        }}
        title="Dismiss Carry-Over Goal?"
        itemName={dismissPastGoalModal?.goal.title}
        description={`Are you sure you want to dismiss "${dismissPastGoalModal?.goal.title}"? It will remain recorded in ${dismissPastGoalModal?.pastWeek} but won't be suggested for carry-over again.`}
        confirmText="Dismiss"
      />

      {/* CARRY OVER PROMPT MODAL (RESUME vs START OVER) */}
      <Dialog
        open={Boolean(carryOverPromptModal)}
        onClose={() => setCarryOverPromptModal(null)}
        title="Carry Over Goal"
      >
        <div className="space-y-4">
          <p className="text-xs text-content-tertiary leading-relaxed">
            How would you like to carry over <strong className="text-content-primary">"{carryOverPromptModal?.goal.title}"</strong> into {currentWeekKey}?
          </p>
          <div className="card p-3 space-y-1">
            <span className="text-micro text-content-muted block">Current Progress in {carryOverPromptModal?.pastWeek}:</span>
            <span className="figure text-sm text-content-primary block">
              {carryOverPromptModal?.goal.manualProgress || 0} / {carryOverPromptModal?.goal.targetValue} {carryOverPromptModal?.goal.unit || 'times'}
            </span>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                if (carryOverPromptModal) {
                  store.carryOverGoal(carryOverPromptModal.pastWeek, currentWeekKey, carryOverPromptModal.goal.id, { resumeProgress: true });
                  setCarryOverPromptModal(null);
                }
              }}
              className="btn-primary text-xs py-2.5 px-4 flex items-center justify-between"
            >
              <span>Resume Progress</span>
              <span className="font-normal opacity-90 text-micro">
                Continue from {carryOverPromptModal?.goal.manualProgress}/{carryOverPromptModal?.goal.targetValue}
              </span>
            </button>
            <button
              onClick={() => {
                if (carryOverPromptModal) {
                  store.carryOverGoal(carryOverPromptModal.pastWeek, currentWeekKey, carryOverPromptModal.goal.id, { resumeProgress: false });
                  setCarryOverPromptModal(null);
                }
              }}
              className="btn-secondary text-xs py-2.5 px-4 flex items-center justify-between"
            >
              <span>Start Over</span>
              <span className="font-normal text-content-muted text-micro">
                Reset to 0/{carryOverPromptModal?.goal.targetValue}
              </span>
            </button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DELETE REFLECTION MODAL */}
      <ConfirmDeleteModal
        open={Boolean(deleteReflectionModal)}
        onClose={() => setDeleteReflectionModal(null)}
        onConfirm={handleDeleteReflectionConfirm}
        isDeleting={deleteReflectionModal ? isKeyLoading(`delete_weekly_reflection_${deleteReflectionModal.id}`) : false}
        title="Delete Reflection?"
        itemName={deleteReflectionModal ? (deleteReflectionModal.content.length > 30 ? deleteReflectionModal.content.substring(0, 30) + '...' : deleteReflectionModal.content) : ''}
        description={
          deleteReflectionModal && isWeeklyReflectionAwarded(selectedWeekKey, deleteReflectionModal.id, store.state)
            ? `Are you sure you want to delete this reflection? Since it earned points, ${WEEKLY_REFLECTION_POINTS.awarded} pts will be deducted. (Your weekly goals will remain untouched).`
            : 'Delete this reflection? Your weekly goals stay as they are.'
        }
        confirmText="Delete Reflection"
      />
    </div>
  );
}
