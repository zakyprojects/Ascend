// Habit actions of useAppState (add a Library or custom habit, rename, delete, tick, the Reading habit,
// isHabitDone), moved out of store.ts unchanged. useAppState calls this hook once, at the same place, and
// returns the same members as before.
import { useCallback } from 'react';
import type { AppState, Habit } from '@/types';
import { uid, periodKey, todayKey, getNow, weekKey } from './dates';
import type { LinkedPactTick } from './pactLifecycle';
import { runningPactsLinkedTo, tickPactsLinkedTo } from './pactLifecycle';
import type { PresetHabit } from './presets';
import { presetHabitPoints } from './habitAwards';
import { renameHabitIn } from './itemEdits';
import { removeLinkedWeeklyGoals, reconcileLinkedWeeklyGoals } from './weeklyGoalPoints';
import { applyHabitAwardsInternal } from './stateAwards';
import { trustedNow } from './clock';
import type { StoreSetState } from './storeSetState';

export function useHabitActions(setState: StoreSetState, get: () => AppState, afterCommit: (fn: () => void) => void, sendLinkedPactTicks: (ticks: readonly LinkedPactTick[], saved: string) => void, inFlightHabitToggles: { current: Set<string> }) {
  const addPresetHabit = useCallback((preset: PresetHabit) => {
    const normalizedName = preset.name.trim().toLowerCase();
    const nowIso = trustedNow().toISOString();
    const habit: Habit = {
      id: uid(),
      name: preset.name,
      frequency: preset.frequency,
      points: preset.points,
      isPreset: true,
      category: preset.category,
      createdAt: nowIso,
      updatedAt: nowIso,
      completions: {},
      createdAtPeriod: periodKey(preset.frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState(
      (prev) => {
        const alreadyExists = (prev.habits || []).some(
          (h) => h.isPreset === true && (h.name || '').trim().toLowerCase() === normalizedName
        );
        if (alreadyExists) {
          return prev;
        }
        return { ...prev, habits: [...prev.habits, habit] };
      },
      { immediate: true }
    );
    return habit;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCustomHabit = useCallback((name: string, frequency: Habit['frequency']) => {
    const nowIso = trustedNow().toISOString();
    const habit: Habit = {
      id: uid(),
      name,
      frequency,
      points: presetHabitPoints({ isPreset: false, name, frequency }),
      isPreset: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completions: {},
      createdAtPeriod: periodKey(frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState(
      (prev) => {
        return {
          ...prev,
          habits: [...prev.habits, habit],
        };
      },
      { immediate: true }
    );
    return habit;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames a custom habit (Library and Reading habits keep their names; see itemEdits). */
  const renameHabit = useCallback((habitId: string, name: string) => {
    const state = get();
    const habit = state.habits.find((h) => h && h.id === habitId);
    // Throws the form's message (taken, Library name, running challenge, Library habit).
    renameHabitIn(state.habits, habitId, name, habit ? runningPactsLinkedTo(state, habit) : 0, trustedNow().toISOString());
    return setState(
      (prev) => {
        const target = prev.habits.find((h) => h && h.id === habitId);
        if (!target) return prev;
        try {
          const habits = renameHabitIn(prev.habits, habitId, name, runningPactsLinkedTo(prev, target), trustedNow().toISOString());
          return habits === prev.habits ? prev : { ...prev, habits };
        } catch {
          return prev;
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteHabit = useCallback((habitId: string) => {
    const currentWeekKey = weekKey(getNow());
    setState(
      (prev) => {
        const target = prev.habits.find((h) => h.id === habitId);
        let runningState = prev;
        const today = todayKey();

        const remainingHabits = prev.habits.filter((h) => h.id !== habitId);

        // If target had a completion today, recalculate cap allocation for the remaining habits
        let targetHadTodayDone = false;
        if (target && target.frequency === 'daily' && presetHabitPoints(target) > 0) {
          if (Array.isArray(target.completions)) {
            targetHadTodayDone = target.completions.includes(today);
          } else if (target.completions && typeof target.completions === 'object') {
            const todayRecord = target.completions[today];
            if (todayRecord?.done) {
              targetHadTodayDone = true;
            }
          }
        }

        // Today's award leaves with the habit and the remaining habits share the freed cap.
        let updatedHabits = remainingHabits;
        if (targetHadTodayDone) {
          const awards = applyHabitAwardsInternal(runningState, remainingHabits, today);
          runningState = { ...runningState, ...awards.points };
          updatedHabits = awards.habits;
        }

        const linkedRemoval = removeLinkedWeeklyGoals(runningState.weeklyGoals, 'habit', [habitId], currentWeekKey);
        const updatedDeletedEntityIds = [...(runningState.deletedEntityIds || []), habitId, ...linkedRemoval.removedGoalIds].slice(-500);
        return {
          ...runningState,
          habits: updatedHabits,
          weeklyGoals: linkedRemoval.weeklyGoals,
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReadingHabit = useCallback(() => {
    const currentWeekKey = weekKey(getNow());
    setState(
      (prev) => {
        const existing = prev.habits.find((h) => h.linkedModule === 'reading');
        if (existing) {
          const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'habit', [existing.id], currentWeekKey);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), existing.id, ...linkedRemoval.removedGoalIds].slice(-500);
          return {
            ...prev,
            habits: prev.habits.filter((h) => h.id !== existing.id),
            weeklyGoals: linkedRemoval.weeklyGoals,
            deletedEntityIds: updatedDeletedEntityIds,
          };
        } else {
          const today = todayKey();
          const todayReadingLogs = (prev.readingLogs || []).filter((l) => l.date === today);
          const totalPagesToday = todayReadingLogs.reduce((sum, l) => sum + (l.pagesRead || 0), 0);
          const hasReadToday = totalPagesToday > 0;

          const nowIso = trustedNow().toISOString();
          const dKey = periodKey('daily');
          const habit: Habit = {
            id: uid(),
            name: 'Reading (Books)',
            frequency: 'daily',
            points: 0,
            isPreset: true,
            category: 'Learning & Growth',
            createdAt: nowIso,
            updatedAt: nowIso,
            completions: hasReadToday ? { [dKey]: { done: true, updatedAt: nowIso } } : {},
            createdAtPeriod: dKey,
            missedPeriods: [],
            consecutiveMisses: 0,
            isSystemLinked: true,
            linkedModule: 'reading',
          };

          const replacedIds = prev.habits.filter((h) => h.name.toLowerCase() === 'reading (books)').map((h) => h.id);
          return {
            ...prev,
            habits: [...prev.habits.filter((h) => h.name.toLowerCase() !== 'reading (books)'), habit],
            // Tombstoned so the habits table soft-deletes them instead of serving them back.
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...replacedIds].slice(-500),
          };
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHabit = useCallback(
    (habitId: string) => {
      if (inFlightHabitToggles.current.has(habitId)) {
        return;
      }
      inFlightHabitToggles.current.add(habitId);

      let completed = false;
      let pactTicks: LinkedPactTick[] = [];

      try {
        setState(
          (prev) => {
            pactTicks = [];
            const habit = prev.habits.find((h) => h.id === habitId);
            if (habit?.linkedModule === 'reading') {
              return prev;
            }

            const nowIso = trustedNow().toISOString();

            const currentKey = habit ? periodKey(habit.frequency) : todayKey();
            const prevCompletions = habit
              ? (Array.isArray(habit.completions)
                  ? Object.fromEntries(habit.completions.map((c) => [c, { done: true, updatedAt: habit.updatedAt || nowIso }]))
                  : (habit.completions || {}))
              : {};
            const isCurrentlyDone = prevCompletions[currentKey]?.done === true;
            completed = !isCurrentlyDone;

            let habits = prev.habits.map((h) => {
              if (h.id !== habitId) return h;
              const key = periodKey(h.frequency);
              const currentCompletions = Array.isArray(h.completions)
                ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                : (h.completions || {});
              if (!completed) {
                return {
                  ...h,
                  completions: {
                    ...currentCompletions,
                    [key]: { done: false, updatedAt: nowIso, pointsAwarded: 0 },
                  },
                  updatedAt: nowIso,
                };
              } else {
                return {
                  ...h,
                  completions: {
                    ...currentCompletions,
                    [key]: { done: true, updatedAt: nowIso, pointsAwarded: h.frequency === 'daily' && presetHabitPoints(h) > 0 ? 0 : h.points },
                  },
                  updatedAt: nowIso,
                };
              }
            });

            let runningState = prev;

            // Daily habits that earn points (presets and custom) share the daily cap; weekly ones earn none.
            if (habit && habit.frequency === 'daily' && presetHabitPoints(habit) > 0) {
              const awards = applyHabitAwardsInternal(runningState, habits, todayKey());
              runningState = { ...runningState, ...awards.points };
              habits = awards.habits;
            }

            let updatedChallenges = prev.sharedChallenges;
            if (habit) {
              const linked = tickPactsLinkedTo(prev, habit, completed);
              updatedChallenges = linked.challenges;
              pactTicks = linked.ticks;
            }

            return reconcileLinkedWeeklyGoals({
              ...runningState,
              habits,
              sharedChallenges: updatedChallenges,
            });
          },
          { immediate: true }
        );

        afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your habit is saved.'));
      } finally {
        inFlightHabitToggles.current.delete(habitId);
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isHabitDone = useCallback((habit: Habit, date = trustedNow()): boolean => {
    const key = periodKey(habit.frequency, date);
    if (!habit.completions) return false;
    if (Array.isArray(habit.completions)) {
      return (habit.completions as any).includes(key);
    }
    return habit.completions[key]?.done === true;
  }, []);

  return {
    addPresetHabit,
    addCustomHabit,
    renameHabit,
    deleteHabit,
    toggleHabit,
    toggleReadingHabit,
    isHabitDone,
  };
}
