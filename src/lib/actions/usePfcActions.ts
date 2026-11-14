// Prefrontal-cortex actions of useAppState (focus sessions, decisions, emotions), moved out of
// store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, FocusSessionLog, DecisionLog, EmotionLog } from '@/types';
import { uid, todayKey } from '../time/dates';
import { skillLateDay } from '../points/skillAwards';
import { focusFloorDay, isFocusDayEntry } from '../points/focusAwards';
import { focusSkillLogFor, withReflectionNote } from '../focus/focusSkillLog';
import { editDecisionText, editEmotionNote, editFocusLogText } from '../focus/pfcLogEdits';
import { reconcileLinkedWeeklyGoals } from '../points/weeklyGoalPoints';
import { applySkillAwardsInternal, applyFocusAwardsInternal } from '../points/stateAwards';
import { trustedNow, trustedNowMs } from '../time/clock';
import type { StoreSetState } from '../store/storeSetState';

export function usePfcActions(setState: StoreSetState, get: () => AppState) {
  // --- MODULE 7: PREFRONTAL CORTEX ACTIONS ---
  /**
   * Logs a focus session and returns its id. `id` makes the log idempotent (a second call with the
   * same id, or one for a deleted log, changes nothing); `endedAtMs` dates it on the local day it
   * ended. `durationMinutes` is the active time; the timer also passes the plan, the first start
   * and the milestone crossings (they bound the credited minutes and place them on each side of
   * midnight). The session earns rule 2 (focusPoints.ts).
   * The server awards only its own today, and raises the day before for a session with points on
   * it (one across midnight, or one that ended yesterday and arrives today), so only those get a
   * preview. The log reaches the server through the outbox, which
   * keeps it on this device until the upload succeeds.
   */
  const logFocusSession = useCallback(
    (
      taskName: string,
      durationMinutes: number,
      skillId?: string,
      reflection?: string,
      opts?: { id?: string; endedAtMs?: number; startedAtMs?: number; plannedMinutes?: number; milestonesAt?: number[] }
    ): string => {
      const id = opts?.id || uid();
      const endedAt = opts?.endedAtMs !== undefined ? new Date(Math.min(opts.endedAtMs, trustedNowMs())) : trustedNow();
      const date = todayKey(endedAt);
      const planned = opts?.plannedMinutes;
      setState((prev) => {
        if (prev.focusLogs.some((f) => f.id === id) || (prev.deletedEntityIds || []).includes(id)) return prev;
        const focusLog: FocusSessionLog = {
          id,
          date,
          taskName: taskName.trim() || 'Deep Focus',
          skillId,
          durationMinutes,
          pointsAwarded: 0,
          reflection: reflection?.trim() || undefined,
          createdAt: endedAt.toISOString(),
          // The server stamps every new row with rule 2 (focus_logs.points_rule); the preview matches it.
          pointsRule: 2,
          ...(planned !== undefined && opts?.startedAtMs !== undefined
            ? {
                plannedMinutes: planned,
                startedAt: new Date(Math.min(opts.startedAtMs, endedAt.getTime())).toISOString(),
                milestonesAt: (opts.milestonesAt || []).map((ms) => new Date(Math.min(ms, endedAt.getTime())).toISOString()),
              }
            : {}),
        };
        const today = todayKey();
        const floorDay = focusFloorDay(focusLog, today);
        // A session with a skill chosen also adds a normal skill practice log (focusSkillLog.ts).
        const withSkillLog = (state: AppState): AppState => {
          const skillLog = focusSkillLogFor(focusLog, state.skills, state.skillLogs, state.deletedEntityIds || []);
          if (!skillLog) return state;
          const skillLogs = [skillLog, ...state.skillLogs];
          // Today's skill award, exactly as Log practice shows it; a session of yesterday raises
          // yesterday only (skillLateDay, floor), as the server does. The server writes the real rows.
          const lateDay = skillLateDay(skillLog, today);
          if (skillLog.date !== today && !lateDay) return reconcileLinkedWeeklyGoals({ ...state, skillLogs });
          const awards = applySkillAwardsInternal(state, skillLogs, state.skills, lateDay ?? today, { floor: Boolean(lateDay) });
          return reconcileLinkedWeeklyGoals({ ...state, skillLogs: awards.skillLogs, ...awards.points });
        };
        if (date !== today && !floorDay) return withSkillLog({ ...prev, focusLogs: [focusLog, ...prev.focusLogs] });
        // The server writes the day's award (applyFocusAwardsInternal shows the same row now).
        let next: AppState = { ...prev, focusLogs: [focusLog, ...prev.focusLogs] };
        if (date === today) {
          const awards = applyFocusAwardsInternal(prev, next.focusLogs, date);
          next = { ...next, focusLogs: awards.focusLogs, ...awards.points };
        }
        if (floorDay) {
          const amountOn = (s: AppState) => (s.pointsHistory || []).find((e) => isFocusDayEntry(e, floorDay))?.amount ?? 0;
          const kept = amountOn(next);
          const before = applyFocusAwardsInternal(next, next.focusLogs, floorDay, { floor: true });
          next = { ...next, ...before.points };
          // A session of yesterday that arrives today shows what it added to yesterday.
          const gained = amountOn(next) - kept;
          if (date === floorDay && gained > 0) {
            next = { ...next, focusLogs: next.focusLogs.map((l) => (l.id === id ? { ...l, pointsAwarded: gained } : l)) };
          }
        }
        return withSkillLog(next);
      });
      return id;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateFocusLogReflection = useCallback((logId: string, reflection: string) => {
    setState((prev) => {
      const idx = prev.focusLogs.findIndex((f) => f.id === logId);
      if (idx === -1) return prev;

      const updated = {
        ...prev.focusLogs[idx],
        reflection: reflection.trim() || undefined,
      };

      const updatedLogs = [...prev.focusLogs];
      updatedLogs[idx] = updated;

      // The session's skill log (if any) gets the reflection as its note.
      const skillLogs = withReflectionNote(prev.skillLogs, logId, prev.focusLogs[idx].reflection, reflection);
      return {
        ...prev,
        focusLogs: updatedLogs,
        ...(skillLogs !== prev.skillLogs ? { skillLogs } : {}),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Task name and reflection of a past or today's focus session; minutes, times and points stay. */
  const updateFocusLogText = useCallback((logId: string, changes: { taskName: string; reflection: string }) => {
    if (!get().focusLogs.some((f) => f && f.id === logId)) throw new Error('This focus session was deleted.');
    return setState(
      (prev) => {
        const next = editFocusLogText(prev.focusLogs, prev.skillLogs, logId, changes);
        if (!next) return prev;
        return {
          ...prev,
          focusLogs: next.focusLogs,
          ...(next.skillLogs !== prev.skillLogs ? { skillLogs: next.skillLogs } : {}),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Words of a decision (title, why, expected outcome, reflection once written); dates stay. */
  const updateDecisionText = useCallback(
    (decisionId: string, changes: { title: string; rationale: string; expectedOutcome: string; reflection?: string }) => {
      if (!get().decisionLogs.some((d) => d && d.id === decisionId)) throw new Error('This decision was deleted.');
      return setState(
        (prev) => {
          const decisionLogs = editDecisionText(prev.decisionLogs, decisionId, changes);
          return decisionLogs ? { ...prev, decisionLogs } : prev;
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** The note of an emotion entry; the emotion, intensity and time stay. */
  const updateEmotionNote = useCallback((emotionId: string, context: string) => {
    if (!get().emotionLogs.some((e) => e && e.id === emotionId)) throw new Error('This entry was deleted.');
    return setState(
      (prev) => {
        const emotionLogs = editEmotionNote(prev.emotionLogs, emotionId, context);
        return emotionLogs ? { ...prev, emotionLogs } : prev;
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addDecision = useCallback((title: string, rationale: string, expectedOutcome: string, revisitDate: string) => {
    const decision: DecisionLog = {
      id: uid(),
      title: title.trim(),
      rationale: rationale.trim(),
      expectedOutcome: expectedOutcome.trim(),
      revisitDate,
      isReflected: false,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, decisionLogs: [decision, ...prev.decisionLogs] };
    });
    return decision;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reflectDecision = useCallback((decisionId: string, reflection: string) => {
    setState((prev) => {
      const idx = prev.decisionLogs.findIndex((d) => d.id === decisionId);
      if (idx === -1) return prev;
      const target = prev.decisionLogs[idx];
      if (target.isReflected) return prev;

      const updated = { ...target, reflection: reflection.trim(), isReflected: true };
      const updatedLogs = [...prev.decisionLogs];
      updatedLogs[idx] = updated;

      return { ...prev, decisionLogs: updatedLogs };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logEmotion = useCallback((emotion: string, intensity: number, context: string) => {
    const log: EmotionLog = {
      id: uid(),
      date: trustedNow().toISOString(),
      emotion: emotion.trim(),
      intensity,
      context: context.trim(),
      pointsAwarded: 0,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return {
        ...prev,
        emotionLogs: [log, ...prev.emotionLogs],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFocusLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.focusLogs.find((f) => f.id === logId);
        if (!target) return prev;

        const remainingFocusLogs = prev.focusLogs.filter((f) => f.id !== logId);
        // Only today's award changes: an earlier day's points stay (the server recomputes only today).
        const awards = applyFocusAwardsInternal(prev, remainingFocusLogs, todayKey());

        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          focusLogs: awards.focusLogs,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteDecisionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          decisionLogs: prev.decisionLogs.filter((d) => d.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteEmotionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          emotionLogs: prev.emotionLogs.filter((e) => e.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    logFocusSession,
    updateFocusLogReflection,
    updateFocusLogText,
    deleteFocusLog,
    addDecision,
    reflectDecision,
    deleteDecisionLog,
    updateDecisionText,
    logEmotion,
    deleteEmotionLog,
    updateEmotionNote,
  };
}
