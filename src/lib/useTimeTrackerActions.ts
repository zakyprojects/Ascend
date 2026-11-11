// Time Tracker actions of useAppState (activities, templates, daily blocks, breaks), moved out of
// store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, TimeTrackerActivity, TimeTrackerTemplate, TimeTrackerState, TimeTrackerBlock } from '@/types';
import { DEFAULT_TIME_TRACKER_STATE } from '@/types';
import { ensureDefaultActivities, autoHydrateDailyLog, checkTimeCollision, normalizeOrSplitMidnightBlock, timeStringToMinutes, minutesToTimeString, commitTimeTrackerDays, describeBlockSpan, findSplitPartner, plannedBlocksForDate, templateDays } from './timeTracker';
import { uid, todayKey, addDays } from './dates';
import { computeTimeTrackerAward, timeTrackerAwardId, timeTrackerGraceDay } from './timeTrackerAwards';
import { planTemplateEditReach, templateEditReachDays, newLinkedBlockId } from './timeTrackerTemplateReach';
import { excisePointsEntriesInternal, canToggleTimeBlock } from './stateAwards';
import { addPointsInternal } from './pointsLedger';
import { trustedNow } from './clock';
import type { StoreSetState } from './storeSetState';

export function useTimeTrackerActions(setState: StoreSetState, get: () => AppState) {
  // ==========================================
  // TIME TRACKER MODULE ACTIONS
  // ==========================================
  const addTimeTrackerActivity = useCallback(
    (activity: Omit<TimeTrackerActivity, 'id'>): TimeTrackerActivity => {
      const newActivity: TimeTrackerActivity = {
        ...activity,
        id: uid(),
        isSystemDefault: false,
        createdAt: trustedNow().toISOString(),
      };
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            activities: [...(currentTT.activities || []), newActivity],
          },
        };
      });
      return newActivity;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTimeTrackerActivity = useCallback(
    (id: string, updates: Partial<TimeTrackerActivity>) => {
      const updatedAt = trustedNow().toISOString();
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        // A built-in category edited for the first time is not in the saved list yet.
        const activities = ensureDefaultActivities(currentTT.activities || []);
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            activities: activities.map((a) => (a.id === id ? { ...a, ...updates, id: a.id, updatedAt } : a)),
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Deletes a custom category. Its blocks on today and later days and in templates move to
   * `replacementId`; past days keep their blocks as they were (shown as a deleted category).
   */
  const deleteTimeTrackerActivity = useCallback(
    (id: string, replacementId: string) => {
      const known = ensureDefaultActivities(get().timeTracker?.activities || []);
      const target = known.find((a) => a.id === id);
      if (!target || target.isSystemDefault) throw new Error("Built-in categories can't be deleted.");
      if (replacementId === id || !known.some((a) => a.id === replacementId)) throw new Error('Choose a category to move them to.');

      const remap = (b: TimeTrackerBlock): TimeTrackerBlock => {
        const usesIt = b.activityId === id || (b.secondaryActivityIds || []).includes(id);
        if (!usesIt) return b;
        const primary = b.activityId === id ? replacementId : b.activityId;
        const secondary = Array.from(
          new Set((b.secondaryActivityIds || []).map((s) => (s === id ? replacementId : s)))
        ).filter((s) => s !== primary);
        return { ...b, activityId: primary, secondaryActivityIds: secondary.length > 0 ? secondary : undefined };
      };

      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const nowIso = trustedNow().toISOString();
          const today = todayKey();
          const changedDays: Record<string, TimeTrackerBlock[]> = {};
          for (const [dateKey, blocks] of Object.entries(currentTT.dailyLogs || {})) {
            if (dateKey < today) continue;
            const next = (blocks || []).map(remap);
            if (next.some((b, i) => b !== blocks[i])) changedDays[dateKey] = next;
          }
          const templates = (currentTT.templates || []).map((t) => {
            const blocks = (t.blocks || []).map(remap);
            return blocks.some((b, i) => b !== t.blocks[i]) ? { ...t, blocks, updatedAt: nowIso } : t;
          });
          const committed = commitTimeTrackerDays(currentTT, changedDays, nowIso);
          const todayBlocks = changedDays[today];
          return {
            ...prev,
            timeTracker: {
              ...committed,
              activities: (currentTT.activities || []).filter((a) => a.id !== id),
              templates,
            },
            deletedEntityIds: [...(prev.deletedEntityIds || []), id].slice(-500),
            ...(todayBlocks ? recomputeTimeTrackerDailyPointsForState(prev, today, committed.dailyLogs[today]) : {}),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Templates with `days` taken off every template but `keepId` (one template per weekday). */
  const withoutDaysElsewhere = (
    templates: TimeTrackerTemplate[],
    days: string[],
    keepId: string,
    updatedAt: string
  ): TimeTrackerTemplate[] => {
    if (days.length === 0) return templates;
    const taken = new Set(days.map((d) => d.toLowerCase()));
    return templates.map((t) => {
      if (t.id === keepId) return t;
      const current = templateDays(t);
      const next = current.filter((d) => !taken.has(d.toLowerCase()));
      return next.length === current.length ? t : { ...t, activeDays: next, autoApplyDays: next, updatedAt };
    });
  };

  const createTimeTrackerTemplate = useCallback(
    (template: Omit<TimeTrackerTemplate, 'id'>): TimeTrackerTemplate => {
      const targetDays = templateDays(template);
      const nowIso = trustedNow().toISOString();
      const newTemplate: TimeTrackerTemplate = {
        ...template,
        activeDays: targetDays,
        autoApplyDays: targetDays,
        id: uid(),
        createdAt: nowIso,
      };

      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            templates: [...withoutDaysElsewhere(currentTT.templates || [], targetDays, newTemplate.id, nowIso), newTemplate],
          },
        };
      });
      return newTemplate;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** The time tracker with one template edited (weekdays it takes leave every other template). */
  const withTemplateEdited = (
    currentTT: TimeTrackerState,
    id: string,
    updates: Partial<TimeTrackerTemplate>,
    nowIso: string
  ): TimeTrackerState | null => {
    const target = (currentTT.templates || []).find((t) => t.id === id);
    if (!target) return null;
    const daysGiven = updates.activeDays !== undefined || updates.autoApplyDays !== undefined;
    const nextDays = daysGiven ? templateDays({ activeDays: updates.activeDays || [], autoApplyDays: updates.autoApplyDays }) : templateDays(target);
    const updated: TimeTrackerTemplate = { ...target, ...updates, activeDays: nextDays, autoApplyDays: nextDays, id: target.id, updatedAt: nowIso };
    const templates = withoutDaysElsewhere(currentTT.templates || [], nextDays, id, nowIso).map((t) => (t.id === id ? updated : t));
    return { ...currentTT, templates };
  };

  /**
   * Which saved days (today and later) an edit to a template would reach: `auto` days update on
   * their own; `asked` days were changed by hand, so the editor asks first.
   */
  const previewTemplateEditReach = useCallback(
    (id: string, updates: Partial<TimeTrackerTemplate>): { autoDates: string[]; askDates: string[] } => {
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const nextTT = withTemplateEdited(currentTT, id, updates, trustedNow().toISOString());
      if (!nextTT) return { autoDates: [], askDates: [] };
      const plans = planTemplateEditReach(currentTT, nextTT, id, todayKey(), trustedNow().getTime());
      return {
        autoDates: plans.filter((p) => p.kind === 'auto').map((p) => p.dateKey),
        askDates: plans.filter((p) => p.kind === 'ask').map((p) => p.dateKey),
      };
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Saves a template edit. A change to its blocks also reaches today and saved later days that
   * the template fills: what is done, skipped, running or past stays; the rest of the day follows
   * the template. Days changed by hand are updated only with `updateAsked` ("Update and save").
   */
  const updateTimeTrackerTemplate = useCallback(
    (id: string, updates: Partial<TimeTrackerTemplate>, options?: { updateAsked?: boolean }) => {
      setState(
        (prev) => {
          const nowIso = trustedNow().toISOString();
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const nextTT = withTemplateEdited(currentTT, id, updates, nowIso);
          if (!nextTT) return prev;
          const today = todayKey();
          // Planned inside the update, so a tick that lands while the editor is open is kept.
          const plans = planTemplateEditReach(currentTT, nextTT, id, today, trustedNow().getTime());
          const days = templateEditReachDays(currentTT, plans, !!options?.updateAsked, today);
          if (Object.keys(days).length === 0) return { ...prev, timeTracker: nextTT };
          const committed = commitTimeTrackerDays(nextTT, days, nowIso);
          return {
            ...prev,
            timeTracker: committed,
            ...(days[today] ? recomputeTimeTrackerDailyPointsForState(prev, today, committed.dailyLogs[today]) : {}),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleTemplateAutoApplyDay = useCallback(
    (templateId: string, day: string) => {
      const nowIso = trustedNow().toISOString();
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const target = (currentTT.templates || []).find((t) => t.id === templateId);
        if (!target) return prev;
        const current = templateDays(target);
        const isRemoving = current.some((d) => d.toLowerCase() === day.toLowerCase());
        const nextDays = isRemoving
          ? current.filter((d) => d.toLowerCase() !== day.toLowerCase())
          : [...current, day];
        const updated: TimeTrackerTemplate = { ...target, activeDays: nextDays, autoApplyDays: nextDays, updatedAt: nowIso };
        const others = isRemoving ? currentTT.templates || [] : withoutDaysElsewhere(currentTT.templates || [], [day], templateId, nowIso);
        return {
          ...prev,
          timeTracker: { ...currentTT, templates: others.map((t) => (t.id === templateId ? updated : t)) },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteTimeTrackerTemplate = useCallback(
    (id: string) => {
      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const updatedDeleted = [...(prev.deletedEntityIds || []), id].slice(-500);
          const updatedRestored = (prev.restoredEntityIds || []).filter((rId) => rId !== id);
          return {
            ...prev,
            timeTracker: {
              ...currentTT,
              templates: (currentTT.templates || []).filter((t) => t.id !== id),
            },
            deletedEntityIds: updatedDeleted,
            restoredEntityIds: updatedRestored,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Shows today's Time Tracker routine points at once (computeTimeTrackerAward), and yesterday's
  // until 02:00 (the grace window, as the server). The entry is never uploaded; the server's own row
  // replaces it on the next pull. Earlier days keep their points.
  const recomputeTimeTrackerDailyPointsForState = (
    baseState: AppState,
    targetDateKey: string,
    newBlocks: TimeTrackerBlock[]
  ): Partial<AppState> => {
    if (targetDateKey !== todayKey() && targetDateKey !== timeTrackerGraceDay(trustedNow())) {
      return {};
    }

    const entryId = timeTrackerAwardId(targetDateKey);
    const current = (baseState.pointsHistory || []).find((e) => e && e.id === entryId);
    const entry = computeTimeTrackerAward(newBlocks, targetDateKey, trustedNow().getTime(), current);
    if (!entry && !current) return {};
    if (
      entry &&
      current &&
      current.amount === entry.amount &&
      JSON.stringify(current.metadata ?? null) === JSON.stringify(entry.metadata)
    ) {
      return {};
    }

    const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(baseState, (e) => e?.id === entryId);
    return entry
      ? addPointsInternal({ ...baseState, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
      : excised;
  };

  /** "Overlaps 12:00 AM–6:00 AM." -> "The part after midnight overlaps 12:00 AM–6:00 AM tomorrow." */
  const tomorrowOverlapMessage = (message?: string) =>
    message?.startsWith('Overlaps ')
      ? `The part after midnight ${message.charAt(0).toLowerCase()}${message.slice(1, -1)} tomorrow.`
      : message || 'The part after midnight overlaps a block tomorrow.';

  /**
   * Adds a block. A block that runs past midnight is saved as two linked halves: start to 24:00 on
   * `dateKey` and 00:00 to the end on the next day, each checked against its own day. A day that
   * was never set up keeps the blocks its template shows, plus the new one.
   */
  const addDailyTimeBlock = useCallback(
    (dateKey: string, block: Omit<TimeTrackerBlock, 'id'>) => {
      if (dateKey < todayKey()) {
        throw new Error("Past days can't change.");
      }
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const parts = normalizeOrSplitMidnightBlock({
        activityId: block.activityId,
        ...(block.secondaryActivityIds?.length ? { secondaryActivityIds: block.secondaryActivityIds } : {}),
        ...(block.customTitle ? { customTitle: block.customTitle } : {}),
        ...(block.notes ? { notes: block.notes } : {}),
        startTime: block.startTime,
        endTime: block.endTime,
      }).map((p, i) => (i === 0 ? { ...p, id: uid(), createdAt: trustedNow().toISOString() } : p));

      const first = checkTimeCollision(parts[0], plannedBlocksForDate(currentTT, dateKey).blocks);
      if (first.hasCollision) throw new Error(first.message || 'This overlaps another block.');
      const nextDayKey = addDays(dateKey, 1);
      if (parts[1]) {
        const second = checkTimeCollision(parts[1], plannedBlocksForDate(currentTT, nextDayKey).blocks);
        if (second.hasCollision) throw new Error(tomorrowOverlapMessage(second.message));
      }

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const days: Record<string, TimeTrackerBlock[]> = {
          [dateKey]: [...plannedBlocksForDate(prevTT, dateKey).blocks, parts[0]],
        };
        if (parts[1]) days[nextDayKey] = [...plannedBlocksForDate(prevTT, nextDayKey).blocks, parts[1]];
        const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
        return {
          ...prev,
          timeTracker: nextTT,
          ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextTT.dailyLogs[dateKey]),
        };
      });

      return parts;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Edits a block. Changing its times clears the trim/pull-forward bookkeeping (so un-completing it
   * later keeps the new times). For a half of a midnight block: a label/category change reaches the
   * other half too; new times that still run past midnight move the other half; new times that no
   * longer do unlink the two.
   */
  const updateDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string, updates: Partial<TimeTrackerBlock>) => {
      if (dateKey < todayKey()) {
        throw new Error("Past days can't change.");
      }
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const dayBlocks = plannedBlocksForDate(currentTT, dateKey).blocks;
      const target = dayBlocks.find((b) => b.id === blockId);
      if (!target) {
        throw new Error('This block is no longer there.');
      }

      const partner = findSplitPartner(currentTT, dateKey, target);
      const span = describeBlockSpan(updates.startTime ?? target.startTime, updates.endTime ?? target.endTime);
      // A stored half never crosses midnight on its own, so new times that do always count as changed.
      const timesChanged = Boolean(span.second) ||
        span.first.startTime !== target.startTime ||
        span.first.endTime !== describeBlockSpan(target.startTime, target.endTime).first.endTime;

      let merged: TimeTrackerBlock = { ...target, ...updates, id: blockId };
      if (timesChanged) {
        merged = {
          ...merged,
          originalStartTime: undefined,
          originalEndTime: undefined,
          trimmedOriginalEndTime: undefined,
          pulledForwardTriggerId: undefined,
          trimmedDueToPullId: undefined,
        };
      }
      // The evening half keeps its pair when it still runs past midnight; any other new crossing
      // starts a pair of its own.
      const keepsPair = Boolean(span.second && partner && partner.dateKey > dateKey);
      const parts = normalizeOrSplitMidnightBlock(keepsPair ? merged : { ...merged, splitPairId: undefined });
      const first: TimeTrackerBlock = { ...parts[0], id: blockId };
      if (!parts[1]) {
        // Label or category only: the halves stay linked. New times: this block stands alone.
        if (!timesChanged && target.splitPairId) first.splitPairId = target.splitPairId;
        else delete first.splitPairId;
      }

      const collision = checkTimeCollision(first, dayBlocks, blockId);
      if (collision.hasCollision) throw new Error(collision.message || 'This overlaps another block.');

      const days: Record<string, TimeTrackerBlock[]> = {};
      const nextDayKey = addDays(dateKey, 1);
      const sharedFields = (b: TimeTrackerBlock): TimeTrackerBlock => ({
        ...b,
        activityId: first.activityId,
        secondaryActivityIds: first.secondaryActivityIds,
        customTitle: first.customTitle,
        notes: first.notes,
      });

      if (parts[1]) {
        const nextBlocks = plannedBlocksForDate(currentTT, nextDayKey).blocks;
        const second: TimeTrackerBlock = keepsPair && partner
          ? { ...sharedFields(partner.block), startTime: parts[1].startTime, endTime: parts[1].endTime, splitPairId: first.splitPairId }
          : parts[1];
        const secondCollision = checkTimeCollision(second, nextBlocks, second.id);
        if (secondCollision.hasCollision) throw new Error(tomorrowOverlapMessage(secondCollision.message));
        days[nextDayKey] = keepsPair
          ? nextBlocks.map((b) => (b.id === second.id ? second : b))
          : [...nextBlocks, second];
      }
      // The old other half: still linked (label change only), or now on its own.
      if (partner && !keepsPair && partner.dateKey >= todayKey()) {
        const others = days[partner.dateKey] ?? plannedBlocksForDate(currentTT, partner.dateKey).blocks;
        days[partner.dateKey] = others.map((b) => {
          if (b.id !== partner.block.id) return b;
          if (!timesChanged) return sharedFields(b);
          const { splitPairId: _unlinked, ...rest } = b;
          return rest;
        });
      }
      days[dateKey] = dayBlocks.map((b) => (b.id === blockId ? first : b));

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
        return {
          ...prev,
          timeTracker: nextTT,
          ...recomputeTimeTrackerDailyPointsForState(prev, todayKey(), nextTT.dailyLogs[todayKey()] || []),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Deletes a block. `withPartner` also deletes the other half of a midnight block (when its day
   * can still change); otherwise that half stays on its own.
   */
  const deleteDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string, options?: { withPartner?: boolean }) => {
      setState(
        (prev) => {
          const today = todayKey();
          if (dateKey < today) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const dayBlocks = plannedBlocksForDate(prevTT, dateKey).blocks;
          const target = dayBlocks.find((b) => b.id === blockId);
          if (!target) return prev;
          const days: Record<string, TimeTrackerBlock[]> = { [dateKey]: dayBlocks.filter((b) => b.id !== blockId) };
          const partner = findSplitPartner(prevTT, dateKey, target);
          if (partner && partner.dateKey >= today) {
            const others = plannedBlocksForDate(prevTT, partner.dateKey).blocks;
            days[partner.dateKey] = options?.withPartner
              ? others.filter((b) => b.id !== partner.block.id)
              : others.map((b) => {
                  if (b.id !== partner.block.id) return b;
                  const { splitPairId: _unlinked, ...rest } = b;
                  return rest;
                });
          }
          const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
          return {
            ...prev,
            timeTracker: nextTT,
            ...(days[today] ? recomputeTimeTrackerDailyPointsForState(prev, today, nextTT.dailyLogs[today]) : {}),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Helper function to revert an un-completed or un-skipped block and cascade-revert any dependent pulled-forward blocks
  const revertBlockAndCascadingPulls = (
    blocks: TimeTrackerBlock[],
    targetBlockId: string
  ): TimeTrackerBlock[] => {
    // Collect IDs of any blocks that were pulled forward because of targetBlockId (if still pending)
    const revertedPulledBlockIds = new Set(
      blocks
        .filter((b) => b.pulledForwardTriggerId === targetBlockId && !b.completed && !b.skipped)
        .map((b) => b.id)
    );

    return blocks
      .map((b) => {
        // 1. Target block being uncompleted/unskipped: restore its own endTime and clear resolution/pull-link state
        if (b.id === targetBlockId) {
          return {
            ...b,
            endTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedOriginalEndTime: undefined,
            trimmedDueToPullId: undefined,
            completed: false,
            completedAt: undefined,
            skipped: false,
            skippedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        // 2. Any block pulled forward because of targetBlockId (if still pending)
        if (revertedPulledBlockIds.has(b.id)) {
          return {
            ...b,
            startTime: b.originalStartTime || b.startTime,
            endTime: b.originalEndTime || b.endTime,
            originalStartTime: undefined,
            originalEndTime: undefined,
            pulledForwardTriggerId: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        // 3. Any preceding block trimmed due to a pulled-forward block that is now reverted
        if (b.trimmedDueToPullId && revertedPulledBlockIds.has(b.trimmedDueToPullId)) {
          return {
            ...b,
            endTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedOriginalEndTime: undefined,
            trimmedDueToPullId: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        return b;
      })
      .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
  };

  /** Returns false when the tick can't change now (a past day, or after the grace window), so the caller shows no "Done". */
  const toggleDailyTimeBlockCompleted = useCallback(
    (dateKey: string, blockId: string, passedTimeStr?: string): boolean => {
      const blocksOf = (s: AppState) => (s.timeTracker || DEFAULT_TIME_TRACKER_STATE).dailyLogs?.[dateKey] || [];
      if (!canToggleTimeBlock(blocksOf(get()), dateKey, blockId)) return false;
      setState((prev) => {
        if (!canToggleTimeBlock(blocksOf(prev), dateKey, blockId)) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId)!;

        const isCurrentlyCompleted = target.completed;

        if (isCurrentlyCompleted) {
          // UN-COMPLETING: Use cascade reversion to restore this block and any blocks pulled forward because of it
          const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

          return {
            ...prev,
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
            ...pointsUpdate,
          };
        }

        // COMPLETING: Execute trim logic (Dimension 2) ONLY for todayKey
        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;

          let finalEndTime = b.endTime;
          let trimmedOriginalEndTime = b.trimmedOriginalEndTime;

          if (dateKey === todayKey()) {
            let timeStr = passedTimeStr;
            if (!timeStr) {
              const now = trustedNow();
              timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            }
            const currentMins = timeStringToMinutes(timeStr);
            const originalEndMins = timeStringToMinutes(b.endTime);
            const startMins = timeStringToMinutes(b.startTime);

            if (currentMins < originalEndMins && currentMins > startMins) {
              trimmedOriginalEndTime = b.endTime;
              finalEndTime = timeStr;
            }
          }

          return {
            ...b,
            endTime: finalEndTime,
            trimmedOriginalEndTime,
            completed: true,
            completedAt: trustedNow().toISOString(),
            skipped: false,
            skippedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        });

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
          ...pointsUpdate,
        };
      });
      return true;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const markDailyTimeBlockSkipped = useCallback(
    (dateKey: string, blockId: string, passedTimeStr?: string) => {
      setState((prev) => {
        if (dateKey !== todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const isCurrentlySkipped = target.skipped;

        if (isCurrentlySkipped) {
          // UN-SKIPPING: Use cascade reversion to restore this block and any blocks pulled forward because of it
          const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

          return {
            ...prev,
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
            ...pointsUpdate,
          };
        }

        // SKIPPING: Execute trim logic (Dimension 2) ONLY for todayKey
        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;

          let finalEndTime = b.endTime;
          let trimmedOriginalEndTime = b.trimmedOriginalEndTime;

          if (dateKey === todayKey()) {
            let timeStr = passedTimeStr;
            if (!timeStr) {
              const now = trustedNow();
              timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            }
            const currentMins = timeStringToMinutes(timeStr);
            const originalEndMins = timeStringToMinutes(b.endTime);
            const startMins = timeStringToMinutes(b.startTime);

            if (currentMins < originalEndMins && currentMins > startMins) {
              trimmedOriginalEndTime = b.endTime;
              finalEndTime = timeStr;
            }
          }

          return {
            ...b,
            endTime: finalEndTime,
            trimmedOriginalEndTime,
            completed: false,
            completedAt: undefined,
            skipped: true,
            skippedAt: trustedNow().toISOString(),
            updatedAt: trustedNow().toISOString(),
          };
        });

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const undoDailyTimeBlockResolution = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        if (dateKey !== todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const pullForwardDailyTimeBlock = useCallback(
    (
      dateKey: string,
      blockId: string,
      newStartTime: string,
      mode: 'shift' | 'stretch' = 'stretch',
      triggerBlockId?: string
    ) => {
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const currentDailyBlocks = currentTT.dailyLogs?.[dateKey] || [];
      const target = currentDailyBlocks.find((b) => b.id === blockId);
      if (!target) return;

      const originalStartTime = target.originalStartTime || target.startTime;
      let newEndTime = target.endTime;
      const originalEndTime = target.originalEndTime || target.endTime;
      const newStartMins = timeStringToMinutes(newStartTime);

      if (mode === 'shift') {
        const startMins = timeStringToMinutes(target.startTime);
        const endMins = timeStringToMinutes(target.endTime);
        const duration = Math.max(1, endMins - startMins);
        const newEndMins = Math.min(1439, newStartMins + duration);
        newEndTime = minutesToTimeString(newEndMins);
      } else {
        newEndTime = target.originalEndTime || target.endTime;
        if (newStartMins >= timeStringToMinutes(newEndTime)) {
          const newEndMins = Math.min(1439, newStartMins + 15);
          newEndTime = minutesToTimeString(newEndMins);
        }
      }

      if (timeStringToMinutes(newStartTime) >= timeStringToMinutes(newEndTime)) {
        throw new Error('Invalid time range: start time must be before end time.');
      }

      const targetNewBlock: TimeTrackerBlock = {
        ...target,
        startTime: newStartTime,
        endTime: newEndTime,
        originalStartTime,
        originalEndTime,
        pulledForwardTriggerId: triggerBlockId,
        updatedAt: trustedNow().toISOString(),
      };

      // Adjust preceding blocks that overlap with newStartTime (e.g. earlier block ending after newStartTime)
      const adjustedBlocks = currentDailyBlocks.map((b) => {
        if (b.id === blockId) return targetNewBlock;
        const bStart = timeStringToMinutes(b.startTime);
        const bEnd = timeStringToMinutes(b.endTime);
        if (bStart <= newStartMins && bEnd > newStartMins) {
          return {
            ...b,
            endTime: newStartTime,
            trimmedOriginalEndTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedDueToPullId: blockId,
            updatedAt: trustedNow().toISOString(),
          };
        }
        return b;
      });

      // Check collision for targetNewBlock against adjustedBlocks (ignoring target block)
      const collision = checkTimeCollision(targetNewBlock, adjustedBlocks, blockId);
      if (collision.hasCollision) {
        throw new Error(collision.message || 'Cannot pull block forward due to overlapping schedule block.');
      }

      setState(
        (prev) => {
          if (dateKey !== todayKey()) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];

          const updatedBlocks = prevDailyBlocks.map((b) => {
            if (b.id === blockId) return targetNewBlock;
            const bStart = timeStringToMinutes(b.startTime);
            const bEnd = timeStringToMinutes(b.endTime);
            if (bStart <= newStartMins && bEnd > newStartMins) {
              return {
                ...b,
                endTime: newStartTime,
                trimmedOriginalEndTime: b.trimmedOriginalEndTime || b.endTime,
                trimmedDueToPullId: blockId,
                updatedAt: trustedNow().toISOString(),
              };
            }
            return b;
          });

          const sortedBlocks = updatedBlocks.sort(
            (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
          );

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, sortedBlocks);

          return {
            ...prev,
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: sortedBlocks }, trustedNow().toISOString()),
            ...pointsUpdate,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const undoEarlyStartTimeBlock = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const originalStart = target.originalStartTime || target.startTime;
        const originalEnd = target.originalEndTime || target.endTime;

        const updatedBlocks = prevDailyBlocks
          .map((b) => {
            if (b.id === blockId) {
              return {
                ...b,
                startTime: originalStart,
                endTime: originalEnd,
                originalStartTime: undefined,
                originalEndTime: undefined,
                trimmedOriginalEndTime: undefined,
                pulledForwardTriggerId: undefined,
                completed: false,
                completedAt: undefined,
                skipped: false,
                skippedAt: undefined,
                updatedAt: trustedNow().toISOString(),
              };
            }
            // If preceding block was trimmed to make room for the early start, restore its trimmed end time
            if (
              b.trimmedDueToPullId === blockId ||
              (b.trimmedOriginalEndTime && timeStringToMinutes(b.endTime) <= timeStringToMinutes(target.startTime))
            ) {
              return {
                ...b,
                endTime: b.trimmedOriginalEndTime || b.endTime,
                trimmedOriginalEndTime: undefined,
                trimmedDueToPullId: undefined,
                updatedAt: trustedNow().toISOString(),
              };
            }
            return b;
          })
          .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startDailyBlockBreak = useCallback(
    (dateKey: string, blockId: string, durationMinutes: number) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakDurationMinutes: durationMinutes,
            breakStartedAt: trustedNow().toISOString(),
            breakEndedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const endDailyBlockBreakEarly = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const now = trustedNow();
        const startMs = target.breakStartedAt ? new Date(target.breakStartedAt).getTime() : now.getTime();
        const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
        const plannedMinutes = target.breakDurationMinutes || 1;
        const actualMinutes = Math.max(1, Math.min(plannedMinutes, Math.ceil(elapsedSeconds / 60)));

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakDurationMinutes: actualMinutes,
            breakEndedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const finalizeDailyBlockBreakNatural = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target || !target.breakStartedAt || target.breakEndedAt) return prev;

        const startMs = new Date(target.breakStartedAt).getTime();
        const plannedMinutes = target.breakDurationMinutes || 1;
        const exactEndIso = new Date(startMs + plannedMinutes * 60 * 1000).toISOString();

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakEndedAt: exactEndIso,
            updatedAt: trustedNow().toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * What applying a template does to a date (pure, so the result is known before the state
   * changes). Merge keeps what the day holds and adds the template blocks that fit; Replace swaps
   * everything for fresh copies of the template's blocks.
   */
  const planTemplateApply = (
    tt: TimeTrackerState,
    dateKey: string,
    templateId: string,
    mode: 'merge' | 'replace'
  ): { blocks: TimeTrackerBlock[]; added: number; rejected: number } | null => {
    const template = (tt.templates || []).find((t) => t.id === templateId);
    if (!template) return null;
    // Linked to the template block (salted, never an id seen before), so a later template edit reaches it.
    const fresh = (b: TimeTrackerBlock): TimeTrackerBlock => ({
      id: b.id ? newLinkedBlockId(dateKey, template.id, b.id) : uid(),
      createdAt: trustedNow().toISOString(),
      startTime: b.startTime,
      endTime: b.endTime,
      activityId: b.activityId,
      ...(b.secondaryActivityIds?.length ? { secondaryActivityIds: b.secondaryActivityIds } : {}),
      ...(b.customTitle ? { customTitle: b.customTitle } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
    });
    if (mode === 'replace') {
      const blocks = (template.blocks || []).map(fresh);
      return { blocks, added: blocks.length, rejected: 0 };
    }
    const blocks = [...plannedBlocksForDate(tt, dateKey).blocks];
    let added = 0;
    let rejected = 0;
    for (const tBlock of template.blocks || []) {
      if (checkTimeCollision(tBlock, blocks).hasCollision) {
        rejected++;
      } else {
        blocks.push(fresh(tBlock));
        added++;
      }
    }
    return { blocks, added, rejected };
  };

  /**
   * Applies a template to today or a later date. The result is worked out from the current state
   * first, so the counts it returns are what happened; nothing changes when `applied` is false
   * (past date, template gone, or Merge with nothing that fits).
   */
  const applyTemplateToDate = useCallback(
    (
      dateKey: string,
      templateId: string,
      mode: 'merge' | 'replace' = 'merge'
    ): { applied: boolean; added: number; rejected: number; reason?: 'past' | 'missing' | 'overlap' } => {
      if (dateKey < todayKey()) return { applied: false, added: 0, rejected: 0, reason: 'past' };
      const plan = planTemplateApply(get().timeTracker || DEFAULT_TIME_TRACKER_STATE, dateKey, templateId, mode);
      if (!plan) return { applied: false, added: 0, rejected: 0, reason: 'missing' };
      if (mode === 'merge' && plan.added === 0) return { applied: false, added: 0, rejected: plan.rejected, reason: 'overlap' };

      setState(
        (prev) => {
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const again = planTemplateApply(prevTT, dateKey, templateId, mode);
          if (!again) return prev;
          const nextTT = commitTimeTrackerDays(prevTT, { [dateKey]: again.blocks }, trustedNow().toISOString());
          return {
            ...prev,
            timeTracker: { ...nextTT, clearedDates: (prevTT.clearedDates || []).filter((d) => d !== dateKey) },
            ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextTT.dailyLogs[dateKey]),
          };
        },
        { immediate: true }
      );

      return { applied: true, added: plan.added, rejected: plan.rejected };
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const clearDailyTimeBlocks = useCallback((dateKey: string) => {
    setState(
      (prev) => {
        if (dateKey < todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        // An empty saved day (not absent) keeps its template from filling it again.
        const nextTT = commitTimeTrackerDays(prevTT, { [dateKey]: [] }, trustedNow().toISOString());
        const cleared = prevTT.clearedDates || [];
        return {
          ...prev,
          timeTracker: { ...nextTT, clearedDates: cleared.includes(dateKey) ? cleared : [...cleared, dateKey] },
          ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, []),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Fills TODAY from its weekday's template when it was never set up (boot, the page, Deep Focus).
   * Other dates are never filled here: a later day shows its template as a preview until the user
   * changes it, and a past day stays as it was.
   */
  const hydrateTimeTrackerForDate = useCallback((dateKey: string) => {
    setState((prev) => {
      if (dateKey !== todayKey()) return prev;
      const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const { updatedState, hydrated } = autoHydrateDailyLog(currentTT, dateKey);
      if (!hydrated) return prev;
      return {
        ...prev,
        timeTracker: updatedState,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Saves a later day's template preview as that day's plan (the "Use it" button). */
  const keepTemplatePreview = useCallback((dateKey: string) => {
    setState((prev) => {
      if (dateKey < todayKey()) return prev;
      const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const planned = plannedBlocksForDate(prevTT, dateKey);
      if (planned.source !== 'template') return prev;
      return { ...prev, timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: planned.blocks }, trustedNow().toISOString()) };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    addTimeTrackerActivity,
    updateTimeTrackerActivity,
    deleteTimeTrackerActivity,
    createTimeTrackerTemplate,
    updateTimeTrackerTemplate,
    previewTemplateEditReach,
    deleteTimeTrackerTemplate,
    toggleTemplateAutoApplyDay,
    addDailyTimeBlock,
    updateDailyTimeBlock,
    deleteDailyTimeBlock,
    toggleDailyTimeBlockCompleted,
    markDailyTimeBlockSkipped,
    undoDailyTimeBlockResolution,
    undoEarlyStartTimeBlock,
    pullForwardDailyTimeBlock,
    startDailyBlockBreak,
    endDailyBlockBreakEarly,
    finalizeDailyBlockBreakNatural,
    keepTemplatePreview,
    applyTemplateToDate,
    clearDailyTimeBlocks,
    hydrateTimeTrackerForDate,
  };
}
