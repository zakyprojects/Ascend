import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppState,
  UserProfile,
  Partnership,
  SharedChallenge,
  AppNotification,
} from '@/types';
import { DEFAULT_STATE } from '@/types';
import { isDeviceOffline } from './deviceOffline';
import { dispatchToastError } from './storeShared';
import { uid, generateNumericUID, todayKey, getNow, getNextDateKey, formatWeekdayDate } from './dates';
import { singleFlight } from './singleFlight';
import { reconcileSharedChallengeLifecycle, mergeSharedChallenge, pactTickRefused, type LinkedPactTick,} from './pactLifecycle';
import { pauseStoredSessionsForSignOut } from './focusSession';
import {
  leagueNow,
  syncSeasonConfig,
} from './leagueTime';
import {
  logoutUser,
  deleteOwnAccount,
  clearLocalUserData,
  setCachedProfiles,
  setCachedSeasonPoints,
  setCachedLeaguePoints,
} from './auth';
import { useTimeTrackerActions } from './useTimeTrackerActions';
import { useWorkoutActions } from './useWorkoutActions';
import { useJournalActions } from './useJournalActions';
import { useRecoveryActions } from './useRecoveryActions';
import { usePfcActions } from './usePfcActions';
import { useSkillActions } from './useSkillActions';
import { useWeeklyGoalActions } from './useWeeklyGoalActions';
import { useProjectActions } from './useProjectActions';
import { useProfileActions } from './useProfileActions';
import { useHabitActions } from './useHabitActions';
import { useBadHabitActions } from './useBadHabitActions';
import { useReadingActions } from './useReadingActions';
import { usePlanActions } from './usePlanActions';
import { usePartnerActions } from './usePartnerActions';
import { useNotificationActions } from './useNotificationActions';
import { hydrateUserSession } from './authSession';
import { sanitizeLoadedState } from './loadedState';
import { reconcileWeeklyGoalsPointsForAllWeeks, reconcileLinkedWeeklyGoals,} from './weeklyGoalPoints';
import { withHydratedPoints } from './stateAwards';
import { createLeagueStandingsRefresher, leaguePeriodKey } from './leagueStandingsRefresh';
import { clockReady, trustedNow, trustedNowMs } from './clock';
import { hasStateData, isGuardedKey } from './dataWeight';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  fetchUserDataWithStatusFromSupabase,
  getUserDataWatermark,
  setUserDataWatermark,
  resetUserDataWatermark,
  lowerUserDataWatermark,
  saveUserDataToSupabase,
  fetchLeagueBoardsFromSupabase,
  fetchPartnerInvitesSupabase,
  fetchPartnershipsSupabase,
  saveSharedChallengeSupabase,
  type SharedChallengeSaveResult,
  fetchSharedChallengesSupabase,
  cleanupPendingInvitesBetweenUsersSupabase,
  fetchNotificationsSupabase,
  storedAuthSession,
  hasSessionFor,
} from './supabase';
import { GuardBlockedError, SessionLostError } from './errors';
import { SYNC_BEHIND_EVENT, SYNC_VERSIONS_EVENT, flushOutbox, hasPendingSyncOps, readBaseline, recordSyncedChanges } from './sync/outbox';
import { setTabSyncedHashes, storeTabSyncedHashes, tabSyncedHashes, type Baseline } from './sync/tabVersions';
import { noteEditTimes } from './sync/editTimes';
import { clearDirtyAfterSave, dirtyMark, markDirty } from './sync/dirtyFlag';
import { adoptTabState, applyRemoteChanges, prepareRemoteRows, pullSyncedRows, takePeerVersions, type RemoteChange } from './sync/pull';
import { SYNCED_COLLECTIONS, cacheWithHydratedCollections, itemsOf, rowIdOf, syncKeyOf } from './sync/syncedCollections';
import { mergeAppState, mergeAppStateWithGuardResult, signInMergeBase } from './stateMerger';
import { toUserMessage } from './userMessage';
import { disablePush } from './push';
import { keepIfUnchanged } from './stateEquality';
import {
  applyTheme,
  deviceThemeFields,
  resolveTheme,
  setLocalThemePreference,
  useSystemTheme,
} from './theme';

// Cross-tab real-time state synchronization channel
export const STATE_SYNC_CHANNEL_NAME = 'ascend-state-sync';

// Global in-flight pledge request lock to prevent double-click race conditions
const pendingPledgeRequests = new Set<string>();
/** How many times a day a linked pact's failed save is resent (while online) before it waits for tomorrow. */
const PACT_RETRY_LIMIT = 3;

export interface StateSyncMessage {
  type: 'ASCEND_STATE_SYNC';
  senderTabId: string;
  userId?: string;
  state: AppState;
  /** The sender's row versions for this state (tabSyncedHashes); absent from older app versions. */
  syncHashes?: Baseline;
  timestamp: number;
}

/** A tab's row versions after its save (SYNC_VERSIONS_EVENT); the other tabs take the ones they hold. */
export interface SyncVersionsMessage {
  type: 'ASCEND_SYNC_VERSIONS';
  senderTabId: string;
  userId: string;
  syncHashes: Baseline;
}

export function broadcastStateToTabs(state: AppState, senderTabId: string) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(STATE_SYNC_CHANNEL_NAME);
    const msg: StateSyncMessage = {
      type: 'ASCEND_STATE_SYNC',
      senderTabId,
      userId: state.currentUser?.id,
      state,
      ...(state.currentUser?.id ? { syncHashes: tabSyncedHashes(state.currentUser.id) } : {}),
      timestamp: trustedNowMs(),
    };
    channel.postMessage(msg);
    channel.close();
  } catch (e) {
    /* ignore BroadcastChannel errors */
  }
}

const GUEST_STORAGE_KEY = 'ascend_guest_state_v2';
/**
 * Writes the account's device cache. The tab's synced row versions are stored with it, so the cached
 * state keeps the versions it was built on (sync/tabVersions). Throws what localStorage throws.
 */
function writeUserDeviceCache(userId: string, cached: AppState): void {
  localStorage.setItem(`ascend_user_cache_${userId}`, JSON.stringify(cached));
  storeTabSyncedHashes(userId);
}
/** How long the boot loader waits on a saved sign-in before offering Retry (offline). */
const STORED_SESSION_WAIT_MS = 8000;
// The "Clear older logs" caps live in clearLimits.ts; re-exported here for the views.
export { CLEAR_WORKOUTS_MAX, CLEAR_SKILL_LOGS_MAX, CLEAR_CRAVING_LOGS_MAX } from './clearLimits';

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        ...deviceThemeFields(),
      };
    }
    // The saved guest theme (normalized there), else this device's.
    return sanitizeLoadedState(JSON.parse(raw), null);
  } catch {
    return {
      ...DEFAULT_STATE,
      ...deviceThemeFields(),
    };
  }
}

async function persistState(state: AppState, options?: { allowDestructiveWipe?: boolean }): Promise<void> {
  if (state.currentUser?.id) {
    await saveUserDataToSupabase(state.currentUser.id, state, options);
    // Clean up local guest storage key once session is authenticated
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } else {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  }
}

/**
 * Every point entry is the server's (20261015250000). The hydrated state already holds exactly the
 * server's rows (the boot table read drops app previews the server never wrote), so after the boot
 * merge with this device's cache only those rows stay; otherwise a rejected preview (a past-day
 * tick, a waiting timezone change) would come back from the cache on every reload. An empty
 * hydrated ledger is not trusted (a failed or missing read), and the merge is kept as it is.
 */
/**
 * The user's own items still on this device whose rows the server deleted (on another device):
 * applying these changes removes them here. This device's own deletes are already gone from it.
 */
function countRemoteRemovals(state: AppState, changes: RemoteChange[]): number {
  return changes.filter((change) => {
    if (change.item !== null || !change.id || !isGuardedKey(change.key)) return false;
    const collection = SYNCED_COLLECTIONS.find((c) => syncKeyOf(c) === change.key);
    return Boolean(collection && itemsOf(collection, state).some((item) => rowIdOf(collection, item) === change.id));
  }).length;
}

export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(loadInitialState);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // True while a sign-in made after the initial check (login, sign-up, guest) loads the user's data.
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  // The inbox's first fetch this session: 'loading' until it answers, 'failed' when it could not
  // (offline or a server error; the list on screen stays), 'ready' after a good fetch.
  const [notificationsStatus, setNotificationsStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const notificationsRefreshRef = useRef<(() => Promise<void>) | null>(null);
  // Partners page: whether partnerships, invites and challenges came back from the last fetch.
  const [partnersStatus, setPartnersStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const partnersRefreshRef = useRef<(() => Promise<void>) | null>(null);
  // Our own pact tick/untick writes, per challenge. A partner snapshot read while one was on its
  // way (or before it) would put the old done-dates back on screen, so it is held back for that
  // pact and one refresh runs once the writes settle. A sequence counter, not a clock.
  const pledgeWriteSeq = useRef(0);
  const pledgeWrites = useRef(new Map<string, { inFlight: number; lastSeq: number; skipped: boolean }>());
  const trackPledgeWrite = useCallback(<T>(challengeId: string, write: Promise<T>): Promise<T> => {
    const entry = pledgeWrites.current.get(challengeId) ?? { inFlight: 0, lastSeq: 0, skipped: false };
    pledgeWrites.current.set(challengeId, entry);
    entry.inFlight++;
    entry.lastSeq = ++pledgeWriteSeq.current;
    return write.finally(() => {
      entry.inFlight--;
      entry.lastSeq = ++pledgeWriteSeq.current;
      if (entry.inFlight === 0 && entry.skipped) {
        entry.skipped = false;
        void partnersRefreshRef.current?.();
      }
    });
  }, []);
  // A pact save answers with the row the server stored. The guard takes the viewer's tick only for
  // today in their profile time zone (and none on a finished pact), so a tick for another device
  // day (after a time-zone change the account's day never goes back, or a wrong device clock) is left out: the stored row is shown instead, with one toast per pact per day naming why.
  // Skipped while another write for the pact is on its way (that one answers with a newer row).
  const pactRefusedToastOn = useRef(new Map<string, string>());
  const settlePactSave = useCallback(
    (sent: SharedChallenge, result: SharedChallengeSaveResult, isUser1: boolean): boolean => {
      const { stored, serverToday } = result;
      if (!stored || (pledgeWrites.current.get(sent.id)?.inFlight ?? 0) > 0) return false;
      const deviceToday = todayKey();
      const refused = pactTickRefused(sent, stored, isUser1, deviceToday);
      if (!refused) return false;
      setState((prev) => ({
        ...prev,
        sharedChallenges: (prev.sharedChallenges || []).map((c) => (c.id === sent.id ? mergeSharedChallenge(c, stored) : c)),
      }));
      syncBroadcaster.broadcast('CHALLENGE_UPDATED', stored);
      if (pactRefusedToastOn.current.get(sent.id) !== deviceToday) {
        pactRefusedToastOn.current.set(sent.id, deviceToday);
        dispatchToastError(
          `"${sent.title}" didn't change`,
          serverToday && serverToday !== deviceToday
            ? `Your device's date (${formatWeekdayDate(deviceToday)}) isn't your account's date (${formatWeekdayDate(serverToday)}), so this couldn't be saved. It works again once both dates match.`
            : 'This challenge has ended, so its days no longer change.'
        );
      }
      return true;
    },
    // False positive: setState is stable; everything else is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Habit-linked pacts follow their habit (planLinkedPactRepairs, run every minute): pacts that
  // differed from their habit on the last pass, the day of each pact's last repair, and pacts whose
  // save from a habit tick failed (resent until it goes through, at most PACT_RETRY_LIMIT times a day).
  const pactDiverged = useRef(new Set<string>());
  const pactRepairedOn = useRef(new Map<string, string>());
  const pactRetry = useRef(new Map<string, { day: string; failures: number }>());
  // Saves the pacts a habit change ticked (tickPactsLinkedTo), after the state update. `saved`
  // names what is already kept when a pact save fails (the pact is resent by the linked-pact pass).
  const sendLinkedPactTicks = useCallback(
    (ticks: readonly LinkedPactTick[], saved: string) => {
      for (const { updated, isUser1 } of ticks) {
        trackPledgeWrite(updated.id, saveSharedChallengeSupabase(updated)).then(
          (result) => {
            pactRetry.current.delete(updated.id);
            settlePactSave(updated, result, isUser1);
          },
          (err) => {
            console.error('Failed to sync a habit-linked shared challenge:', err);
            // The habit is saved (outbox); the pact keeps the tick on screen and is resent
            // by the linked-pact pass until the server has it.
            pactRetry.current.set(updated.id, { day: todayKey(), failures: 0 });
            dispatchToastError("Challenge tick didn't save", `${saved} "${updated.title}" will try again soon.`);
          }
        );
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
      }
    },
    [trackPledgeWrite, settlePactSave]
  );
  // The initial check found no session while this device still holds a saved sign-in (a phone's
  // network not ready yet): the boot loader stays up until Supabase signs it in or drops it, rather
  // than flashing the sign-in page. 'failed' once that takes too long (offline).
  const [storedSessionWait, setStoredSessionWait] = useState<'idle' | 'waiting' | 'failed'>('idle');
  const storedSessionWaitRef = useRef(false);
  const storedSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydrated = useRef(false);
  // The signed-in account's data came from the server this session: hydration finished and every
  // synced table was read (at boot, or by a later pull if a boot read failed). A device cache alone
  // never sets it, so moments that compare against saved memory (the rank-up) wait for it.
  const [isServerDataApplied, setIsServerDataApplied] = useState(false);
  const canPersistLocally = useRef(false);
  const authGenerationRef = useRef(0);
  const currentUserRef = useRef<UserProfile | null>(state.currentUser);
  // The SIGNED_OUT handling of the auth listener, also run for a sign-in that died without that event.
  const applySignedOutRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  // Work that reads what a setState updater decided runs here, after the commit that ran the
  // updater: React 18 runs most updaters during the next render, not inside the setState call, so
  // a value assigned in an updater is still empty on the next line. Declared before the other
  // effects so queued work runs first in the same commit.
  const afterCommitQueue = useRef<Array<() => void>>([]);
  const afterCommit = useCallback((fn: () => void) => {
    afterCommitQueue.current.push(fn);
  }, []);
  useEffect(() => {
    if (afterCommitQueue.current.length === 0) return;
    const queued = afterCommitQueue.current;
    afterCommitQueue.current = [];
    for (const fn of queued) fn();
  });

  /**
   * The app shows an account whose sign-in this tab no longer holds (storage cleared outside the
   * app, or a sign-out elsewhere this tab never heard of): show it signed out, as SIGNED_OUT would.
   * A refresh token still on the device means Supabase is only waiting to refresh it (offline), so
   * nothing changes then. Unsaved changes stay in the account's device cache and are merged and
   * saved at its next sign-in.
   */
  const checkLostSession = useCallback(async () => {
    const userId = currentUserRef.current?.id;
    if (!userId || !isHydrated.current || storedSessionWaitRef.current) return;
    if (await hasSessionFor(userId)) return;
    if (storedAuthSession()) return;
    if (currentUserRef.current?.id !== userId) return;
    console.warn('[AUTH] Sign-in for this account is gone from this tab; showing it signed out.');
    applySignedOutRef.current?.();
  }, []);
  const get = useCallback(() => stateRef.current, []);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimer = useRef<number | null>(null);
  const pendingImmediateResolvers = useRef<
    Array<{
      resolve: () => void;
      reject: (err: unknown) => void;
      actionLabel?: string;
      entityId?: string;
    }>
  >([]);
  const isLoggingOutRef = useRef(false);
  // Set while the account is being deleted on the server: no new autosave starts, and a save that
  // fails in that window stays silent (the account is going away).
  const isClosingAccountRef = useRef(false);
  const lastPersistedStateRef = useRef<AppState>(state);
  /** The state the edit-time scan last saw (noteEditTimes compares item objects with it). */
  const editScanStateRef = useRef<AppState | null>(null);
  const lastKnownGoodStateRef = useRef<AppState>(state);

  // Other members' standings live in module caches (auth.ts); this version re-renders league views
  // when a refresh writes them.
  const [leagueDataVersion, setLeagueDataVersion] = useState(0);
  const [leagueRefresher] = useState(() =>
    createLeagueStandingsRefresher({
      sessionUserId: async () =>
        isSupabaseConfigured ? (await supabase.auth.getSession()).data?.session?.user?.id ?? null : null,
      fetchBoards: fetchLeagueBoardsFromSupabase,
      now: leagueNow,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      apply: ({ profiles, points, seasonPoints }) => {
        if (profiles) setCachedProfiles(profiles);
        // A live poll moves the season board with week and month (full sets carry it in profiles).
        else if (seasonPoints) setCachedSeasonPoints(seasonPoints);
        if (points) setCachedLeaguePoints(points);
        setLeagueDataVersion((v) => v + 1);
      },
      onStatusChange: () => setLeagueDataVersion((v) => v + 1),
    })
  );
  /** Refetches other members' standings; `full` skips the 15 s throttle (sign-in, new period). */
  const refreshLeagueStandings = leagueRefresher.refresh;
  /**
   * Whether other members' standings are in for this sign-in: 'ready' after a full fetch for the
   * current member, 'failed' when the last attempt (or being offline) left none, else 'loading'.
   * Read live each render; leagueDataVersion re-renders on every change.
   */
  const currentUserId = state.currentUser?.id ?? null;
  const getLeagueStandingsStatus = useCallback((): 'loading' | 'ready' | 'failed' => {
    const fetchedFor = leagueRefresher.fetchedUserId();
    if (fetchedFor && fetchedFor === currentUserId) return 'ready';
    if (leagueRefresher.isRefreshing()) return 'loading';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline || leagueRefresher.lastAttemptFailed() ? 'failed' : 'loading';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueRefresher, currentUserId, leagueDataVersion]);
  /** Sign-out: the next account must not see this viewer's standings. */
  const clearLeagueStandings = useCallback(() => {
    leagueRefresher.reset();
    setCachedProfiles([]);
    setCachedLeaguePoints(null);
    setLeagueDataVersion((v) => v + 1);
  }, [leagueRefresher]);

  const [destructiveWipeModal, setDestructiveWipeModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    stateToRetry: AppState;
    stateBeforeAction: AppState;
  } | null>(null);
  const [isSavingDestructiveWipe, setIsSavingDestructiveWipe] = useState(false);

  // Write-serialization queue: guarantees sequential execution of persistState calls
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueuePersist = useCallback(
    (stateToPersist: AppState, options?: { allowDestructiveWipe?: boolean }): Promise<void> => {
      let callResolve!: () => void;
      let callReject!: (err: unknown) => void;
      const callerPromise = new Promise<void>((resolve, reject) => {
        callResolve = resolve;
        callReject = reject;
      });

      // This tab's row versions as they stand with this state: the diff compares with these even if
      // a pull or a broadcast moves them before the save gets there.
      const persistUserId = stateToPersist.currentUser?.id;
      const versionsAtStart = persistUserId ? tabSyncedHashes(persistUserId) : undefined;

      writeQueueRef.current = writeQueueRef.current
        .catch(() => {
          // Isolate queue failures: prior failure does not prevent subsequent writes
        })
        .then(async () => {
          try {
            await persistState(stateToPersist, options);
            lastKnownGoodStateRef.current = stateToPersist;
            // Mirror what the blob accepted into the relational tables (DB normalization S2).
            recordSyncedChanges(stateToPersist, versionsAtStart);
            callResolve();
          } catch (err) {
            callReject(err);
            // Re-throw so downstream catch catches, but queue next tick remains unblocked
            throw err;
          }
        });

      writeQueueRef.current.catch(() => {}); // Suppress console-level unhandled rejection on stored ref; caller still gets real error via callerPromise

      return callerPromise;
    },
    []
  );

  const handleConfirmDestructiveWipe = useCallback(async () => {
    if (!destructiveWipeModal?.stateToRetry) {
      setDestructiveWipeModal(null);
      return;
    }
    // Drop the items its own tombstones remove, as the save itself does: keeping them in the
    // cache and on screen brought the same prompt back on the next load.
    const stateToSave = mergeAppState(destructiveWipeModal.stateToRetry, destructiveWipeModal.stateToRetry, 'writeSync');
    setIsSavingDestructiveWipe(true);
    try {
      await enqueuePersist(stateToSave, { allowDestructiveWipe: true });
      lastPersistedStateRef.current = stateToSave;
      lastKnownGoodStateRef.current = stateToSave;
      setStateRaw(stateToSave);
      if (typeof window !== 'undefined') {
        try {
          if (stateToSave.currentUser?.id) {
            writeUserDeviceCache(stateToSave.currentUser.id, stateToSave);
            localStorage.removeItem(`ascend_dirty_${stateToSave.currentUser.id}`);
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stateToSave));
          }
        } catch {
          /* ignore */
        }
      }
      if (stateToSave.currentUser?.id) {
        resetUserDataWatermark(stateToSave.currentUser.id, stateToSave);
      }
      setDestructiveWipeModal(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-success', {
            detail: {
              title: 'Changes saved',
              message: 'Your changes are saved.',
            },
          })
        );
      }
    } catch (err: any) {
      console.error('[CONFIRM DESTRUCTIVE SAVE] Error persisting confirmed state:', err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-error', {
            detail: {
              title: "Couldn't save your changes",
              message: toUserMessage(err, "Your changes weren't saved. Try again."),
            },
          })
        );
      }
    } finally {
      setIsSavingDestructiveWipe(false);
    }
  }, [destructiveWipeModal, enqueuePersist]);

  const handleCancelDestructiveWipe = useCallback(() => {
    if (destructiveWipeModal?.stateBeforeAction) {
      const preDeleteState = destructiveWipeModal.stateBeforeAction;
      lastPersistedStateRef.current = preDeleteState;
      lastKnownGoodStateRef.current = preDeleteState;
      setStateRaw(preDeleteState);
      if (typeof window !== 'undefined') {
        try {
          if (preDeleteState.currentUser?.id) {
            writeUserDeviceCache(preDeleteState.currentUser.id, preDeleteState);
            localStorage.removeItem(`ascend_dirty_${preDeleteState.currentUser.id}`);
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(preDeleteState));
          }
        } catch {
          /* ignore */
        }
      }
    }
    setDestructiveWipeModal(null);
  }, [destructiveWipeModal]);

  // Cross-tab synchronization tracking
  const tabId = useRef<string>(Math.random().toString(36).substring(2) + trustedNowMs().toString(36)).current;
  const isRemoteBroadcastUpdate = useRef(false);
  const inFlightHabitToggles = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  // `immediate` saves at once instead of debouncing. Deletes start that save but do not wait for
  // it: the change is local and mirrored at once, a failed save shows its own toast, and the
  // dirty flag retries it on reconnect.
  const setState = useCallback(
    (
      updater: AppState | ((prev: AppState) => AppState),
      options?: { immediate?: boolean; actionLabel?: string; entityId?: string }
    ) => {
      let immediatePromise: Promise<void> | undefined;
      if (options?.immediate) {
        let callResolve!: () => void;
        let callReject!: (err: unknown) => void;
        immediatePromise = new Promise<void>((resolve, reject) => {
          callResolve = resolve;
          callReject = reject;
        });
        const entry = {
          resolve: callResolve,
          reject: callReject,
          actionLabel: options.actionLabel,
          entityId: options.entityId,
        };
        pendingImmediateResolvers.current.push(entry);
        // Suppress unhandled rejection on the promise itself so non-awaiting callers never produce console warnings
        immediatePromise.catch(() => {});
        setStateRaw((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          // An update that changes nothing has nothing to save. React skips that render, so the
          // save effect never runs for it: settle its wait here. Safe to run twice (StrictMode).
          if (next === prev) {
            const index = pendingImmediateResolvers.current.indexOf(entry);
            if (index !== -1) pendingImmediateResolvers.current.splice(index, 1);
            entry.resolve();
          }
          return next;
        });
        return immediatePromise;
      }
      setStateRaw(updater);
      return immediatePromise;
    },
    []
  );

  // Relational tables (DB normalization): send pending ops first, then merge server rows into state.
  const syncTables = useCallback(
    async (userId: string, full: boolean) => {
      await flushOutbox(userId);
      const { changes, everyTableRead } = await pullSyncedRows(userId, full);
      const applied = everyTableRead && isHydrated.current && currentUserRef.current?.id === userId;
      if (changes.length > 0) {
        lowerUserDataWatermark(userId, countRemoteRemovals(stateRef.current, changes));
        setState((prev) => (prev.currentUser?.id === userId ? applyRemoteChanges(prev, changes, userId) : prev));
      }
      if (applied) setIsServerDataApplied(true);
    },
    [setState]
  );

  // A save held back old copies (another tab of this browser synced newer rows first): pull, so
  // this tab shows the newer rows. At most once per 15 s, so a copy that cannot be replaced never loops.
  // The server refused rows this device sent (a newer edit is there): pull at once to show it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastPull = 0;
    const onBehind = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; refused?: boolean }>).detail;
      const userId = detail?.userId;
      if (!userId || userId !== currentUserRef.current?.id || !isHydrated.current || isDeviceOffline()) return;
      // Rows the server refused are re-read once and then forgotten, so that pull never loops.
      if (!detail?.refused && trustedNowMs() - lastPull < 15_000) return;
      lastPull = trustedNowMs();
      void syncTables(userId, false);
    };
    window.addEventListener(SYNC_BEHIND_EVENT, onBehind);
    return () => window.removeEventListener(SYNC_BEHIND_EVENT, onBehind);
  }, [syncTables]);

  // Live updates from the user's other devices.
  const syncedUserId = state.currentUser?.id;
  useEffect(() => {
    if (!syncedUserId || !isSupabaseConfigured) return;
    // The name is matched by ACCOUNT_CHANNEL_TOPIC in auth.ts (closed before sign-out).
    let channel = supabase.channel(`synced_tables_${syncedUserId}`);
    for (const collection of SYNCED_COLLECTIONS) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: collection.table, filter: `user_id=eq.${syncedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || !row.id) return;
          const changes = prepareRemoteRows(syncedUserId, collection, [row]);
          if (changes.length === 0) return;
          lowerUserDataWatermark(syncedUserId, countRemoteRemovals(stateRef.current, changes));
          setState((prev) =>
            prev.currentUser?.id === syncedUserId ? applyRemoteChanges(prev, changes, syncedUserId) : prev
          );
        }
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncedUserId, setState]);

  // FIX 1: Frontend Cross-Tab Sync via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel(STATE_SYNC_CHANNEL_NAME);

    // This tab's versions after a save go to the other tabs (older app versions ignore the message).
    const onVersions = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; hashes?: Baseline }>).detail;
      if (!detail?.userId || !detail.hashes) return;
      const msg: SyncVersionsMessage = { type: 'ASCEND_SYNC_VERSIONS', senderTabId: tabId, userId: detail.userId, syncHashes: detail.hashes };
      try {
        channel.postMessage(msg);
      } catch {
        /* ignore BroadcastChannel errors */
      }
    };
    window.addEventListener(SYNC_VERSIONS_EVENT, onVersions);

    channel.onmessage = (event: MessageEvent<StateSyncMessage | SyncVersionsMessage>) => {
      const data = event.data;
      if (data?.type === 'ASCEND_SYNC_VERSIONS') {
        const userId = currentUserRef.current?.id;
        if (data.senderTabId === tabId || !userId || data.userId !== userId || !data.syncHashes) return;
        // Versions only, never state: a row held with exactly the sender's synced content is in step.
        const mine = tabSyncedHashes(userId);
        const next = takePeerVersions(stateRef.current, mine, data.syncHashes);
        if (next !== mine) setTabSyncedHashes(userId, next);
        return;
      }
      if (!data || data.type !== 'ASCEND_STATE_SYNC') return;
      if (data.senderTabId === tabId) return; // Ignore own broadcast

      const incomingUserId = data.userId;
      const currentUserId = currentUserRef.current?.id;

      // Only between tabs of the same account: a signed-out tab, or one still holding another
      // account, must not take in a state that is not its own.
      if (!currentUserId || incomingUserId !== currentUserId) {
        return;
      }

      if (!data.state) return;

      // A tab still running an app version from before row versions (no syncHashes): its state can
      // hold old copies, and taken as is, this tab would upload them as edits. Not taken; its saves
      // reach this tab through the server instead.
      if (!data.syncHashes) {
        window.dispatchEvent(new CustomEvent(SYNC_BEHIND_EVENT, { detail: { userId: currentUserId } }));
        return;
      }

      // Pacts this tab is still saving a tick to: the other tab's copy may predate it, so ours stays
      // on screen and the refresh after our write settles brings in the rest (as for realtime rows).
      const pledgesInFlight = new Set<string>();
      for (const [challengeId, write] of pledgeWrites.current) {
        if (write.inFlight > 0) {
          write.skipped = true;
          pledgesInFlight.add(challengeId);
        }
      }

      isRemoteBroadcastUpdate.current = true;
      setStateRaw((current) => {
        // When receiving a state broadcast from another tab, that tab's state is the authoritative
        // recent snapshot of user mutations. Set directly to prevent un-deleting items via union merge.
        // Except synced rows the sender still held at an older version (it saved before its pull
        // caught up): those keep this tab's newer copy, so an old copy never spreads to this tab.
        const adopted = adoptTabState(
          data.state,
          data.syncHashes,
          current,
          readBaseline(currentUserId),
          tabSyncedHashes(currentUserId)
        );
        setTabSyncedHashes(currentUserId, adopted.tabHashes);
        let targetState = adopted.state;
        if (pledgesInFlight.size > 0 && Array.isArray(targetState.sharedChallenges)) {
          const ours = new Map((current.sharedChallenges || []).map((c) => [c.id, c]));
          targetState = {
            ...targetState,
            sharedChallenges: targetState.sharedChallenges.map((c) =>
              pledgesInFlight.has(c.id) ? ours.get(c.id) ?? c : c
            ),
          };
        }
        return targetState;
      });
    };

    return () => {
      window.removeEventListener(SYNC_VERSIONS_EVENT, onVersions);
      channel.close();
    };
  }, [tabId]);

  // FIX 3: Network Reconnection & Tab Focus Sync (with Anti-Spam Throttle)
  const lastSyncTimeRef = useRef<number>(trustedNowMs());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isSyncing = false;
    const SYNC_THROTTLE_MS = 180000; // 3 minutes

    const handleReconnectAndSync = async (force = false) => {
      // Offline every request below fails; the online event forces this sync on return.
      if (isSyncing || isDeviceOffline()) return;
      const now = trustedNowMs();
      if (!force && now - lastSyncTimeRef.current < SYNC_THROTTLE_MS) {
        return;
      }

      const userId = currentUserRef.current?.id;
      if (!userId || !isHydrated.current || !isSupabaseConfigured) return;
      void syncTables(userId, false);

      try {
        isSyncing = true;
        const serverRes = await fetchUserDataWithStatusFromSupabase(userId);
        if (serverRes.exists && serverRes.state) {
          lastSyncTimeRef.current = trustedNowMs();
          setStateRaw((current) => {
            // Reconcile and union-merge server state with current state using mergeAppState
            // Tombstones (deletedEntityIds) prevent resurrecting deleted items while preserving offline progress
            const serverState = serverRes.state!;
            // Nothing new on the server: keep the same state, so no save starts.
            const merged = keepIfUnchanged(
              current,
              reconcileWeeklyGoalsPointsForAllWeeks(
                reconcileLinkedWeeklyGoals(
                  mergeAppState(serverState, current, 'hydration'),
                  getNow()
                ),
                getNow()
              )
            );
            setUserDataWatermark(userId, merged);
            lastKnownGoodStateRef.current = merged;
            return merged;
          });
        }
      } catch (e) {
        console.error('[SYNC] Error syncing state on reconnection/visibility:', e);
      } finally {
        isSyncing = false;
        // OUTBOUND RETRY PUSH: the dirty flag stays set until a save succeeds, so changes made
        // offline (or a save that failed) are pushed whether or not the inbound fetch worked.
        if (localStorage.getItem(`ascend_dirty_${userId}`)) {
          setState((prev) => ({ ...prev }), { immediate: true, actionLabel: 'Pending changes' });
        }
      }
    };

    const onOnline = () => {
      // Force immediate sync upon network reconnection
      handleReconnectAndSync(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Throttled sync when returning to tab
        handleReconnectAndSync(false);
      }
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Every state this tab shows, before it is cached: an edit gets its time now, so it is uploaded
    // with it even if the save only runs after a reconnect or a reopen (sync/editTimes.ts).
    const scanUserId = state.currentUser?.id;
    if (scanUserId && typeof window !== 'undefined') {
      try {
        noteEditTimes(scanUserId, editScanStateRef.current, state, trustedNow().toISOString());
      } catch {
        /* storage unavailable: the save stamps the upload time, as before */
      }
    }
    editScanStateRef.current = state;

    if (isRemoteBroadcastUpdate.current) {
      // This state update was synced from another tab via BroadcastChannel.
      // Skip duplicate persistence and re-broadcast.
      isRemoteBroadcastUpdate.current = false;
      lastPersistedStateRef.current = state;
      return;
    }

    lastPersistedStateRef.current = state;

    if (canPersistLocally.current) {
      // Synchronous, network-independent local-mirror write for resilient offline reload and debounce-window protection
      if (typeof window !== 'undefined') {
        try {
          if (state.currentUser?.id) {
            const uid = state.currentUser.id;
            writeUserDeviceCache(uid, state);
            if (hasStateData(state)) {
              markDirty(uid);
            }
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
          }
        } catch {
          /* ignore quota/security error */
        }
      }

      // Broadcast state to all other tabs immediately
      broadcastStateToTabs(state, tabId);
    }

    if (isHydrated.current) {
      if (pendingImmediateResolvers.current.length > 0) {
        const resolversToDrain = [...pendingImmediateResolvers.current];
        pendingImmediateResolvers.current = [];
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        // A change made while this save runs sets a new mark, and keeps the flag for its own save.
        const dirtyAtSave = state.currentUser?.id ? dirtyMark(state.currentUser.id) : null;
        enqueuePersist(state)
          .then(() => {
            if (typeof window !== 'undefined' && state.currentUser?.id) {
              clearDirtyAfterSave(state.currentUser.id, dirtyAtSave);
            }
            resolversToDrain.forEach(({ resolve }) => resolve());
          })
          .catch((err) => {
            resolversToDrain.forEach(({ reject }) => reject(err));
            if (err instanceof SessionLostError) {
              // Not a connection problem: kept on the device (dirty flag); no toast.
              void checkLostSession();
              return;
            }
            if (isClosingAccountRef.current) {
              console.warn('[AUTOSAVE IMMEDIATE] Save failed while the account is being deleted:', err);
              return;
            }
            console.error('[AUTOSAVE IMMEDIATE] Failed to persist state:', err);
            if (typeof window !== 'undefined') {
              const isGuard = err instanceof GuardBlockedError;

              // If guard triggered a destructive wipe or abnormal drop, route to confirmation modal instead of a dead-end toast
              if (isGuard && (err.requiresConfirmation || err.code === 'ZERO_OUT_WIPE' || err.code === 'ABNORMAL_DROP')) {
                const isZeroOut = err.code === 'ZERO_OUT_WIPE';
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : 'This removes most of your tracked items. Save this change?',
                  stateToRetry: state,
                  stateBeforeAction: lastKnownGoodStateRef.current,
                });
                return;
              }

              // Collect distinct action labels
              const distinctLabels = Array.from(
                new Set(
                  resolversToDrain
                    .map((r) => r.actionLabel)
                    .filter((label): label is string => Boolean(label && label.trim()))
                )
              );

              // Distinct entity IDs for dedupKey if known
              const distinctEntityIds = Array.from(
                new Set(
                  resolversToDrain
                    .map((r) => r.entityId)
                    .filter((id): id is string => Boolean(id && id.trim()))
                )
              );

              let toastTitle: string;
              if (distinctLabels.length === 1) {
                toastTitle = isGuard
                  ? `${distinctLabels[0]} not saved`
                  : `${distinctLabels[0]} failed`;
              } else {
                toastTitle = isGuard ? 'Save stopped to protect your data' : "Couldn't save your changes";
              }

              const toastMessage = isGuard
                ? "This change would have erased a lot of your data, so we didn't save it. Nothing was lost."
                : "They're kept on this device for now. Check your connection.";

              const dedupKey =
                distinctEntityIds.length === 1
                  ? `${distinctLabels[0] || 'immediate'}_${distinctEntityIds[0]}`
                  : undefined;

              window.dispatchEvent(
                new CustomEvent('app-toast-error', {
                  detail: {
                    title: toastTitle,
                    message: toastMessage,
                    dedupKey,
                  },
                })
              );
              window.dispatchEvent(new CustomEvent('app-network-error'));
            }
          });
      } else if (!isLoggingOutRef.current && !isClosingAccountRef.current) {
        // A log-out already sent what was unsaved and is about to end the sign-in; a save started
        // now would reach the server after that and be refused. The same holds while the account
        // is being deleted.
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
          // The latest state, not the one this timer was set for: a broadcast taken in meanwhile
          // (it sets no timer of its own) holds newer rows, and saving the older copy over them
          // would send it as an edit. Another account's state never stands in.
          const latest = stateRef.current;
          const toSave = latest.currentUser?.id === state.currentUser?.id ? latest : state;
          const dirtyAtSave = toSave.currentUser?.id ? dirtyMark(toSave.currentUser.id) : null;
          try {
            await enqueuePersist(toSave);
            if (typeof window !== 'undefined' && toSave.currentUser?.id) {
              clearDirtyAfterSave(toSave.currentUser.id, dirtyAtSave);
            }
          } catch (err) {
            if (err instanceof SessionLostError) {
              // Not a connection problem: kept on the device (dirty flag); no toast.
              void checkLostSession();
              return;
            }
            if (isClosingAccountRef.current) {
              console.warn('[AUTOSAVE DEBOUNCED] Save failed while the account is being deleted:', err);
              return;
            }
            console.error('[AUTOSAVE DEBOUNCED] Failed to persist state:', err);
            if (typeof window !== 'undefined') {
              const isGuard = err instanceof GuardBlockedError;

              // If guard triggered a destructive wipe or abnormal drop, route to confirmation modal instead of a dead-end toast
              if (isGuard && (err.requiresConfirmation || err.code === 'ZERO_OUT_WIPE' || err.code === 'ABNORMAL_DROP')) {
                const isZeroOut = err.code === 'ZERO_OUT_WIPE';
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : 'This removes most of your tracked items. Save this change?',
                  stateToRetry: toSave,
                  stateBeforeAction: lastKnownGoodStateRef.current,
                });
                return;
              }

              window.dispatchEvent(
                new CustomEvent('app-toast-error', {
                  detail: {
                    title: isGuard ? 'Save stopped to protect your data' : "Couldn't save your changes",
                    message: isGuard
                      ? "This change would have erased a lot of your data, so we didn't save it. Nothing was lost."
                      : "They're kept on this device for now. Check your connection.",
                  },
                })
              );
              window.dispatchEvent(new CustomEvent('app-network-error'));
            }
          }
        }, 500);
      }
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tabId]);

  // Paint the theme (data-theme + browser bar colour); 'system' follows the device, live.
  const systemTheme = useSystemTheme();
  const resolvedTheme = resolveTheme(state.themePreference, systemTheme);
  useEffect(() => {
    applyTheme(resolvedTheme);
    setLocalThemePreference(state.themePreference ?? 'system');
  }, [state.themePreference, resolvedTheme, state.currentUser]);

  // Initial Supabase data load & auth listener (single source of truth for session state)
  useEffect(() => {
    let mounted = true;

    /** Starts (or continues) waiting on a saved sign-in; false when the device holds none. */
    const holdForStoredSession = (): boolean => {
      if (storedSessionWaitRef.current) return true;
      if (!storedAuthSession()) return false;
      storedSessionWaitRef.current = true;
      setStoredSessionWait('waiting');
      storedSessionTimerRef.current = setTimeout(() => {
        if (mounted) setStoredSessionWait('failed');
      }, STORED_SESSION_WAIT_MS);
      return true;
    };
    const endStoredSessionWait = () => {
      if (!storedSessionWaitRef.current) return;
      storedSessionWaitRef.current = false;
      if (storedSessionTimerRef.current) clearTimeout(storedSessionTimerRef.current);
      storedSessionTimerRef.current = null;
      setStoredSessionWait('idle');
    };

    async function initSupabaseData() {
      if (!isSupabaseConfigured) {
        if (mounted) setIsAuthChecking(false);
        return;
      }

      try {
        const [sessionRes] = await Promise.all([
          supabase.auth.getSession(),
          refreshLeagueStandings({ full: true }),
        ]);

        if (mounted) {
          if (!sessionRes.data?.session && !holdForStoredSession()) {
            setIsAuthChecking(false);
          }
        }
      } catch (e) {
        console.error('Error loading Supabase data:', e);
        if (mounted && !holdForStoredSession()) setIsAuthChecking(false);
      }
    }

    initSupabaseData();

    /** Leaves the signed-in account: guest state on screen, nothing more saved for the account. */
    const applySignedOut = () => {
      endStoredSessionWait();
      const myGeneration = ++authGenerationRef.current;
      clearLeagueStandings();

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      pendingImmediateResolvers.current = [];
      pledgeWrites.current.clear();
      pactDiverged.current.clear();
      pactRepairedOn.current.clear();
      pactRetry.current.clear();
      isHydrated.current = false;
      setIsServerDataApplied(false);
      canPersistLocally.current = false;
      currentUserRef.current = null;

      if (typeof window !== 'undefined') {
        try {
          // A running focus session is paused and kept for this account, never removed
          // (also for a sign-out from another device or an expired session).
          pauseStoredSessionsForSignOut();
          sessionStorage.removeItem('ascend_focus_tab_alive');
        } catch (e) {
          /* ignore */
        }
      }
      const deviceTheme = deviceThemeFields();
      const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      let guestState = DEFAULT_STATE;
      if (guestRaw) {
        try {
          guestState = JSON.parse(guestRaw);
        } catch {
          /* use default */
        }
      }
      const sanitized = sanitizeLoadedState(guestState, null);
      const nextGuestState: AppState = {
        ...sanitized,
        ...deviceTheme,
      };
      applyTheme(resolveTheme(deviceTheme.themePreference));
      if (myGeneration !== authGenerationRef.current) return;
      setState(nextGuestState);
      setIsAuthChecking(false);
      setIsSessionLoading(false);
    };
    applySignedOutRef.current = applySignedOut;

    // SINGLE SOURCE OF TRUTH: onAuthStateChange is the ONLY place that sets authenticated
    // app state. auth.ts functions (loginUser/signUpUser) only call Supabase Auth APIs and
    // return — they never hydrate state themselves. This eliminates the race condition.
    //
    // IMPORTANT: Do not use async/await directly in this callback — it deadlocks
    // signInWithPassword/signUp in the browser. Defer all async work via setTimeout.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          applySignedOut();
          return;
        }

        // A guest whose email link was opened elsewhere: the refreshed token says it is now a real
        // account, so it loads again as one (the same id, so nothing is merged or replaced).
        const guestBecameMember =
          event === 'TOKEN_REFRESHED' &&
          !!session?.user &&
          session.user.is_anonymous === false &&
          currentUserRef.current?.id === session.user.id &&
          currentUserRef.current?.isAnonymous === true;

        if (
          (event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'USER_UPDATED' ||
            guestBecameMember ||
            // A saved sign-in coming back by a token refresh (the auto-refresh tick) after the wait.
            (event === 'TOKEN_REFRESHED' && storedSessionWaitRef.current)) &&
          session?.user
        ) {
          endStoredSessionWait();
          if (event !== 'USER_UPDATED' && !guestBecameMember && isHydrated.current && currentUserRef.current?.id === session.user.id) {
            setIsAuthChecking(false);
            return;
          }

          const myGeneration = ++authGenerationRef.current;
          if (event === 'SIGNED_IN') setIsSessionLoading(true);
          if (currentUserRef.current?.id !== session.user.id) setIsServerDataApplied(false);
          // A member signed in after boot (or a different one) gets the standings their session can see.
          void refreshLeagueStandings({ full: leagueRefresher.fetchedUserId() !== session.user.id });

          const userId = session.user.id;
          const email = session.user.email || '';

          // Read signup defaults stored by signUpUser(), if this is a fresh signup
          let signupDefaults: { username: string; avatar: string } | undefined;
          try {
            const raw = sessionStorage.getItem('ascend_signup_defaults');
            if (raw) {
              signupDefaults = JSON.parse(raw);
              sessionStorage.removeItem('ascend_signup_defaults');
            }
          } catch {
            // sessionStorage unavailable — ignore
          }

          // 15-second hard timeout: if hydration hangs, abort gracefully
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auth hydration timed out after 15s')), 15000)
          );

          try {
            const { user, state: hydratedState, tablesRead } = await Promise.race([
              hydrateUserSession(userId, email, session.user, signupDefaults),
              timeoutPromise,
            ]);
            // Penalties, streaks and season rollovers below decide days by the clock: wait for
            // the server time and the season master values (at most a few seconds each) so a
            // moved device clock cannot steer them.
            await Promise.all([clockReady(), syncSeasonConfig()]);

            if (mounted) {
              if (myGeneration !== authGenerationRef.current) return;
              isHydrated.current = true;
              canPersistLocally.current = true;
              const sanitizedState = sanitizeLoadedState(hydratedState, user);
              // Send relational ops left over from an earlier session; hydration already read every row.
              void syncTables(userId, false);
              if (sanitizedState.themePreference) {
                setLocalThemePreference(sanitizedState.themePreference);
                applyTheme(resolveTheme(sanitizedState.themePreference));
              }

              let baseCurrentState = signInMergeBase(stateRef.current, sanitizedState, userId);
              if (typeof window !== 'undefined' && userId) {
                try {
                  const isDirty = Boolean(localStorage.getItem(`ascend_dirty_${userId}`));
                  if (isDirty) {
                    const cachedRaw = localStorage.getItem(`ascend_user_cache_${userId}`);
                    if (cachedRaw) {
                      const parsed = JSON.parse(cachedRaw);
                      if (parsed && typeof parsed === 'object') {
                        // Settings and device-local keys from the cache; synced lists as hydration
                        // already merged them (offline edits included), so an older cached copy
                        // never goes back over another device's newer row or a delete.
                        baseCurrentState = cacheWithHydratedCollections(
                          sanitizeLoadedState(parsed, user),
                          sanitizedState,
                          readBaseline(userId)
                        );
                        // A signed-out state on screen belongs to no account, so it is merged in too
                        // (as signInMergeBase does on the clean path); else its items would be dropped.
                        if (!stateRef.current.currentUser) {
                          baseCurrentState = mergeAppState(stateRef.current, baseCurrentState, 'hydration');
                        }
                      } else {
                        localStorage.removeItem(`ascend_dirty_${userId}`);
                      }
                    } else {
                      localStorage.removeItem(`ascend_dirty_${userId}`);
                    }
                  }
                } catch {
                  localStorage.removeItem(`ascend_dirty_${userId}`);
                }
              }

              const watermark = userId ? getUserDataWatermark(userId) : undefined;
              const guardResult = mergeAppStateWithGuardResult(sanitizedState, baseCurrentState, watermark);

              const rawMergedState = guardResult.hasSuspiciousDrop
                ? guardResult.retainedState
                : withHydratedPoints(guardResult.mergedState, sanitizedState);
              const reconciledMergedState = reconcileWeeklyGoalsPointsForAllWeeks(
                reconcileLinkedWeeklyGoals(rawMergedState, getNow()),
                getNow()
              );

              lastKnownGoodStateRef.current = reconciledMergedState;

              setState(reconciledMergedState);
              // Same batch as the state: the first render that sees the flag sees the server data.
              setIsServerDataApplied(tablesRead && !guardResult.hasSuspiciousDrop);

              if (guardResult.hasSuspiciousDrop) {
                const isZeroOut = guardResult.mergedCount === 0;
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : `${guardResult.droppedCount} items are missing compared to your last save. Save these removals, or keep your existing data?`,
                  stateToRetry: guardResult.mergedState,
                  stateBeforeAction: guardResult.retainedState,
                });
              }
            }
          } catch (e) {
            console.error('Error hydrating auth session:', e);
            // If hydration fails or times out, attempt to restore from local cache first
            if (mounted) {
              if (myGeneration !== authGenerationRef.current) return;
              let cachedState: AppState | null = null;
              if (typeof window !== 'undefined') {
                try {
                  const cachedRaw = localStorage.getItem(`ascend_user_cache_${userId}`);
                  if (cachedRaw) {
                    cachedState = JSON.parse(cachedRaw);
                  }
                } catch {
                  /* ignore */
                }
              }

              const fallbackUser: UserProfile = {
                id: userId,
                uid: cachedState?.currentUser?.uid || generateNumericUID(),
                email,
                username: session.user.user_metadata?.username || email.split('@')[0],
                avatar: session.user.user_metadata?.avatar || '🧑',
                createdAt: session.user.created_at || trustedNow().toISOString(),
                isProfilePublic: true,
              };

              // CRITICAL: isHydrated MUST remain false so no empty/fallback state is auto-saved over Supabase
              isHydrated.current = false;
              setIsServerDataApplied(false);

              if (cachedState) {
                const sanitizedCached = sanitizeLoadedState(cachedState, fallbackUser);
                setState((current) =>
                  reconcileWeeklyGoalsPointsForAllWeeks(
                    reconcileLinkedWeeklyGoals(
                      mergeAppState(sanitizedCached, signInMergeBase(current, sanitizedCached, userId), 'hydration'),
                      getNow()
                    ),
                    getNow()
                  )
                );
                canPersistLocally.current = true;
              } else {
                let resultingState: AppState = stateRef.current;
                setState((prev) => {
                  if (prev.currentUser?.id === userId) {
                    resultingState = prev;
                    return prev;
                  }
                  const emptyState: AppState = { ...DEFAULT_STATE, ...deviceThemeFields() };
                  resultingState = {
                    ...signInMergeBase(prev, emptyState, userId),
                    currentUser: fallbackUser,
                    username: fallbackUser.username,
                  };
                  return resultingState;
                });
                afterCommit(() => {
                  if (myGeneration !== authGenerationRef.current) return;
                  if (!hasStateData(resultingState)) {
                    canPersistLocally.current = true;
                  }
                });
              }
            }
          } finally {
            if (mounted && myGeneration === authGenerationRef.current) setIsSessionLoading(false);
            if (mounted) setIsAuthChecking(false);
          }
        } else if (!session?.user) {
          // No session yet, but a saved sign-in: keep the boot loader (see storedSessionWait).
          if (!holdForStoredSession() && mounted) setIsAuthChecking(false);
        }
        // Any other event carries the session of the account that INITIAL_SESSION / SIGNED_IN is
        // loading or has loaded (e.g. TOKEN_REFRESHED, which supabase fires at boot when it
        // refreshed an expired token). It must not end the boot check: that showed the sign-in
        // page while the account was still loading.
      }, 0);
    });

    // A guest waiting for its email link keeps a guest token until it refreshes (up to an hour).
    // When the app opens or comes back into view, ask for a fresh token so a link opened on another
    // device shows here at once. Only guests with a pending email; at most once a minute.
    let lastPendingCheckMs = 0;
    const checkPendingEmail = async () => {
      if (document.visibilityState !== 'visible' || !currentUserRef.current?.isAnonymous) return;
      const now = trustedNowMs();
      if (now - lastPendingCheckMs < 60_000) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user?.is_anonymous || !data.session.user.new_email) return;
      lastPendingCheckMs = now;
      const { error } = await supabase.auth.refreshSession();
      if (error) console.warn('Pending-email token refresh failed:', error.message);
    };
    const onPendingCheck = () => void checkPendingEmail();
    const pendingCheckTimer = setTimeout(onPendingCheck, 3000);
    window.addEventListener('focus', onPendingCheck);
    document.addEventListener('visibilitychange', onPendingCheck);

    return () => {
      mounted = false;
      applySignedOutRef.current = null;
      if (storedSessionTimerRef.current) clearTimeout(storedSessionTimerRef.current);
      clearTimeout(pendingCheckTimer);
      window.removeEventListener('focus', onPendingCheck);
      document.removeEventListener('visibilitychange', onPendingCheck);
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Real-time synchronization listener for cross-tab / multi-user updates
  useEffect(() => {
    const unsubscribe = syncBroadcaster.subscribe((event, payload) => {
      // Another tab's pact copy while this tab's own write to that pact is on its way: ours stays;
      // the refresh after the write settles brings the other tab's change in from the server.
      if (event === 'CHALLENGE_UPDATED') {
        const write = payload?.id ? pledgeWrites.current.get(payload.id) : undefined;
        if (write && write.inFlight > 0) {
          write.skipped = true;
          return;
        }
      }
      // A plan deleted in another tab leaves this tab's plan list too.
      setState((prev) => {
        if (event === 'PLAN_DELETED') {
          if (!prev.improvementPlans.some((p) => p.id === payload.planId)) return prev;
          return { ...prev, improvementPlans: prev.improvementPlans.filter((p) => p.id !== payload.planId) };
        }

        if (event === 'PLAN_CREATED' || event === 'PLAN_UPDATED') {
          // The channel is shared by every tab in the browser, whichever account it is signed in to.
          // Payloads can be partial ({ id, copyCount }), so they merge into a plan this tab already has,
          // and a new plan is only added when it is a full plan owned by this tab's user.
          const exists = prev.improvementPlans.some((p) => p.id === payload.id);
          if (exists) {
            return {
              ...prev,
              improvementPlans: prev.improvementPlans.map((p) => (p.id === payload.id ? { ...p, ...payload } : p)),
            };
          }
          const isOwnFullPlan = Boolean(payload.title) && Boolean(prev.currentUser?.id) && payload.creatorId === prev.currentUser?.id;
          if (!isOwnFullPlan) return prev;
          return { ...prev, improvementPlans: [payload, ...prev.improvementPlans] };
        }

        if (event === 'FOLLOW_UPDATED') {
          // Another tab of the same account changed a copy: take it, so this tab's older copy
          // never overwrites it on its next save.
          if (!payload?.id || !prev.currentUser?.id || payload.userId !== prev.currentUser.id) return prev;
          const exists = prev.followedPlans.some((f) => f.id === payload.id);
          return {
            ...prev,
            followedPlans: exists
              ? prev.followedPlans.map((f) => (f.id === payload.id ? { ...f, ...payload, syncStatus: f.syncStatus } : f))
              : [{ ...payload, syncStatus: 'synced' }, ...prev.followedPlans],
          };
        }

        if (event === 'FOLLOW_DELETED') {
          if (!prev.followedPlans.some((f) => f.id === payload.followId)) return prev;
          return { ...prev, followedPlans: prev.followedPlans.filter((f) => f.id !== payload.followId) };
        }

        if (event === 'PARTNER_INVITE_SENT') {
          const invite = payload.invite || payload;

          if (
            invite.toUsername.toLowerCase() === prev.username.toLowerCase() ||
            (prev.currentUser?.id && invite.toUserId === prev.currentUser.id)
          ) {
            // Only the invite: its notice is the server's row, which arrives by realtime (N13).
            if (prev.partnerInvites.some((i) => i.id === invite.id)) return prev;
            return { ...prev, partnerInvites: [invite, ...prev.partnerInvites] };
          }
        }

        if (event === 'PARTNER_INVITE_CANCELLED') {
          return {
            ...prev,
            partnerInvites: prev.partnerInvites.filter((i) => i.id !== payload.inviteId),
          };
        }

        if (event === 'PARTNER_ACCEPTED') {
          if (prev.deletedEntityIds?.includes(payload.id)) return prev;
          const myId = prev.currentUser?.id;
          if (
            (myId && (payload.user1Id === myId || payload.user2Id === myId)) ||
            payload.user1Username.toLowerCase() === prev.username.toLowerCase() ||
            payload.user2Username.toLowerCase() === prev.username.toLowerCase()
          ) {
            const updatedPartnerships = [payload, ...(prev.partnerships || []).filter((p) => p.id !== payload.id)];
            return {
              ...prev,
              partnerInvites: prev.partnerInvites.filter(
                (i) =>
                  !(
                    (i.fromUsername.toLowerCase() === payload.user1Username.toLowerCase() &&
                      i.toUsername.toLowerCase() === payload.user2Username.toLowerCase()) ||
                    (i.fromUsername.toLowerCase() === payload.user2Username.toLowerCase() &&
                      i.toUsername.toLowerCase() === payload.user1Username.toLowerCase())
                  )
              ),
              partnerships: updatedPartnerships,
              partnership: updatedPartnerships[0] || null,
            };
          }
        }

        if (event === 'PARTNER_ENDED') {
          const targetId = payload.partnershipId;
          const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
          return {
            ...prev,
            partnerships: updatedPartnerships,
            partnership: updatedPartnerships[0] || null,
            sharedChallenges: prev.sharedChallenges.filter((c) => c.partnershipId !== targetId),
          };
        }

        if (event === 'CHALLENGE_UPDATED') {
          if (
            (prev.deletedEntityIds || []).includes(payload.id) ||
            (prev.deletedEntityIds || []).includes(payload.partnershipId)
          ) {
            return prev;
          }

          const partnershipExists =
            (prev.partnerships || []).some((p) => p.id === payload.partnershipId) ||
            prev.partnership?.id === payload.partnershipId;
          if (!partnershipExists) {
            return prev;
          }

          const exists = prev.sharedChallenges.some((c) => c.id === payload.id);
          if (exists) {
            return {
              ...prev,
              sharedChallenges: prev.sharedChallenges.map((c) =>
                c.id === payload.id ? mergeSharedChallenge(c, payload) : c
              ),
            };
          } else {
            return {
              ...prev,
              sharedChallenges: [payload, ...prev.sharedChallenges],
            };
          }
        }

        if (event === 'CHALLENGE_DELETED') {
          return {
            ...prev,
            sharedChallenges: prev.sharedChallenges.filter((c) => c.id !== payload.challengeId),
          };
        }

        return prev;
      });
    });

    return () => unsubscribe();
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart Realtime Subscriptions with adaptive fallback polling
  useEffect(() => {
    if (!state.currentUser?.id) return;
    const userId = state.currentUser.id;
    const username = state.username;
    // A new account (or a fresh sign-in) waits for its own first inbox fetch.
    setNotificationsStatus('loading');
    setPartnersStatus('loading');
    // Offline at start: the channel never subscribes and polling waits for 'online', so nothing would
    // end the loading state. Show Couldn't load / Retry now; the 'online' handler re-syncs (C1).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNotificationsStatus('failed');
      setPartnersStatus('failed');
    }

    /** Keeps local "read" marks (a mark-read may still be on its way) and drops cleared rows. */
    const mergeFetchedNotifications = (prev: AppState, fetched: AppNotification[]): AppNotification[] => {
      const currentTombstones = new Set(prev.deletedEntityIds || []);
      return fetched
        .filter((fn) => !currentTombstones.has(fn.id))
        .map((fn) => {
          const local = prev.notifications?.find((n) => n.id === fn.id);
          return local && local.read ? { ...fn, read: true } : fn;
        });
    };

    /**
     * This tab still holds this account's session. A tab whose sign-in lapsed would otherwise poll
     * as anon every 10 s and get "permission denied"; it skips, and a sign-in that is gone for good
     * shows the tab signed out (checkLostSession).
     */
    const hasSession = async () => {
      if (await hasSessionFor(userId)) return true;
      void checkLostSession();
      return false;
    };

    const syncNotificationsLive = async () => {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !(await hasSession())) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        return;
      }
      const fetchedNotifs = await fetchNotificationsSupabase(userId);
      if (!fetchedNotifs) {
        // A failed fetch keeps the list on screen; the panel says it couldn't refresh.
        setNotificationsStatus('failed');
        return;
      }
      setNotificationsStatus('ready');
      setState((prev) => {
        const merged = mergeFetchedNotifications(prev, fetchedNotifs);
        if (JSON.stringify(prev.notifications ?? []) === JSON.stringify(merged)) return prev;
        return { ...prev, notifications: merged };
      });
    };
    notificationsRefreshRef.current = syncNotificationsLive;

    // The stale-invite cleanup below runs once per partnership in this session, not on every refetch.
    const cleanedInvitePartnershipIds = new Set<string>();

    const fetchPartnerDataLive = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        setPartnersStatus('failed');
        return;
      }
      if (!(await hasSession())) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        setPartnersStatus((s) => (s === 'ready' ? s : 'failed'));
        return;
      }
      try {
        const seqAtStart = pledgeWriteSeq.current;
        // Each fetch gives null when it failed: that part keeps what is on screen (N1).
        const fetchedInvites = await fetchPartnerInvitesSupabase(userId, username);
        const activePartnerships = await fetchPartnershipsSupabase(userId);
        const pIds = (activePartnerships ?? []).map((p) => p.id);
        const challenges = activePartnerships
          ? pIds.length > 0
            ? await fetchSharedChallengesSupabase(pIds)
            : []
          : null;
        const fetchedNotifs = await fetchNotificationsSupabase(userId);
        setNotificationsStatus(fetchedNotifs ? 'ready' : 'failed');
        setPartnersStatus(fetchedInvites && activePartnerships && challenges ? 'ready' : 'failed');

        if (activePartnerships && activePartnerships.length > 0) {
          // Clean up stale invites in Supabase DB for all active partnerships
          const tombstoneSet = new Set(state.deletedEntityIds || []);
          const seen = new Set<string>();
          for (const p of activePartnerships) {
            if (!p || tombstoneSet.has(p.id) || cleanedInvitePartnershipIds.has(p.id)) continue;
            const key = [(p.user1Username || '').toLowerCase(), (p.user2Username || '').toLowerCase()].sort().join(':::');
            if (seen.has(key)) continue;
            seen.add(key);
            cleanedInvitePartnershipIds.add(p.id);
            cleanupPendingInvitesBetweenUsersSupabase(p.user1Id, p.user1Username, p.user2Id, p.user2Username).catch(() => {});
          }
        }

        // Pacts we wrote to while these reads ran keep what is on screen (the read may predate the
        // write). A write still on its way refreshes once it settles; a settled one refreshes now.
        const heldBackChallengeIds = new Set<string>();
        let refreshAfterHoldBack = false;
        for (const c of challenges ?? []) {
          const write = c && pledgeWrites.current.get(c.id);
          if (!c || !write || (write.inFlight === 0 && write.lastSeq <= seqAtStart)) continue;
          heldBackChallengeIds.add(c.id);
          if (write.inFlight > 0) write.skipped = true;
          else refreshAfterHoldBack = true;
        }

        setState((prev) => {
          const currentTombstones = new Set(prev.deletedEntityIds || []);

          // 1. Notifications
          const mergedNotifs = fetchedNotifs ? mergeFetchedNotifications(prev, fetchedNotifs) : prev.notifications;

          // 2. Partnerships (authoritative from DB, filtered by tombstones), or the ones on screen
          let finalPartnerships: Partnership[];
          if (activePartnerships) {
            const mergedPartnershipsMap = new Map<string, Partnership>();
            for (const p of activePartnerships) {
              if (!p || currentTombstones.has(p.id)) continue;
              const u1 = (p.user1Username || '').toLowerCase();
              const u2 = (p.user2Username || '').toLowerCase();
              const key = [u1, u2].sort().join(':::');
              if (!mergedPartnershipsMap.has(key)) {
                mergedPartnershipsMap.set(key, p);
              }
            }
            finalPartnerships = Array.from(mergedPartnershipsMap.values());
          } else {
            finalPartnerships = prev.partnerships || [];
          }
          const finalActivePartnershipIds = new Set(finalPartnerships.map((p) => p.id));

          // 3. Invites: pending ones with someone who is not already a partner
          let validInvites = prev.partnerInvites;
          if (fetchedInvites) {
            validInvites = fetchedInvites.filter((inv) => !currentTombstones.has(inv.id));
            if (finalPartnerships.length > 0) {
              const activePartnerUsernames = new Set(
                finalPartnerships.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])
              );
              const activePartnerUserIds = new Set(finalPartnerships.flatMap((p) => [p.user1Id, p.user2Id]));
              validInvites = fetchedInvites.filter((inv) => {
                if (inv.status !== 'pending' || currentTombstones.has(inv.id)) return false;
                const otherUserId = inv.fromUserId === userId ? inv.toUserId : inv.fromUserId;
                const otherUsername = (
                  inv.fromUsername.toLowerCase() === username.toLowerCase() ? inv.toUsername : inv.fromUsername
                ).toLowerCase();
                const isAlreadyPartner =
                  (otherUserId && activePartnerUserIds.has(otherUserId)) ||
                  (otherUsername && activePartnerUsernames.has(otherUsername));
                return !isAlreadyPartner;
              });
            }
          }

          // 4. Shared challenges (authoritative from DB, merged lifecycle), or the ones on screen
          let finalSharedChallenges = prev.sharedChallenges || [];
          if (challenges) {
            const challengeMap = new Map<string, SharedChallenge>();
            for (const c of challenges) {
              if (!c || currentTombstones.has(c.id) || currentTombstones.has(c.partnershipId)) continue;
              if (!finalActivePartnershipIds.has(c.partnershipId)) continue;
              const existing = (prev.sharedChallenges || []).find((sc) => sc.id === c.id);
              if (existing && heldBackChallengeIds.has(c.id)) {
                challengeMap.set(c.id, existing);
                continue;
              }
              const merged = existing ? mergeSharedChallenge(existing, c) : c;
              challengeMap.set(c.id, reconcileSharedChallengeLifecycle(merged));
            }
            finalSharedChallenges = Array.from(challengeMap.values());
          }

          const next = {
            partnerInvites: validInvites,
            partnerships: finalPartnerships,
            partnership: finalPartnerships[0] || null,
            sharedChallenges: finalSharedChallenges,
            notifications: mergedNotifs,
          };
          // The fallback poll runs every 10 s: when the server has nothing new, keep the same
          // state object so the whole app does not re-render for nothing.
          const unchanged = (Object.keys(next) as (keyof typeof next)[]).every(
            (key) => JSON.stringify(prev[key] ?? null) === JSON.stringify(next[key] ?? null)
          );
          if (unchanged) return prev;
          return { ...prev, ...next };
        });
        if (refreshAfterHoldBack) void syncPartnerDataLive();
      } catch (e) {
        // Background sync error: what is on screen stays; the Partners page offers Retry.
        setPartnersStatus('failed');
      }
    };
    // Overlapping triggers (realtime bursts, poll, Retry) never run the reads in parallel: one run at
    // a time plus at most one more after it.
    const syncPartnerDataLive = singleFlight(fetchPartnerDataLive);
    partnersRefreshRef.current = syncPartnerDataLive;

    let pollInterval: any = null;
    // Set first in the cleanup: removeChannel reports CLOSED to the subscribe callback afterwards,
    // which must not start a poll that no cleanup would ever stop.
    let disposed = false;

    // No polling while the tab is hidden; a return to it catches up at once (handleVisibilityChange).
    const startFallbackPolling = () => {
      if (disposed) return;
      if (!pollInterval && (typeof navigator === 'undefined' || navigator.onLine) && !document.hidden) {
        pollInterval = setInterval(syncPartnerDataLive, 10000);
      }
    };

    const stopFallbackPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    let isSubscribed = false;
    let channel: any = null;
    if (isSupabaseConfigured) {
      // The name is matched by ACCOUNT_CHANNEL_TOPIC in auth.ts (closed before sign-out).
      channel = supabase
        .channel(`social_realtime_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_invites' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setState((prev) => ({
                ...prev,
                partnerInvites: (prev.partnerInvites || []).filter((i) => i.id !== deletedId),
                deletedEntityIds: [...(prev.deletedEntityIds || []), deletedId].slice(-500),
              }));
            }
          }
          syncPartnerDataLive();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setState((prev) => {
                const remainingPartnerships = (prev.partnerships || []).filter((p) => p.id !== deletedId);
                const remainingChallenges = (prev.sharedChallenges || []).filter((c) => c.partnershipId !== deletedId);
                const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), deletedId].slice(-500);
                return {
                  ...prev,
                  partnerships: remainingPartnerships,
                  partnership: remainingPartnerships[0] || null,
                  sharedChallenges: remainingChallenges,
                  deletedEntityIds: updatedDeletedEntityIds,
                };
              });
            }
          }
          syncPartnerDataLive();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_challenges' }, (payload) => {
          // The event carries the row, so a pact of a partnership this tab already shows is applied
          // from it alone. Only a pact of a partnership not known here yet needs the full refetch.
          // Missed events are caught up by the refetch on (re)subscribe, online, tab return and poll.
          const knownPartnership = (partnershipId: string | undefined) =>
            !!partnershipId && (stateRef.current?.partnerships || []).some((p) => p.id === partnershipId);
          let needsRefetch = true;
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            // A DELETE carries only the id: the pact on screen says which partnership it was in.
            needsRefetch = !knownPartnership(
              (stateRef.current?.sharedChallenges || []).find((c) => c.id === deletedId)?.partnershipId
            );
            if (deletedId) {
              setState((prev) => ({
                ...prev,
                sharedChallenges: (prev.sharedChallenges || []).filter((c) => c.id !== deletedId),
                deletedEntityIds: [...(prev.deletedEntityIds || []), deletedId].slice(-500),
              }));
            }
          } else if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const row = payload.new as any;
            needsRefetch = !knownPartnership(row?.partnership_id);
            if (row && row.id) {
              const u1DoneDates = Array.isArray(row.user1_done_dates) && row.user1_done_dates.length
                ? row.user1_done_dates
                : (row.user1_done_date ? [row.user1_done_date] : []);
              const u2DoneDates = Array.isArray(row.user2_done_dates) && row.user2_done_dates.length
                ? row.user2_done_dates
                : (row.user2_done_date ? [row.user2_done_date] : []);

              const incomingChallenge: SharedChallenge = reconcileSharedChallengeLifecycle({
                id: row.id,
                partnershipId: row.partnership_id,
                title: row.title,
                targetHabitName: row.target_habit_name,
                durationDays: row.duration_days,
                jointStreak: row.joint_streak,
                totalJointDaysCompleted: row.total_joint_days_completed ?? 0,
                user1Category: row.user1_category || 'habit',
                user1Target: row.user1_target || row.target_habit_name,
                user2Category: row.user2_category || 'habit',
                user2Target: row.user2_target || row.target_habit_name,
                user1DoneDate: row.user1_done_date || undefined,
                user2DoneDate: row.user2_done_date || undefined,
                user1DoneDates: u1DoneDates,
                user2DoneDates: u2DoneDates,
                status: row.status as 'active' | 'completed' | 'expired',
                createdAt: row.created_at,
              });

              // Our own write to this pact is still on its way: keep the tick on screen; the
              // refresh after it settles brings this change in.
              const write = pledgeWrites.current.get(incomingChallenge.id);
              if (write && write.inFlight > 0) {
                write.skipped = true;
                return;
              }

              setState((prev) => {
                if (
                  (prev.deletedEntityIds || []).includes(incomingChallenge.id) ||
                  (prev.deletedEntityIds || []).includes(incomingChallenge.partnershipId)
                ) {
                  return prev;
                }
                const exists = (prev.sharedChallenges || []).some((c) => c.id === incomingChallenge.id);
                return {
                  ...prev,
                  sharedChallenges: exists
                    ? prev.sharedChallenges.map((c) => (c.id === incomingChallenge.id ? mergeSharedChallenge(c, incomingChallenge) : c))
                    : [incomingChallenge, ...(prev.sharedChallenges || [])],
                };
              });
            }
          }
          if (needsRefetch) syncPartnerDataLive();
        })
        // Only this account's notices; they need only the inbox refetch, not the partner queries.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
          () => syncNotificationsLive()
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            stopFallbackPolling();
            syncPartnerDataLive();
          } else {
            isSubscribed = false;
            startFallbackPolling();
          }
        });
    } else {
      startFallbackPolling();
    }

    const handleOnline = () => {
      if (!isSubscribed) {
        startFallbackPolling();
      }
      syncPartnerDataLive();
    };

    const handleOffline = () => {
      stopFallbackPolling();
      // A first load still waiting when the connection drops would never finish.
      setPartnersStatus((s) => (s === 'loading' ? 'failed' : s));
      setNotificationsStatus((s) => (s === 'loading' ? 'failed' : s));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopFallbackPolling();
      } else if (!isSubscribed && (typeof navigator === 'undefined' || navigator.onLine)) {
        startFallbackPolling();
        syncPartnerDataLive();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      stopFallbackPolling();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) supabase.removeChannel(channel);
    };
    // Intentional: adding deletedEntityIds would tear down/reconnect the realtime channel on every deletion app-wide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id, state.username]);

  // Check for league period rollovers and missed-habit penalties on mount and every minute
  useEffect(() => {
    const retryUnconfirmedPlans = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const currentState = stateRef.current;
      if (!currentState || !isSupabaseConfigured) return;
      const isUnconfirmed = (status?: string) => status === 'pending' || status === 'failed';
      (currentState.improvementPlans || [])
        .filter((p) => isUnconfirmed(p.syncStatus))
        .forEach((plan) => handlePlanSyncExecution(plan));
      (currentState.followedPlans || [])
        .filter((f) => isUnconfirmed(f.syncStatus))
        .forEach((follow) => handleFollowSyncExecution(follow));
    };

    const checkUpdates = (simulatedLeagueNow?: Date) => {
      const leagueTarget = simulatedLeagueNow || leagueNow();
      // Weekly goals and pacts run on the user's own days, never on league time.
      const personalNow = getNow();

      // A new week, month or season: other members' points for it (and final ones for the period
      // that just closed, which archiving waits for) need a fresh fetch.
      const fetchedPeriod = leagueRefresher.fetchedPeriodKey();
      if (fetchedPeriod && fetchedPeriod !== leaguePeriodKey(leagueTarget)) {
        void refreshLeagueStandings({ full: true });
      }

      setState((prev) => {
        // League archives and missed-habit, no-report and exercise-target penalties come from hourly server jobs.
        const weeklyGoalsReconciledState = reconcileWeeklyGoalsPointsForAllWeeks(
          reconcileLinkedWeeklyGoals(prev, personalNow),
          personalNow
        );

        // Streak and ended status are only re-derived for the screen, never saved from here: the
        // server stores the status itself (guard + hourly pact expiry), nothing reads the stored
        // joint streak, and a save from this possibly stale copy could undo a tick made elsewhere.
        const reconciledChallenges = (weeklyGoalsReconciledState.sharedChallenges || []).map((c) =>
          reconcileSharedChallengeLifecycle(c, personalNow)
        );

        const next = { ...weeklyGoalsReconciledState, sharedChallenges: reconciledChallenges };
        // A tick that changed nothing keeps the same state, so nothing re-renders or saves.
        return keepIfUnchanged(prev, next);
      });

      // RETRY PENDING OR FAILED IMPROVEMENT PLANS (Outside setState)
      retryUnconfirmedPlans();
    };
    checkUpdates(leagueNow());
    archiveTimer.current = window.setInterval(() => checkUpdates(leagueNow()), 60000);

    const handleOnline = () => {
      retryUnconfirmedPlans();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      if (archiveTimer.current) window.clearInterval(archiveTimer.current);
      window.removeEventListener('online', handleOnline);
    };
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `accountDeleted`: the account is already gone on the server, so unsaved state is
  // discarded (a flush would try to recreate the user's rows) and only the local session is cleared.
  const logout = useCallback(async ({ accountDeleted = false }: { accountDeleted?: boolean } = {}) => {
    // 1. Guard against re-entrancy
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    const myLogoutGeneration = ++authGenerationRef.current;

    try {
      const currentState = stateRef.current;
      const deviceTheme = deviceThemeFields();

      // 2. Cancel pending debounce timer if one exists
      const hadPendingSave = Boolean(debounceTimer.current);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      // 15-second hard timeout: if logout network calls hang, proceed to reset locally
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Logout network calls timed out after 15s')), 15000)
      );

      // 3. Save before signing out, but only what is not saved yet: a clean account just waits
      // for a save already in flight. Then send pending table changes (they stay queued on this
      // device if this fails, and go out on the next sign-in).
      let persistError: unknown = null;
      const userId = currentState.currentUser?.id;
      if (!accountDeleted) {
        const hasUnsavedChanges =
          hadPendingSave ||
          pendingImmediateResolvers.current.length > 0 ||
          Boolean(userId && localStorage.getItem(`ascend_dirty_${userId}`));
        const dirtyAtSave = userId ? dirtyMark(userId) : null;
        try {
          await Promise.race([
            hasUnsavedChanges ? enqueuePersist(currentState) : writeQueueRef.current,
            timeoutPromise,
          ]);
          // Saved: the flag no longer stands for unsent changes, so step 3b can clear the device
          // (an edit made during the save keeps it).
          if (hasUnsavedChanges && userId) clearDirtyAfterSave(userId, dirtyAtSave);
        } catch (persistErr) {
          persistError = persistErr;
          console.error('Failed to flush state before logout:', persistErr);
        }
        if (userId) {
          await Promise.race([flushOutbox(userId), timeoutPromise]).catch((err) =>
            console.error('Failed to send pending changes before logout:', err)
          );
        }
      }

      // 3b. Nothing waits to be sent: remove this account's data from the device, so the next
      // person on a shared browser cannot read it. Unsent changes keep it for the next sign-in.
      if (
        !accountDeleted &&
        userId &&
        !persistError &&
        !hasPendingSyncOps(userId) &&
        !localStorage.getItem(`ascend_dirty_${userId}`)
      ) {
        clearLocalUserData(userId);
      }

      // 3c. Stop pushes for this account on this device (the next person here must not get them).
      await Promise.race([disablePush(), timeoutPromise]).catch((err) =>
        console.warn('Failed to remove push subscription before logout:', err)
      );

      // 4. Attempt remote sign-out
      let networkError: unknown = null;
      try {
        await Promise.race([logoutUser({ scope: 'local', dropFocusFor: accountDeleted && userId ? userId : undefined }), timeoutPromise]);
      } catch (err: unknown) {
        networkError = err;
        console.error('Logout error in auth service:', err);
      }

      // 5. Unconditionally reset local state to guest (unless superseded by a newer auth event)
      if (myLogoutGeneration !== authGenerationRef.current) return;
      clearLeagueStandings();

      const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      let guestState = DEFAULT_STATE;
      if (guestRaw) {
        try {
          guestState = JSON.parse(guestRaw);
        } catch {}
      }
      const sanitized = sanitizeLoadedState(guestState, null);
      setState({
        ...sanitized,
        ...deviceTheme,
      });

      // 6. Surface user-facing notifications for any failures that occurred
      if (typeof window !== 'undefined') {
        if (persistError) {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: 'Some changes may not have saved',
                message: 'Your latest changes may not have saved before you logged out.',
              },
            })
          );
        }

        if (networkError) {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: 'Logged out on this device',
                message: "Couldn't reach the server to finish logging out everywhere.",
              },
            })
          );
        }
      }
    } finally {
      isLoggingOutRef.current = false;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Deletes the signed-in account on the server, then signs out. While the server deletes it no
   * new autosave starts, and a save that fails then stays silent. When the server refuses, the
   * user stays signed in, the save that was cancelled starts again, and the error is rethrown.
   */
  const deleteAccount = useCallback(async (): Promise<void> => {
    const userId = stateRef.current.currentUser?.id;
    if (!userId) throw new Error("Couldn't delete your account. Try again.");

    isClosingAccountRef.current = true;
    const stateAtStart = stateRef.current;
    const hadPendingSave = Boolean(debounceTimer.current);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    try {
      await deleteOwnAccount(userId);
    } catch (err) {
      isClosingAccountRef.current = false;
      // Changes made while the delete ran started no save either.
      if (hadPendingSave || stateRef.current !== stateAtStart) {
        const stateToSave = stateRef.current;
        const dirtyAtSave = dirtyMark(userId);
        enqueuePersist(stateToSave)
          .then(() => clearDirtyAfterSave(userId, dirtyAtSave))
          .catch((saveErr) => console.error('Failed to save after a refused account deletion:', saveErr));
      }
      throw err;
    }

    try {
      await logout({ accountDeleted: true });
    } finally {
      isClosingAccountRef.current = false;
    }
  }, [logout, enqueuePersist]);

  /**
   * Logging out of a guest account deletes it: a guest cannot sign back in, so the account would
   * stay behind in the leagues forever. When the server refuses, the guest stays signed in.
   * Returns false on failure (an error toast is shown).
   */
  const logoutGuest = useCallback(async (): Promise<boolean> => {
    const user = stateRef.current.currentUser;
    if (!user?.id || !user.isAnonymous) {
      await logout();
      return true;
    }
    try {
      await deleteAccount();
    } catch (err) {
      console.error('Guest account deletion failed:', err);
      dispatchToastError("Couldn't delete your guest account", 'Check your connection and try again.');
      return false;
    }
    return true;
  }, [logout, deleteAccount]);

  // Habit actions (useHabitActions.ts), spread into the return object below.
  const habitActions = useHabitActions(setState, get, afterCommit, sendLinkedPactTicks, inFlightHabitToggles);

  // Journal and lesson actions (useJournalActions.ts), spread into the return object below.
  const journalActions = useJournalActions(setState, state);

  // Profile and settings actions (useProfileActions.ts). Destructured: their places in the return object below are not side by side.
  const {
    setUsername,
    updateProfileUsername,
    updateProfileAvatar,
    setThemePreference,
    toggleThemePreference,
    setRankCelebrated,
    setLastSeenRelease,
    toggleProfilePrivacy,
    toggleAcceptPartnerInvites,
    toggleNotificationPreference,
  } = useProfileActions(setState, get, stateRef);

  // Workout actions (useWorkoutActions.ts), spread into the return object below.
  const workoutActions = useWorkoutActions(setState, get);

  // Reading actions (useReadingActions.ts). Destructured: their places in the return object below are not side by side.
  const {
    updateReadingProgress,
    finishBook,
    deleteBook,
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    updateBookDetails,
    restartBook,
  } = useReadingActions(setState, afterCommit, sendLinkedPactTicks);

  // Skill actions (useSkillActions.ts), spread into the return object below.
  const skillActions = useSkillActions(setState, get);

  // Bad habit actions (useBadHabitActions.ts), spread into the return object below.
  const badHabitActions = useBadHabitActions(setState, get, afterCommit, sendLinkedPactTicks);

  // Recovery actions (useRecoveryActions.ts), spread into the return object below.
  const recoveryActions = useRecoveryActions(setState, get);

  // Focus, decision and emotion actions (usePfcActions.ts), spread into the return object below.
  const pfcActions = usePfcActions(setState, get);

  // Weekly goal actions (useWeeklyGoalActions.ts), spread into the return object below.
  const weeklyGoalActions = useWeeklyGoalActions(setState);

  // Project, goal and task actions (useProjectActions.ts), spread into the return object below.
  const projectActions = useProjectActions(setState, get, state, isServerDataApplied);

  // Plan actions (usePlanActions.ts), spread into the return object below. handlePlanSyncExecution and handleFollowSyncExecution are not members:
  // the minute tick above (retryUnconfirmedPlans) calls them, so they are taken out and stay out of the spread.
  const { handlePlanSyncExecution, handleFollowSyncExecution, ...planActions } = usePlanActions(setState, afterCommit, stateRef, state);

  // Habit-linked pacts follow their habit: every minute, a running pact whose own side differs from
  // its linked habit today is brought in step (planLinkedPactRepairs: a difference seen on two passes
  // in a row, once per pact per day; a failed save from a habit tick is resent). This covers what a
  // tick on this device can't: a habit ticked on another device or offline, a pact that arrived from
  // the partner, a habit added or renamed to the goal later. Only against this session's server copy
  // of the habits and the pacts: a device cache could be behind (it would undo a tick made elsewhere,
  // or re-create a pact that was deleted).
  const pactRepairReady = useRef(false);
  pactRepairReady.current = isServerDataApplied && partnersStatus === 'ready';
  const linkedPactUserId = state.currentUser?.id;

  // Partner and pact actions (usePartnerActions.ts), spread into the return object below.
  const partnerActions = usePartnerActions(setState, stateRef, state, trackPledgeWrite, settlePactSave, pledgeWrites, pactDiverged, pactRepairedOn, pactRetry, pactRepairReady, linkedPactUserId, pendingPledgeRequests, PACT_RETRY_LIMIT);

  // Notification and league actions (useNotificationActions.ts). Destructured: their places in the return object below are not side by side.
  const {
    markNotificationsRead,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    clearReadNotifications,
    refreshNotifications,
    refreshPartners,
    getLeagueData,
  } = useNotificationActions(setState, get, state, leagueDataVersion, notificationsRefreshRef, partnersRefreshRef, setNotificationsStatus, setPartnersStatus);

  // Time Tracker actions (useTimeTrackerActions.ts), spread into the return object below.
  const timeTrackerActions = useTimeTrackerActions(setState, get);

  return {
    state,
    isAuthChecking,
    isSessionLoading,
    isServerDataApplied,
    setRankCelebrated,
    setLastSeenRelease,
    storedSessionWait,
    logout,
    deleteAccount,
    logoutGuest,
    ...habitActions,
    ...journalActions,
    setUsername,
    updateProfileUsername,
    updateProfileAvatar,
    resolvedTheme,
    setThemePreference,
    toggleThemePreference,
    toggleProfilePrivacy,
    toggleAcceptPartnerInvites,
    toggleNotificationPreference,
    getLeagueData,
    refreshLeagueStandings,
    getLeagueStandingsStatus,
    // New Module Actions
    ...workoutActions,
    updateReadingProgress,
    finishBook,
    deleteBook,
    ...skillActions,
    ...badHabitActions,
    ...recoveryActions,
    ...pfcActions,
    ...weeklyGoalActions,
    // Self Improvement Books Library Actions
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    updateBookDetails,
    restartBook,
    // Social Features Actions
    ...planActions,
    ...partnerActions,
    markNotificationRead,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    clearReadNotifications,
    refreshNotifications,
    notificationsStatus,
    refreshPartners,
    partnersStatus,
    // Projects & Goals Module Actions
    ...projectActions,
    // Time Tracker Module Actions
    ...timeTrackerActions,
    // Destructive Wipe Confirmation Gate
    destructiveWipeModal,
    isSavingDestructiveWipe,
    handleConfirmDestructiveWipe,
    handleCancelDestructiveWipe,
  };
}

export type AppStore = ReturnType<typeof useAppState>;
