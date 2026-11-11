// Bad-habit actions of useAppState (add, log today, undo today, delete, rename), moved out of store.ts
// unchanged. useAppState calls this hook once, at the same place, and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, BadHabit, BadHabitLog } from '@/types';
import { uid, todayKey } from './dates';
import { tickLinkedBadHabitPacts, pactSideIn, runningPactsLinkedToBadHabit } from './pactLifecycle';
import type { LinkedPactTick } from './pactLifecycle';
import { sameName } from './uniqueNames';
import { renameBadHabitIn } from './itemEdits';
import { applyBadHabitAwardsInternal } from './stateAwards';
import { badHabitCreatedDay, getBadHabitBadDaysBefore } from './habitPenalties';
import { trustedNow } from './clock';
import type { StoreSetState } from './storeSetState';

export function useBadHabitActions(setState: StoreSetState, get: () => AppState, afterCommit: (fn: () => void) => void, sendLinkedPactTicks: (ticks: readonly LinkedPactTick[], saved: string) => void) {
  // --- MODULE 4: BAD HABIT REDUCTION TRACKER ACTIONS ---
  const addBadHabit = useCallback((name: string, isPreset = false) => {
    const bh: BadHabit = {
      id: uid(),
      name: name.trim(),
      isPreset,
      isCompleted: false,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      // A library bad habit is added once (a quick second tap on Add); the dialog checks names first.
      if (isPreset && prev.badHabits.some((b) => b && !b.isCompleted && sameName(b.name, bh.name))) return prev;
      return { ...prev, badHabits: [...prev.badHabits, bh] };
    });
    return bh;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bad-habit points come from the server (src/lib/badHabitAwards.ts); each action below only
  // changes habits and logs and shows the server's result at once. Only today can be logged.
  // A log change also ticks (Resisted) or unticks (Slipped, undone) today on the running resist
  // challenges linked to that bad habit; challenges give no points.
  const logBadHabitDay = useCallback((badHabitId: string, date: string, status: 'resisted' | 'occurred') => {
    let pactTicks: LinkedPactTick[] = [];
    setState((prev) => {
      pactTicks = [];
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh || bh.isCompleted || date !== todayKey()) return prev;

      const existingLog = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);
      if (existingLog && existingLog.status === status) return prev;

      // Same count as the server (habitPenalties.ts getBadHabitBadDaysBefore): 1 + bad days in a row.
      const consecutiveOccurrences =
        status === 'occurred'
          ? 1 + getBadHabitBadDaysBefore(prev.badHabitLogs, badHabitId, date, badHabitCreatedDay(bh.createdAt))
          : 0;

      const nowIso = trustedNow().toISOString();
      const newLog: BadHabitLog = {
        id: existingLog?.id || uid(),
        badHabitId,
        date,
        status,
        consecutiveOccurrences,
        pointsAwardedOrDeducted: 0,
        createdAt: existingLog?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      const logs = [newLog, ...prev.badHabitLogs.filter((l) => !(l && l.badHabitId === badHabitId && l.date === date))];
      const awards = applyBadHabitAwardsInternal(prev, prev.badHabits, logs, date);
      const linked = tickLinkedBadHabitPacts(prev.sharedChallenges || [], pactSideIn(prev), bh, status === 'resisted', date);
      pactTicks = linked.ticks;
      return {
        ...prev,
        badHabitLogs: awards.logs,
        deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => id !== `${badHabitId}_${date}`),
        ...awards.points,
        sharedChallenges: linked.challenges,
      };
    });
    afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your log is saved.'));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoTodayBadHabitLog = useCallback((badHabitId: string) => {
    let pactTicks: LinkedPactTick[] = [];
    setState((prev) => {
      pactTicks = [];
      const today = todayKey();
      const target = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === today);
      if (!target || target.status === 'no_report') return prev;

      const logs = prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === today));
      const awards = applyBadHabitAwardsInternal(prev, prev.badHabits, logs, today);
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      const linked = bh
        ? tickLinkedBadHabitPacts(prev.sharedChallenges || [], pactSideIn(prev), bh, false, today)
        : { challenges: prev.sharedChallenges, ticks: [] };
      pactTicks = linked.ticks;
      return {
        ...prev,
        badHabitLogs: awards.logs,
        deletedEntityIds: Array.from(new Set([...(prev.deletedEntityIds || []), target.id])).slice(-500),
        ...awards.points,
        sharedChallenges: linked.challenges,
      };
    });
    afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your log is saved.'));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteBadHabit = useCallback((badHabitId: string) => {
    void (
      setState(
        (prev) => {
          const habitLogs = prev.badHabitLogs.filter((l) => l.badHabitId === badHabitId);
          const today = todayKey();
          const badHabits = prev.badHabits.filter((b) => b.id !== badHabitId);
          const logs = prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId);

          // Same as the server's bad_habits_award_points: only today's points of the habit go
          // (the day is recomputed without it); earlier points and penalties stay.
          const awards = applyBadHabitAwardsInternal(prev, badHabits, logs, today);

          const toTombstone = [...(prev.deletedEntityIds || []), badHabitId, ...habitLogs.map((l) => l.id).filter(Boolean)];
          return {
            ...prev,
            badHabits,
            badHabitLogs: awards.logs,
            deletedEntityIds: Array.from(new Set(toTombstone)).slice(-500),
            ...awards.points,
          };
        },
        { immediate: true, actionLabel: 'Bad habit deletion', entityId: badHabitId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames a custom bad habit (Library ones keep their names; see itemEdits). */
  const renameBadHabit = useCallback((badHabitId: string, name: string) => {
    const state = get();
    const target = state.badHabits.find((b) => b && b.id === badHabitId);
    const active = (list: BadHabit[]) => list.filter((b) => b && !b.isCompleted);
    renameBadHabitIn(state.badHabits, badHabitId, name, active(state.badHabits), target ? runningPactsLinkedToBadHabit(state, target) : 0);
    return setState(
      (prev) => {
        const bh = prev.badHabits.find((b) => b && b.id === badHabitId);
        if (!bh) return prev;
        try {
          const badHabits = renameBadHabitIn(prev.badHabits, badHabitId, name, active(prev.badHabits), runningPactsLinkedToBadHabit(prev, bh));
          return badHabits === prev.badHabits ? prev : { ...prev, badHabits };
        } catch {
          return prev;
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    addBadHabit,
    logBadHabitDay,
    undoTodayBadHabitLog,
    deleteBadHabit,
    renameBadHabit,
  };
}
