// Journal and lesson actions of useAppState (save, edit, delete, today's entry, lesson read),
// moved out of store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, JournalEntry } from '@/types';
import { uid, todayKey } from './time/dates';
import { journalEntryEarns } from './points/journalAwards';
import { applyJournalEntryEdit } from './journalEdits';
import { computeLessonAward, isLessonReadInSeason, lessonReadId } from './points/lessonAwards';
import { leagueNow, getSeasonNumber } from './time/leagueTime';
import { applyJournalAwardInternal } from './points/stateAwards';
import { addPointsInternal } from './points/pointsLedger';
import { trustedNow } from './time/clock';
import type { StoreSetState } from './storeSetState';

export function useJournalActions(setState: StoreSetState, state: AppState) {
  const saveJournalEntry = useCallback(
    (mood: JournalEntry['mood'], content: string, existingId?: string) => {
      const date = todayKey();
      const trimmed = content.trim();

      setState((prev) => {
        const existingIdx = prev.journalEntries.findIndex(
          (e) => (existingId && e.id === existingId) || e.date === date
        );

        const existing = existingIdx >= 0 ? prev.journalEntries[existingIdx] : null;
        // An edit keeps createdAt (the first write), as the server does, so its echo is a no-op.
        const saved: JournalEntry = existing
          ? { ...existing, mood, content: trimmed }
          : { id: uid(), date, mood, content: trimmed, createdAt: trustedNow().toISOString(), pointsAwarded: false };
        // Only today's entry earns (the server recomputes only today); an earlier entry keeps its flag.
        if (saved.date === date) saved.pointsAwarded = journalEntryEarns(saved);

        const journalEntries = existing
          ? prev.journalEntries.map((e, i) => (i === existingIdx ? saved : e))
          : [saved, ...prev.journalEntries];
        // The server writes the day's award (applyJournalAwardInternal shows the same row now).
        return { ...prev, journalEntries, ...applyJournalAwardInternal(prev, journalEntries, date) };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteJournalEntry = useCallback((entryId: string) => {
    void (
      setState(
        (prev) => {
          const entry = prev.journalEntries.find((e) => e.id === entryId);
          if (!entry) return prev;

          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), entryId].slice(-500);
          const journalEntries = prev.journalEntries.filter((e) => e.id !== entryId);

          // Only today's award changes: an earlier day's points stay (the server recomputes only today).
          return {
            ...prev,
            journalEntries,
            deletedEntityIds: updatedDeletedEntityIds,
            ...applyJournalAwardInternal(prev, journalEntries, todayKey()),
          };
        },
        { immediate: true, actionLabel: 'Journal entry deletion', entityId: entryId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edit a saved entry of any day: mood and notes only (never its date or createdAt, never creates one).
  // An earlier day's points never change (the server recomputes only today); today's entry
  // recomputes today's award, as saveJournalEntry does.
  const editJournalEntry = useCallback((entryId: string, mood: JournalEntry['mood'], content: string) => {
    setState((prev) => {
      const today = todayKey();
      const edit = applyJournalEntryEdit(prev.journalEntries, entryId, mood, content, today);
      if (!edit) return prev;
      const { journalEntries } = edit;
      return edit.entry.date === today
        ? { ...prev, journalEntries, ...applyJournalAwardInternal(prev, journalEntries, today) }
        : { ...prev, journalEntries };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTodayJournalEntry = useCallback((date = trustedNow()): JournalEntry | null => {
    const key = todayKey(date);
    return state.journalEntries.find((e) => e.date === key) ?? null;
  }, [state.journalEntries]);

  const markLessonRead = useCallback(
    (lessonId: string) => {
      setState((prev) => {
        const activeSeasonNum = getSeasonNumber(leagueNow());
        if (isLessonReadInSeason(prev.readLessonIds, lessonId, activeSeasonNum)) return prev;

        // The server writes the award from its own catalog (computeLessonAward shows the same row now).
        // Offline there is no preview: the read is judged by the season it reaches the server in,
        // and a later season awards nothing for it. The server's row shows once it lands.
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        const award = online ? computeLessonAward(lessonId, activeSeasonNum, trustedNow().toISOString()) : null;
        const pointsUpdate = award
          ? addPointsInternal(prev, award.amount, award.reason, award.source, award.metadata, award.timestamp, award.id)
          : {};
        return {
          ...prev,
          readLessonIds: [...prev.readLessonIds, lessonReadId(lessonId, activeSeasonNum)],
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return {
    saveJournalEntry,
    deleteJournalEntry,
    editJournalEntry,
    getTodayJournalEntry,
    markLessonRead,
  };
}
