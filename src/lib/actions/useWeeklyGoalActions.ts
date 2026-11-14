// Weekly goal actions of useAppState (goal items, reflections, carry-over, linked-goal sync),
// moved out of store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { WeeklyGoal, WeeklyGoalItem, WeeklyGoalReflection } from '@/types';
import { uid, weekKey } from '../time/dates';
import { linkedItemExists, linkedGoalUnit } from '../items/linkedGoalMetrics';
import { isReflectionWindowOpen } from '../points/weeklyAwards';
import { reconcileWeeklyGoalsPointsForAllWeeks, reconcileLinkedWeeklyGoals, reconcileReflectionPoints, withDeletedGoalIds, recomputeWeeklyGoalsPointsForState } from '../points/weeklyGoalPoints';
import { trustedNow } from '../time/clock';
import type { StoreSetState } from '../store/storeSetState';

export function useWeeklyGoalActions(setState: StoreSetState) {
  const addWeeklyReflection = useCallback((targetWeekKey: string, content: string) => {
    if (!content.trim()) return;
    if (!isReflectionWindowOpen(targetWeekKey, trustedNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;

      const existingReflections = existingDoc?.reflections || [];

      const newRef: WeeklyGoalReflection = {
        id: uid(),
        content: content.trim(),
        createdAt: trustedNow().toISOString(),
        pointsAwarded: false,
      };

      const candidateReflections = [...existingReflections, newRef];

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        targetWeekKey,
        candidateReflections,
        trustedNow()
      );

      const updatedDoc: WeeklyGoal = withDeletedGoalIds({
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: existingDoc ? existingDoc.goals : [],
        reflections: updatedReflections,
        deletedGoalIds: existingDoc?.deletedGoalIds,
        createdAt: existingDoc ? existingDoc.createdAt : trustedNow().toISOString(),
      });

      let newWeeklyGoals = [...nextState.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = updatedDoc;
      } else {
        newWeeklyGoals = [updatedDoc, ...newWeeklyGoals];
      }

      return {
        ...nextState,
        weeklyGoals: newWeeklyGoals,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWeeklyReflection = useCallback((targetWeekKey: string, reflectionId: string, content: string) => {
    if (!content.trim()) return;
    if (!isReflectionWindowOpen(targetWeekKey, trustedNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const reflections = doc.reflections || [];
      const refIdx = reflections.findIndex((r) => r.id === reflectionId);
      if (refIdx === -1) return prev;

      const existingRef = reflections[refIdx];
      const updatedRef: WeeklyGoalReflection = {
        ...existingRef,
        content: content.trim(),
        updatedAt: trustedNow().toISOString(),
      };

      const candidateReflections = [...reflections];
      candidateReflections[refIdx] = updatedRef;

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        targetWeekKey,
        candidateReflections,
        trustedNow()
      );

      const updatedDoc = withDeletedGoalIds({ ...doc, reflections: updatedReflections });
      const newWeeklyGoals = [...nextState.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      return {
        ...nextState,
        weeklyGoals: newWeeklyGoals,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWeeklyReflection = useCallback((targetWeekKey: string, reflectionId: string) => {
    if (!isReflectionWindowOpen(targetWeekKey, trustedNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    void (
      setState(
        (prev) => {
          const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
          if (docIdx === -1) return prev;

          const doc = prev.weeklyGoals[docIdx];
          const targetRef = (doc.reflections || []).find((r) => r.id === reflectionId);
          if (!targetRef) return prev;

          const candidateReflections = (doc.reflections || []).filter((r) => r.id !== reflectionId);

          const { updatedReflections, nextState } = reconcileReflectionPoints(
            prev,
            targetWeekKey,
            candidateReflections,
            trustedNow()
          );

          const updatedDoc = withDeletedGoalIds({ ...doc, reflections: updatedReflections });
          const newWeeklyGoals = [...nextState.weeklyGoals];
          newWeeklyGoals[docIdx] = updatedDoc;
          const updatedDeletedEntityIds = [...(nextState.deletedEntityIds || []), reflectionId].slice(-500);

          return {
            ...nextState,
            weeklyGoals: newWeeklyGoals,
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Weekly reflection deletion', entityId: reflectionId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWeeklyGoalItem = useCallback((targetWeekKey: string, goalData: Partial<WeeklyGoalItem>) => {
    const currentWeek = weekKey(trustedNow());
    if (targetWeekKey < currentWeek) {
      throw new Error('Past weeks are read-only.');
    }
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;
      const nowIso = trustedNow().toISOString();

      const isLinked = Boolean(goalData.linkedModule && goalData.linkedModule !== 'none');

      let isCompleted = false;
      let manualProgress: number | undefined = undefined;
      let completedAt: string | undefined = undefined;

      if (isLinked) {
        isCompleted = false;
        manualProgress = 0;
        completedAt = undefined;
      } else {
        const targetVal = typeof goalData.targetValue === 'number' && goalData.targetValue > 0 ? goalData.targetValue : 1;
        manualProgress = typeof goalData.manualProgress === 'number' ? goalData.manualProgress : 0;
        isCompleted = goalData.completed !== undefined
          ? Boolean(goalData.completed)
          : (manualProgress >= targetVal);
        completedAt = isCompleted ? (goalData.completedAt || trustedNow().toISOString()) : undefined;
      }

      if (targetWeekKey > currentWeek) {
        isCompleted = false;
        completedAt = undefined;
        manualProgress = 0;
      }

      const newItem: WeeklyGoalItem = {
        id: uid(),
        title: (goalData.title || goalData.text || '').trim() || 'New Weekly Goal',
        targetDescription: goalData.targetDescription?.trim() || '',
        priority: goalData.priority || 'medium',
        linkedModule: goalData.linkedModule || 'none',
        linkedItemId: goalData.linkedItemId || undefined,
        linkedMetricKey: goalData.linkedMetricKey || undefined,
        targetValue: typeof goalData.targetValue === 'number' && goalData.targetValue > 0 ? goalData.targetValue : undefined,
        unit: goalData.unit?.trim() || undefined,
        manualProgress,
        completed: isCompleted,
        done: isCompleted,
        completedAt,
        carriedOverFromWeekKey: goalData.carriedOverFromWeekKey,
        carriedOverFromGoalId: goalData.carriedOverFromGoalId || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const updatedGoals = existingDoc ? [...existingDoc.goals, newItem] : [newItem];
      const updatedDoc: WeeklyGoal = withDeletedGoalIds({
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: updatedGoals,
        reflections: existingDoc?.reflections || [],
        deletedGoalIds: existingDoc?.deletedGoalIds,
        createdAt: existingDoc ? existingDoc.createdAt : nowIso,
      });

      const newWeeklyGoals = [...prev.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = updatedDoc;
      } else {
        newWeeklyGoals.unshift(updatedDoc);
      }

      const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, newItem.id);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWeeklyGoalItem = useCallback((targetWeekKey: string, goalId: string, updates: Partial<WeeklyGoalItem>) => {
    const currentWeek = weekKey(trustedNow());
    if (targetWeekKey < currentWeek) {
      const keys = Object.keys(updates);
      if (keys.length !== 1 || keys[0] !== 'carryOverDismissed') {
        throw new Error('Past weeks are read-only.');
      }
    }
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const goalIdx = doc.goals.findIndex((g) => g.id === goalId);
      if (goalIdx === -1) return prev;

      const existingGoal = doc.goals[goalIdx];

      let effectiveUpdates = updates;
      if (targetWeekKey > currentWeek) {
        const { completed, completedAt, manualProgress, done, ...rest } = updates as any;
        effectiveUpdates = rest;
      }

      // Check if re-linked (converting between freeform/linked, or pointing to a different habit/workout/book/skill/metric)
      const targetLinkedModule = effectiveUpdates.linkedModule !== undefined ? effectiveUpdates.linkedModule : existingGoal.linkedModule;
      // What the goal counts changed (link, item, Count or target): it can't count as achieved before now.
      const countEdited =
        (effectiveUpdates.linkedModule !== undefined && effectiveUpdates.linkedModule !== existingGoal.linkedModule) ||
        (effectiveUpdates.linkedItemId !== undefined && (effectiveUpdates.linkedItemId || '') !== (existingGoal.linkedItemId || '')) ||
        (effectiveUpdates.linkedMetricKey !== undefined && effectiveUpdates.linkedMetricKey !== existingGoal.linkedMetricKey) ||
        (effectiveUpdates.targetValue !== undefined && effectiveUpdates.targetValue !== existingGoal.targetValue);

      // No item ('' or missing) = any workout/book/skill.
      const isReLinked =
        (effectiveUpdates.linkedModule !== undefined && effectiveUpdates.linkedModule !== existingGoal.linkedModule) ||
        (effectiveUpdates.linkedItemId !== undefined && (effectiveUpdates.linkedItemId || '') !== (existingGoal.linkedItemId || '')) ||
        (effectiveUpdates.linkedMetricKey !== undefined && effectiveUpdates.linkedMetricKey !== existingGoal.linkedMetricKey);

      const isLinkedGoal = Boolean(targetLinkedModule && targetLinkedModule !== 'none');

      let nextCompleted = existingGoal.completed;
      let nextCompletedAt = existingGoal.completedAt;
      let nextManualProgress = existingGoal.manualProgress;

      let nextCompletedByLogId = existingGoal.completedByLogId;
      if (isReLinked) {
        // If re-linked, reset completion state so it can be cleanly re-evaluated
        nextCompleted = false;
        nextCompletedAt = undefined;
        nextCompletedByLogId = undefined;
        nextManualProgress = 0;
      } else if (isLinkedGoal) {
        // For linked goals, manual completion overrides are ignored; completed/completedAt are managed by reconcileLinkedWeeklyGoals
        nextManualProgress = 0;
      } else {
        // Freeform goal: calculate completion from updates.completed or manualProgress vs targetValue
        const targetVal = effectiveUpdates.targetValue !== undefined && effectiveUpdates.targetValue > 0
          ? effectiveUpdates.targetValue
          : (existingGoal.targetValue && existingGoal.targetValue > 0 ? existingGoal.targetValue : 1);

        nextManualProgress = effectiveUpdates.manualProgress !== undefined
          ? effectiveUpdates.manualProgress
          : existingGoal.manualProgress;

        if (effectiveUpdates.completed !== undefined) {
          nextCompleted = Boolean(effectiveUpdates.completed);
          if (nextCompleted) {
            nextCompletedAt = effectiveUpdates.completedAt || existingGoal.completedAt || trustedNow().toISOString();
          } else {
            nextCompletedAt = undefined;
          }
        } else if (effectiveUpdates.manualProgress !== undefined || effectiveUpdates.targetValue !== undefined) {
          if (nextManualProgress !== undefined && nextManualProgress >= targetVal) {
            nextCompleted = true;
            nextCompletedAt = existingGoal.completedAt || trustedNow().toISOString();
          } else if (nextManualProgress !== undefined && nextManualProgress < targetVal) {
            nextCompleted = false;
            nextCompletedAt = undefined;
          }
        }
      }

      if (targetWeekKey > currentWeek) {
        nextCompleted = false;
        nextCompletedAt = undefined;
        nextManualProgress = 0;
      }

      const updatedGoal: WeeklyGoalItem = {
        ...existingGoal,
        ...effectiveUpdates,
        ...(effectiveUpdates.linkedItemId !== undefined ? { linkedItemId: effectiveUpdates.linkedItemId || undefined } : {}),
        completed: nextCompleted,
        done: nextCompleted,
        completedAt: nextCompletedAt,
        completedByLogId: isLinkedGoal && nextCompleted ? nextCompletedByLogId : undefined,
        manualProgress: isLinkedGoal ? 0 : nextManualProgress,
        updatedAt: trustedNow().toISOString(),
        ...(countEdited ? { linkEditedAt: trustedNow().toISOString() } : {}),
        title: effectiveUpdates.title !== undefined ? effectiveUpdates.title.trim() : existingGoal.title,
        targetDescription: effectiveUpdates.targetDescription !== undefined ? effectiveUpdates.targetDescription.trim() : existingGoal.targetDescription,
      };

      const updatedGoals = [...doc.goals];
      updatedGoals[goalIdx] = updatedGoal;

      const updatedDoc = withDeletedGoalIds({ ...doc, goals: updatedGoals });
      const newWeeklyGoals = [...prev.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      const pointsUpdate = targetWeekKey < currentWeek ? {} : recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, goalId);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWeeklyGoalItem = useCallback((targetWeekKey: string, goalId: string) => {
    const currentWeek = weekKey(trustedNow());
    if (targetWeekKey < currentWeek) {
      throw new Error('Past weeks are read-only.');
    }
    void (
      setState(
        (prev) => {
          const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
          if (docIdx === -1) return prev;

          const doc = prev.weeklyGoals[docIdx];
          const deletedGoal = doc.goals.find((g) => g.id === goalId);
          const updatedGoals = doc.goals.filter((g) => g.id !== goalId);

          const updatedDoc = withDeletedGoalIds({ ...doc, goals: updatedGoals }, [goalId]);
          const newWeeklyGoals = [...prev.weeklyGoals];
          newWeeklyGoals[docIdx] = updatedDoc;

          // Deleting a carried-over goal settles its source (Zakria 2026-10-15): the source is
          // marked dismissed so it does not come back as an unresolved goal from an earlier week.
          if (deletedGoal?.carriedOverFromWeekKey && deletedGoal.carriedOverFromGoalId) {
            const sourceIdx = newWeeklyGoals.findIndex((w) => w.weekKey === deletedGoal.carriedOverFromWeekKey);
            const sourceDoc = sourceIdx >= 0 ? newWeeklyGoals[sourceIdx] : null;
            if (sourceDoc?.goals.some((g) => g.id === deletedGoal.carriedOverFromGoalId && !g.carryOverDismissed)) {
              const nowIso = trustedNow().toISOString();
              newWeeklyGoals[sourceIdx] = withDeletedGoalIds({
                ...sourceDoc,
                goals: sourceDoc.goals.map((g) =>
                  g.id === deletedGoal.carriedOverFromGoalId ? { ...g, carryOverDismissed: true, updatedAt: nowIso } : g
                ),
              });
            }
          }
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), goalId].slice(-500);
          const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, goalId);

          const mergedDeletedEntityIds = Array.from(
            new Set([...updatedDeletedEntityIds, ...(pointsUpdate.deletedEntityIds || [])])
          ).slice(-500);

          return {
            ...prev,
            weeklyGoals: newWeeklyGoals,
            ...pointsUpdate,
            deletedEntityIds: mergedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Weekly goal deletion', entityId: goalId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carryOverGoal = useCallback((sourceWeekKey: string, targetWeekKey: string, goalId: string, options?: { resumeProgress?: boolean }) => {
    const currentWeek = weekKey(trustedNow());
    if (targetWeekKey !== currentWeek) {
      return;
    }
    setState((prev) => {
      const sourceDoc = prev.weeklyGoals.find((w) => w.weekKey === sourceWeekKey);
      if (!sourceDoc) return prev;

      const targetGoal = sourceDoc.goals.find((g) => g.id === goalId);
      if (!targetGoal) return prev;

      // Check if already carried over to targetWeekKey
      const targetDocIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const targetDoc = targetDocIdx >= 0 ? prev.weeklyGoals[targetDocIdx] : null;

      if (
        targetDoc &&
        targetDoc.goals.some(
          (g) =>
            g.carriedOverFromGoalId === targetGoal.id ||
            (!g.carriedOverFromGoalId &&
              g.title.trim().toLowerCase() === targetGoal.title.trim().toLowerCase())
        )
      ) {
        return prev;
      }

      const nowIso = trustedNow().toISOString();
      // A goal whose habit, book or skill was deleted carries over as a goal the user updates
      // themselves, in the unit it counted.
      const deadLink = Boolean(targetGoal.linkedModule && targetGoal.linkedModule !== 'none') && !linkedItemExists(targetGoal, prev);
      const carriedItem: WeeklyGoalItem = {
        ...targetGoal,
        id: uid(),
        ...(deadLink
          ? { linkedModule: 'none', linkedItemId: undefined, linkedMetricKey: undefined, unit: linkedGoalUnit(targetGoal, prev) || 'times' }
          : {}),
        completed: false,
        done: false,
        completedAt: undefined,
        completedByLogId: undefined,
        linkEditedAt: undefined,
        manualProgress: options?.resumeProgress ? (targetGoal.manualProgress || 0) : 0,
        carriedOverFromWeekKey: sourceWeekKey,
        carriedOverFromGoalId: targetGoal.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const newGoals = targetDoc ? [...targetDoc.goals, carriedItem] : [carriedItem];
      const newDoc: WeeklyGoal = withDeletedGoalIds({
        id: targetDoc ? targetDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: newGoals,
        reflections: targetDoc?.reflections || [],
        deletedGoalIds: targetDoc?.deletedGoalIds,
        createdAt: targetDoc ? targetDoc.createdAt : nowIso,
      });

      let newWeeklyGoals = [...prev.weeklyGoals];
      if (targetDocIdx >= 0) {
        newWeeklyGoals[targetDocIdx] = newDoc;
      } else {
        newWeeklyGoals.unshift(newDoc);
      }

      const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, newGoals, carriedItem.id);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncLinkedWeeklyGoals = useCallback(() => {
    setState((prev) =>
      reconcileWeeklyGoalsPointsForAllWeeks(
        reconcileLinkedWeeklyGoals(prev, trustedNow()),
        trustedNow()
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    addWeeklyReflection,
    updateWeeklyReflection,
    deleteWeeklyReflection,
    addWeeklyGoalItem,
    updateWeeklyGoalItem,
    deleteWeeklyGoalItem,
    carryOverGoal,
    syncLinkedWeeklyGoals,
  };
}
