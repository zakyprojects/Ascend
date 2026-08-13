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
  CheckCircle2,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import {
  weekKey,
  getWeekDates,
  offsetWeekKey,
  formatWeekRange,
  getWeekReflectionCutoff,
} from '@/lib/dates';
import { WeeklyGoalItem, WeeklyGoalPriority, WeeklyGoalLinkedModule, WeeklyGoalReflection } from '@/types';

export function WeeklyGoalsView({ store }: { store: AppStore }) {
  const currentWeekKey = weekKey();
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(currentWeekKey);

  const weeklyGoals = store.state.weeklyGoals;

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

  // Derived progress calculator for linked modules during selectedWeekKey (or specified targetWeekKey)
  const getLinkedGoalProgress = useCallback(
    (item: WeeklyGoalItem, targetWeekKey?: string): { current: number; target: number; unit: string; percent: number } => {
      const weekKeyToUse = targetWeekKey || selectedWeekKey;
      const target = item.targetValue && item.targetValue > 0 ? item.targetValue : 1;
      const unit = item.unit || 'times';

      if (!item.linkedModule || item.linkedModule === 'none') {
        const manual = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? target : 0);
        return {
          current: manual,
          target,
          unit,
          percent: Math.min(100, Math.round((manual / target) * 100)),
        };
      }

      const { dateStrings } = getWeekDates(weekKeyToUse);

      if (item.linkedModule === 'habit') {
        const habit = store.state.habits.find((h) => h.id === item.linkedItemId);
        if (!habit || !habit.completions) {
          return { current: item.completed ? target : 0, target, unit, percent: item.completed ? 100 : 0 };
        }
        const count = habit.completions.filter((c) => dateStrings.includes(typeof c === 'string' ? c : (c as any).date)).length;
        return {
          current: count,
          target,
          unit: unit || 'completions',
          percent: Math.min(100, Math.round((count / target) * 100)),
        };
      }

      if (item.linkedModule === 'exercise') {
        const weekWorkouts = store.state.workouts.filter((w) => dateStrings.includes(w.date));
        if (unit.toLowerCase().includes('min')) {
          const totalMins = weekWorkouts.reduce((acc, w) => acc + (w.durationMinutes || 0), 0);
          return { current: totalMins, target, unit: 'mins', percent: Math.min(100, Math.round((totalMins / target) * 100)) };
        } else {
          const sessionCount = weekWorkouts.length;
          return { current: sessionCount, target, unit: 'sessions', percent: Math.min(100, Math.round((sessionCount / target) * 100)) };
        }
      }

      if (item.linkedModule === 'reading') {
        const logs = store.state.readingLogs.filter((l) => dateStrings.includes(l.date));
        const filtered = item.linkedItemId ? logs.filter((l) => l.bookId === item.linkedItemId) : logs;
        const totalPages = filtered.reduce((acc, l) => acc + (l.progressAmount || 0), 0);
        return { current: totalPages, target, unit: 'pages', percent: Math.min(100, Math.round((totalPages / target) * 100)) };
      }

      if (item.linkedModule === 'skill') {
        const logs = store.state.skillLogs.filter((l) => dateStrings.includes(l.date));
        const filtered = item.linkedItemId ? logs.filter((l) => l.skillId === item.linkedItemId) : logs;
        const totalMins = filtered.reduce((acc, l) => acc + (l.durationMinutes || 0), 0);
        return { current: totalMins, target, unit: 'mins', percent: Math.min(100, Math.round((totalMins / target) * 100)) };
      }

      return { current: 0, target, unit, percent: 0 };
    },
    [selectedWeekKey, store.state.habits, store.state.workouts, store.state.readingLogs, store.state.skillLogs]
  );

  // Unaddressed incomplete goals from past weeks
  const unaddressedPastGoals = useMemo(() => {
    if (selectedWeekKey !== currentWeekKey) return [];

    const pastDocs = weeklyGoals.filter((w) => w.weekKey < currentWeekKey);
    const result: { weekKey: string; goal: WeeklyGoalItem }[] = [];
    const currentGoalTitles = new Set(activeGoalDoc.goals.map((g) => g.title.trim().toLowerCase()));

    pastDocs.forEach((doc) => {
      doc.goals.forEach((g) => {
        const prog = getLinkedGoalProgress(g, doc.weekKey);
        if (
          prog.percent < 100 &&
          !g.archived &&
          !g.carryOverDismissed &&
          !currentGoalTitles.has(g.title.trim().toLowerCase())
        ) {
          result.push({ weekKey: doc.weekKey, goal: g });
        }
      });
    });

    return result;
  }, [selectedWeekKey, currentWeekKey, weeklyGoals, activeGoalDoc, getLinkedGoalProgress]);

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

  const handleDeleteReflectionConfirm = () => {
    if (deleteReflectionModal) {
      store.deleteWeeklyReflection(selectedWeekKey, deleteReflectionModal.id);
      setDeleteReflectionModal(null);
    }
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setTitle('');
    setTargetDescription('');
    setPriority('medium');
    setLinkedModule('none');
    setLinkedItemId('');
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
    setTargetValue(goal.targetValue || 1);
    setUnit(goal.unit || 'times');
    setModalOpen(true);
  };

  const handleSaveGoal = () => {
    if (!title.trim()) return;

    const payload = {
      title: title.trim(),
      targetDescription: targetDescription.trim(),
      priority,
      linkedModule,
      linkedItemId: linkedModule !== 'none' ? linkedItemId : undefined,
      targetValue: targetValue && targetValue > 0 ? targetValue : 1,
      unit: unit.trim() ? unit.trim() : 'times',
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
      const prog = getLinkedGoalProgress(g);
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
  }, [activeGoalDoc.goals, getLinkedGoalProgress]);

  const priorityColor = (p: WeeklyGoalPriority) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'low':
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & WEEK NAVIGATION CARD */}
      <div className="card p-5 space-y-4 border border-white/10 bg-bg-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Target size={24} className="text-emerald-400" />
              <h1 className="text-2xl font-display font-bold text-slate-100">Weekly Executive Goals & Review</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Set high-leverage measurable goals, auto-sync activity progress across trackers, and conduct structured Sunday reflections.
            </p>
          </div>

          {/* Week Selector Controls */}
          <div className="flex items-center gap-2 bg-bg-900/60 p-1.5 rounded-xl border border-white/5 self-start md:self-auto">
            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, -1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-bg-800 transition-colors"
              title="Previous Week"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-center px-3">
              <span className="text-xs font-bold text-slate-200 block">{selectedWeekKey}</span>
              <span className="text-[10px] text-slate-400 block whitespace-nowrap">
                {formatWeekRange(selectedWeekKey)}
              </span>
            </div>

            <button
              onClick={() => setSelectedWeekKey(offsetWeekKey(selectedWeekKey, 1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-bg-800 transition-colors"
              title="Next Week"
            >
              <ChevronRight size={16} />
            </button>

            {selectedWeekKey !== currentWeekKey && (
              <button
                onClick={() => setSelectedWeekKey(currentWeekKey)}
                className="ml-1 text-[11px] font-bold text-primary-400 hover:text-primary-300 bg-primary-500/10 px-2 py-1 rounded-lg border border-primary-500/20 transition-all"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* OVERALL WEEK PROGRESS BAR & SUMMARY BADGES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="md:col-span-2 bg-bg-900/40 p-3.5 rounded-xl border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <BarChart2 size={14} className="text-primary-400" />
                Weekly Target Completion
              </span>
              <span className="text-primary-400 font-bold">{goalStats.percent}% Complete ({goalStats.completed}/{goalStats.total})</span>
            </div>
            <div className="w-full bg-bg-900 rounded-full h-2.5 overflow-hidden border border-white/5">
              <div
                className="bg-gradient-to-r from-primary-500 to-emerald-400 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${goalStats.percent}%` }}
              />
            </div>
          </div>

          <div className="bg-bg-900/40 p-3.5 rounded-xl border border-white/5 flex items-center justify-around">
            <div className="text-center">
              <span className="text-lg font-bold text-slate-100 block">{goalStats.total}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Total Goals</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="text-lg font-bold text-emerald-400 block">{goalStats.completed}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Completed</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="text-lg font-bold text-rose-400 block">{goalStats.highPriorityCompleted}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">High Pri Done</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARRY-OVER PROMPT BANNER FOR INCOMPLETE PAST GOALS */}
      {unaddressedPastGoals.length > 0 && selectedWeekKey === currentWeekKey && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-amber-300">Unresolved Goals from Previous Weeks</h3>
              <p className="text-xs text-amber-200/80 mt-0.5">
                You have {unaddressedPastGoals.length} incomplete priority goal{unaddressedPastGoals.length > 1 ? 's' : ''} from earlier weeks.
                Select whether to carry them over into this week or dismiss them.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {unaddressedPastGoals.map(({ weekKey: pastWeek, goal }) => (
              <div
                key={`${pastWeek}-${goal.id}`}
                className="flex items-center justify-between p-2.5 bg-bg-900/70 border border-amber-500/20 rounded-lg"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">{goal.title}</span>
                  <span className="text-[10px] text-amber-400/90 font-medium">
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
                    className="btn-secondary text-[11px] py-1 px-2 text-slate-400 hover:text-slate-200"
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
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-primary-400" />
            <h3 className="text-sm font-bold text-slate-200">
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
          <div className="text-center py-8 space-y-3 bg-bg-900/30 rounded-xl border border-dashed border-white/10">
            <Target size={28} className="text-slate-600 mx-auto" />
            <div>
              <p className="text-xs font-semibold text-slate-300">No Weekly Goals Set Yet</p>
              <p className="text-[11px] text-slate-500">
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
              const prog = getLinkedGoalProgress(item);
              const isDone = item.completed || prog.percent >= 100;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isDone
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-bg-900/60 border-white/10 hover:border-white/20'
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
                            : 'bg-bg-800 border-white/20 text-slate-500 hover:border-white/40'
                        }`}
                      >
                        {isDone ? <Check size={14} /> : <Circle size={14} />}
                      </button>

                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-semibold text-slate-100 ${
                              isDone ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {item.title}
                          </span>

                          <span className={`badge text-[10px] font-bold border ${priorityColor(item.priority)}`}>
                            {item.priority.toUpperCase()}
                          </span>

                          {item.carriedOverFromWeekKey && (
                            <span className="badge bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                              Carried over from {item.carriedOverFromWeekKey}
                            </span>
                          )}

                          {item.linkedModule && item.linkedModule !== 'none' && (
                            <span className="badge bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] flex items-center gap-1">
                              <Zap size={10} /> Linked: {item.linkedModule.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {item.targetDescription && (
                          <p className="text-xs text-slate-400">{item.targetDescription}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Edit Goal"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteGoalModal(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Goal"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* PROGRESS BAR FOR MEASURABLE / LINKED GOALS */}
                  <div className="space-y-1.5 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span>Progress</span>
                      <div className="flex items-center gap-2">
                        {(!item.linkedModule || item.linkedModule === 'none') && prog.target > 1 && (
                          <div className="flex items-center gap-1 bg-bg-800 px-1.5 py-0.5 rounded-lg border border-white/10 text-xs">
                            <button
                              onClick={() => {
                                const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                                const newVal = Math.max(0, currentVal - 1);
                                store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                              }}
                              disabled={prog.current <= 0}
                              className="p-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                              title="Decrement progress"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="font-bold text-slate-200 min-w-[16px] text-center">{prog.current}</span>
                            <button
                              onClick={() => {
                                const currentVal = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? prog.target : 0);
                                const newVal = Math.min(prog.target, currentVal + 1);
                                store.updateWeeklyGoalItem(selectedWeekKey, item.id, { manualProgress: newVal });
                              }}
                              disabled={prog.current >= prog.target}
                              className="p-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                              title="Increment progress"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        )}
                        <span className="text-slate-200 font-bold">
                          {prog.current} / {prog.target} {prog.unit} ({prog.percent}%)
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-bg-800 rounded-full h-2 overflow-hidden border border-white/5">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          prog.percent >= 100
                            ? 'bg-emerald-400'
                            : 'bg-primary-500'
                        }`}
                        style={{ width: `${prog.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SUNDAY EVENING REVIEW & REFLECTIONS CARD */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              Weekly Reflections
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reflect on wins, friction, and execution velocity. The first reflection each week awards +20 pts.
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
          <div className="p-3.5 bg-slate-900/80 border border-slate-700/60 rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-slate-200">
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
            const isBeforeCutoff = new Date() < reflectionCutoff;
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
                  <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No reflections added for {selectedWeekKey} yet. Click "+ Add Reflection" above to add your insights.
                  </div>
                )}

                {reflections.map((ref) => {
                  const isEditingThis = editingReflection?.id === ref.id;

                  if (isEditingThis) {
                    return (
                      <div key={ref.id} className="p-3.5 bg-slate-900/80 border border-slate-700/60 rounded-xl space-y-3">
                        <label className="block text-xs font-semibold text-slate-200">
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
                      className="p-3.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-300">
                            {new Date(ref.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {ref.pointsAwarded ? (
                            <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                              <Sparkles size={11} /> +20 pts
                            </span>
                          ) : isBeforeCutoff && latestReflection?.id === ref.id ? (
                            <span
                              className="badge bg-amber-500/15 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1"
                              title="Points will be awarded when cutoff passes on Sunday 17:00"
                            >
                              <Sparkles size={11} /> Pending +20 pts
                            </span>
                          ) : null}
                        </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingReflection(ref);
                        setEditReflectionContent(ref.content);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Edit reflection"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteReflectionModal(ref)}
                      className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Delete reflection"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
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
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Goal Title <span className="text-rose-400">*</span>
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
            <label className="block text-xs font-semibold text-slate-300 mb-1">
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Link Tracker Module
              </label>
              <select
                value={linkedModule}
                onChange={(e) => {
                  const mod = e.target.value as WeeklyGoalLinkedModule;
                  setLinkedModule(mod);
                  if (mod === 'exercise') setUnit('sessions');
                  else if (mod === 'reading') setUnit('pages');
                  else if (mod === 'skill') setUnit('mins');
                  else if (mod === 'habit') setUnit('completions');
                  else setUnit('times');
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
          {linkedModule === 'habit' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Specific Habit
              </label>
              <select
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="">Select a Habit...</option>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Book (Optional)
              </label>
              <select
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="">All Reading</option>
                {store.state.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {linkedModule === 'skill' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Skill (Optional)
              </label>
              <select
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input w-full bg-bg-800"
              >
                <option value="">All Skill Practice</option>
                {store.state.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* TARGET VALUE & UNIT INPUTS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/10">
            <button
              onClick={() => setModalOpen(false)}
              className="btn-secondary text-xs flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveGoal}
              disabled={!title.trim()}
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
        onConfirm={() => {
          if (deleteGoalModal) {
            store.deleteWeeklyGoalItem(selectedWeekKey, deleteGoalModal.id);
            setDeleteGoalModal(null);
          }
        }}
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
          <p className="text-xs text-slate-300 leading-relaxed">
            How would you like to carry over <strong className="text-white">"{carryOverPromptModal?.goal.title}"</strong> into {currentWeekKey}?
          </p>
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium block">Current Progress in {carryOverPromptModal?.pastWeek}:</span>
            <span className="text-xs font-bold text-amber-300 block">
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
              <span className="font-normal text-slate-400 text-[11px]">
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
        title="Delete Reflection?"
        itemName={deleteReflectionModal ? (deleteReflectionModal.content.length > 30 ? deleteReflectionModal.content.substring(0, 30) + '...' : deleteReflectionModal.content) : ''}
        description={
          deleteReflectionModal?.pointsAwarded
            ? 'Are you sure you want to delete this reflection? Since it earned points, 20 pts will be deducted. (Your weekly goals will remain untouched).'
            : 'Are you sure you want to delete this reflection entry? (Your weekly goals will remain untouched).'
        }
        confirmText="Delete Reflection"
      />
    </div>
  );
}
