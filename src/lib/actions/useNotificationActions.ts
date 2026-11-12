// Notification and league actions of useAppState (mark read, mark all read, clear, clear read, the inbox and
// partners Retry, getLeagueData), moved out of store.ts unchanged. useAppState calls this hook once, at the
// same place, and destructures the members (their places in its return object are not side by side).
import { useCallback } from 'react';
import type { AppState, LeagueType } from '@/types';
import { dispatchToastError } from '../store/storeShared';
import { todayKey } from '../time/dates';
import { getLeaguePeriodStart, calculatePeriodPoints, getEffectiveSeasonPoints, generateCompetitors, getUserRank } from '../leagues/leagues';
import { leagueNow, getSeasonStart } from '../time/leagueTime';
import { toSeasonHistory } from '../leagues/seasonArchive';
import { buildMemberStats } from '../leagues/memberStats';
import { markNotificationReadSupabase, markAllNotificationsReadSupabase, clearNotificationSupabase, clearNotificationsSupabase } from '../auth/supabase';
import type { Dispatch, SetStateAction } from 'react';
import type { StoreSetState } from '../store/storeSetState';

export function useNotificationActions(setState: StoreSetState, get: () => AppState, state: AppState, leagueDataVersion: number, notificationsRefreshRef: { current: (() => Promise<void>) | null }, partnersRefreshRef: { current: (() => Promise<void>) | null }, setNotificationsStatus: Dispatch<SetStateAction<'loading' | 'ready' | 'failed'>>, setPartnersStatus: Dispatch<SetStateAction<'loading' | 'ready' | 'failed'>>) {
  /** Marks these notices read at once; a failed save puts them back as unread with a toast (N7). */
  const markNotificationsRead = useCallback((notificationIds: string[]) => {
    const ids = new Set(notificationIds);
    const wereUnread = (get().notifications || []).filter((n) => ids.has(n.id) && !n.read).map((n) => n.id);
    if (wereUnread.length === 0) return;
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => (ids.has(n.id) ? { ...n, read: true } : n)),
    }));
    const revert = (err: unknown) => {
      console.error('Failed to mark notifications read:', err);
      const back = new Set(wereUnread);
      setState((prev) => ({
        ...prev,
        notifications: (prev.notifications || []).map((n) => (back.has(n.id) ? { ...n, read: false } : n)),
      }));
      dispatchToastError("Couldn't mark as read", 'Check your connection and try again.');
    };
    Promise.all(wereUnread.map((id) => markNotificationReadSupabase(id))).catch(revert);
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markNotificationRead = useCallback(
    (notificationId: string) => markNotificationsRead([notificationId]),
    [markNotificationsRead]
  );

  const markAllNotificationsRead = useCallback(() => {
    const wereUnread = (get().notifications || []).filter((n) => !n.read).map((n) => n.id);
    if (wereUnread.length === 0) return;
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
    if (!state.currentUser?.id) return;
    markAllNotificationsReadSupabase(state.currentUser.id).catch((err) => {
      console.error('Failed to mark all notifications read:', err);
      const back = new Set(wereUnread);
      setState((prev) => ({
        ...prev,
        notifications: (prev.notifications || []).map((n) => (back.has(n.id) ? { ...n, read: false } : n)),
      }));
      dispatchToastError("Couldn't mark all as read", 'Check your connection and try again.');
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id]);

  /** Removes these notices here and on the server; a failed delete puts them back with a toast. */
  const clearNotifications = useCallback((notificationIds: string[]) => {
    const ids = new Set(notificationIds);
    const cleared = (get().notifications || []).filter((n) => ids.has(n.id));
    if (cleared.length === 0) return;
    const clearedIds = cleared.map((n) => n.id);
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => !ids.has(n.id)),
      deletedEntityIds: [...(prev.deletedEntityIds || []), ...clearedIds].slice(-500),
    }));
    // The table row is the only record across devices, so a failed delete puts it back.
    const request = clearedIds.length === 1 ? clearNotificationSupabase(clearedIds[0]) : clearNotificationsSupabase(clearedIds);
    request.catch((err) => {
      console.error('Failed to clear notifications:', err);
      setState((prev) => {
        const present = new Set((prev.notifications || []).map((n) => n.id));
        const restored = [...cleared.filter((n) => !present.has(n.id)), ...(prev.notifications || [])].sort((x, y) =>
          y.createdAt.localeCompare(x.createdAt)
        );
        return {
          ...prev,
          notifications: restored,
          deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => !ids.has(id)),
        };
      });
      dispatchToastError(clearedIds.length === 1 ? "Couldn't clear the notification" : "Couldn't clear notifications", 'Check your connection and try again.');
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Clears every read notice in the inbox window. */
  const clearReadNotifications = useCallback(() => {
    clearNotifications((get().notifications || []).filter((n) => n.read).map((n) => n.id));
    // False positive: get is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNotifications]);

  /** Fetches the inbox again (the panel's Retry). */
  const refreshNotifications = useCallback(() => {
    setNotificationsStatus((s) => (s === 'ready' ? s : 'loading'));
    return notificationsRefreshRef.current?.() ?? Promise.resolve();
  }, []);

  /** Fetches partnerships, invites and challenges again (the Partners page's Retry). */
  const refreshPartners = useCallback(() => {
    setPartnersStatus('loading');
    return partnersRefreshRef.current?.() ?? Promise.resolve();
  }, []);

  // Multi-user Competitor League Helper
  const getLeagueData = useCallback(
    (type: LeagueType) => {
      const now = leagueNow();
      let userPoints: number;
      if (type === 'ninetyDay') {
        userPoints = getEffectiveSeasonPoints(state, now);
      } else {
        const start = getLeaguePeriodStart(type, now);
        userPoints = calculatePeriodPoints(state.pointsHistory, start, now, state.totalPoints);
      }

      // The same builder writes the profile's legacy stats; the card itself comes from the server (ascend_member_card).
      const userStats = {
        ...buildMemberStats(state, { today: todayKey(), seasonStartMs: getSeasonStart(now).getTime() }),
        // Own trophy cabinet: the same closed-season scores other members read from the profile.
        season_history: toSeasonHistory(state.leagueArchives),
      };

      const competitors = generateCompetitors(
        type,
        userPoints,
        state.currentUser,
        state.username,
        state.totalPoints,
        userStats,
        undefined,
        now
      );
      const userRank = getUserRank(competitors);
      return { competitors, userRank, userPoints };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.pointsHistory,
      state.habits,
      state.workouts,
      state.libraryBooks,
      state.readingLogs,
      state.badHabits,
      state.badHabitLogs,
      state.skillLogs,
      state.journalEntries,
      state.currentUser,
      state.username,
      state.totalPoints,
      state.seasonId,
      state.leagueArchives,
      leagueDataVersion,
    ]
  );

  return {
    getLeagueData,
    markNotificationRead,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    clearReadNotifications,
    refreshNotifications,
    refreshPartners,
  };
}
