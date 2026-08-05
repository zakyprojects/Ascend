import { useState, useEffect } from 'react';
import {
  Compass,
  Plus,
  Globe,
  Lock,
  Copy,
  CheckCircle2,
  Circle,
  Trash2,
  Award,
  Sparkles,
  User,
  Layers,
  Edit3,
  RefreshCw,
  CheckSquare,
  Target,
  Flame,
  MessageSquare,
  Calendar,
  TrendingUp,
  Send,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ImprovementPlan, PlanType, UserPlanFollow, VisionReflectionNote } from '@/types';
import { getCurrentTier } from '@/lib/tiers';
import { TierBadge } from '@/components/ui/TierBadge';
import { fetchPublicPlansFromSupabase, mapRowToImprovementPlan, supabase, syncBroadcaster } from '@/lib/supabase';
import { getProfilePointsByUsername } from '@/lib/auth';
import { isTodayLocal } from '@/lib/dates';

export function ImprovementPlans({ store }: { store: AppStore }) {
  const [activeTab, setActiveTab] = useState<'my_plans' | 'discover'>('my_plans');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create Form states (Shared + Type-Specific)
  const [planType, setPlanType] = useState<PlanType>('milestone');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal Growth');
  const [isPublic, setIsPublic] = useState(true);
  const [steps, setSteps] = useState<string[]>(['Step 1: ', 'Step 2: ', 'Step 3: ']);

  // Target Goal states
  const [targetValue, setTargetValue] = useState<number>(10);
  const [targetUnit, setTargetUnit] = useState<string>('books');
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [targetDate, setTargetDate] = useState<string>('');

  // Habit Journey states
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [duration, setDuration] = useState<number>(30);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Vision Plan states
  const [targetReviewDate, setTargetReviewDate] = useState<string>('');
  const [initialReflectionNote, setInitialReflectionNote] = useState<string>('');

  // Edit Form states (Structural fields ONLY)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('Personal Growth');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editTargetValue, setEditTargetValue] = useState<number>(10);
  const [editTargetUnit, setEditTargetUnit] = useState<string>('books');
  const [editTargetDate, setEditTargetDate] = useState<string>('');
  const [editCadence, setEditCadence] = useState<'daily' | 'weekly'>('daily');
  const [editDuration, setEditDuration] = useState<number>(30);
  const [editTargetReviewDate, setEditTargetReviewDate] = useState<string>('');
  const [editingPlanType, setEditingPlanType] = useState<PlanType>('milestone');

  // Interactive inline UI state (Progress inputs & Reflection note inputs)
  const [progressInput, setProgressInput] = useState<{ [planId: string]: string }>({});
  const [reflectionInput, setReflectionInput] = useState<{ [planId: string]: string }>({});
  const [expandedReflections, setExpandedReflections] = useState<{ [planId: string]: boolean }>({});
  const [editingNoteId, setEditingNoteId] = useState<{ [noteKey: string]: boolean }>({});
  const [editingNoteText, setEditingNoteText] = useState<{ [noteKey: string]: string }>({});

  const improvementPlans = store.state.improvementPlans;
  const followedPlans = store.state.followedPlans;
  const currentUsername = store.state.username;

  // Remote public plans fetched & updated via Supabase Realtime & syncBroadcaster
  const [remotePublicPlans, setRemotePublicPlans] = useState<ImprovementPlan[]>([]);

  const loadPlans = async () => {
    setIsRefreshing(true);
    try {
      const plans = await fetchPublicPlansFromSupabase();
      if (plans) {
        setRemotePublicPlans(plans);
        plans.forEach((p) => {
          if (p.copyCount !== undefined) {
            store.updatePlanCopyCount(p.id, p.copyCount);
          }
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const fetchInitialPlans = async () => {
      const plans = await fetchPublicPlansFromSupabase();
      if (mounted && plans) {
        setRemotePublicPlans(plans);
        plans.forEach((p) => {
          if (p.copyCount !== undefined) {
            store.updatePlanCopyCount(p.id, p.copyCount);
          }
        });
      }
    };

    fetchInitialPlans();

    // 1. Supabase Realtime postgres_changes listener for improvement_plans
    const plansChannel = supabase
      .channel('public_plans_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'improvement_plans' },
        (payload) => {
          if (!mounted) return;
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            if (newRow && newRow.is_public) {
              const newPlan = mapRowToImprovementPlan(newRow);
              setRemotePublicPlans((prev) => {
                if (prev.some((p) => p.id === newPlan.id)) return prev;
                return [newPlan, ...prev];
              });
            }
          } else if (eventType === 'UPDATE') {
            if (newRow) {
              const updatedPlan = mapRowToImprovementPlan(newRow);
              if (newRow.copy_count !== undefined) {
                store.updatePlanCopyCount(newRow.id, newRow.copy_count);
              }
              setRemotePublicPlans((prev) => {
                if (!newRow.is_public) {
                  return prev.filter((p) => p.id !== updatedPlan.id);
                }
                const exists = prev.some((p) => p.id === updatedPlan.id);
                if (exists) {
                  return prev.map((p) => (p.id === updatedPlan.id ? { ...p, ...updatedPlan } : p));
                } else {
                  return [updatedPlan, ...prev];
                }
              });
            }
          } else if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              setRemotePublicPlans((prev) => prev.filter((p) => p.id !== oldRow.id));
            }
          }
        }
      )
      .subscribe();

    // 2. Supabase Realtime listener for user_plan_follows
    const followsChannel = supabase
      .channel('public_follows_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_plan_follows' },
        (payload) => {
          if (!mounted) return;
          const newFollow = payload.new;
          if (newFollow && newFollow.original_plan_id) {
            const targetId = newFollow.original_plan_id;
            setRemotePublicPlans((prev) =>
              prev.map((p) => (p.id === targetId ? { ...p, copyCount: (p.copyCount || 0) + 1 } : p))
            );
            const currentLocal = store.state.improvementPlans.find((p) => p.id === targetId);
            if (currentLocal) {
              store.updatePlanCopyCount(targetId, (currentLocal.copyCount || 0) + 1);
            }
          }
        }
      )
      .subscribe();

    // 3. Tab-to-tab syncBroadcaster listener for local multi-tab sync
    const unsubscribeBroadcast = syncBroadcaster.subscribe((event) => {
      if (!mounted) return;
      if (event.type === 'PLAN_DELETED' && event.data?.planId) {
        const deletedId = event.data.planId;
        setRemotePublicPlans((prev) => prev.filter((p) => p.id !== deletedId));
      } else if (event.type === 'PLAN_UPDATED' && event.data) {
        const updated = event.data;
        if (updated.id) {
          setRemotePublicPlans((prev) => {
            if (updated.isPublic === false) {
              return prev.filter((p) => p.id !== updated.id);
            }
            return prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
          });
        }
      }
    });

    return () => {
      mounted = false;
      supabase.removeChannel(plansChannel);
      supabase.removeChannel(followsChannel);
      unsubscribeBroadcast();
    };
  }, [activeTab]);

  // Merge public plans from store and remote database
  const publicDiscoverPlans = (() => {
    const localPublic = store.getPublicImprovementPlans();
    const map = new Map<string, ImprovementPlan>();

    localPublic.forEach((p) => map.set(p.id, p));

    remotePublicPlans.forEach((p) => {
      const existing = map.get(p.id);
      if (existing) {
        map.set(p.id, {
          ...existing,
          ...p,
          copyCount: Math.max(existing.copyCount || 0, p.copyCount || 0),
        });
      } else {
        map.set(p.id, p);
      }
    });

    return Array.from(map.values())
      .filter((p) => {
        const isMyPlan = (p.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase() || (p.creatorId && store.state.currentUser?.id && p.creatorId === store.state.currentUser.id);
        const localMatch = improvementPlans.find((lp) => lp.id === p.id);
        if (localMatch) {
          return localMatch.isPublic;
        }
        if (isMyPlan) {
          return false;
        }
        return p.isPublic;
      })
      .map((p) => {
        const localMatch = improvementPlans.find((lp) => lp.id === p.id);
        if (localMatch) {
          return {
            ...localMatch,
            ...p,
            copyCount: Math.max(localMatch.copyCount || 0, p.copyCount || 0),
          };
        }
        return p;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  })();

  const myCreatedPlans = improvementPlans.filter((p) => (p.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase());

  // Form Step handlers
  const handleAddStepField = () => {
    setSteps([...steps, `Step ${steps.length + 1}: `]);
  };

  const handleStepChange = (index: number, val: string) => {
    const updated = [...steps];
    updated[index] = val;
    setSteps(updated);
  };

  const handleRemoveStepField = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, idx) => idx !== index));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    store.createImprovementPlan(
      title,
      description,
      isPublic,
      steps,
      category,
      planType,
      {
        targetValue,
        targetUnit,
        currentProgress,
        targetDate,
        cadence,
        duration,
        startDate,
        targetReviewDate,
        initialReflectionNote,
      }
    );

    setCreateModalOpen(false);
    setTitle('');
    setDescription('');
    setSteps(['Step 1: ', 'Step 2: ', 'Step 3: ']);
    setInitialReflectionNote('');
  };

  // Edit Structural Fields Modal handlers (Does NOT touch progress/streaks/reflections)
  const handleOpenEdit = (plan: ImprovementPlan) => {
    setEditingPlanId(plan.id);
    setEditTitle(plan.title);
    setEditDescription(plan.description);
    setEditCategory(plan.category || 'Personal Growth');
    setEditIsPublic(plan.isPublic);
    setEditSteps((plan.steps || []).map((s) => s.title));
    setEditTargetValue(plan.targetValue || 10);
    setEditTargetUnit(plan.targetUnit || 'books');
    setEditTargetDate(plan.targetDate || '');
    setEditCadence(plan.cadence || 'daily');
    setEditDuration(plan.duration || 30);
    setEditTargetReviewDate(plan.targetReviewDate || '');
    setEditingPlanType(plan.planType || 'milestone');
    setEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId || !editTitle.trim() || !editDescription.trim()) return;
    store.updateImprovementPlan(
      editingPlanId,
      editTitle,
      editDescription,
      editCategory,
      editIsPublic,
      editSteps,
      {
        targetValue: editTargetValue,
        targetUnit: editTargetUnit,
        targetDate: editTargetDate,
        cadence: editCadence,
        duration: editDuration,
        targetReviewDate: editTargetReviewDate,
      }
    );
    setEditModalOpen(false);
    setEditingPlanId(null);
  };

  // Type Icon and Label Helper
  const renderPlanTypeBadge = (type?: PlanType) => {
    const resolvedType = type || 'milestone';
    switch (resolvedType) {
      case 'target_goal':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Target size={11} /> Target Goal
          </span>
        );
      case 'habit_journey':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Flame size={11} /> Habit Journey
          </span>
        );
      case 'vision':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Compass size={11} /> Vision & Reflection
          </span>
        );
      case 'milestone':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <CheckSquare size={11} /> Milestone Plan
          </span>
        );
    }
  };

  // Render Plan Content Body based on Mode:
  // - mode = 'read_only' (Discover tab: static showcase, NO tracking inputs)
  // - mode = 'creator_interactive' (Created By Me section: creator interactive controls)
  // - mode = 'follower_interactive' (Followed & Copied Plans section: follower interactive controls)
  const renderPlanCardBody = (
    plan: ImprovementPlan | UserPlanFollow,
    mode: 'read_only' | 'creator_interactive' | 'follower_interactive'
  ) => {
    const resolvedType = plan.planType || 'milestone';
    const planId = plan.id;

    if (resolvedType === 'target_goal') {
      const targetVal = plan.targetValue || 1;
      const curProg = plan.currentProgress || 0;
      const pct = Math.min(100, Math.round((curProg / targetVal) * 100));
      const isGoalCompleted = curProg >= targetVal;

      return (
        <div className="space-y-3 mt-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">
              Progress: <span className="text-amber-400 font-bold">{curProg}</span> / {targetVal} {plan.targetUnit || 'units'}
            </span>
            <span className="font-bold text-amber-400">{pct}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>

          {plan.targetDate && (
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Calendar size={12} className="text-slate-500" /> Target Date: <span className="text-slate-300">{plan.targetDate}</span>
            </div>
          )}

          {/* Read-Only mode in Discover: NO input field or button */}
          {mode === 'read_only' ? (
            isGoalCompleted && (
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1 pt-1">
                <CheckCircle2 size={13} /> Completed!
              </div>
            )
          ) : (
            /* Interactive mode in My Plans */
            <div className="pt-1 flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={progressInput[planId] !== undefined ? progressInput[planId] : (plan.currentProgress || 0)}
                onChange={(e) => setProgressInput({ ...progressInput, [planId]: e.target.value })}
                className="input text-xs w-24 py-1"
                placeholder="Value"
              />
              <button
                onClick={() => {
                  const val = Number(progressInput[planId]);
                  if (!isNaN(val)) {
                    if (mode === 'creator_interactive') {
                      store.updateTargetGoalProgress(planId, val);
                    } else {
                      store.updateFollowedTargetGoalProgress(planId, val);
                    }
                  }
                }}
                className="btn-secondary text-xs py-1 px-3"
              >
                Update Progress
              </button>
              {isGoalCompleted && (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 ml-auto">
                  <CheckCircle2 size={13} /> Completed!
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    if (resolvedType === 'habit_journey') {
      const streak = plan.streakCount || 0;
      const cadenceText = plan.cadence === 'weekly' ? 'Week' : 'Day';
      const durationText = plan.duration ? `${plan.duration} ${plan.cadence === 'weekly' ? 'weeks' : 'days'}` : 'Ongoing';
      const isCompletedToday = isTodayLocal(plan.lastCompletedDate);

      return (
        <div className="space-y-3 mt-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-rose-400">
              <Flame size={15} className="animate-pulse" /> {streak} {cadenceText} Streak
            </span>
            <span className="text-slate-400 text-[11px]">
              Commitment: <span className="text-slate-200">{durationText}</span> ({plan.cadence || 'daily'})
            </span>
          </div>

          {/* Read-Only mode in Discover: NO "Mark Done" button */}
          {mode === 'read_only' ? (
            plan.lastCompletedDate && (
              <div className="text-[10px] text-slate-500 pt-1">
                Last completed: {new Date(plan.lastCompletedDate).toLocaleDateString()}
              </div>
            )
          ) : (
            /* Interactive mode in My Plans */
            <div className="pt-1 flex items-center justify-between">
              {isCompletedToday ? (
                <button
                  onClick={() => {
                    if (mode === 'creator_interactive') {
                      store.undoHabitJourneyDone(planId);
                    } else {
                      store.undoFollowedHabitJourneyDone(planId);
                    }
                  }}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                  title="Revert today's mark and restore pending state for today"
                >
                  <RotateCcw size={14} /> Undo Today's Mark
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (mode === 'creator_interactive') {
                      store.markHabitJourneyDone(planId);
                    } else {
                      store.markFollowedHabitJourneyDone(planId);
                    }
                  }}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white"
                >
                  <CheckCircle2 size={14} /> Mark Done for {cadenceText}
                </button>
              )}
              {plan.lastCompletedDate && (
                <span className="text-[10px] text-slate-500">
                  Last completed: {new Date(plan.lastCompletedDate).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    if (resolvedType === 'vision') {
      const notes = plan.reflectionNotes || [];
      const isExpanded = expandedReflections[planId] ?? false;

      return (
        <div className="space-y-3 mt-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
          {plan.targetReviewDate && (
            <div className="text-[11px] text-purple-300 flex items-center gap-1">
              <Calendar size={12} className="text-purple-400" /> Target Review Date: {plan.targetReviewDate}
            </div>
          )}

          {/* Add Reflection Note Field (Interactive mode ONLY) */}
          {mode !== 'read_only' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={reflectionInput[planId] || ''}
                onChange={(e) => setReflectionInput({ ...reflectionInput, [planId]: e.target.value })}
                placeholder="Add dated check-in reflection note..."
                className="input text-xs flex-1 py-1"
              />
              <button
                onClick={() => {
                  const text = reflectionInput[planId];
                  if (text && text.trim()) {
                    if (mode === 'creator_interactive') {
                      store.addVisionReflectionNote(planId, text);
                    } else {
                      store.addFollowedVisionReflectionNote(planId, text);
                    }
                    setReflectionInput({ ...reflectionInput, [planId]: '' });
                  }
                }}
                className="btn-secondary text-xs py-1 px-3 flex items-center gap-1 text-purple-300 hover:text-purple-200"
              >
                <Send size={12} /> Post
              </button>
            </div>
          )}

          {/* Reflections List Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <MessageSquare size={13} className="text-purple-400" /> {notes.length} Check-in Reflection(s)
            </span>
            {notes.length > 0 && (
              <button
                onClick={() => setExpandedReflections({ ...expandedReflections, [planId]: !isExpanded })}
                className="text-xs text-purple-400 hover:underline flex items-center gap-1"
              >
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {isExpanded ? 'Hide' : 'View Notes'}
              </button>
            )}
          </div>

          {/* Expanded Reflection List with Edit & Delete */}
          {isExpanded && notes.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              {notes.map((n) => {
                const noteKey = n.id || n.date;
                const isEditingThisNote = editingNoteId[noteKey] ?? false;

                return (
                  <div key={noteKey} className="text-xs p-2 rounded bg-slate-800/60 border border-slate-700/50 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{new Date(n.date).toLocaleString()}</span>
                      {mode !== 'read_only' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingNoteId({ ...editingNoteId, [noteKey]: !isEditingThisNote });
                              setEditingNoteText({ ...editingNoteText, [noteKey]: n.note });
                            }}
                            className="text-slate-400 hover:text-purple-300 transition-colors"
                            title="Edit Note"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => {
                              if (mode === 'creator_interactive') {
                                store.deleteVisionReflectionNote(planId, noteKey);
                              } else {
                                store.deleteFollowedVisionReflectionNote(planId, noteKey);
                              }
                            }}
                            className="text-slate-400 hover:text-rose-400 transition-colors"
                            title="Delete Note"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditingThisNote ? (
                      <div className="space-y-1.5 pt-1">
                        <textarea
                          value={editingNoteText[noteKey] || ''}
                          onChange={(e) => setEditingNoteText({ ...editingNoteText, [noteKey]: e.target.value })}
                          className="input text-xs w-full min-h-[50px] py-1"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingNoteId({ ...editingNoteId, [noteKey]: false })}
                            className="btn-secondary text-[10px] py-0.5 px-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              const val = editingNoteText[noteKey];
                              if (val && val.trim()) {
                                if (mode === 'creator_interactive') {
                                  store.editVisionReflectionNote(planId, noteKey, val);
                                } else {
                                  store.editFollowedVisionReflectionNote(planId, noteKey, val);
                                }
                                setEditingNoteId({ ...editingNoteId, [noteKey]: false });
                              }
                            }}
                            className="btn-primary text-[10px] py-0.5 px-2 bg-purple-600 hover:bg-purple-500"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-300 italic">"{n.note}"</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Default: Milestone Steps List
    return (
      <div className="space-y-1.5 mt-2">
        {plan.steps && plan.steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-xs">
            {mode === 'read_only' ? (
              /* Read-only static checkbox indicator in Discover */
              <div className="text-slate-600">
                {step.completed ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <Circle size={15} />
                )}
              </div>
            ) : (
              /* Working checkbox in My Plans (Creator or Follower) */
              <button
                onClick={() => {
                  if (mode === 'creator_interactive') {
                    store.completePlanStep(planId, step.id);
                  } else {
                    store.completeFollowedPlanStep(planId, step.id);
                  }
                }}
                className="text-slate-500 hover:text-emerald-400 transition-colors"
              >
                {step.completed ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <Circle size={15} />
                )}
              </button>
            )}
            <span className={step.completed ? 'line-through text-slate-600' : 'text-slate-300'}>
              {step.title}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <Compass className="text-blue-400" size={26} />
            Personal Improvement Plans
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Build Milestones, Target Goals, Habit Journeys, & Vision reflections — discover public plans & track progress
          </p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span>Create Plan</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('my_plans')}
            className={`pb-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'my_plans'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            My Plans & Following ({myCreatedPlans.length + followedPlans.length})
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            className={`pb-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'discover'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Discover Public Plans ({publicDiscoverPlans.length})
          </button>
        </div>

        {activeTab === 'discover' && (
          <button
            onClick={loadPlans}
            disabled={isRefreshing}
            className="btn-ghost text-xs flex items-center gap-1.5 text-slate-400 hover:text-blue-400"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {/* MY PLANS & FOLLOWING TAB */}
      {activeTab === 'my_plans' && (
        <div className="space-y-6">
          {/* Created By Me Section */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Created By Me</h2>
            {myCreatedPlans.length === 0 ? (
              <div className="card p-6 text-center text-slate-500 text-sm">
                You haven't created any plans yet. Click "Create Plan" above to start building!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myCreatedPlans.map((plan) => {
                  const remoteMatch = remotePublicPlans.find((r) => r.id === plan.id);
                  const displayCopyCount = remoteMatch
                    ? Math.max(plan.copyCount || 0, remoteMatch.copyCount || 0)
                    : (plan.copyCount || 0);

                  return (
                    <div key={plan.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                      <div>
                        <div className="flex justify-between items-start gap-3">
                          {/* LEFT SIDE: Type Badge, Title, Category */}
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {renderPlanTypeBadge(plan.planType)}
                              {plan.category && (
                                <span className="badge text-[10px] bg-slate-800 text-slate-400 border border-slate-700/50">
                                  {plan.category}
                                </span>
                              )}
                              <span className={`badge text-[10px] font-bold ${plan.isPublic ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700/50'}`}>
                                {plan.isPublic ? <Globe size={10} className="inline mr-1" /> : <Lock size={10} className="inline mr-1" />}
                                {plan.isPublic ? 'Public' : 'Private'}
                              </span>
                            </div>
                            <h3 className="font-bold text-slate-100 text-sm leading-snug break-words">{plan.title}</h3>
                            <p className="text-xs text-slate-400 line-clamp-2">{plan.description}</p>
                          </div>

                          {/* RIGHT SIDE: Action Button Group */}
                          <div className="flex items-center gap-1.5 shrink-0 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 px-1" title="Times copied">
                              <Copy size={12} /> {displayCopyCount}
                            </span>

                            {/* Sleek Globe/Lock Toggle */}
                            <button
                              onClick={async () => {
                                await store.togglePlanVisibility(plan.id, !plan.isPublic);
                              }}
                              className={`p-1.5 rounded transition-colors ${
                                plan.isPublic
                                  ? 'text-blue-400 hover:bg-blue-500/20'
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                              }`}
                              title={plan.isPublic ? 'Make Private' : 'Make Public'}
                            >
                              {plan.isPublic ? <Globe size={14} /> : <Lock size={14} />}
                            </button>

                            {/* Pencil Edit Icon */}
                            <button
                              onClick={() => handleOpenEdit(plan)}
                              className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                              title="Edit Structure"
                            >
                              <Edit3 size={14} />
                            </button>

                            {/* Trash Delete Icon */}
                            <button
                              onClick={async () => {
                                await store.deletePlan(plan.id);
                              }}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete Plan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Creator Interactive Card Body */}
                      {renderPlanCardBody(plan, 'creator_interactive')}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Followed & Copied Plans Section (FULL INTERACTIVITY FOR FOLLOWER) */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Followed & Copied Plans</h2>
            {followedPlans.length === 0 ? (
              <div className="card p-6 text-center text-slate-500 text-sm">
                You haven't copied any public plans yet. Visit the "Discover Public Plans" tab to browse and copy plans!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {followedPlans.map((follow) => (
                  <div key={follow.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                    <div>
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {renderPlanTypeBadge(follow.planType)}
                          </div>
                          <h3 className="font-bold text-slate-100 text-sm leading-snug break-words">{follow.title}</h3>
                          <p className="text-xs text-slate-400 line-clamp-2">{follow.description}</p>
                        </div>

                        <button
                          onClick={() => store.deleteFollowedPlan(follow.id)}
                          className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1 text-xs shrink-0 border border-rose-500/20 transition-colors"
                          title="Remove copied plan from your account"
                        >
                          <Trash2 size={13} /> Unfollow
                        </button>
                      </div>
                    </div>

                    {/* Follower Interactive Card Body */}
                    {renderPlanCardBody(follow, 'follower_interactive')}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCOVER TAB (READ-ONLY PREVIEW SHOWCASE ONLY) */}
      {activeTab === 'discover' && (
        <div className="space-y-4">
          {publicDiscoverPlans.length === 0 ? (
            <div className="card p-6 text-center text-slate-500 text-sm">
              No public plans discoverable right now. Be the first to publish a plan!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publicDiscoverPlans.map((plan) => {
                const creatorPts = plan.creatorPoints || getProfilePointsByUsername(plan.creatorUsername) || 0;
                const tier = getCurrentTier(creatorPts);
                const isOwnPlan = (plan.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase();
                const isAlreadyCopied = followedPlans.some((f) => f.originalPlanId === plan.id);

                return (
                  <div key={plan.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                    <div>
                      {/* Creator Info Header */}
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">{plan.creatorAvatar || '🧑'}</span>
                          <div>
                            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                              {plan.creatorUsername}
                              <TierBadge tier={tier} />
                            </div>
                            <span className="text-[10px] text-slate-500">{creatorPts} pts</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                          <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 px-1" title="Times copied">
                            <Copy size={12} /> {plan.copyCount || 0}
                          </span>
                          {isOwnPlan && (
                            <>
                              <button
                                onClick={async () => {
                                  await store.togglePlanVisibility(plan.id, !plan.isPublic);
                                }}
                                className={`p-1.5 rounded transition-colors ${
                                  plan.isPublic
                                    ? 'text-blue-400 hover:bg-blue-500/20'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                                title={plan.isPublic ? 'Make Private' : 'Make Public'}
                              >
                                {plan.isPublic ? <Globe size={14} /> : <Lock size={14} />}
                              </button>
                              <button
                                onClick={() => handleOpenEdit(plan)}
                                className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                                title="Edit Structure"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={async () => {
                                  await store.deletePlan(plan.id);
                                }}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete Plan"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Title, Description & Category */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {renderPlanTypeBadge(plan.planType)}
                          {plan.category && (
                            <span className="badge text-[10px] bg-slate-800 text-slate-400 border border-slate-700/50">
                              {plan.category}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-100 text-sm leading-snug break-words">{plan.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2">{plan.description}</p>
                      </div>
                    </div>

                    {/* Read-Only Card Body Showcase */}
                    {renderPlanCardBody(plan, 'read_only')}

                    {/* Copy Action Footer */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Created: {new Date(plan.createdAt).toLocaleDateString()}</span>

                      {!isOwnPlan && (
                        <button
                          onClick={() => store.copyPublicPlan(plan)}
                          disabled={isAlreadyCopied}
                          className={`btn-primary text-xs py-1 px-3 flex items-center gap-1.5 ${
                            isAlreadyCopied ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400' : ''
                          }`}
                        >
                          <Copy size={13} />
                          <span>{isAlreadyCopied ? 'Copied to My Account' : 'Copy Plan to My Account'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE PLAN MODAL */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Personal Improvement Plan">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {/* STEP 1: PLAN TYPE SELECTOR */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Plan Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlanType('milestone')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                  planType === 'milestone'
                    ? 'border-blue-500 bg-blue-500/10 text-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-blue-400">
                  <CheckSquare size={14} /> Milestone Plan
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Ordered list of milestones & step completion</div>
              </button>

              <button
                type="button"
                onClick={() => setPlanType('target_goal')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                  planType === 'target_goal'
                    ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-400">
                  <Target size={14} /> Target Goal
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Single measurable target value reached by date</div>
              </button>

              <button
                type="button"
                onClick={() => setPlanType('habit_journey')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                  planType === 'habit_journey'
                    ? 'border-rose-500 bg-rose-500/10 text-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-rose-400">
                  <Flame size={14} /> Habit Journey
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Daily/weekly habit commitment with streak counter</div>
              </button>

              <button
                type="button"
                onClick={() => setPlanType('vision')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                  planType === 'vision'
                    ? 'border-purple-500 bg-purple-500/10 text-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-purple-400">
                  <Compass size={14} /> Vision & Reflection
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Long-term vision with dated check-in notes</div>
              </button>
            </div>
          </div>

          {/* SHARED FIELDS */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Plan Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                planType === 'target_goal'
                  ? 'e.g. Read 12 Self-Improvement Books'
                  : planType === 'habit_journey'
                  ? 'e.g. 30-Day Daily Mindfulness Practice'
                  : planType === 'vision'
                  ? 'e.g. Financial Freedom Vision 2030'
                  : 'e.g. 30-Day Morning Mastery Blueprint'
              }
              className="input text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Goal & Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the objective and core outcome of this plan..."
              className="input min-h-[70px] text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input text-xs">
                <option value="Personal Growth">Personal Growth</option>
                <option value="Career">Career</option>
                <option value="Health">Health</option>
                <option value="Finance">Finance</option>
                <option value="Relationships">Relationships</option>
                <option value="Learning">Learning</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Visibility</label>
              <select
                value={isPublic ? 'public' : 'private'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
                className="input text-xs"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* TYPE-SPECIFIC FIELDS */}
          {planType === 'milestone' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-400">Steps & Milestones</label>
                <button type="button" onClick={handleAddStepField} className="text-xs text-blue-400 hover:underline">
                  + Add Step
                </button>
              </div>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => handleStepChange(idx, e.target.value)}
                      placeholder={`Step #${idx + 1}...`}
                      className="input text-xs flex-1"
                      required
                    />
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStepField(idx)}
                        className="text-slate-600 hover:text-rose-400 p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {planType === 'target_goal' && (
            <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Value (Number)</label>
                  <input
                    type="number"
                    min="1"
                    value={targetValue}
                    onChange={(e) => setTargetValue(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unit Label</label>
                  <input
                    type="text"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                    placeholder="e.g. books, km, sessions"
                    className="input text-xs"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Initial Progress</label>
                  <input
                    type="number"
                    min="0"
                    value={currentProgress}
                    onChange={(e) => setCurrentProgress(Number(e.target.value))}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {planType === 'habit_journey' && (
            <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cadence</label>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
                    className="input text-xs"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Duration ({cadence === 'weekly' ? 'Weeks' : 'Days'})</label>
                  <input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {planType === 'vision' && (
            <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target Review Date (Optional)</label>
                <input
                  type="date"
                  value={targetReviewDate}
                  onChange={(e) => setTargetReviewDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Initial Reflection Check-in Note (Optional)</label>
                <textarea
                  value={initialReflectionNote}
                  onChange={(e) => setInitialReflectionNote(e.target.value)}
                  placeholder="First check-in note on your vision..."
                  className="input min-h-[60px] text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Create Plan
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT STRUCTURAL FIELDS MODAL */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Plan Structure">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Plan Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Goal & Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="input min-h-[70px] text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="input text-xs">
                <option value="Personal Growth">Personal Growth</option>
                <option value="Career">Career</option>
                <option value="Health">Health</option>
                <option value="Finance">Finance</option>
                <option value="Relationships">Relationships</option>
                <option value="Learning">Learning</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Visibility</label>
              <select
                value={editIsPublic ? 'public' : 'private'}
                onChange={(e) => setEditIsPublic(e.target.value === 'public')}
                className="input text-xs"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* TYPE-SPECIFIC STRUCTURAL EDIT FIELDS */}
          {editingPlanType === 'milestone' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-400">Steps & Milestones</label>
                <button
                  type="button"
                  onClick={() => setEditSteps([...editSteps, `Step ${editSteps.length + 1}`])}
                  className="text-xs text-blue-400 hover:underline"
                >
                  + Add Step
                </button>
              </div>
              <div className="space-y-2">
                {editSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => {
                        const next = [...editSteps];
                        next[idx] = e.target.value;
                        setEditSteps(next);
                      }}
                      placeholder={`Step #${idx + 1}...`}
                      className="input text-xs flex-1"
                      required
                    />
                    {editSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditSteps(editSteps.filter((_, i) => i !== idx))}
                        className="text-slate-600 hover:text-rose-400 p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {editingPlanType === 'target_goal' && (
            <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Value</label>
                  <input
                    type="number"
                    min="1"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unit Label</label>
                  <input
                    type="text"
                    value={editTargetUnit}
                    onChange={(e) => setEditTargetUnit(e.target.value)}
                    placeholder="e.g. books, km, sessions"
                    className="input text-xs"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target Date</label>
                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>
          )}

          {editingPlanType === 'habit_journey' && (
            <div className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cadence</label>
                <select
                  value={editCadence}
                  onChange={(e) => setEditCadence(e.target.value as 'daily' | 'weekly')}
                  className="input text-xs"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Duration (Days/Weeks)</label>
                <input
                  type="number"
                  min="1"
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="input text-xs"
                  required
                />
              </div>
            </div>
          )}

          {editingPlanType === 'vision' && (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <label className="block text-xs font-medium text-slate-400 mb-1">Target Review Date</label>
              <input
                type="date"
                value={editTargetReviewDate}
                onChange={(e) => setEditTargetReviewDate(e.target.value)}
                className="input text-xs"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
