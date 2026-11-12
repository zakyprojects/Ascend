// Workout actions of useAppState (log, edit, delete, clear older), moved out of store.ts
// unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, WorkoutLog } from '@/types';
import { uid, todayKey } from '../time/dates';
import { editWorkoutIn, workoutFields } from '../itemEdits';
import { CLEAR_WORKOUTS_MAX } from '../store/clearLimits';
import { reconcileLinkedWeeklyGoals } from '../points/weeklyGoalPoints';
import { applyWorkoutAwardsInternal } from '../points/stateAwards';
import { trustedNow } from '../time/clock';
import type { StoreSetState } from '../store/storeSetState';

export function useWorkoutActions(setState: StoreSetState, get: () => AppState) {
  // --- MODULE 1: EXERCISE TRACKER ACTIONS ---
  const logWorkout = useCallback((type: string, durationMinutes: number, amount?: number, unit?: string) => {
    const date = todayKey();
    setState((prev) => {
      // One rule for the saved fields, shared with updateWorkout.
      const workout: WorkoutLog = {
        id: uid(),
        date,
        ...workoutFields(type, durationMinutes, amount, unit),
        pointsAwarded: 0,
        createdAt: trustedNow().toISOString(),
      };

      // The server writes the day's award (applyWorkoutAwardsInternal shows the same row now).
      const awards = applyWorkoutAwardsInternal(prev, [workout, ...prev.workouts], date);
      return reconcileLinkedWeeklyGoals({
        ...prev,
        workouts: awards.workouts,
        ...awards.points,
      });
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWorkout = useCallback((workoutId: string) => {
    void (
      setState(
        (prev) => {
          const target = prev.workouts.find((w) => w.id === workoutId);
          if (!target) return prev;

          const remainingWorkouts = prev.workouts.filter((w) => w.id !== workoutId);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), workoutId].slice(-500);

          // Only today's award follows the workouts; an earlier day's points stay (as on the server).
          const today = todayKey();
          if (target.date !== today) {
            return reconcileLinkedWeeklyGoals({ ...prev, workouts: remainingWorkouts, deletedEntityIds: updatedDeletedEntityIds });
          }
          const awards = applyWorkoutAwardsInternal(prev, remainingWorkouts, today);
          return reconcileLinkedWeeklyGoals({
            ...prev,
            workouts: awards.workouts,
            deletedEntityIds: updatedDeletedEntityIds,
            ...awards.points,
          });
        },
        { immediate: true, actionLabel: 'Workout deletion', entityId: workoutId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Changes today's workout (type, amount, measure). Any other day throws: the server drops those
   * edits. Today's award is recomputed here as the server does on the update.
   */
  const updateWorkout = useCallback((workoutId: string, type: string, durationMinutes: number, amount?: number, unit?: string) => {
    const fields = workoutFields(type, durationMinutes, amount, unit);
    editWorkoutIn(get().workouts, workoutId, fields, todayKey());
    return setState(
      (prev) => {
        const today = todayKey();
        let workouts: WorkoutLog[];
        try {
          workouts = editWorkoutIn(prev.workouts, workoutId, fields, today);
        } catch {
          return prev;
        }
        const awards = applyWorkoutAwardsInternal(prev, workouts, today);
        return reconcileLinkedWeeklyGoals({ ...prev, workouts: awards.workouts, ...awards.points });
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Removes workout logs dated before `beforeDate` (a local day key). Points already earned stay:
   * no earlier day's award is recomputed, here or on the server. Capped per call so the ids
   * fit in the tombstone list (deletedEntityIds keeps the last 500).
   */
  const clearWorkoutsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const ids = prev.workouts
            .filter((w) => w.date < beforeDate && w.date !== todayKey())
            .slice(0, CLEAR_WORKOUTS_MAX)
            .map((w) => w.id);
          if (ids.length === 0) return prev;
          const cleared = new Set(ids);
          return {
            ...prev,
            workouts: prev.workouts.filter((w) => !cleared.has(w.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...ids].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old workouts' }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    logWorkout,
    deleteWorkout,
    updateWorkout,
    clearWorkoutsBefore,
  };
}
