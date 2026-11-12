// Recovery actions of useAppState (sobriety tracker, check-ins, cravings), moved out of
// store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, AddictionTracker, CravingLog, RecoveryCheckin } from '@/types';
import { uid, todayKey } from '../time/dates';
import { canUndoRecoveryCheckin, computeRecoveryCheckinAward, RECOVERY_CHECKIN_SOURCE, RECOVERY_MILESTONES, recoveryCheckinDays, recoveryDayAwardId, trackerStartMs } from '../points/recoveryAwards';
import { renameTracker } from '../itemEdits';
import { CLEAR_CRAVING_LOGS_MAX } from '../store/clearLimits';
import { excisePointsEntriesInternal } from '../points/stateAwards';
import { addPointsInternal } from '../points/pointsLedger';
import { trustedNow } from '../time/clock';
import type { StoreSetState } from '../store/storeSetState';

export function useRecoveryActions(setState: StoreSetState, get: () => AppState) {
  // --- MODULE 5: ADDICTION RECOVERY ACTIONS ---
  const setAddictionTracker = useCallback((title: string, startDateIso?: string) => {
    setState((prev) => {
      const tracker: AddictionTracker = {
        id: prev.addictionTracker?.id || uid(),
        title: title.trim() || 'Sobriety Tracker',
        startDate: startDateIso || trustedNow().toISOString(),
        milestonesUnlocked: prev.addictionTracker?.milestonesUnlocked || [],
        awardedMilestones: prev.addictionTracker?.awardedMilestones || [],
        createdAt: prev.addictionTracker?.createdAt || trustedNow().toISOString(),
      };
      return { ...prev, addictionTracker: tracker };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames the recovery tracker. Never resets: start date, milestones and awards stay. */
  const renameAddictionTracker = useCallback((title: string) => {
    const current = get().addictionTracker;
    if (!current) throw new Error('This tracker was deleted.');
    renameTracker(current, title);
    return setState(
      (prev) => {
        if (!prev.addictionTracker) return prev;
        try {
          const addictionTracker = renameTracker(prev.addictionTracker, title);
          return addictionTracker === prev.addictionTracker ? prev : { ...prev, addictionTracker };
        } catch {
          return prev;
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAddictionStreak = useCallback(() => {
    void setState(
      (prev) => {
        if (!prev.addictionTracker) return prev;
        // A relapse starts a new streak; points already earned stay.
        return {
          ...prev,
          addictionTracker: { ...prev.addictionTracker, startDate: trustedNow().toISOString(), milestonesUnlocked: [] },
        };
      },
      {
        immediate: true,
        actionLabel: 'Sobriety streak reset',
        entityId: get().addictionTracker?.id || 'sobriety_tracker',
      }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

  const checkAddictionMilestones = useCallback(() => {
    setState((prev) => {
      if (!prev.addictionTracker) return prev;
      const startMs = trackerStartMs(prev.addictionTracker);
      const hoursElapsed = startMs === null ? 0 : (trustedNow().getTime() - startMs) / 3600000;

      const unlocked = [...prev.addictionTracker.milestonesUnlocked];
      for (const m of RECOVERY_MILESTONES) {
        if (hoursElapsed >= m.hours && !unlocked.includes(m.key)) unlocked.push(m.key);
      }
      return unlocked.length === prev.addictionTracker.milestonesUnlocked.length
        ? prev
        : { ...prev, addictionTracker: { ...prev.addictionTracker, milestonesUnlocked: unlocked } };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Clean today": one check-in for `day` (today, or yesterday when it was missed), never edited
   * afterwards (only today's can be undone, undoRecoveryCheckin). The server writes the point (ascend_award_recovery_checkin); the app shows the same
   * row at once (computeRecoveryCheckinAward) and never uploads it.
   */
  const checkInRecovery = useCallback((day: string) => {
    void setState(
      (prev) => {
        const tracker = prev.addictionTracker;
        const nowMs = trustedNow().getTime();
        const { today, yesterday } = recoveryCheckinDays(nowMs);
        const checkins = prev.recoveryCheckins || [];
        if (!tracker?.id || (day !== today && day !== yesterday) || checkins.some((c) => c.id === day)) return prev;
        const checkin: RecoveryCheckin = { id: day, trackerId: tracker.id, createdAt: new Date(nowMs).toISOString() };
        const next = { ...prev, recoveryCheckins: [...checkins, checkin] };
        const award = computeRecoveryCheckinAward(tracker, day, prev.pointsHistory || [], nowMs);
        return award
          ? { ...next, ...addPointsInternal(next, award.amount, award.reason, award.source, award.metadata, award.timestamp, award.id) }
          : next;
      },
      { immediate: true }
    );
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Undo of TODAY's check-in (the tick on the done card): the check-in leaves (synced as a soft
   * delete) and so does today's preview point. The server removes today's point only while the day
   * is still today (ascend_revoke_recovery_checkin); yesterday's late tap and older days never go.
   * Clean today can be tapped again afterwards and earns the same single point once.
   */
  const undoRecoveryCheckin = useCallback(() => {
    void setState(
      (prev) => {
        const nowMs = trustedNow().getTime();
        const { today } = recoveryCheckinDays(nowMs);
        if (!canUndoRecoveryCheckin(prev.recoveryCheckins, today, nowMs)) return prev;
        const next = { ...prev, recoveryCheckins: (prev.recoveryCheckins || []).filter((c) => c.id !== today) };
        const awardId = recoveryDayAwardId(today);
        const { excisedEntryIds: _gone, ...points } = excisePointsEntriesInternal(
          next,
          (e) => e.id === awardId && e.source === RECOVERY_CHECKIN_SOURCE
        );
        return { ...next, ...points };
      },
      { immediate: true }
    );
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logCraving = useCallback((intensity: number, trigger: string, copingStrategy: string) => {
    const log: CravingLog = {
      id: uid(),
      date: trustedNow().toISOString(),
      intensity,
      trigger: trigger.trim(),
      copingStrategy: copingStrategy.trim(),
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, cravingLogs: [log, ...prev.cravingLogs] };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteAddictionTracker = useCallback(() => {
    void (
      setState(
        (prev) => {
          if (!prev.addictionTracker) return prev;
          const tracker = prev.addictionTracker;

          // Points already earned stay, and so do the check-ins (one per day, whatever the tracker).
          const trackerId = tracker.id;
          const updatedDeletedEntityIds = [
            ...(prev.deletedEntityIds || []),
            ...(trackerId ? [trackerId] : []),
            ...prev.cravingLogs.map((l) => l.id),
          ].slice(-500);

          return {
            ...prev,
            addictionTracker: null,
            cravingLogs: [],
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        {
          immediate: true,
          actionLabel: 'Sobriety tracker deletion',
          entityId: get().addictionTracker?.id || 'sobriety_tracker',
        }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

  const deleteCravingLog = useCallback((logId: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
          return {
            ...prev,
            cravingLogs: prev.cravingLogs.filter((l) => l.id !== logId),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Craving log deletion', entityId: logId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Removes up to CLEAR_CRAVING_LOGS_MAX craving logs from before `beforeDate` (local day key). No points ride on cravings. */
  const clearCravingLogsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const toClear = prev.cravingLogs
            .filter((l) => {
              const at = new Date(l?.date || '');
              return !Number.isNaN(at.getTime()) && todayKey(at) < beforeDate;
            })
            .slice(0, CLEAR_CRAVING_LOGS_MAX);
          if (toClear.length === 0) return prev;
          const cleared = new Set(toClear.map((l) => l.id));
          return {
            ...prev,
            cravingLogs: prev.cravingLogs.filter((l) => !cleared.has(l.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...cleared].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old craving logs' }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    setAddictionTracker,
    renameAddictionTracker,
    deleteAddictionTracker,
    resetAddictionStreak,
    checkAddictionMilestones,
    checkInRecovery,
    undoRecoveryCheckin,
    logCraving,
    deleteCravingLog,
    clearCravingLogsBefore,
  };
}
