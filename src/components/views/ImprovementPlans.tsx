import { useState, useEffect, useRef, useCallback } from 'react';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import { useToast } from '@/components/ui/Toast';
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
  CalendarClock,
  LayoutTemplate,
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
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Dialog, EmptyState, ProgressBar, Skeleton, SlidingPill } from '@/components/ui/primitives';
import { ImprovementPlan, PlanType, UserPlanFollow, PlanReflectionNote, PLAN_CATEGORIES } from '@/types';
import { getCurrentTier } from '@/lib/tiers';
import { todayKey } from '@/lib/dates';
import { TierBadge } from '@/components/ui/TierBadge';
import { fetchPublicPlansFromSupabase, mapRowToImprovementPlan, supabase, syncBroadcaster } from '@/lib/supabase';
import { getProfilePointsByUsername, getProfileSeasonPointsByUsername } from '@/lib/auth';
import { leagueNow } from '@/lib/leagueTime';
import { isTodayLocal, calculateActivePlanStreak, formatDateShort, parseDate } from '@/lib/dates';
import { STARTER_TEMPLATES } from '@/data/planTemplates';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { AutoNum, CountUp } from '@/components/ui/Motion';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

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
        className={`text-xs text-content-muted whitespace-pre-wrap ${!isExpanded ? 'line-clamp-2' : ''}`}
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-micro text-purple-hierarchy hover:text-content-primary hover:underline flex items-center gap-1 mt-1"
        >
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} 
          {isExpanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

export function ImprovementPlans({ store }: { store: AppStore }) {
  const { showSuccessToast, showErrorToast } = useToast();
  const { isLoading: isLoadingPlans, executeFn: executeLoadPlans } = useAsyncAction();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const [activeTab, setActiveTab] = useState<'my_plans' | 'discover'>('my_plans');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

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
  const [startDate, setStartDate] = useState<string>(todayKey());

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
  // Completed target goal: the plan waiting for a new target, and the value being typed.
  const [newTargetFor, setNewTargetFor] = useState<{ planId: string; mode: 'creator_interactive' | 'follower_interactive' } | null>(null);
  const [newTargetValue, setNewTargetValue] = useState('');
  const newTargetNumber = Number(newTargetValue);
  const isNewTargetValid = newTargetValue.trim() !== '' && Number.isFinite(newTargetNumber) && newTargetNumber >= 1;

  const closeNewTarget = () => {
    setNewTargetFor(null);
    setNewTargetValue('');
  };

  const handleNewTargetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetFor || !isNewTargetValid) return;
    if (newTargetFor.mode === 'creator_interactive') {
      store.setNewTargetGoal(newTargetFor.planId, newTargetNumber);
    } else {
      store.setNewFollowedTargetGoal(newTargetFor.planId, newTargetNumber);
    }
    setProgressInput((prev) => ({ ...prev, [newTargetFor.planId]: '0' }));
    closeNewTarget();
  };

  const createForm = useUnsavedChanges(createModalOpen, [
    planType,
    title,
    description,
    category,
    isPublic,
    steps,
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
  ]);
  const editForm = useUnsavedChanges(editModalOpen && editingPlanId, [
    editTitle,
    editDescription,
    editCategory,
    editIsPublic,
    editSteps,
    editTargetValue,
    editTargetUnit,
    editTargetDate,
    editCadence,
    editDuration,
    editTargetReviewDate,
    editReviewCadence,
  ]);
  // The "add a reflection note" boxes under each plan; a box cleared after saving is clean again.
  useUnsavedChanges(
    true,
    Object.entries(reflectionInput).filter(([, text]) => text.trim() !== '')
  );

  const [noteToDelete, setNoteToDelete] = useState<{ planId: string; noteKey: string; mode: 'creator_interactive' | 'follower_interactive' } | null>(null);

  const improvementPlans = store.state.improvementPlans;
  const followedPlans = store.state.followedPlans;
  const currentUsername = store.state.username;

  // Remote public plans fetched & updated via Supabase Realtime & syncBroadcaster
  const [remotePublicPlans, setRemotePublicPlans] = useState<ImprovementPlan[]>([]);

  const loadPlans = useCallback(
    async (
      overrideSearch?: string,
      overrideCat?: string,
      overrideType?: string,
      overrideSort?: 'recent' | 'followed' | 'creator_rank'
    ) => {
      await executeLoadPlans(async () => {
        const search = overrideSearch !== undefined ? overrideSearch : discoverSearch;
        const category = overrideCat !== undefined ? overrideCat : discoverCategory;
        const planType = overrideType !== undefined ? overrideType : discoverPlanType;
        const sortBy = overrideSort !== undefined ? overrideSort : discoverSortBy;

        const plans = await fetchPublicPlansFromSupabase({ search, category, planType, sortBy });
        if (plans) {
          setRemotePublicPlans(plans);
          plans.forEach((p) => {
            if (p.copyCount !== undefined) {
              storeRef.current.updatePlanCopyCount(p.id, p.copyCount);
            }
          });
        }
      });
    },
    [discoverSearch, discoverCategory, discoverPlanType, discoverSortBy, executeLoadPlans]
  );

  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  const discoverFiltersRef = useRef({
    search: discoverSearch,
    category: discoverCategory,
    planType: discoverPlanType,
    sortBy: discoverSortBy,
  });

  useEffect(() => {
    discoverFiltersRef.current = {
      search: discoverSearch,
      category: discoverCategory,
      planType: discoverPlanType,
      sortBy: discoverSortBy,
    };
  }, [discoverSearch, discoverCategory, discoverPlanType, discoverSortBy]);

  // Periodic silent background reconciliation for Discover tab (covers RLS-dropped visibility UPDATEs)
  useEffect(() => {
    if (activeTab !== 'discover') return;

    let mounted = true;

    const performSilentReconcile = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      try {
        const filters = discoverFiltersRef.current;
        const plans = await fetchPublicPlansFromSupabase({
          search: filters.search,
          category: filters.category,
          planType: filters.planType,
          sortBy: filters.sortBy,
        });

        if (!mounted || !plans) return;

        let hasDifferences = false;
        const plansWithChangedCopyCount: { id: string; copyCount: number }[] = [];

        setRemotePublicPlans((prev) => {
          hasDifferences = false;
          plansWithChangedCopyCount.length = 0;

          const prevMap = new Map(prev.map((p) => [p.id, p]));

          if (prev.length === plans.length) {
            const isIdentical = prev.every((p, i) => {
              const n = plans[i];
              return (
                p.id === n.id &&
                p.isPublic === n.isPublic &&
                p.copyCount === n.copyCount &&
                p.title === n.title &&
                p.description === n.description &&
                p.currentProgress === n.currentProgress &&
                p.streakCount === n.streakCount &&
                p.lastCompletedDate === n.lastCompletedDate &&
                p.creatorPoints === n.creatorPoints
              );
            });
            if (isIdentical) return prev;
          }

          hasDifferences = true;

          plans.forEach((p) => {
            if (p.copyCount !== undefined) {
              const prevPlan = prevMap.get(p.id);
              if (!prevPlan || prevPlan.copyCount !== p.copyCount) {
                plansWithChangedCopyCount.push({ id: p.id, copyCount: p.copyCount });
              }
            }
          });

          return plans;
        });

        if (hasDifferences && plansWithChangedCopyCount.length > 0) {
          plansWithChangedCopyCount.forEach(({ id, copyCount }) => {
            storeRef.current.updatePlanCopyCount(id, copyCount);
          });
        }
      } catch (err) {
        console.error('Failed to perform silent reconcile for Discover plans:', err);
      }
    };

    let pollInterval: number | null = null;

    const startPolling = () => {
      if (!pollInterval && (typeof navigator === 'undefined' || navigator.onLine)) {
        pollInterval = window.setInterval(performSilentReconcile, 25000);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    startPolling();

    const handleOnline = () => {
      startPolling();
      performSilentReconcile();
    };

    const handleOffline = () => {
      stopPolling();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      stopPolling();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeTab]);

  useEffect(() => {
    let mounted = true;

    const fetchInitialPlans = async () => {
      await executeLoadPlans(async () => {
        const plans = await fetchPublicPlansFromSupabase();
        if (mounted && plans) {
          setRemotePublicPlans(plans);
          plans.forEach((p) => {
            if (p.copyCount !== undefined) {
              storeRef.current.updatePlanCopyCount(p.id, p.copyCount);
            }
          });
        }
      });
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
    const unsubscribeBroadcast = syncBroadcaster.subscribe((event, payload) => {
      if (!mounted) return;
      if (event === 'PLAN_DELETED' && payload?.planId) {
        const deletedId = payload.planId;
        setRemotePublicPlans((prev) => prev.filter((p) => p.id !== deletedId));
      } else if (event === 'PLAN_UPDATED' && payload) {
        const updated = payload;
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
  }, [activeTab, executeLoadPlans]);

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
          lastCompletedDate: (() => {
            const remoteDate = parseDate(remote.lastCompletedDate);
            const localDate = parseDate(local.lastCompletedDate);
            if (remoteDate && localDate) {
              return remoteDate.getTime() > localDate.getTime() ? remote.lastCompletedDate : local.lastCompletedDate;
            }
            return remote.lastCompletedDate || local.lastCompletedDate || '';
          })(),
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

  // Plan Type change handler with Review Cadence enforcement
  const handleSelectPlanType = (type: PlanType) => {
    setPlanType(type);
    if (type === 'vision') {
      if (!reviewCadence) {
        setReviewCadence('weekly');
      }
    }
  };

  // Starter Template application helper
  const applyTemplate = (tpl: typeof STARTER_TEMPLATES[number]) => {
    setPlanType(tpl.planType);
    setTitle(tpl.title);
    setDescription(tpl.description);
    setCategory(tpl.category);
    setIsPublic(false); // Default visibility: Private
    setReviewCadence(tpl.planType === 'vision' ? 'weekly' : null); // Vision plans require an active cadence
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

    const enforcedReviewCadence = planType === 'vision' ? (reviewCadence || 'weekly') : reviewCadence;

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
        reviewCadence: enforcedReviewCadence,
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
    const isVision = plan.planType === 'vision';
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
    setEditReviewCadence(isVision ? (plan.reviewCadence || 'weekly') : (plan.reviewCadence || null));
    setEditingPlanType(plan.planType || 'milestone');
    setEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId || !editTitle.trim() || !editDescription.trim()) return;
    const enforcedEditReviewCadence = editingPlanType === 'vision' ? (editReviewCadence || 'weekly') : editReviewCadence;
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
        reviewCadence: enforcedEditReviewCadence,
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
          <span className="badge-amber inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded">
            <Target size={11} /> Target Goal
          </span>
        );
      case 'habit_journey':
        return (
          <span className="badge-rose inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-lg">
            <Flame size={11} /> Habit Journey
          </span>
        );
      case 'vision':
        return (
          <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded badge-purple">
            <Compass size={11} /> Vision & Reflection
          </span>
        );
      case 'milestone':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded badge-blue">
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

    const isVision = resolvedType === 'vision' || (plan as any).type === 'VISION_REFLECTION' || (plan as any).type === 'vision';
    const effectiveCadence = plan.reviewCadence || (isVision ? 'weekly' : null);

    const isReviewDue =
      mode !== 'read_only' &&
      !!effectiveCadence &&
      !!plan.nextReviewDueAt &&
      new Date(plan.nextReviewDueAt).getTime() <= Date.now();

    const renderReviewDueBadge = () => {
      if (!isReviewDue) return null;
      return (
        <div className="badge-amber flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg mb-2">
          <CalendarClock size={13} className="text-warning-text shrink-0" />
          <span>Review Due ({effectiveCadence === 'monthly' ? 'Monthly' : 'Weekly'} Check-in)</span>
        </div>
      );
    };

    const renderReflectionSection = () => {
      // Defensive rendering: For non-vision plans, hide reflection UI if reviewCadence is null, 'none', or not weekly/monthly.
      // For Vision & Reflection plans, ALWAYS render the reflection UI as a fallback even if reviewCadence is 'none'/null on legacy records.
      const hasActiveCadence = plan.reviewCadence === 'weekly' || plan.reviewCadence === 'monthly';
      if (!isVision && !hasActiveCadence) {
        return null;
      }

      if (mode === 'read_only' && notes.length === 0) return null;

      return (
        <div className="space-y-3 mt-3 pt-3 border-t border-overlay-subtle">
          {/* Add Reflection Note Field (Interactive mode ONLY) */}
          {mode !== 'read_only' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-micro">
                <span className="font-medium text-content-tertiary">Add Reflection Note</span>
                {effectiveCadence && (
                  <span className="text-2xs text-purple-hierarchy">
                    Cadence: {effectiveCadence === 'weekly' ? 'Weekly' : 'Monthly'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={reflectionInput[planId] || ''}
                  onChange={(e) => setReflectionInput({ ...reflectionInput, [planId]: e.target.value })}
                  placeholder="Add a check-in note..."
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
                  className="hover:text-purple-hierarchy text-purple-hierarchy btn-secondary text-xs py-1 px-3 flex items-center gap-1 shrink-0"
                >
                  <Send size={12} /> Post
                </button>
              </div>
            </div>
          )}

          {/* Reflections List Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-content-tertiary flex items-center gap-1">
              <MessageSquare size={13} className="text-purple-hierarchy" /> {notes.length} Check-in Reflection(s)
            </span>
            {notes.length > 0 && (
              <button
                onClick={() => setExpandedReflections({ ...expandedReflections, [planId]: !isExpanded })}
                className="text-xs text-purple-hierarchy hover:text-content-primary hover:underline flex items-center gap-1"
              >
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {isExpanded ? 'Hide' : 'View Notes'}
              </button>
            )}
          </div>

          {/* Expanded Reflection List with Edit & Delete */}
          {isExpanded && notes.length > 0 && (
            <div className="divide-y divide-overlay-subtle border-t border-overlay-subtle">
              {notes.map((n) => {
                const noteKey = n.id || n.date || n.createdAt;
                const noteDate = n.createdAt || n.date || new Date().toISOString();
                const isEditingThisNote = editingNoteId[noteKey] ?? false;

                return (
                  <div key={noteKey} className="text-xs py-2 space-y-1">
                    <div className="figure flex items-center justify-between text-2xs text-content-disabled">
                      <span>{new Date(noteDate).toLocaleString()}</span>
                      {mode !== 'read_only' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingNoteId({ ...editingNoteId, [noteKey]: !isEditingThisNote });
                              setEditingNoteText({ ...editingNoteText, [noteKey]: n.note });
                            }}
                            className={`text-content-muted hover:text-purple-hierarchy transition-colors ${TAP_TARGET_Y}`}
                            title="Edit Note"
                            aria-label="Edit reflection note"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => setNoteToDelete({ planId, noteKey, mode })}
                            className={`text-content-muted hover:text-rose-theme transition-colors ${TAP_TARGET_Y}`}
                            title="Delete Note"
                            aria-label="Delete reflection note"
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
                            className="btn-secondary text-2xs py-0.5 px-2"
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
                            className="hover:bg-purple-500 bg-purple-600 btn-primary text-2xs py-0.5 px-2"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-content-tertiary italic">"{n.note}"</div>
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
          <div className="space-y-3 pt-3 border-t border-overlay-subtle">
            <div className="flex items-center justify-between text-xs">
              <span className="text-content-tertiary">
                Progress: <span className={isGoalCompleted ? 'figure text-success-text' : 'figure text-warning-text'}><AutoNum text={String(curProg)} /></span>{/* OLD: <span className="text-brand-text font-bold">{curProg}</span> */} / {targetVal} {plan.targetUnit || 'units'}
              </span>
              <span className={isGoalCompleted ? 'figure text-sm text-success-text' : 'figure text-sm text-warning-text'}><CountUp value={pct} />%</span>{/* OLD: <span className="font-bold text-brand-text">{pct}%</span> */}
            </div>

            {/* Progress Bar */}
            <ProgressBar value={pct} label="Plan goal progress" tone={isGoalCompleted ? 'success' : 'warning'} />

            {plan.targetDate && (
              <div className="text-micro text-content-muted flex items-center gap-1">
                <Calendar size={12} className="text-content-disabled" /> Target Date: <span className="text-content-tertiary">{plan.targetDate}</span>
              </div>
            )}

            {/* Read-Only mode in Discover: NO input field or button */}
            {mode === 'read_only' ? (
              isGoalCompleted && (
                <div className="text-xs font-medium text-success-text flex items-center gap-1 pt-1">
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
                    onClick={() => setNewTargetFor({ planId, mode })}
                    className="btn-primary text-micro py-1 px-2 ml-1"
                  >
                    Set New Target
                  </button>
                )}
                {isGoalCompleted && (
                  <span className="text-xs font-medium text-success-text flex items-center gap-1 ml-auto mt-1 sm:mt-0">
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
          <div className="space-y-3 pt-3 border-t border-overlay-subtle">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-rose-theme">
                <Flame size={15} className={streak > 0 ? 'text-brand-text' : 'text-content-subtle'} /> <span className="figure">{streak}</span> {cadenceText} Streak
              </span>
              <span className="text-content-muted text-micro">
                Commitment: <span className="text-content-secondary">{durationText}</span> ({plan.cadence || 'daily'})
              </span>
            </div>

            {/* Read-Only mode in Discover: NO "Mark Done" button */}
            {mode === 'read_only' ? (
              plan.lastCompletedDate && (
                <div className="text-2xs text-content-disabled pt-1">
                  Last completed: {formatDateShort(plan.lastCompletedDate)}
                </div>
              )
            ) : (
              /* Interactive mode in My Plans */
              <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isCompletedToday ? (
                    <>
                      <span className="badge-emerald text-xs font-medium flex items-center gap-1 px-2.5 py-1 rounded">
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
                        className="hover:bg-rose-500/10 text-rose-theme btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                        title="Undo today's completion"
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
                      className="hover:bg-rose-500 bg-rose-600 btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} /> Mark Done for {cadenceText}
                    </button>
                  )}
                </div>
                {plan.lastCompletedDate && (
                  <span className="text-2xs text-content-disabled">
                    Last completed: {formatDateShort(plan.lastCompletedDate)}
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
            <div className="text-micro text-purple-hierarchy flex items-center gap-1 bg-purple-500/5 p-2.5 rounded-lg border border-purple-500/15 mb-2">
              <Calendar size={12} className="text-purple-hierarchy" /> Target Review Date: {plan.targetReviewDate}
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
        <div className="space-y-1.5 mt-2 pt-3 border-t border-overlay-subtle">
          {plan.steps && plan.steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              {mode === 'read_only' ? (
                /* Read-only static checkbox indicator in Discover */
                <div className="text-content-subtle">
                  {step.completed ? (
                    <CheckCircle2 size={15} className="text-success-text" />
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
                  className={`text-content-disabled hover:text-success-text transition-colors ${TAP_TARGET}`}
                  aria-label={step.completed ? `Mark step "${step.title}" incomplete` : `Mark step "${step.title}" complete`}
                >
                  {step.completed ? (
                    <CheckCircle2 size={15} className="text-success-text" />
                  ) : (
                    <Circle size={15} />
                  )}
                </button>
              )}
              <span className={step.completed ? 'line-through text-content-subtle' : 'text-content-tertiary'}>
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Improvement Plans</h1>
          <p className="page-subtitle">Milestones, goals and habit journeys, your own or shared.</p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2 sm:shrink-0">
          <Plus size={18} />
          <span>Create Plan</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
        <div className="relative isolate flex gap-4">
          <SlidingPill active={activeTab} variant="underline" className="rounded-full bg-blue-500" />
          <button
            data-pill-id="my_plans"
            onClick={() => setActiveTab('my_plans')}
            className={`pb-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'my_plans'
                ? 'border-transparent text-blue-theme'
                : 'border-transparent text-content-disabled hover:text-content-tertiary'
            }`}
          >
            My Plans & Following ({myCreatedPlans.length + followedPlans.length})
          </button>
          <button
            data-pill-id="discover"
            onClick={() => setActiveTab('discover')}
            className={`pb-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'discover'
                ? 'border-transparent text-blue-theme'
                : 'border-transparent text-content-disabled hover:text-content-tertiary'
            }`}
          >
            Discover Public Plans ({publicDiscoverPlans.length})
          </button>
        </div>

        {activeTab === 'discover' && (
          <button
            onClick={() => loadPlans()}
            disabled={isLoadingPlans}
            className="hover:text-blue-theme btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={isLoadingPlans ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {/* MY PLANS & FOLLOWING TAB */}
      {activeTab === 'my_plans' && (
        <div className="space-y-6">
          {/* Created By Me Section */}
          <div>
            <h2 className="section-title mb-3">Created By Me</h2>
            {myCreatedPlans.length === 0 ? (
              <EmptyState
                title="No plans yet"
                description={'Use "Create Plan" to make one.'}
              />
            ) : (
              <div className="grid-cards-lg gap-4">
                {myCreatedPlans.map((plan) => {
                  const remoteMatch = remotePublicPlans.find((r) => r.id === plan.id);
                  const displayCopyCount = remoteMatch
                    ? Math.max(plan.copyCount || 0, remoteMatch.copyCount || 0)
                    : (plan.copyCount || 0);

                  return (
                    <div key={plan.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-overlay-default transition-all">
                      <div>
                        <div className="flex justify-between items-start gap-3">
                          {/* LEFT SIDE: Type Badge, Title, Category */}
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {renderPlanTypeBadge(plan.planType)}
                              {plan.category && (
                                <span className="text-2xs text-content-muted">
                                  {plan.category}
                                </span>
                              )}
                              <span className={`badge text-2xs ${plan.isPublic ? 'badge-blue' : 'bg-bg-700 text-content-muted border border-overlay-subtle'}`}>
                                {plan.isPublic ? <Globe size={10} className="inline mr-1" /> : <Lock size={10} className="inline mr-1" />}
                                {plan.isPublic ? 'Public' : 'Private'}
                              </span>
                            </div>
                            <h3 className="item-name text-sm leading-snug break-words">{plan.title}</h3>
                            <ExpandableDescription text={plan.description} />
                          </div>

                          {/* RIGHT SIDE: Action Button Group */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="figure flex items-center gap-1 text-micro text-blue-theme px-1" title="Times copied">
                              <Copy size={12} /> {displayCopyCount}
                            </span>

                            {/* Sleek Globe/Lock Toggle */}
                            <button
                              disabled={isKeyLoading(`toggle_vis_${plan.id}`)}
                              onClick={async () => {
                                await executeWithKey(`toggle_vis_${plan.id}`, async () => {
                                  try {
                                    await store.togglePlanVisibility(plan.id, !plan.isPublic);
                                  } catch (err: any) {
                                    showErrorToast("Couldn't change plan visibility", toUserMessage(err, 'Try again in a moment.'));
                                  }
                                });
                              }}
                              className={`p-1.5 rounded transition-colors ${
                                isKeyLoading(`toggle_vis_${plan.id}`) ? 'opacity-50 cursor-not-allowed' : ''
                              } ${
                                plan.isPublic
                                  ? 'text-blue-theme hover:bg-blue-500/20'
                                  : 'text-content-disabled hover:text-content-tertiary hover:bg-bg-700'
                              } ${TAP_TARGET_Y}`}
                              title={plan.isPublic ? 'Make Private' : 'Make Public'}
                              aria-label={plan.isPublic ? `Make "${plan.title}" private` : `Make "${plan.title}" public`}
                            >
                              {isKeyLoading(`toggle_vis_${plan.id}`) ? (
                                <AscendLoadingIndicator size="sm" />
                              ) : plan.isPublic ? (
                                <Globe size={14} />
                              ) : (
                                <Lock size={14} />
                              )}
                            </button>

                            {/* Pencil Edit Icon */}
                            <button
                              onClick={() => handleOpenEdit(plan)}
                              className={`p-1.5 rounded text-content-muted hover:text-blue-theme hover:bg-overlay-subtle transition-colors ${TAP_TARGET_Y}`}
                              title="Edit Structure"
                              aria-label={`Edit structure of "${plan.title}"`}
                            >
                              <Edit3 size={14} />
                            </button>

                            {/* Trash Delete Icon */}
                            <button
                              onClick={() => setPlanToDelete(plan)}
                              className={`p-1.5 rounded text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET_Y}`}
                              title="Delete Plan"
                              aria-label={`Delete plan "${plan.title}"`}
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
            <h2 className="section-title mb-3">Followed & Copied Plans</h2>
            {followedPlans.length === 0 ? (
              <EmptyState
                title="No copied plans yet"
                description="Copy one from Discover Public Plans."
              />
            ) : (
              <div className="grid-cards-lg gap-4">
                {followedPlans.map((follow) => (
                  <div key={follow.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-overlay-default transition-all">
                    <div>
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {renderPlanTypeBadge(follow.planType)}
                          </div>
                          <h3 className="item-name text-sm leading-snug break-words">{follow.title}</h3>
                          <ExpandableDescription text={follow.description} />
                        </div>

                        <button
                          onClick={() => setFollowToDelete(follow)}
                          className="p-1.5 rounded text-rose-theme hover:text-rose-theme hover:bg-rose-500/10 flex items-center gap-1 text-xs shrink-0 transition-colors"
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
          <div className="space-y-3">
            {/* Search Input & Sort Dropdown */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" />
                <input
                  type="text"
                  value={discoverSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDiscoverSearch(val);
                    loadPlans(val, discoverCategory, discoverPlanType, discoverSortBy);
                  }}
                  placeholder="Search public plans..."
                  className="input text-xs pl-9 py-2 w-full"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-medium text-content-muted flex items-center gap-1">
                  <Filter size={13} className="text-blue-theme" /> Sort:
                </label>
                <select
                  value={discoverSortBy}
                  onChange={(e) => {
                    const sort = e.target.value as 'recent' | 'followed' | 'creator_rank';
                    setDiscoverSortBy(sort);
                    loadPlans(discoverSearch, discoverCategory, discoverPlanType, sort);
                  }}
                  className="input text-xs py-1.5 px-3 bg-bg-700 border-overlay-default text-content-secondary"
                >
                  <option value="recent">Most Recent</option>
                  <option value="followed">Most Followed (Copy Count)</option>
                  <option value="creator_rank">Creator Rank (Tier Points)</option>
                </select>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-overlay-default">
              <span className="text-micro font-medium text-content-muted mr-1">Category:</span>
              {['All', ...PLAN_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setDiscoverCategory(cat);
                    loadPlans(discoverSearch, cat, discoverPlanType, discoverSortBy);
                  }}
                  className={`text-micro font-medium px-2.5 py-1 rounded-full border transition-all ${
                    discoverCategory === cat
                      ? 'badge-blue font-semibold'
                      : 'text-content-muted border-transparent hover:bg-overlay-subtle hover:text-content-secondary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Plan Type Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-micro font-medium text-content-muted mr-1">Plan Type:</span>
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
                  className={`text-micro font-medium px-2.5 py-1 rounded-full border transition-all ${
                    discoverPlanType === t.id
                      ? 'bg-purple-500/20 text-purple-hierarchy border-purple-500/40 font-semibold'
                      : 'text-content-muted border-transparent hover:bg-overlay-subtle hover:text-content-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {isLoadingPlans ? (
            <div role="status" aria-label="Loading public plans" className="grid-cards-lg gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2.5 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-8 w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : remotePublicPlans.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No plans match your filters"
              description="Try a different search, category or type."
              action={
                (discoverSearch || discoverCategory !== 'All' || discoverPlanType !== 'all') ? (
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
                ) : undefined
              }
            />
          ) : (
            <div className="grid-cards-lg gap-4">
              {remotePublicPlans.map((plan) => {
                const creatorLifetimePts = plan.creatorPoints || getProfilePointsByUsername(plan.creatorUsername) || 0;
                const creatorSeasonPts = getProfileSeasonPointsByUsername(plan.creatorUsername, 'ninetyDay', leagueNow()) || 0;
                const isOwnPlan = (plan.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase();
                const isAlreadyCopied = followedPlans.some((f) => f.originalPlanId === plan.id);

                return (
                  <div key={plan.id} className="card p-4 space-y-3 flex flex-col justify-between hover:border-overlay-default transition-all">
                    <div>
                      {/* Creator Info Header */}
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">{plan.creatorAvatar || '🧑'}</span>
                          <div>
                            <div className="item-name text-xs text-content-secondary flex items-center gap-1.5">
                              {plan.creatorUsername}
                              <TierBadge totalPoints={creatorSeasonPts} size="sm" />
                            </div>
                            <span className="figure text-2xs text-content-disabled">{creatorSeasonPts} pts</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="figure flex items-center gap-1 text-micro text-blue-theme px-1" title="Times copied">
                            <Copy size={12} /> {plan.copyCount || 0}
                          </span>
                          {isOwnPlan && (
                            <>
                              <button
                                disabled={isKeyLoading(`toggle_vis_${plan.id}`)}
                                onClick={async () => {
                                  await executeWithKey(`toggle_vis_${plan.id}`, async () => {
                                    try {
                                      await store.togglePlanVisibility(plan.id, !plan.isPublic);
                                    } catch (err: any) {
                                      showErrorToast("Couldn't change plan visibility", toUserMessage(err, 'Try again in a moment.'));
                                    }
                                  });
                                }}
                                className={`p-1.5 rounded transition-colors ${
                                  isKeyLoading(`toggle_vis_${plan.id}`) ? 'opacity-50 cursor-not-allowed' : ''
                                } ${
                                  plan.isPublic
                                    ? 'text-blue-theme hover:bg-blue-500/20'
                                    : 'text-content-disabled hover:text-content-tertiary hover:bg-bg-700'
                                } ${TAP_TARGET_Y}`}
                                title={plan.isPublic ? 'Make Private' : 'Make Public'}
                                aria-label={plan.isPublic ? `Make "${plan.title}" private` : `Make "${plan.title}" public`}
                              >
                                {isKeyLoading(`toggle_vis_${plan.id}`) ? (
                                  <AscendLoadingIndicator size="sm" />
                                ) : plan.isPublic ? (
                                  <Globe size={14} />
                                ) : (
                                  <Lock size={14} />
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenEdit(plan)}
                                className={`p-1.5 rounded text-content-muted hover:text-blue-theme hover:bg-overlay-subtle transition-colors ${TAP_TARGET_Y}`}
                                title="Edit Structure"
                                aria-label={`Edit structure of "${plan.title}"`}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setPlanToDelete(plan)}
                                className={`p-1.5 rounded text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET_Y}`}
                                title="Delete Plan"
                                aria-label={`Delete plan "${plan.title}"`}
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
                            <span className="text-2xs text-content-muted">
                              {plan.category}
                            </span>
                          )}
                        </div>
                        <h3 className="item-name text-sm leading-snug break-words">{plan.title}</h3>
                        <ExpandableDescription text={plan.description} />
                      </div>
                    </div>

                    {/* Read-Only Card Body Showcase */}
                    {renderPlanCardBody(plan, 'read_only')}

                    {/* Copy Action Footer */}
                    <div className="pt-2 border-t border-overlay-default flex items-center justify-between">
                      <span className="text-2xs text-content-disabled">Created: {new Date(plan.createdAt).toLocaleDateString()}</span>

                      {!isOwnPlan && (
                        <button
                          onClick={async () => {
                            await executeWithKey(`copy_plan_${plan.id}`, async () => {
                              try {
                                await store.copyPublicPlan(plan);
                                showSuccessToast('Plan copied!', `"${plan.title}" added to your saved plans.`);
                              } catch (err: any) {
                                showErrorToast("Couldn't copy plan", toUserMessage(err, 'Try again in a moment.'));
                              }
                            });
                          }}
                          disabled={isAlreadyCopied || isKeyLoading(`copy_plan_${plan.id}`)}
                          className={`btn-primary text-xs py-1 px-3 flex items-center gap-1.5 ${
                            isAlreadyCopied || isKeyLoading(`copy_plan_${plan.id}`)
                              ? 'opacity-50 cursor-not-allowed bg-bg-600 text-content-muted hover:shadow-none'
                              : ''
                          }`}
                        >
                          {isKeyLoading(`copy_plan_${plan.id}`) ? (
                            <AscendLoadingIndicator size="sm" />
                          ) : (
                            <Copy size={13} />
                          )}
                          <span>
                            {isKeyLoading(`copy_plan_${plan.id}`)
                              ? 'Copying Plan...'
                              : isAlreadyCopied
                              ? 'Copied to My Account'
                              : 'Copy Plan to My Account'}
                          </span>
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

      {/* NEW TARGET (completed target goal) */}
      <Dialog open={newTargetFor !== null} onClose={closeNewTarget} title="Set a new target" maxWidth="max-w-sm">
        <form onSubmit={handleNewTargetSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="plan-new-target" className="text-xs font-medium text-content-secondary">
              New target value
            </label>
            <input
              id="plan-new-target"
              type="number"
              min="1"
              step="any"
              inputMode="decimal"
              autoFocus
              value={newTargetValue}
              onChange={(e) => setNewTargetValue(e.target.value)}
              className="input w-full"
              placeholder="e.g. 20"
            />
            <p className="text-xs text-content-muted">Goal done. Progress starts again from 0.</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={closeNewTarget}
              className="flex-1 py-2.5 hover:bg-overlay-subtle text-content-tertiary font-semibold text-xs rounded-xl border border-overlay-default transition-all"
            >
              Cancel
            </button>
            <button type="submit" disabled={!isNewTargetValid} className="btn-primary flex-1 justify-center text-xs disabled:opacity-50 disabled:cursor-not-allowed">
              Set target
            </button>
          </div>
        </form>
      </Dialog>

      {/* CREATE PLAN MODAL */}
      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        dirty={createForm.dirty}
        title="Create Improvement Plan"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {/* STARTER TEMPLATE ACCELERATOR */}
          <div className="card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-content-tertiary flex items-center gap-1.5">
                <LayoutTemplate size={13} className="text-blue-theme" /> Start from Template (Optional)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="text-left p-2.5 rounded-xl border border-overlay-default hover:border-blue-500/50 hover:bg-overlay-subtle transition-colors text-xs group"
                >
                  <div className="item-name text-content-secondary group-hover:text-blue-theme flex items-center justify-between">
                    <span>{tpl.title}</span>
                  </div>
                  <div className="text-2xs text-content-disabled line-clamp-2 mt-0.5">{tpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 1: PLAN TYPE SELECTOR */}
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-2">Select Plan Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPlanType('milestone')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  planType === 'milestone'
                    ? 'border-blue-500 bg-blue-500/10 text-content-primary ring-1 ring-blue-500/40'
                    : 'border-overlay-default text-content-muted hover:border-overlay-strong hover:bg-overlay-subtle'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-blue-theme">
                  <CheckSquare size={14} /> Milestone Plan
                </div>
                <div className="text-micro text-content-disabled leading-tight">Ordered list of milestones & step completion</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPlanType('target_goal')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  planType === 'target_goal'
                    ? 'border-amber-500 bg-amber-500/10 text-content-primary ring-1 ring-amber-500/40'
                    : 'border-overlay-default text-content-muted hover:border-overlay-strong hover:bg-overlay-subtle'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-warning-text">
                  <Target size={14} /> Target Goal
                </div>
                <div className="text-micro text-content-disabled leading-tight">Single measurable target value reached by date</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPlanType('habit_journey')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  planType === 'habit_journey'
                    ? 'border-rose-500 bg-rose-500/10 text-content-primary ring-1 ring-rose-500/40'
                    : 'border-overlay-default text-content-muted hover:border-overlay-strong hover:bg-overlay-subtle'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-rose-theme">
                  <Flame size={14} /> Habit Journey
                </div>
                <div className="text-micro text-content-disabled leading-tight">Daily/weekly habit commitment with streak counter</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPlanType('vision')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                  planType === 'vision'
                    ? 'border-purple-500 bg-purple-500/10 text-content-primary ring-1 ring-purple-500/40'
                    : 'border-overlay-default text-content-muted hover:border-overlay-strong hover:bg-overlay-subtle'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-purple-hierarchy">
                  <Compass size={14} /> Vision & Reflection
                </div>
                <div className="text-micro text-content-disabled leading-tight">Long-term vision with dated check-in notes</div>
              </button>
            </div>
          </div>

          {/* SHARED FIELDS */}
          <div>
            <label htmlFor="pip-create-title" className="block text-xs font-medium text-content-muted mb-1">Plan Title</label>
            <input
              id="pip-create-title"
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
            <label htmlFor="pip-create-description" className="block text-xs font-medium text-content-muted mb-1">Goal & Description</label>
            <textarea
              id="pip-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this plan is for and the result you want..."
              className="input min-h-[70px] text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pip-create-category" className="block text-xs font-medium text-content-muted mb-1">Category</label>
              <select id="pip-create-category" value={category} onChange={(e) => setCategory(e.target.value)} className="input text-xs">
                {PLAN_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pip-create-visibility" className="block text-xs font-medium text-content-muted mb-1">Visibility</label>
              <select
                id="pip-create-visibility"
                value={isPublic ? 'public' : 'private'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
                className="input text-xs"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* Phase C Review Cadence Selector - Hidden for Vision & Reflection plans */}
          {planType !== 'vision' && (
            <div>
              <label htmlFor="pip-create-review-cadence" className="block text-xs font-medium text-content-muted mb-1">Review Cadence (Check-in Loop)</label>
              <select
                id="pip-create-review-cadence"
                value={reviewCadence || ''}
                onChange={(e) => setReviewCadence(e.target.value ? (e.target.value as 'weekly' | 'monthly') : null)}
                className="input text-xs"
              >
                <option value="">None (No scheduled check-in review)</option>
                <option value="weekly">Weekly Check-in Loop</option>
                <option value="monthly">Monthly Check-in Loop</option>
              </select>
            </div>
          )}

          {/* TYPE-SPECIFIC FIELDS */}
          {planType === 'milestone' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-content-muted">Steps & Milestones</label>
                <button type="button" onClick={handleAddStepField} className="text-xs text-blue-theme hover:text-content-primary hover:underline">
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
                        className={`text-content-subtle hover:text-rose-theme p-1 ${TAP_TARGET}`}
                        aria-label={`Remove step "${step}"`}
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
            <div className="card space-y-3 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pip-create-target-value" className="block text-xs font-medium text-content-muted mb-1">Target Value (Number)</label>
                  <input
                    id="pip-create-target-value"
                    type="number"
                    min="1"
                    value={targetValue}
                    onChange={(e) => setTargetValue(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pip-create-target-unit" className="block text-xs font-medium text-content-muted mb-1">Unit Label</label>
                  <input
                    id="pip-create-target-unit"
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
                  <label htmlFor="pip-create-initial-progress" className="block text-xs font-medium text-content-muted mb-1">Initial Progress</label>
                  <input
                    id="pip-create-initial-progress"
                    type="number"
                    min="0"
                    value={currentProgress}
                    onChange={(e) => setCurrentProgress(Number(e.target.value))}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="pip-create-target-date" className="block text-xs font-medium text-content-muted mb-1">Target Date</label>
                  <input
                    id="pip-create-target-date"
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
            <div className="card space-y-3 p-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pip-create-cadence" className="block text-xs font-medium text-content-muted mb-1">Cadence</label>
                  <select
                    id="pip-create-cadence"
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
                    className="input text-xs"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pip-create-duration" className="block text-xs font-medium text-content-muted mb-1">Duration ({cadence === 'weekly' ? 'Weeks' : 'Days'})</label>
                  <input
                    id="pip-create-duration"
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pip-create-start-date" className="block text-xs font-medium text-content-muted mb-1">Start Date</label>
                  <input
                    id="pip-create-start-date"
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
            <div className="card space-y-3 p-3">
              <div>
                <label htmlFor="pip-create-target-review-date" className="block text-xs font-medium text-content-muted mb-1">Target Review Date (Optional)</label>
                <input
                  id="pip-create-target-review-date"
                  type="date"
                  value={targetReviewDate}
                  onChange={(e) => setTargetReviewDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
              <div>
                <label htmlFor="pip-create-initial-reflection-note" className="block text-xs font-medium text-content-muted mb-1">Initial Reflection Check-in Note (Optional)</label>
                <textarea
                  id="pip-create-initial-reflection-note"
                  value={initialReflectionNote}
                  onChange={(e) => setInitialReflectionNote(e.target.value)}
                  placeholder="Your first check-in note..."
                  className="input min-h-[60px] text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => createForm.confirmDiscard(() => setCreateModalOpen(false))}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Create Plan
            </button>
          </div>
        </form>
      </Dialog>

      {/* EDIT STRUCTURAL FIELDS MODAL */}
      <Dialog
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        dirty={editForm.dirty}
        title="Edit Plan Structure"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label htmlFor="pip-edit-title" className="block text-xs font-medium text-content-muted mb-1">Plan Title</label>
            <input
              id="pip-edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input text-xs"
              required
            />
          </div>

          <div>
            <label htmlFor="pip-edit-description" className="block text-xs font-medium text-content-muted mb-1">Goal & Description</label>
            <textarea
              id="pip-edit-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="input min-h-[70px] text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pip-edit-category" className="block text-xs font-medium text-content-muted mb-1">Category</label>
              <select id="pip-edit-category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="input text-xs">
                {PLAN_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pip-edit-visibility" className="block text-xs font-medium text-content-muted mb-1">Visibility</label>
              <select
                id="pip-edit-visibility"
                value={editIsPublic ? 'public' : 'private'}
                onChange={(e) => setEditIsPublic(e.target.value === 'public')}
                className="input text-xs"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* Phase C Review Cadence Selector - Hidden for Vision & Reflection plans */}
          {editingPlanType !== 'vision' && (
            <div>
              <label htmlFor="pip-edit-review-cadence" className="block text-xs font-medium text-content-muted mb-1">Review Cadence (Check-in Loop)</label>
              <select
                id="pip-edit-review-cadence"
                value={editReviewCadence || ''}
                onChange={(e) => setEditReviewCadence(e.target.value ? (e.target.value as 'weekly' | 'monthly') : null)}
                className="input text-xs"
              >
                <option value="">None (No scheduled check-in review)</option>
                <option value="weekly">Weekly Check-in Loop</option>
                <option value="monthly">Monthly Check-in Loop</option>
              </select>
            </div>
          )}

          {/* TYPE-SPECIFIC STRUCTURAL EDIT FIELDS */}
          {editingPlanType === 'milestone' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-content-muted">Steps & Milestones</label>
                <button
                  type="button"
                  onClick={() => setEditSteps([...editSteps, `Step ${editSteps.length + 1}`])}
                  className="text-xs text-blue-theme hover:text-content-primary hover:underline"
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
                        className={`text-content-subtle hover:text-rose-theme p-1 ${TAP_TARGET}`}
                        aria-label={`Remove step "${step}"`}
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
            <div className="card space-y-3 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pip-edit-target-value" className="block text-xs font-medium text-content-muted mb-1">Target Value</label>
                  <input
                    id="pip-edit-target-value"
                    type="number"
                    min="1"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(Number(e.target.value))}
                    className="input text-xs"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pip-edit-target-unit" className="block text-xs font-medium text-content-muted mb-1">Unit Label</label>
                  <input
                    id="pip-edit-target-unit"
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
                <label htmlFor="pip-edit-target-date" className="block text-xs font-medium text-content-muted mb-1">Target Date</label>
                <input
                  id="pip-edit-target-date"
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>
          )}

          {editingPlanType === 'habit_journey' && (
            <div className="grid grid-cols-2 gap-3 bg-bg-800/50 p-3 rounded-lg border border-overlay-subtle">
              <div>
                <label htmlFor="pip-edit-cadence" className="block text-xs font-medium text-content-muted mb-1">Cadence</label>
                <select
                  id="pip-edit-cadence"
                  value={editCadence}
                  onChange={(e) => setEditCadence(e.target.value as 'daily' | 'weekly')}
                  className="input text-xs"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label htmlFor="pip-edit-duration" className="block text-xs font-medium text-content-muted mb-1">Duration (Days/Weeks)</label>
                <input
                  id="pip-edit-duration"
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
            <div className="bg-bg-800/50 p-3 rounded-lg border border-overlay-subtle">
              <label htmlFor="pip-edit-target-review-date" className="block text-xs font-medium text-content-muted mb-1">Target Review Date</label>
              <input
                id="pip-edit-target-review-date"
                type="date"
                value={editTargetReviewDate}
                onChange={(e) => setEditTargetReviewDate(e.target.value)}
                className="input text-xs"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => editForm.confirmDiscard(() => setEditModalOpen(false))}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Changes
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete Plan Confirm Modal */}
      <ConfirmDeleteModal
        open={Boolean(planToDelete)}
        onClose={() => setPlanToDelete(null)}
        onConfirm={async () => {
          if (planToDelete) {
            const planId = planToDelete.id;
            await executeWithKey(`delete_plan_${planId}`, async () => {
              try {
                await store.deletePlan(planId);
                setPlanToDelete(null);
                showSuccessToast('Plan deleted', 'Improvement plan removed successfully.', `plan_${planId}`);
              } catch (err: any) {
                showErrorToast("Couldn't delete plan", toUserMessage(err, 'Try again in a moment.'));
              }
            });
          }
        }}
        isDeleting={planToDelete ? isKeyLoading(`delete_plan_${planToDelete.id}`) : false}
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
            const followId = followToDelete.id;
            await executeWithKey(`delete_follow_${followId}`, async () => {
              try {
                await store.deleteFollowedPlan(followId);
                setFollowToDelete(null);
                showSuccessToast('Plan removed', 'Saved plan removed from your account.', `follow_${followId}`);
              } catch (err: any) {
                showErrorToast("Couldn't remove plan", toUserMessage(err, 'Try again.'));
              }
            });
          }
        }}
        isDeleting={followToDelete ? isKeyLoading(`delete_follow_${followToDelete.id}`) : false}
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
            showSuccessToast('Note deleted', 'Reflection note removed.', `note_${noteToDelete.planId}_${noteToDelete.noteKey}`);
            setNoteToDelete(null);
          }
        }}
        title="Delete Reflection Note?"
        description="Are you sure you want to delete this reflection note?"
      />
    </div>
  );
}
