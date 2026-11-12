// Plan actions of useAppState (own plans and followed copies: create, steps, targets, journeys, reflection
// notes, sharing, copy, delete) and their two save helpers, moved out of store.ts unchanged. useAppState calls
// this hook once, at the same place, spreads the same members as before, and takes the two save helpers out
// for its minute tick.
import { useCallback } from 'react';
import type { AppState, PlanStep, ImprovementPlan, UserPlanFollow, PlanReflectionNote, PlanType } from '@/types';
import { dispatchToastError } from './storeShared';
import { uid, generateUUID, todayKey, isPlanJourneyDoneThisPeriod, calculateActivePlanStreak } from './time/dates';
import { trustedNow, trustedNowMs } from './time/clock';
import { editedPlanStructure } from './planStructure';
import type { PlanStructureEdits } from './planStructure';
import { supabase, syncBroadcaster, syncPlanToSupabase, syncFollowedPlanToSupabase, deletePlanFromSupabase, deleteFollowedPlanFromSupabase } from './supabase';
import type { StoreSetState } from './storeSetState';

export function usePlanActions(setState: StoreSetState, afterCommit: (fn: () => void) => void, stateRef: { current: AppState }, state: AppState) {
  // --- SOCIAL FEATURE 1: PERSONAL IMPROVEMENT PLANS ACTIONS ---
  // Every change to a plan or a copy goes through these two: the row is marked pending, saved, and
  // marked synced or failed. Pending and failed rows are retried (retryUnconfirmedPlans) and win over
  // the table on the next load, so an edit made offline or during a failed save is never lost.
  const notifyPlanSaveFailed = (id: string, isCopy: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('app-toast-error', {
        detail: {
          title: isCopy ? "Couldn't save your copy" : "Couldn't save plan",
          message: "It's saved on this device and will retry automatically.",
          dedupKey: `plan_sync_failed_${id}`,
        },
      })
    );
  };

  const handlePlanSyncExecution = useCallback((planToSync: ImprovementPlan) => {
    const setStatus = (syncStatus: 'pending' | 'synced' | 'failed') =>
      setState((prev) => {
        if (!prev.improvementPlans.some((p) => p.id === planToSync.id)) return prev;
        return {
          ...prev,
          improvementPlans: prev.improvementPlans.map((p) => (p.id === planToSync.id ? { ...p, syncStatus } : p)),
        };
      });
    setStatus('pending');
    syncPlanToSupabase(planToSync)
      .then((res) => {
        setStatus(res ? 'synced' : 'failed');
        if (!res) notifyPlanSaveFailed(planToSync.id, false);
      })
      .catch(() => {
        setStatus('failed');
        notifyPlanSaveFailed(planToSync.id, false);
      });
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollowSyncExecution = useCallback((followToSync: UserPlanFollow) => {
    const setStatus = (syncStatus: 'pending' | 'synced' | 'failed') =>
      setState((prev) => {
        if (!prev.followedPlans.some((f) => f.id === followToSync.id)) return prev;
        return {
          ...prev,
          followedPlans: prev.followedPlans.map((f) => (f.id === followToSync.id ? { ...f, syncStatus } : f)),
        };
      });
    setStatus('pending');
    syncBroadcaster.broadcast('FOLLOW_UPDATED', followToSync);
    syncFollowedPlanToSupabase(followToSync)
      .then((ok) => {
        setStatus(ok ? 'synced' : 'failed');
        if (!ok) notifyPlanSaveFailed(followToSync.id, true);
      })
      .catch(() => {
        setStatus('failed');
        notifyPlanSaveFailed(followToSync.id, true);
      });
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createImprovementPlan = useCallback(
    (
      title: string,
      description: string,
      isPublic: boolean,
      stepTitles: string[],
      category?: string,
      planType: PlanType = 'milestone',
      typeParams?: {
        targetValue?: number;
        targetUnit?: string;
        currentProgress?: number;
        targetDate?: string;
        cadence?: 'daily' | 'weekly';
        duration?: number;
        startDate?: string;
        targetReviewDate?: string;
        initialReflectionNote?: string;
        reviewCadence?: 'weekly' | 'monthly' | null;
      }
    ) => {
      let newPlan: ImprovementPlan | null = null;
      setState((prev) => {
        const steps: PlanStep[] = (stepTitles || [])
          .filter((t) => t.trim().length > 0)
          .map((t, i) => ({
            id: uid(),
            title: t.trim(),
            orderIndex: i,
            completed: false,
          }));

        const reflectionNotes: PlanReflectionNote[] = typeParams?.initialReflectionNote
          ? [{ id: uid(), createdAt: trustedNow().toISOString(), note: typeParams.initialReflectionNote.trim() }]
          : [];

        const isVision = planType === 'vision';
        const reviewCadence = isVision
          ? (typeParams?.reviewCadence || 'weekly')
          : (typeParams?.reviewCadence || null);

        let nextReviewDueAt: string | null = null;
        if (reviewCadence === 'weekly') {
          nextReviewDueAt = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (reviewCadence === 'monthly') {
          nextReviewDueAt = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        newPlan = {
          id: generateUUID(),
          creatorId: prev.currentUser?.id || generateUUID(),
          creatorUsername: prev.username,
          creatorAvatar: prev.currentUser?.avatar || '🧑',
          creatorPoints: prev.totalPoints,
          title: title.trim(),
          description: description.trim(),
          category: category?.trim() || 'Personal Growth',
          isPublic,
          steps,
          copyCount: 0,
          createdAt: trustedNow().toISOString(),

          // Phase B Plan Type Properties
          planType,
          targetValue: typeParams?.targetValue,
          targetUnit: typeParams?.targetUnit,
          currentProgress: typeParams?.currentProgress ?? 0,
          targetDate: typeParams?.targetDate,
          cadence: typeParams?.cadence ?? 'daily',
          duration: typeParams?.duration ?? 30,
          startDate: typeParams?.startDate || trustedNow().toISOString(),
          streakCount: 0,
          lastCompletedDate: undefined,
          targetReviewDate: typeParams?.targetReviewDate,
          reflectionNotes,

          // Phase C Review Loop
          reviewCadence,
          nextReviewDueAt,

          // Client-side/user_data sync tracking
          syncStatus: 'pending',
        };

        return {
          ...prev,
          improvementPlans: [newPlan, ...prev.improvementPlans],
        };
      });

      afterCommit(() => {
        if (newPlan) {
          const planToSync = newPlan as ImprovementPlan;
          syncBroadcaster.broadcast('PLAN_CREATED', planToSync);
          handlePlanSyncExecution(planToSync);
        }
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTargetGoalProgress = useCallback((planId: string, newProgress: number) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];
      const validProgress = Math.min(target.targetValue || 0, Math.max(0, newProgress));

      updatedPlan = {
        ...target,
        currentProgress: validProgress,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setNewTargetGoal = useCallback((planId: string, newTarget: number) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];
      const validTarget = Math.max(1, newTarget);

      updatedPlan = {
        ...target,
        targetValue: validTarget,
        currentProgress: 0,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markHabitJourneyDone = useCallback((planId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      // Once per period: today for a daily journey, this week for a weekly one.
      if (isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const nowIso = trustedNow().toISOString();
      const activeStreak = calculateActivePlanStreak(
        target.streakCount || 0,
        target.lastCompletedDate,
        target.cadence || 'daily'
      );
      const newStreak = activeStreak + 1;

      updatedPlan = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: nowIso,
        previousCompletedDate: target.lastCompletedDate || undefined,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoHabitJourneyDone = useCallback((planId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      // Undo only the current period's completion.
      if (!isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      // The completion before this one comes back, so the streak it carried survives tomorrow.
      updatedPlan = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: target.previousCompletedDate || undefined,
        previousCompletedDate: undefined,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setNewFollowedTargetGoal = useCallback((followId: string, newTarget: number) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];
      const validTarget = Math.max(1, newTarget);

      updatedFollow = {
        ...target,
        targetValue: validTarget,
        currentProgress: 0,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markFollowedHabitJourneyDone = useCallback((followId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((p) => p.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      // Once per period: today for a daily journey, this week for a weekly one.
      if (isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const nowIso = trustedNow().toISOString();
      const activeStreak = calculateActivePlanStreak(
        target.streakCount || 0,
        target.lastCompletedDate,
        target.cadence || 'daily'
      );
      const newStreak = activeStreak + 1;

      updatedFollow = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: nowIso,
        previousCompletedDate: target.lastCompletedDate || undefined,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        const follow = updatedFollow as UserPlanFollow;
        handleFollowSyncExecution(follow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoFollowedHabitJourneyDone = useCallback((followId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      // Undo only the current period's completion.
      if (!isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      // The completion before this one comes back, so the streak it carried survives tomorrow.
      updatedFollow = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: target.previousCompletedDate || undefined,
        previousCompletedDate: undefined,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editVisionReflectionNote = useCallback((planId: string, noteId: string, newNoteText: string) => {
    if (!newNoteText.trim()) return;
    let updatedPlan: ImprovementPlan | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.map((n) =>
        n.id === noteId || (n as any).date === noteId ? { ...n, note: newNoteText.trim() } : n
      );

      updatedPlan = {
        ...target,
        reflectionNotes: updatedNotes,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addVisionReflectionNote = useCallback((planId: string, note: string) => {
    if (!note.trim()) return;
    let updatedPlan: ImprovementPlan | null = null;
    let nextDue: string | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const newNote: PlanReflectionNote = {
        id: generateUUID(),
        originalPlanId: planId,
        createdAt: trustedNow().toISOString(),
        note: note.trim(),
      };

      const effectiveCadence = target.reviewCadence || (target.planType === 'vision' ? 'weekly' : null);
      if (effectiveCadence === 'weekly') {
        nextDue = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (effectiveCadence === 'monthly') {
        nextDue = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        nextDue = target.nextReviewDueAt || null;
      }

      const existingNotes = target.reflectionNotes || [];
      updatedPlan = {
        ...target,
        nextReviewDueAt: nextDue,
        reflectionNotes: [newNote, ...existingNotes],
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        const p = updatedPlan as ImprovementPlan;
        syncBroadcaster.broadcast('PLAN_UPDATED', p);
        handlePlanSyncExecution(p);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteVisionReflectionNote = useCallback((planId: string, noteId: string) => {
    let updatedPlan: ImprovementPlan | null = null;

    setState(
      (prev) => {
        const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
        if (idx === -1) return prev;
        const target = prev.improvementPlans[idx];

        const notes = target.reflectionNotes || [];
        const updatedNotes = notes.filter((n) => n.id !== noteId && (n as any).date !== noteId);

        updatedPlan = {
          ...target,
          reflectionNotes: updatedNotes,
          syncStatus: 'pending',
        };

        const updatedPlans = [...prev.improvementPlans];
        updatedPlans[idx] = updatedPlan;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), noteId].slice(-500);
        return { ...prev, improvementPlans: updatedPlans, deletedEntityIds: updatedDeletedEntityIds };
      },
      { immediate: true }
    );

    afterCommit(() => {
      if (updatedPlan) {
        const planToSync = updatedPlan as ImprovementPlan;
        syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
        handlePlanSyncExecution(planToSync);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateImprovementPlan = useCallback((
    planId: string,
    title: string,
    description: string,
    category: string,
    isPublic: boolean,
    stepEdits?: { id?: string; title: string }[],
    typeParams?: PlanStructureEdits
  ) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      updatedPlan = {
        ...target,
        ...editedPlanStructure(target, title, description, stepEdits, typeParams),
        category: category.trim() || 'Personal Growth',
        isPublic,
        creatorPoints: prev.totalPoints,
        syncStatus: 'pending',
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        const planToSync = updatedPlan as ImprovementPlan;
        syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
        handlePlanSyncExecution(planToSync);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The user's own copy is theirs to reshape: only this copy changes, never the original or other copies.
  // Its link to the original (originalPlanId, sourceUsername) and its progress stay as they are.
  const updateFollowedPlan = useCallback((
    followId: string,
    title: string,
    description: string,
    stepEdits?: { id?: string; title: string }[],
    typeParams?: PlanStructureEdits
  ) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      updatedFollow = {
        ...target,
        ...editedPlanStructure(target, title, description, stepEdits, typeParams),
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlanVisibility = useCallback(async (planId: string, newVisibility?: boolean) => {
    // Sharing changes go to the table first, so "Only me" is true the moment the switch shows it.
    // A plan whose first save hasn't landed yet (no row) changes here and goes out with its save.
    // Errors reach the caller, which shows the toast.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Log in and try again.');

    const local = stateRef.current?.improvementPlans.find((p) => p.id === planId);
    const isPublic = newVisibility ?? !local?.isPublic;

    const { data, error } = await supabase
      .from('improvement_plans')
      .update({ is_public: isPublic })
      .eq('id', planId)
      .eq('creator_id', session.user.id)
      .select('id');
    if (error) throw error;
    const reachedTable = Boolean(data && data.length > 0);
    const isUnconfirmed = local?.syncStatus === 'pending' || local?.syncStatus === 'failed';
    if (!reachedTable && !isUnconfirmed) throw new Error('Try again in a moment.');

    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      updatedPlan = { ...prev.improvementPlans[idx], isPublic };
      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    afterCommit(() => {
      if (updatedPlan) {
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
        // An older save still queued would carry the old setting; this one goes after it.
        if (!reachedTable || isUnconfirmed) handlePlanSyncExecution(updatedPlan);
      }
    });
    // False positive: setState and stateRef are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlanCopyCount = useCallback((planId: string, newCount: number) => {
    const differs = (plans: ImprovementPlan[]) => plans.some((p) => p.id === planId && p.copyCount !== newCount);
    // Other tabs of this account hold the same plans, so a plan this tab doesn't have (or already
    // shows with this count) is nothing to tell them. Decided outside setState: updaters stay pure.
    const shouldBroadcast = differs(stateRef.current?.improvementPlans ?? []);
    setState((prev) =>
      differs(prev.improvementPlans)
        ? {
            ...prev,
            improvementPlans: prev.improvementPlans.map((p) => (p.id === planId ? { ...p, copyCount: newCount } : p)),
          }
        : prev
    );
    if (shouldBroadcast) syncBroadcaster.broadcast('PLAN_UPDATED', { id: planId, copyCount: newCount });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyPublicPlan = useCallback(async (originalPlan: ImprovementPlan) => {
    // Resolves true once the copy is added; false when it is the user's own plan or already copied.
    // Throws when there is no session (the caller shows the one error toast).
    const planId = originalPlan.id;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Log in and try again.');

    const isOwnPlan = originalPlan.creatorId === session.user.id;
    const alreadyCopied = state.followedPlans.some((f) => f.originalPlanId === planId);
    if (isOwnPlan || alreadyCopied) return false;

    // Optimistic count; the trigger on user_plan_follows sets the real copy_count, which arrives by realtime.
    updatePlanCopyCount(planId, (originalPlan.copyCount || 0) + 1);

    const stepsCopy: PlanStep[] = (originalPlan.steps || []).map((s) => ({
      ...s,
      id: uid(),
      completed: false,
    }));

    const copyReviewCadence = originalPlan.reviewCadence || (originalPlan.planType === 'vision' ? 'weekly' : null);
    const createdFollow: UserPlanFollow = {
      id: generateUUID(),
      userId: session.user.id,
      originalPlanId: planId,
      sourceUsername: originalPlan.creatorUsername,
      title: originalPlan.title,
      description: originalPlan.description,
      steps: stepsCopy,
      isCompleted: false,
      pointsAwarded: 0,
      createdAt: trustedNow().toISOString(),

      // Phase B Plan Type Additions (fresh starting values for follower)
      planType: originalPlan.planType || 'milestone',
      targetValue: originalPlan.targetValue,
      targetUnit: originalPlan.targetUnit,
      currentProgress: 0, // Reset progress for copier
      // A deadline the creator already passed means nothing to the copier.
      targetDate: originalPlan.targetDate && originalPlan.targetDate >= todayKey() ? originalPlan.targetDate : undefined,
      cadence: originalPlan.cadence,
      duration: originalPlan.duration,
      startDate: trustedNow().toISOString(),
      streakCount: 0, // Reset streak for copier
      lastCompletedDate: undefined,
      targetReviewDate:
        originalPlan.targetReviewDate && originalPlan.targetReviewDate >= todayKey() ? originalPlan.targetReviewDate : undefined,
      reflectionNotes: [], // Reset reflections to empty for copier

      // The copier's first review is one cadence from now, never the creator's due date.
      reviewCadence: copyReviewCadence,
      nextReviewDueAt: copyReviewCadence
        ? new Date(trustedNowMs() + (copyReviewCadence === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString()
        : null,
    };

    setState((prev) => {
      return {
        ...prev,
        followedPlans: [createdFollow, ...prev.followedPlans],
      };
    });

    handleFollowSyncExecution(createdFollow);
    return true;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePlanCopyCount, state.followedPlans]);

  // --- FOLLOWED & COPIED PLANS INTERACTIVE ACTIONS ---
  const completeFollowedPlanStep = useCallback((followId: string, stepId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    let nextState: AppState | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const stepIdx = (target.steps || []).findIndex((s) => s.id === stepId);
      if (stepIdx === -1) return prev;

      const newSteps = [...target.steps];
      const currentStep = newSteps[stepIdx];
      const toggledState = !currentStep.completed;
      newSteps[stepIdx] = { ...currentStep, completed: toggledState };

      updatedFollow = {
        ...target,
        steps: newSteps,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      nextState = { ...prev, followedPlans: updatedFollows };
      return nextState;
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFollowedTargetGoalProgress = useCallback((followId: string, newProgress: number) => {
    let updatedFollow: UserPlanFollow | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const validProg = Math.min(target.targetValue || 0, Math.max(0, newProgress));

      updatedFollow = {
        ...target,
        currentProgress: validProg,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFollowedVisionReflectionNote = useCallback((followId: string, note: string) => {
    if (!note.trim()) return;
    let updatedFollow: UserPlanFollow | null = null;
    let nextDue: string | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const newNote: PlanReflectionNote = {
        id: uid(),
        followedPlanId: followId,
        createdAt: trustedNow().toISOString(),
        note: note.trim(),
      };

      const effectiveCadence = target.reviewCadence || (target.planType === 'vision' ? 'weekly' : null);
      if (effectiveCadence === 'weekly') {
        nextDue = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (effectiveCadence === 'monthly') {
        nextDue = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        nextDue = target.nextReviewDueAt || null;
      }

      const existingNotes = target.reflectionNotes || [];
      updatedFollow = {
        ...target,
        nextReviewDueAt: nextDue,
        reflectionNotes: [newNote, ...existingNotes],
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        const f = updatedFollow as UserPlanFollow;
        handleFollowSyncExecution(f);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editFollowedVisionReflectionNote = useCallback((followId: string, noteId: string, newNoteText: string) => {
    if (!newNoteText.trim()) return;
    let updatedFollow: UserPlanFollow | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.map((n) =>
        n.id === noteId || (n as any).date === noteId ? { ...n, note: newNoteText.trim() } : n
      );

      updatedFollow = {
        ...target,
        reflectionNotes: updatedNotes,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFollowedVisionReflectionNote = useCallback((followId: string, noteId: string) => {
    let updatedFollow: UserPlanFollow | null = null;

    setState(
      (prev) => {
        const idx = prev.followedPlans.findIndex((f) => f.id === followId);
        if (idx === -1) return prev;
        const target = prev.followedPlans[idx];

        const notes = target.reflectionNotes || [];
        const updatedNotes = notes.filter((n) => n.id !== noteId && (n as any).date !== noteId);

        updatedFollow = {
          ...target,
          reflectionNotes: updatedNotes,
        };

        const updatedFollows = [...prev.followedPlans];
        updatedFollows[idx] = updatedFollow;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), noteId].slice(-500);
        return { ...prev, followedPlans: updatedFollows, deletedEntityIds: updatedDeletedEntityIds };
      },
      { immediate: true }
    );

    afterCommit(() => {
      if (updatedFollow) {
        handleFollowSyncExecution(updatedFollow);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFollowedPlan = useCallback(async (followedPlanId: string) => {
    // Optimistic: the copy leaves at once and its tombstone is saved, so a failed table delete is
    // finished on the next load instead of the copy coming back.
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), followedPlanId].slice(-500);
        return {
          ...prev,
          followedPlans: prev.followedPlans.filter((f) => f.id !== followedPlanId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    syncBroadcaster.broadcast('FOLLOW_DELETED', { followId: followedPlanId });
    const ok = await deleteFollowedPlanFromSupabase(followedPlanId);
    if (!ok) {
      dispatchToastError("Couldn't remove copy everywhere", "It's removed here and will finish the next time AscendDay loads.");
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completePlanStep = useCallback((planId: string, stepId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    let nextState: AppState | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const stepIdx = (target.steps || []).findIndex((s) => s.id === stepId);
      if (stepIdx === -1) return prev;
      const targetStep = target.steps[stepIdx];

      const isNowCompleted = !targetStep.completed;
      const updatedSteps = [...target.steps];
      updatedSteps[stepIdx] = { ...targetStep, completed: isNowCompleted };

      updatedPlan = {
        ...target,
        steps: updatedSteps,
        syncStatus: 'pending',
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      nextState = {
        ...prev,
        improvementPlans: updatedPlans,
      };

      return nextState;
    });

    afterCommit(() => {
      if (updatedPlan) {
        const planToSync = updatedPlan as ImprovementPlan;
        syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
        handlePlanSyncExecution(planToSync);
      }
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deletePlan = useCallback(async (planId: string) => {
    // The table delete comes first (the caller keeps its confirm dialog open and shows the error
    // if it fails). A plan that never reached the table deletes the same way.
    await deletePlanFromSupabase(planId);

    syncBroadcaster.broadcast('PLAN_DELETED', { planId });
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), planId].slice(-500);
        return {
          ...prev,
          improvementPlans: prev.improvementPlans.filter((p) => p.id !== planId),
          followedPlans: prev.followedPlans.filter((f) => f.originalPlanId !== planId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    createImprovementPlan,
    updateImprovementPlan,
    updateFollowedPlan,
    togglePlanVisibility,
    updateTargetGoalProgress,
    setNewTargetGoal,
    markHabitJourneyDone,
    undoHabitJourneyDone,
    addVisionReflectionNote,
    editVisionReflectionNote,
    deleteVisionReflectionNote,
    completeFollowedPlanStep,
    updateFollowedTargetGoalProgress,
    setNewFollowedTargetGoal,
    markFollowedHabitJourneyDone,
    undoFollowedHabitJourneyDone,
    addFollowedVisionReflectionNote,
    editFollowedVisionReflectionNote,
    deleteFollowedVisionReflectionNote,
    copyPublicPlan,
    updatePlanCopyCount,
    deleteFollowedPlan,
    completePlanStep,
    deletePlan,
    handlePlanSyncExecution,
    handleFollowSyncExecution,
  };
}
