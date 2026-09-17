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
  Sparkles,
} from 'lucide-react';
import { AppStore, isWeeklyReflectionAwarded } from '@/lib/store';
import { WEEKLY_REFLECTION_POINTS } from '@/lib/pointsConfig';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
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

export function WeeklyGoalsView({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const currentWeekKey = weekKey();
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(currentWeekKey);

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
    store.addWeeklyReflection(selectedWeekKey, newReflectionContent);
    setNewReflectionContent('');
    setShowAddReflection(false);
  };

  const handleUpdateReflection = () => {
    if (!editingReflection || !editReflectionContent.trim()) return;
    store.updateWeeklyReflection(selectedWeekKey, editingReflection.id, editReflectionContent);
    setEditingReflection(null);
    setEditReflectionContent('');
  };

  const handleDeleteReflectionConfirm = async () => {
    if (deleteReflectionModal) {
      const reflectionId = deleteReflectionModal.id;
      await executeWithKey(`delete_weekly_reflection_${reflectionId}`, async () => {
        store.deleteWeeklyReflection(selectedWeekKey, reflectionId);
        setDeleteReflectionModal(null);
        showSuccessToast('Reflection Deleted', 'Weekly reflection entry removed.', `weekly_reflection_${reflectionId}`);
      });
    }
  };

  const handleDeleteGoalConfirm = async () => {
    if (deleteGoalModal) {
      const goalId = deleteGoalModal.id;
      await executeWithKey(`delete_weekly_goal_${goalId}`, async () => {
        store.deleteWeeklyGoalItem(selectedWeekKey, goalId);
        setDeleteGoalModal(null);
        showSuccessToast('Goal Deleted', 'Weekly goal removed.', `weekly_goal_${goalId}`);
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

    if (editingGoal) {
      store.updateWeeklyGoalItem(selectedWeekKey, editingGoal.id, payload);
    } else {
      store.addWeeklyGoalItem(selectedWeekKey, payload);
    }

    setModalOpen(false);
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

  const priorityColor = (p: WeeklyGoalPriority) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500/15 text-rose-theme border-rose-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-warning-text border-amber-500/30';
      case 'low':
        return 'bg-overlay-subtle text-content-tertiary border-overlay-default';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & WEEK NAVIGATION CARD */}
      <div className="card p-5 space-y-4 border border-overlay-default bg-bg-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-overlay-subtle pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Target size={24} className="text-success-text" />
              <h1 className="text-2xl font-display font-bold text-content-primary">Weekly Executive Goals & Review</h1>
            </div>
            <p className="text-sm text-content-muted mt-1">
              Set high-leverage measurable goals, auto-sync activity progress across trackers, and conduct structured Sunday reflections.
            </p>
          </div>

          {/* Week Selector Controls */}
          <div className="flex items-center gap-2 bg-bg-900/60 p-1.5 rounded-xl border border-overlay-subtle self-start md:self-auto">
            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, -1))}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-800 transition-colors"
              title="Previous Week"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-center px-3">
              <span className="text-xs font-bold text-content-secondary block">{selectedWeekKey}</span>
              <span className="text-[10px] text-content-muted block whitespace-nowrap">
                {formatWeekRange(selectedWeekKey)}
              </span>
            </div>

            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, 1))}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-800 transition-colors"
              title="Next Week"
            >
              <ChevronRight size={16} />
            </button>

            {selectedWeekKey !== currentWeekKey && (
              <button
                onClick={() => setSelectedWeekKey(currentWeekKey)}
                className="ml-1 text-[11px] font-bold text-brand-text hover:opacity-80 bg-primary-500/10 px-2 py-1 rounded-lg border border-primary-500/20 transition-all"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* OVERALL WEEK PROGRESS BAR & SUMMARY BADGES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="md:col-span-2 bg-bg-900/40 p-3.5 rounded-xl border border-overlay-subtle space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-content-tertiary flex items-center gap-1.5">
                <BarChart2 size={14} className="text-brand-text" />
                Weekly Target Completion
              </span>
              <span className="text-brand-text font-bold">{goalStats.percent}% Complete ({goalStats.completed}/{goalStats.total})</span>
            </div>
            <div className="w-full bg-bg-900 rounded-full h-2.5 overflow-hidden border border-overlay-subtle">
              <div
                className="bg-gradient-to-r from-primary-500 to-emerald-400 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${goalStats.percent}%` }}
              />
            </div>
          </div>

          <div className="bg-bg-900/40 p-3.5 rounded-xl border border-overlay-subtle flex items-center justify-around">
            <div className="text-center">
              <span className="text-lg font-bold text-content-primary block">{goalStats.total}</span>
              <span className="text-[10px] uppercase tracking-wider text-content-muted font-medium">Total Goals</span>
            </div>
            <div className="w-px h-8 bg-overlay-default" />
            <div className="text-center">
              <span className="text-lg font-bold text-success-text block">{goalStats.completed}</span>
              <span className="text-[10px] uppercase tracking-wider text-content-muted font-medium">Completed</span>
            </div>
            <div className="w-px h-8 bg-overlay-default" />
            <div className="text-center">
              <span className="text-lg font-bold text-rose-theme block">{goalStats.highPriorityCompleted}</span>
              <span className="text-[10px] uppercase tracking-wider text-content-muted font-medium">High Pri Done</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARRY-OVER PROMPT BANNER FOR INCOMPLETE PAST GOALS */}
      {unaddressedPastGoals.length > 0 && selectedWeekKey === currentWeekKey && (
        <div className="card p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-warning-text shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-warning-text">Unresolved Goals from Previous Weeks</h3>
              <p className="text-xs text-content-secondary mt-0.5">
                You have {unaddressedPastGoals.length} incomplete priority goal{unaddressedPastGoals.length > 1 ? 's' : ''} from earlier weeks.
                Select whether to carry them over into this week or dismiss them.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {unaddressedPastGoals.map(({ weekKey: pastWeek, goal }) => (
              <div
                key={`${pastWeek}-${goal.id}`}
                className="flex items-center justify-between p-2.5 bg-bg-900/70 border border-overlay-default rounded-lg"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-content-secondary block">{goal.title}</span>
                  <span className="text-[10px] text-warning-text font-medium">
                    From {pastWeek} ({goal.priority.toUpperCase()} Priority)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCarryOverClick(pastWeek, goal)}
                    className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1"
                  >
                    <ArrowRight size={12} /> Carry Over
                  </button>
                  <button
                    onClick={() => setDismissPastGoalModal({ pastWeek, goal })}
                    className="btn-secondary text-[11px] py-1 px-2 text-content-muted hover:text-content-secondary"
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
        <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-brand-text" />
            <h3 className="text-sm font-bold text-content-secondary">
              Target Priorities for {selectedWeekKey}
            </h3>
          </div>

          <button
            onClick={openCreateModal}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Weekly Goal
          </button>
        </div>

        {activeGoalDoc.goals.filter((g) => !g.archived).length === 0 ? (
          <div className="text-center py-8 space-y-3 bg-bg-900/30 rounded-xl border border-dashed border-overlay-default">
            <Target size={28} className="text-content-subtle mx-auto" />
            <div>
              <p className="text-xs font-semibold text-content-tertiary">No Weekly Goals Set Yet</p>
              <p className="text-[11px] text-content-disabled">
                Define 1-3 measurable, high-leverage priorities to align your effort this week.
              </p>
            </div>
            <button onClick={openCreateModal} className="btn-secondary text-xs inline-flex items-center gap-1.5">
              <Plus size={14} /> Set First Goal
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoalDoc.goals.filter((g) => !g.archived).map((item) => {
              const prog = getGoalProgress(item);
              const isDone = item.completed || prog.percent >= 100;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isDone
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-bg-900/60 border-overlay-default hover:border-overlay-strong'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        onClick={() => {
                          const isFreeformWithStepper = (!item.linkedModule || item.linkedModule === 'none') && prog.target > 1;
                          const nextCompleted = !isDone;

                          if (isFreeformWithStepper) {
                            store.updateWeeklyGoalItem(selectedWeekKey, item.id, {
                              completed: nextCompleted,
                            });
                          } else {
                            store.updateWeeklyGoalItem(selectedWeekKey, item.id, {
                              completed: nextCompleted,
                              manualProgress: nextCompleted ? (item.targetValue || 1) : 0,
                            });
                          }
                        }}
                        className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-all border ${
                          isDone
                            ? 'bg-emerald-500 border-emerald-400 text-bg-900 font-bold'
                            : 'bg-bg-800 border-overlay-strong text-content-disabled hover:border-overlay-heavy'
                        }`}
                      >
                        {isDone ? <Check size={14} /> : <Circle size={14} />}
                      </button>

                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-semibold text-content-primary ${
                              isDone ? 'line-through text-content-muted' : ''
                            }`}
                          >
                            {item.title}
                          </span>

                          <span className={`badge text-[10px] font-bold border ${priorityColor(item.priority)}`}>
                            {item.priority.toUpperCase()}
                          </span>

                          {item.carriedOverFromWeekKey && (
                            <span className="badge badge-purple text-[10px]">
                              Carried over from {item.carriedOverFromWeekKey}
                            </span>
                          )}

                          {item.linkedModule && item.linkedModule !== 'none' && (
                            <span className="badge badge-cyan text-[10px] flex items-center gap-1">
                              <Zap size={10} /> Linked: {item.linkedModule.toUpperCase()}
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
                        className="p-1.5 text-content-muted hover:text-content-secondary transition-colors"
                        title="Edit Goal"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteGoalModal(item)}
                        className="p-1.5 text-content-muted hover:text-rose-theme transition-colors"
                        title="Delete Goal"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* PROGRESS BAR FOR MEASURABLE / LINKED GOALS */}
                  <div className="space-y-1.5 pt-1 border-t border-overlay-subtle">
                    {prog.needsMetricSelection ? (
                      <div className="flex items-center justify-between text-xs text-warning-text bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle size={13} />
                          <span>Choose what to track for this goal</span>
                        </span>
                        <button
                          onClick={() => openEditModal(item)}
                          className="text-[11px] underline hover:text-content-primary font-medium ml-2"
                        >
                          Choose Metric
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-content-muted font-medium">
                          <span>Progress</span>
                          <div className="flex items-center gap-2">
                            {(!item.linkedModule || item.linkedModule === 'none') && prog.target > 1 && (
                              <div className="flex items-center gap-1 bg-bg-800 px-1.5 py-0.5 rounded-lg border border-overlay-default text-xs">
                                <button
                                  onClick={() => {
                                    const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                                    const newVal = Math.max(0, currentVal - 1);
                                    store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                                  }}
                                  disabled={prog.current <= 0}
                                  className="p-0.5 text-content-muted hover:text-content-primary disabled:opacity-30 disabled:hover:text-content-muted transition-colors"
                                  title="Decrement progress"
                                >
                                  <Minus size={12} />
                                </button>
                                <span className="font-bold text-content-secondary min-w-[16px] text-center">{prog.current}</span>
                                <button
                                  onClick={() => {
                                    const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                                    const newVal = Math.min(prog.target, currentVal + 1);
                                    store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                                  }}
                                  disabled={prog.current >= prog.target}
                                  className="p-0.5 text-content-muted hover:text-content-primary disabled:opacity-30 disabled:hover:text-content-muted transition-colors"
                                  title="Increment progress"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            )}
                            <span className="text-content-secondary font-bold">
                              {prog.current} / {prog.target} {prog.unit} ({prog.percent}%)
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-bg-800 rounded-full h-2 overflow-hidden border border-overlay-subtle">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              prog.percent >= 100
                                ? 'bg-emerald-400'
                                : 'bg-primary-500'
                            }`}
                            style={{ width: `${prog.percent}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SUNDAY EVENING REVIEW & REFLECTIONS CARD */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
          <div>
            <h3 className="text-sm font-bold text-content-secondary flex items-center gap-2">
              <Sparkles size={16} className="text-warning-text" />
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
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Add Reflection</span>
            </button>
          )}
        </div>

        {/* ADD REFLECTION FORM */}
        {showAddReflection && (
          <div className="p-3.5 bg-bg-800/80 border border-overlay-default rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-content-secondary">
              New Reflection Entry
            </label>
            <textarea
              value={newReflectionContent}
              onChange={(e) => setNewReflectionContent(e.target.value)}
              placeholder="What went exceptionally well? What friction did you encounter? What key adjustment will you make next week?"
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
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Save Reflection</span>
              </button>
            </div>
          </div>
        )}

        {/* LIST OF REFLECTIONS */}
        <div className="space-y-3">
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
                  <div className="text-center py-6 border border-dashed border-overlay-subtle rounded-xl text-content-disabled text-xs">
                    No reflections added for {selectedWeekKey} yet. Click "+ Add Reflection" above to add your insights.
                  </div>
                )}

                {reflections.map((ref) => {
                  const isEditingThis = editingReflection?.id === ref.id;

                  if (isEditingThis) {
                    return (
                      <div key={ref.id} className="p-3.5 bg-bg-800/80 border border-overlay-default rounded-xl space-y-3">
                        <label className="block text-xs font-semibold text-content-secondary">
                          Edit Reflection
                        </label>
                        <textarea
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
                            className="btn-primary text-xs py-1.5 px-3"
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
                      className="p-3.5 bg-bg-800/60 border border-overlay-subtle hover:border-overlay-default rounded-xl space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between text-[11px] text-content-muted">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-content-tertiary">
                            {new Date(ref.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isWeeklyReflectionAwarded(selectedWeekKey, ref.id, store.state) ? (
                            <span className="badge badge-emerald text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles size={11} /> +{WEEKLY_REFLECTION_POINTS.awarded} pts
                            </span>
                          ) : isBeforeCutoff && latestReflection?.id === ref.id ? (
                            <span
                              className="badge badge-amber text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                              title="Points will be awarded when cutoff passes on Sunday 17:00"
                            >
                              <Sparkles size={11} /> Pending +{WEEKLY_REFLECTION_POINTS.awarded} pts
                            </span>
                          ) : null}
                        </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingReflection(ref);
                        setEditReflectionContent(ref.content);
                      }}
                      className="p-1 text-content-muted hover:text-content-secondary transition-colors"
                      title="Edit reflection"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteReflectionModal(ref)}
                      className="p-1 text-content-muted hover:text-rose-theme transition-colors"
                      title="Delete reflection"
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

      {/* CREATE / EDIT GOAL MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGoal ? 'Edit Weekly Goal' : 'Add Weekly Goal'}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-content-tertiary mb-1">
              Goal Title <span className="text-rose-theme">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete 3 Workouts, Read 50 pages, Run 10km"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-tertiary mb-1">
              Target Description & Strategy
            </label>
            <textarea
              value={targetDescription}
              onChange={(e) => setTargetDescription(e.target.value)}
              placeholder="Why is this high leverage? How will you schedule this?"
              className="input min-h-[70px] text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Priority Level
              </label>
              <select
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
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Link Tracker Module
              </label>
              <select
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
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Select Workout <span className="text-rose-theme">*</span>
              </label>
              <select
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
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Select Habit <span className="text-rose-theme">*</span>
              </label>
              <select
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
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Select Book <span className="text-rose-theme">*</span>
              </label>
              <select
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="" disabled>Select a specific book...</option>
                {store.state.libraryBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} {b.status === 'completed' ? '✓ (Completed)' : b.status === 'reading' ? '📖 (Reading)' : '⏳ (To Read)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {linkedModule === 'skill' && (
            <div>
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Select Skill <span className="text-rose-theme">*</span>
              </label>
              <select
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
              <label className="block text-xs font-semibold text-content-tertiary mb-1">
                Target Goal Amount
              </label>
              <input
                type="number"
                min="1"
                value={targetValue}
                onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 1)}
                className="input w-full"
              />
            </div>

            {linkedModule !== 'none' ? (
              <div>
                <label className="block text-xs font-semibold text-content-tertiary mb-1">
                  Select Metric <span className="text-rose-theme">*</span>
                </label>
                <select
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
                <label className="block text-xs font-semibold text-content-tertiary mb-1">
                  Unit Label
                </label>
                <input
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
      </Modal>

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
            store.updateWeeklyGoalItem(dismissPastGoalModal.pastWeek, dismissPastGoalModal.goal.id, {
              carryOverDismissed: true,
            });
            setDismissPastGoalModal(null);
          }
        }}
        title="Dismiss Carry-Over Goal?"
        itemName={dismissPastGoalModal?.goal.title}
        description={`Are you sure you want to dismiss "${dismissPastGoalModal?.goal.title}"? It will remain recorded in ${dismissPastGoalModal?.pastWeek} but won't be suggested for carry-over again.`}
        confirmText="Dismiss"
      />

      {/* CARRY OVER PROMPT MODAL (RESUME vs START OVER) */}
      <Modal
        open={Boolean(carryOverPromptModal)}
        onClose={() => setCarryOverPromptModal(null)}
        title="Carry Over Goal"
      >
        <div className="space-y-4">
          <p className="text-xs text-content-tertiary leading-relaxed">
            How would you like to carry over <strong className="text-content-primary">"{carryOverPromptModal?.goal.title}"</strong> into {currentWeekKey}?
          </p>
          <div className="card p-3 space-y-1">
            <span className="text-[11px] text-content-muted font-medium block">Current Progress in {carryOverPromptModal?.pastWeek}:</span>
            <span className="text-xs font-bold text-warning-text block">
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
              <span className="font-normal opacity-90 text-[11px]">
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
              <span className="font-normal text-content-muted text-[11px]">
                Reset to 0/{carryOverPromptModal?.goal.targetValue}
              </span>
            </button>
          </div>
        </div>
      </Modal>

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
            : 'Are you sure you want to delete this reflection entry? (Your weekly goals will remain untouched).'
        }
        confirmText="Delete Reflection"
      />
    </div>
  );
}
