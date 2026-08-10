import { useState, useEffect, useRef } from 'react';
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
  Search,
  Filter,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { ImprovementPlan, PlanType, UserPlanFollow, PlanReflectionNote, PLAN_CATEGORIES } from '@/types';
import { getCurrentTier } from '@/lib/tiers';
import { TierBadge } from '@/components/ui/TierBadge';
import { fetchPublicPlansFromSupabase, mapRowToImprovementPlan, supabase, syncBroadcaster } from '@/lib/supabase';
import { getProfilePointsByUsername } from '@/lib/auth';
import { isTodayLocal, calculateActivePlanStreak } from '@/lib/dates';
import { STARTER_TEMPLATES } from '@/data/planTemplates';

function ExpandableDescription({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      // Small timeout ensures styles/layout are applied before checking scrollHeight
      setTimeout(() => {
        setIsOverflowing(el.scrollHeight > el.clientHeight);
      }, 0);
    }
  }, [text]);

  return (
    <div className="space-y-1">
      <p 
        ref={textRef} 
        className={`text-xs text-slate-400 whitespace-pre-wrap ${!isExpanded ? 'line-clamp-2' : ''}`}
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[11px] text-purple-400 hover:underline flex items-center gap-1 mt-1"
        >
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} 
          {isExpanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

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

  // Vision Plan & Phase C Review Loop states
  const [targetReviewDate, setTargetReviewDate] = useState<string>('');
  const [initialReflectionNote, setInitialReflectionNote] = useState<string>('');
  const [reviewCadence, setReviewCadence] = useState<'weekly' | 'monthly' | null>(null);

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
  const [editReviewCadence, setEditReviewCadence] = useState<'weekly' | 'monthly' | null>(null);
  const [editingPlanType, setEditingPlanType] = useState<PlanType>('milestone');

  // Discover tab filter/search/sort state
  const [discoverSearch, setDiscoverSearch] = useState<string>('');
  const [discoverCategory, setDiscoverCategory] = useState<string>('All');
  const [discoverPlanType, setDiscoverPlanType] = useState<string>('all');
  const [discoverSortBy, setDiscoverSortBy] = useState<'recent' | 'followed' | 'creator_rank'>('recent');

  // Interactive inline UI state (Progress inputs & Reflection note inputs)
  const [progressInput, setProgressInput] = useState<{ [planId: string]: string }>({});
  const [reflectionInput, setReflectionInput] = useState<{ [planId: string]: string }>({});
  const [expandedReflections, setExpandedReflections] = useState<{ [planId: string]: boolean }>({});
  const [editingNoteId, setEditingNoteId] = useState<{ [noteKey: string]: boolean }>({});
  const [editingNoteText, setEditingNoteText] = useState<{ [noteKey: string]: string }>({});

  const [planToDelete, setPlanToDelete] = useState<ImprovementPlan | null>(null);
  const [followToDelete, setFollowToDelete] = useState<UserPlanFollow | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{ planId: string; noteKey: string; mode: 'creator_interactive' | 'follower_interactive' } | null>(null);

  const improvementPlans = store.state.improvementPlans;
  const followedPlans = store.state.followedPlans;
  const currentUsername = store.state.username;

  // Remote public plans fetched & updated via Supabase Realtime & syncBroadcaster
  const [remotePublicPlans, setRemotePublicPlans] = useState<ImprovementPlan[]>([]);

  const loadPlans = async (
    overrideSearch?: string,
    overrideCat?: string,
    overrideType?: string,
    overrideSort?: 'recent' | 'followed' | 'creator_rank'
  ) => {
    setIsRefreshing(true);
    try {
      const search = overrideSearch !== undefined ? overrideSearch : discoverSearch;
      const category = overrideCat !== undefined ? overrideCat : discoverCategory;
      const planType = overrideType !== undefined ? overrideType : discoverPlanType;
      const sortBy = overrideSort !== undefined ? overrideSort : discoverSortBy;

      const plans = await fetchPublicPlansFromSupabase({ search, category, planType, sortBy });
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

  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  useEffect(() => {
    let mounted = true;

    const fetchInitialPlans = async () => {
      const plans = await fetchPublicPlansFromSupabase();
      if (mounted && plans) {
        setRemotePublicPlans(plans);
        plans.forEach((p) => {
          if (p.copyCount !== undefined) {
            storeRef.current.updatePlanCopyCount(p.id, p.copyCount);
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
                storeRef.current.updatePlanCopyCount(newRow.id, newRow.copy_count);
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
            const currentLocal = storeRef.current.state.improvementPlans.find((p) => p.id === targetId);
            if (currentLocal) {
              storeRef.current.updatePlanCopyCount(targetId, (currentLocal.copyCount || 0) + 1);
            }
          }
        }
      )
      .subscribe();

    // 3. Tab-to-tab syncBroadcaster listener for local multi-tab sync
    const unsubscribeBroadcast = syncBroadcaster.subscribe((event: any, payload?: any) => {
      if (!mounted) return;
      const eventObj = typeof event === 'object' && event !== null ? event : payload;
      if (eventObj?.type === 'PLAN_DELETED' && eventObj.data?.planId) {
        const deletedId = eventObj.data.planId;
        setRemotePublicPlans((prev) => prev.filter((p) => p.id !== deletedId));
      } else if (eventObj?.type === 'PLAN_UPDATED' && eventObj.data) {
        const updated = eventObj.data;
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

    // 1. Load remote public plans from database / realtime updates first
    remotePublicPlans.forEach((p) => map.set(p.id, p));

    // 2. Merge local public plans (highest streak / progress always wins)
    localPublic.forEach((local) => {
      const remote = map.get(local.id);
      if (remote) {
        map.set(local.id, {
          ...remote,
          ...local,
          streakCount: Math.max(remote.streakCount || 0, local.streakCount || 0),
          currentProgress: Math.max(remote.currentProgress || 0, local.currentProgress || 0),
          lastCompletedDate: (remote.lastCompletedDate && local.lastCompletedDate)
            ? (new Date(remote.lastCompletedDate) > new Date(local.lastCompletedDate) ? remote.lastCompletedDate : local.lastCompletedDate)
            : (remote.lastCompletedDate || local.lastCompletedDate || ''),
          copyCount: Math.max(remote.copyCount || 0, local.copyCount || 0),
        });
      } else {
        map.set(local.id, local);
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

  // Starter Template application helper
  const applyTemplate = (tpl: typeof STARTER_TEMPLATES[number]) => {
    setPlanType(tpl.planType);
    setTitle(tpl.title);
    setDescription(tpl.description);
    setCategory(tpl.category);
    setIsPublic(false); // Default visibility: Private
    setReviewCadence(null); // Default review cadence: None
    if (tpl.planType === 'habit_journey') {
      if (tpl.cadence) setCadence(tpl.cadence);
      if (tpl.duration) setDuration(tpl.duration);
    } else if (tpl.planType === 'target_goal') {
      if (tpl.targetValue) setTargetValue(tpl.targetValue);
      if (tpl.targetUnit) setTargetUnit(tpl.targetUnit);
      if (tpl.getTargetDate) setTargetDate(tpl.getTargetDate().split('T')[0]);
    } else if (tpl.planType === 'milestone') {
      if (tpl.steps) setSteps(tpl.steps);
    }
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
        reviewCadence,
      }
    );

    setCreateModalOpen(false);
    setTitle('');
    setDescription('');
    setSteps(['Step 1: ', 'Step 2: ', 'Step 3: ']);
    setInitialReflectionNote('');
    setReviewCadence(null);
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
    setEditReviewCadence(plan.reviewCadence || null);
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
        reviewCadence: editReviewCadence,
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
    const notes = (plan.reflectionNotes || []) as any[];
    const isExpanded = expandedReflections[planId] ?? false;

    const isReviewDue =
      mode !== 'read_only' &&
      !!plan.reviewCadence &&
      !!plan.nextReviewDueAt &&
      new Date(plan.nextReviewDueAt).getTime() <= Date.now();

    const renderReviewDueBadge = () => {
      if (!isReviewDue) return null;
      return (
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md mb-2 animate-pulse">
          <Sparkles size={13} className="text-amber-400 shrink-0" />
          <span>Review Due ({plan.reviewCadence === 'weekly' ? 'Weekly' : 'Monthly'} Check-in)</span>
        </div>
      );
    };

    const renderReflectionSection = () => {
      // PHASE 1 FIX: Hide Reflection UI if reviewCadence is null, 'none', or not weekly/monthly
      if (!plan.reviewCadence || (plan.reviewCadence !== 'weekly' && plan.reviewCadence !== 'monthly')) {
        return null;
      }

      if (mode === 'read_only' && notes.length === 0) return null;

      return (
        <div className="space-y-3 mt-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
          {/* Add Reflection Note Field (Interactive mode ONLY) */}
          {mode !== 'read_only' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-400">Add Reflection Note</span>
                {plan.reviewCadence && (
                  <span className="text-[10px] text-purple-400 font-mono">
                    Cadence: {plan.reviewCadence === 'weekly' ? 'Weekly' : 'Monthly'}
                  </span>
                )}
              </div>
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
                  className="btn-secondary text-xs py-1 px-3 flex items-center gap-1 text-purple-300 hover:text-purple-200 shrink-0"
                >
                  <Send size={12} /> Post
                </button>
              </div>
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
                const noteKey = n.id || n.date || n.createdAt;
                const noteDate = n.createdAt || n.date || new Date().toISOString();
                const isEditingThisNote = editingNoteId[noteKey] ?? false;

                return (
                  <div key={noteKey} className="text-xs p-2 rounded bg-slate-800/60 border border-slate-700/50 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{new Date(noteDate).toLocaleString()}</span>
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
                            onClick={() => setNoteToDelete({ planId, noteKey, mode })}
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
    };

    if (resolvedType === 'target_goal') {
      const targetVal = plan.targetValue || 1;
      const curProg = plan.currentProgress || 0;
      const pct = Math.min(100, Math.round((curProg / targetVal) * 100));
      const isGoalCompleted = curProg >= targetVal;

      return (
        <div>
          {renderReviewDueBadge()}
          <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                Progress: <span className="text-amber-400 font-bold">{curProg}</span> / {targetVal} {plan.targetUnit || 'units'}
              </span>
              <span className="font-bold text-amber-400">{pct}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div 
                className={`${isGoalCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'} h-full transition-all duration-500`} 
                style={{ width: `${pct}%` }} 
              />
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
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={progressInput[planId] !== undefined ? progressInput[planId] : (plan.currentProgress || 0)}
                  onChange={(e) => setProgressInput({ ...progressInput, [planId]: e.target.value })}
                  className="input text-xs w-24 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Value"
                  disabled={isGoalCompleted}
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
                  className="btn-secondary text-xs py-1 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isGoalCompleted}
                >
                  Update Progress
                </button>
                
                {isGoalCompleted && (
                  <button
                    onClick={() => {
                      const newTargetStr = window.prompt(`Goal completed! Enter your new target value:`);
                      if (newTargetStr === null) return;
                      
                      const newTarget = Number(newTargetStr);
                      if (!isNaN(newTarget) && newTarget > 0) {
                        if (mode === 'creator_interactive') {
                          store.setNewTargetGoal(planId, newTarget);
                        } else {
                          store.setNewFollowedTargetGoal(planId, newTarget);
                        }
                        setProgressInput({ ...progressInput, [planId]: '0' });
                      } else {
                        alert("Please enter a valid number greater than 0.");
                      }
                    }}
                    className="btn-primary text-[11px] py-1 px-2 ml-1"
                  >
                    Set New Target
                  </button>
                )}
                {isGoalCompleted && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 ml-auto mt-1 sm:mt-0">
                    <CheckCircle2 size={13} /> Completed!
                  </span>
                )}
              </div>
            )}
          </div>
          {renderReflectionSection()}
        </div>
      );
    }

    if (resolvedType === 'habit_journey') {
      const streak = calculateActivePlanStreak(plan.streakCount || 0, plan.lastCompletedDate, plan.cadence || 'daily');
      const cadenceText = plan.cadence === 'weekly' ? 'Week' : 'Day';
      const durationText = plan.duration ? `${plan.duration} ${plan.cadence === 'weekly' ? 'weeks' : 'days'}` : 'Ongoing';
      const isCompletedToday = isTodayLocal(plan.lastCompletedDate);

      return (
        <div>
          {renderReviewDueBadge()}
          <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
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
              <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isCompletedToday ? (
                    <>
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                        <CheckCircle2 size={13} /> Done for {cadenceText}
                      </span>
                      <button
                        onClick={() => {
                          if (mode === 'follower_interactive') {
                            store.undoFollowedHabitJourneyDone(planId);
                          } else {
                            store.undoHabitJourneyDone(planId);
                          }
                        }}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        title="Undo today's completion and re-enable mark done"
                      >
                        <RotateCcw size={13} /> Undo Today's Mark
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (mode === 'follower_interactive') {
                          store.markFollowedHabitJourneyDone(planId);
                        } else {
                          store.markHabitJourneyDone(planId);
                        }
                      }}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white"
                    >
                      <CheckCircle2 size={14} /> Mark Done for {cadenceText}
                    </button>
                  )}
                </div>
                {plan.lastCompletedDate && (
                  <span className="text-[10px] text-slate-500">
                    Last completed: {new Date(plan.lastCompletedDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
          {renderReflectionSection()}
        </div>
      );
    }

    if (resolvedType === 'vision') {
      return (
        <div>
          {renderReviewDueBadge()}
          {plan.targetReviewDate && (
            <div className="text-[11px] text-purple-300 flex items-center gap-1 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 mb-2">
              <Calendar size={12} className="text-purple-400" /> Target Review Date: {plan.targetReviewDate}
            </div>
          )}
          {renderReflectionSection()}
        </div>
      );
    }

    // Default: Milestone Steps List
    return (
      <div>
        {renderReviewDueBadge()}
        <div className="space-y-1.5 mt-2 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
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
        {renderReflectionSection()}
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
            onClick={() => loadPlans()}
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
                            <ExpandableDescription text={plan.description} />
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
                              onClick={() => setPlanToDelete(plan)}
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
                          <ExpandableDescription text={follow.description} />
                        </div>

                        <button
                          onClick={() => setFollowToDelete(follow)}
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

      {/* DISCOVER TAB (READ-ONLY PREVIEW SHOWCASE ONLY WITH SERVER-SIDE FILTERING & SORTING) */}
      {activeTab === 'discover' && (
        <div className="space-y-4">
          {/* Server-Side Search, Filter, & Sort Control Bar */}
          <div className="card p-4 space-y-3 bg-slate-900/60 border-slate-800">
            {/* Search Input & Sort Dropdown */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={discoverSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDiscoverSearch(val);
                    loadPlans(val, discoverCategory, discoverPlanType, discoverSortBy);
                  }}
                  placeholder="Search public plans by title, description, or keyword..."
                  className="input text-xs pl-9 py-2 w-full"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
                  <Filter size={13} className="text-blue-400" /> Sort:
                </label>
                <select
                  value={discoverSortBy}
                  onChange={(e) => {
                    const sort = e.target.value as 'recent' | 'followed' | 'creator_rank';
                    setDiscoverSortBy(sort);
                    loadPlans(discoverSearch, discoverCategory, discoverPlanType, sort);
                  }}
                  className="input text-xs py-1.5 px-3 bg-slate-800 border-slate-700 text-slate-200"
                >
                  <option value="recent">Most Recent</option>
                  <option value="followed">Most Followed (Copy Count)</option>
                  <option value="creator_rank">Creator Rank (Tier Points)</option>
                </select>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Category:</span>
              {['All', ...PLAN_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setDiscoverCategory(cat);
                    loadPlans(discoverSearch, cat, discoverPlanType, discoverSortBy);
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    discoverCategory === cat
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Plan Type Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Plan Type:</span>
              {[
                { id: 'all', label: 'All Types' },
                { id: 'milestone', label: 'Milestone' },
                { id: 'target_goal', label: 'Target Goal' },
                { id: 'habit_journey', label: 'Habit Journey' },
                { id: 'vision', label: 'Vision & Reflection' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setDiscoverPlanType(t.id);
                    loadPlans(discoverSearch, discoverCategory, t.id, discoverSortBy);
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    discoverPlanType === t.id
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {remotePublicPlans.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 text-sm space-y-3">
              <Compass size={32} className="mx-auto text-slate-600 mb-1" />
              <p className="font-semibold text-slate-400">No public plans found matching your filters.</p>
              <p className="text-xs text-slate-500">Try adjusting your search query, category, or plan type filters.</p>
              {(discoverSearch || discoverCategory !== 'All' || discoverPlanType !== 'all') && (
                <button
                  onClick={() => {
                    setDiscoverSearch('');
                    setDiscoverCategory('All');
                    setDiscoverPlanType('all');
                    setDiscoverSortBy('recent');
                    loadPlans('', 'All', 'all', 'recent');
                  }}
                  className="btn-secondary text-xs py-1.5 px-4 mx-auto inline-block"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {remotePublicPlans.map((plan) => {
                const creatorPts = plan.creatorPoints || getProfilePointsByUsername(plan.creatorUsername) || 0;
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
                              <TierBadge totalPoints={creatorPts} size="sm" />
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
                                onClick={() => setPlanToDelete(plan)}
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
                        <ExpandableDescription text={plan.description} />
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
          {/* STARTER TEMPLATE ACCELERATOR */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles size={13} className="text-blue-400" /> Start from Template (Optional)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="text-left p-2 rounded border border-slate-800 hover:border-blue-500/50 bg-slate-800/40 hover:bg-slate-800/80 transition-all text-xs group"
                >
                  <div className="font-bold text-slate-200 group-hover:text-blue-300 flex items-center justify-between">
                    <span>{tpl.title}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{tpl.description}</div>
                </button>
              ))}
            </div>
          </div>

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
                {PLAN_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
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

          {/* Phase C Review Cadence Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Review Cadence (Check-in Loop)</label>
            <select
              value={reviewCadence || ''}
              onChange={(e) => setReviewCadence(e.target.value ? (e.target.value as 'weekly' | 'monthly') : null)}
              className="input text-xs"
            >
              <option value="">None (No scheduled check-in review)</option>
              <option value="weekly">Weekly Check-in Loop</option>
              <option value="monthly">Monthly Check-in Loop</option>
            </select>
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
                {PLAN_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
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

          {/* Phase C Review Cadence Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Review Cadence (Check-in Loop)</label>
            <select
              value={editReviewCadence || ''}
              onChange={(e) => setEditReviewCadence(e.target.value ? (e.target.value as 'weekly' | 'monthly') : null)}
              className="input text-xs"
            >
              <option value="">None (No scheduled check-in review)</option>
              <option value="weekly">Weekly Check-in Loop</option>
              <option value="monthly">Monthly Check-in Loop</option>
            </select>
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

      {/* Delete Plan Confirm Modal */}
      <ConfirmDeleteModal
        open={Boolean(planToDelete)}
        onClose={() => setPlanToDelete(null)}
        onConfirm={async () => {
          if (planToDelete) {
            await store.deletePlan(planToDelete.id);
            setPlanToDelete(null);
          }
        }}
        title="Delete Improvement Plan?"
        itemName={planToDelete?.title}
        description={`Are you sure you want to delete "${planToDelete?.title}"? This will permanently remove the plan and all attached reflection notes or logs.`}
      />

      {/* Remove Followed Plan Confirm Modal */}
      <ConfirmDeleteModal
        open={Boolean(followToDelete)}
        onClose={() => setFollowToDelete(null)}
        onConfirm={async () => {
          if (followToDelete) {
            await store.deleteFollowedPlan(followToDelete.id);
            setFollowToDelete(null);
          }
        }}
        title="Remove Saved Plan?"
        itemName={followToDelete?.title}
        description={`Are you sure you want to remove "${followToDelete?.title}" from your saved plans?`}
        confirmText="Remove Plan"
      />

      {/* Delete Reflection Note Confirm Modal */}
      <ConfirmDeleteModal
        open={Boolean(noteToDelete)}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete) {
            if (noteToDelete.mode === 'creator_interactive') {
              store.deleteVisionReflectionNote(noteToDelete.planId, noteToDelete.noteKey);
            } else {
              store.deleteFollowedVisionReflectionNote(noteToDelete.planId, noteToDelete.noteKey);
            }
            setNoteToDelete(null);
          }
        }}
        title="Delete Reflection Note?"
        description="Are you sure you want to delete this reflection note?"
      />
    </div>
  );
}
