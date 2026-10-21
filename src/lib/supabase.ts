import { createClient } from '@supabase/supabase-js';
import { ImprovementPlan, PartnerInvite, Partnership, AppState, SharedChallenge, UserPlanFollow, AppNotification, PlanReflectionNote } from '@/types';
import { calculateUnifiedStreak } from './streakLogic';
import { mergeAppState } from './stateMerger';
import { reconcileSharedChallengeLifecycle } from './pactLifecycle';
import { todayKey } from './dates';
import { GuardBlockedError, PreFetchSyncError, SessionLostError } from './errors';
import {
  DEVICE_TIMEZONE_SENT_EVENT,
  deviceTimeZone,
  deviceTimezoneSent,
  markDeviceTimezoneSent,
} from './deviceTimezone';
import { computeStateDataWeight, savedItemCount, type UserDataWeight } from './dataWeight';
import { withoutSyncedCollections } from './sync/syncedCollections';
import { withoutRetiredKeys, withoutUnsavedBlobKeys } from './retiredStateKeys';
import { withoutDeviceLocalKeys } from './deviceLocalState';
import { trustedNow, trustedNowMs } from './clock';
import { CaptchaRejectedError, isCaptchaRejection, withCaptcha } from './captcha';
import { SentSnapshots, snapshotOf } from './sentSnapshots';

function getValidSupabaseUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

function getValidAnonKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
  return trimmed;
}

const rawUrl = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env.VITE_SUPABASE_URL : undefined;
const rawKey = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

const validatedUrl = getValidSupabaseUrl(rawUrl);
const validatedAnonKey = getValidAnonKey(rawKey);

export const isSupabaseConfigured = Boolean(validatedUrl && validatedAnonKey);

const DEFAULT_SUPABASE_URL = 'https://placeholder.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder';

const supabaseUrl = validatedUrl || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = validatedAnonKey || DEFAULT_SUPABASE_KEY;

if (!isSupabaseConfigured) {
  console.warn('Supabase URL or Anon Key is missing or invalid in environment variables. Operating in local state fallback mode.');
}

// supabase-js's own default key, named here so the app can read it (unchanged: nobody is signed out).
const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

/**
 * A password-reset email lands on `/reset-password#access_token=…&type=recovery` (or `#error=…`
 * when the link expired or was used). Read before the client starts: it clears the hash once it
 * has taken the session from it.
 */
function readRecoveryRedirect(): { recovery: boolean; error: string | null } {
  if (typeof window === 'undefined') return { recovery: false, error: null };
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const error = params.get('error_description') || params.get('error') || query.get('error_description') || query.get('error');
  return { recovery: params.get('type') === 'recovery', error: error ? error.replace(/\+/g, ' ') : null };
}
const recoveryRedirect = readRecoveryRedirect();
let passwordRecoverySession = recoveryRedirect.recovery;

/** What this tab last wrote per account, to skip saves identical to the last successful one. */
const sentSnapshots = new SentSnapshots();

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  }
);

// Subscribed at once so the client's PASSWORD_RECOVERY (fired while it starts up) is never missed.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') passwordRecoverySession = true;
  else if (event === 'SIGNED_OUT') passwordRecoverySession = false;
  // A new sign-in or a sign-out: the next save writes everything again.
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') sentSnapshots.forget();
});

/** This tab was opened from a password-reset email and its session may set a new password. */
export function isPasswordRecoverySession(): boolean {
  return passwordRecoverySession;
}

/** The new password is set (or the user left): the reset page stops offering the form. */
export function endPasswordRecoverySession(): void {
  passwordRecoverySession = false;
}

/** The error a reset link came back with (expired, already used), or null. */
export function passwordRecoveryLinkError(): string | null {
  return recoveryRedirect.error;
}

/**
 * Checks a password for the signed-in email without touching the app's own sign-in (D-S3): a
 * separate client that keeps nothing, then a sign-out of just that check's session. The app's
 * session, its events and the other devices are unaffected. Passes the bot check like a sign-in.
 */
export async function verifyAccountPassword(email: string, password: string): Promise<'ok' | 'wrong'> {
  const checker = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `${AUTH_STORAGE_KEY}-password-check`,
    },
  });
  const error = await withCaptcha('password_check', async (captchaToken) => {
    const { error: signInError } = await checker.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (isCaptchaRejection(signInError)) throw new CaptchaRejectedError();
    return signInError;
  });
  if (error) {
    if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) return 'wrong';
    throw new Error(error.message || "Couldn't check your password. Try again.");
  }
  // 'local' ends only the session this check just made.
  await checker.auth.signOut({ scope: 'local' }).catch(() => undefined);
  return 'ok';
}

/** This tab holds a sign-in for this account (requests run as the user, not as anon). */
export async function hasSessionFor(userId: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId;
}

/**
 * The sign-in this device still holds (a refresh token), or null. Supabase reports no session
 * when refreshing an expired one fails on the network (a phone waking up), yet keeps it saved and
 * signs it in again moments later; a dead sign-in is removed from storage instead.
 */
export function storedAuthSession(): { isAnonymous: boolean; userId: string | null } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { refresh_token?: unknown; user?: { id?: unknown; is_anonymous?: unknown } } | null;
    if (typeof saved?.refresh_token !== 'string' || !saved.refresh_token) return null;
    return {
      isAnonymous: saved.user?.is_anonymous === true,
      userId: typeof saved.user?.id === 'string' ? saved.user.id : null,
    };
  } catch {
    return null;
  }
}

// BroadcastChannel fallback for multi-tab real-time sync across registered users & guest sessions
const BROADCAST_CHANNEL_NAME = 'ascend_realtime_sync_channel';

class SyncBroadcaster {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(event: string, payload: any) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.channel.onmessage = (e) => {
        if (e.data && e.data.event) {
          this.listeners.forEach((fn) => fn(e.data.event, e.data.payload));
        }
      };
    }
  }

  public broadcast(event: string, payload: any) {
    if (this.channel) {
      this.channel.postMessage({ event, payload });
    }
  }

  public subscribe(fn: (event: string, payload: any) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

export const syncBroadcaster = new SyncBroadcaster();

// --- SUPABASE DATABASE SYNC HELPERS ---

const userWatermarkMap = new Map<string, UserDataWeight>();
const userHydrationCompleteMap = new Map<string, boolean>();

export function setUserHydrationComplete(userId: string, isComplete: boolean = true) {
  if (!userId) return;
  if (isComplete) {
    userHydrationCompleteMap.set(userId, true);
  } else {
    userHydrationCompleteMap.delete(userId);
  }
}

export function isUserHydrationComplete(userId: string): boolean {
  return userHydrationCompleteMap.get(userId) === true;
}

export function setUserDataWatermark(userId: string, stateOrWeight: AppState | UserDataWeight) {
  if (!userId) return;
  const weight = 'itemCount' in stateOrWeight ? stateOrWeight : computeStateDataWeight(stateOrWeight);
  const existing = userWatermarkMap.get(userId);
  if (!existing) {
    userWatermarkMap.set(userId, weight);
  } else {
    userWatermarkMap.set(userId, {
      itemCount: Math.max(existing.itemCount, weight.itemCount),
      arrayBreakdown: { ...existing.arrayBreakdown, ...weight.arrayBreakdown },
      tombstoneIds: Array.from(new Set([...existing.tombstoneIds, ...weight.tombstoneIds])),
    });
  }
}

/**
 * Items another device deleted (rows the server soft-deleted, removed here by a table pull) leave
 * no tombstone on this device, so they come off the watermark: the next save is not a data loss.
 */
export function lowerUserDataWatermark(userId: string, removedCount: number) {
  const existing = userWatermarkMap.get(userId);
  if (!existing || removedCount <= 0) return;
  userWatermarkMap.set(userId, { ...existing, itemCount: Math.max(0, existing.itemCount - removedCount) });
}

export function resetUserDataWatermark(userId: string, stateOrWeight: AppState | UserDataWeight) {
  if (!userId) return;
  const weight = 'itemCount' in stateOrWeight ? stateOrWeight : computeStateDataWeight(stateOrWeight);
  userWatermarkMap.set(userId, weight);
}

export function getUserDataWatermark(userId: string): UserDataWeight | undefined {
  return userWatermarkMap.get(userId);
}

export function clearUserDataWatermark(userId: string) {
  userWatermarkMap.delete(userId);
  userHydrationCompleteMap.delete(userId);
  sentSnapshots.forget(userId);
}

export async function fetchUserDataWithStatusFromSupabase(userId: string): Promise<{
  state: AppState | null;
  exists: boolean;
  error: any | null;
}> {
  if (!isSupabaseConfigured) return { state: null, exists: false, error: null };
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user_data from Supabase:', error);
      return { state: null, exists: false, error };
    }
    if (!data || !data.state) {
      return { state: null, exists: false, error: null };
    }
    return { state: withoutDeviceLocalKeys(data.state as AppState), exists: true, error: null };
  } catch (e) {
    console.error('Exception fetching user_data from Supabase:', e);
    return { state: null, exists: false, error: e };
  }
}

export async function fetchUserDataFromSupabase(userId: string): Promise<AppState | null> {
  const res = await fetchUserDataWithStatusFromSupabase(userId);
  return res.state;
}

/** Writes this account's profile row from the state (stats, settings, device timezone); throws on failure. */
async function writeProfileFromState(userId: string, st: AppState): Promise<null> {
  if (!st.currentUser) return null;

  const habitsCompletedCount = (st.habits || []).reduce(
    (acc, h) =>
      acc +
      (Array.isArray(h.completions)
        ? h.completions.length
        : Object.values(h.completions || {}).filter((c) => c.done).length),
    0
  );
  const habitsCompletedTodayCount = (st.habits || []).reduce((acc, h) => {
    const todayStr = todayKey();
    const isDone = Array.isArray(h.completions)
      ? h.completions.includes(todayStr)
      : h.completions?.[todayStr]?.done === true;
    return acc + (isDone ? 1 : 0);
  }, 0);
  const unified = calculateUnifiedStreak(st);
  const exerciseMinutes = (st.workouts || []).reduce((sum, w) => sum + w.durationMinutes, 0);
  const booksRead = (st.libraryBooks || []).filter((b) => b.status === 'completed' || b.isFinished).length;
  const skillsPracticedCount = (st.skillLogs || []).length;

  const userStats = {
    streakDays: unified.currentStreakDays,
    streakSource: unified.currentStreakDays > 0 ? unified.currentStreakCategory : undefined,
    currentStreakDays: unified.currentStreakDays,
    currentStreakCategory: unified.currentStreakCategory,
    currentStreakIsActive: unified.currentStreakIsActive,
    lastActiveDate: unified.lastActiveDate,
    habitsCompletedCount,
    habitsCompletedTodayCount,
    journalEntriesCount: (st.journalEntries || []).length,
    exerciseMinutes,
    booksRead,
    skillsPracticedCount,
  };

  const profilePayload: Record<string, any> = {
    id: userId,
    username: st.currentUser.username,
    email: st.currentUser.email,
    avatar: st.currentUser.avatar || '🧑',
    season_id: st.seasonId || 1,
    stats: userStats,
    // Habit names are not published: other members no longer see which habits someone keeps.
    active_habits: [],
    // The device's timezone. The server derives profiles.timezone (the user's "today") from it,
    // never letting the local date go backwards (supabase/migrations/20261016120000).
    device_timezone: deviceTimeZone(),
  };

  if (st.currentUser.uid) {
    profilePayload.uid = st.currentUser.uid;
  }

  if (st.currentUser.lastUsernameChangeAt) {
    profilePayload.last_username_change_at = st.currentUser.lastUsernameChangeAt;
  }

  let profErr = await writeOwnProfile(userId, profilePayload);

  if (profErr) {
    if (profErr.message?.includes('last_username_change_at')) {
      delete profilePayload.last_username_change_at;
    }
    if (profErr.message?.includes('uid')) {
      delete profilePayload.uid;
    }
    if (profErr.message?.includes('device_timezone')) {
      delete profilePayload.device_timezone;
    }
    profErr = await writeOwnProfile(userId, profilePayload);
  }

  if (profErr) {
    console.error('Error upserting profile in Supabase:', profErr);
    throw new Error(profErr.message || "Couldn't save your profile. Try again.");
  }
  if (profilePayload.device_timezone) markDeviceTimezoneSent(userId, profilePayload.device_timezone);
  return null;
}

export async function saveUserDataToSupabase(
  userId: string,
  state: AppState,
  options?: { allowDestructiveWipe?: boolean }
): Promise<AppState | null> {
  if (!isSupabaseConfigured) return null;

  // SAFETY CHECK 1: Ensure user ID matches the logged-in state user
  if (!userId || !state.currentUser || state.currentUser.id !== userId) {
    console.warn('[GUARD] Blocked saveUserDataToSupabase due to missing or mismatched userId:', {
      userId,
      stateUserId: state.currentUser?.id,
    });
    return null;
  }

  // SAFETY CHECK 1B: without this account's sign-in every request below runs as anon: the
  // pre-fetch reads no row (so no merge) and both writes are refused. Keep the changes for later.
  if (!(await hasSessionFor(userId))) throw new SessionLostError();

  // SKIP: this exact state was already saved by this tab (it passed the guards then), so there is
  // no blob to merge or write and no table change to record. The profile still goes through: its
  // stats follow the day, and writeOwnProfile sends only a part that changed.
  const inputSnapshot = snapshotOf(state);
  if (!options?.allowDestructiveWipe && sentSnapshots.matches(userId, 'save-input', inputSnapshot)) {
    try {
      await writeProfileFromState(userId, state);
    } catch (e) {
      if (!(await hasSessionFor(userId))) throw new SessionLostError();
      throw e;
    }
    return state;
  }

  // Write-time merge: Reconcile server state with incoming state using tombstone-aware merger
  let finalState: AppState = state;
  const existingRes = await fetchUserDataWithStatusFromSupabase(userId);
  if (existingRes.error) {
    console.error(
      '[SAVE MERGE] Pre-fetch check failed with network/database error, aborting unmerged write to prevent data loss:',
      existingRes.error
    );
    throw new PreFetchSyncError(
      'Could not verify existing remote database state before saving.',
      existingRes.error
    );
  }
  if (existingRes.exists && existingRes.state) {
    try {
      finalState = mergeAppState(existingRes.state, state, 'writeSync');
    } catch (mergeErr) {
      console.error('[SAVE MERGE] mergeAppState threw, aborting write (fail-closed):', mergeErr);
      throw mergeErr;
    }
  }

  // SAFETY CHECK 2: Comprehensive Data-Loss Protection Safeguard
  const incomingWeight = computeStateDataWeight(finalState);
  const watermark = userWatermarkMap.get(userId);
  const isHydrated = isUserHydrationComplete(userId);
  const allowDestructive = Boolean(options?.allowDestructiveWipe);

  // Check 2A: Active in-memory session watermark guard. Items deleted on purpose since the last
  // save (tombstoned) still count, so only items that vanished without a delete read as a drop.
  const keptCount = watermark ? savedItemCount(incomingWeight, watermark) : incomingWeight.itemCount;
  if (!allowDestructive && watermark && watermark.itemCount > 0) {
    // Floor exemption: If the account has <= 3 items total AND hydration is fully complete,
    // allow legitimate low-data zero-outs / mass deletions without blocking.
    const isFloorExempt = watermark.itemCount <= 3 && isHydrated;

    if (!isFloorExempt) {
      // Block total wipe: incoming is empty (0 items)
      if (keptCount === 0) {
        console.error('[CRITICAL GUARD] Blocked catastrophic zero-out wipe to user_data for established account:', {
          userId,
          watermark,
          incomingWeight,
          isHydrated,
        });
        throw new GuardBlockedError(
          'Blocked catastrophic zero-out wipe to user_data for established account',
          'ZERO_OUT_WIPE',
          true
        );
      }

      // Block massive catastrophic entity drop (>70% vanished at once on accounts with >= 3 items)
      if (watermark.itemCount >= 3 && keptCount < Math.ceil(watermark.itemCount * 0.3)) {
        console.error('[CRITICAL GUARD] Blocked abnormal massive data drop to user_data:', {
          userId,
          watermarkItemCount: watermark.itemCount,
          incomingItemCount: incomingWeight.itemCount,
          keptCount,
          isHydrated,
        });
        throw new GuardBlockedError(
          'Blocked abnormal massive data drop to user_data (>70% drop)',
          'ABNORMAL_DROP',
          true
        );
      }
    }
  }

  // Check 2B: Cold baseline check if no session watermark has been registered yet
  if (!watermark && incomingWeight.itemCount === 0) {
    const existingRes = await fetchUserDataWithStatusFromSupabase(userId);
    if (existingRes.exists && existingRes.state) {
      const existingWeight = computeStateDataWeight(existingRes.state);
      if (existingWeight.itemCount > 0) {
        console.error('[CRITICAL GUARD] Blocked cold zero-out wipe over existing rich database state:', {
          userId,
          existingWeight,
          incomingWeight,
        });
        setUserDataWatermark(userId, existingWeight);
        throw new GuardBlockedError(
          'Blocked cold zero-out wipe over existing rich database state',
          'COLD_ZERO_OUT',
          false
        );
      }
    }
  }

  // The saved state is the new baseline. (Keeping the session's highest count instead made a run
  // of ordinary one-by-one deletes add up to an "abnormal drop" and ask to confirm.)
  resetUserDataWatermark(userId, incomingWeight);

  // Always mirror authenticated user state to local cache for resilient cold boot and offline recovery
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`ascend_user_cache_${userId}`, JSON.stringify(finalState));
    } catch {
      /* ignore */
    }
  }

  // Collections with their own tables are not written to the blob (DB normalization S4),
  // nor are keys no code reads any more (a merge with an older remote blob can carry them),
  // nor device-local state, nor values derived again on every load.
  const blobState = withoutUnsavedBlobKeys(
    withoutDeviceLocalKeys(withoutRetiredKeys(withoutSyncedCollections(finalState)))
  );

  try {
    // Execute user_data upsert and profiles upsert in parallel for maximum speed
    const userDataPromise = supabase.from('user_data').upsert({
      user_id: userId,
      state: blobState,
      updated_at: trustedNow().toISOString(),
    });

    const profilePromise = writeProfileFromState(userId, finalState);

    const [dataResult] = await Promise.all([userDataPromise, profilePromise]);

    if (dataResult.error) {
      if (dataResult.error.code === '23503') {
        // Foreign key constraint: Wait for profile creation then retry user_data upsert
        await profilePromise;
        const { error: retryErr } = await supabase.from('user_data').upsert({
          user_id: userId,
          state: blobState,
          updated_at: trustedNow().toISOString(),
        });
        if (retryErr) {
          console.error('Error retrying user_data upsert in Supabase:', retryErr);
          throw new Error(retryErr.message || "Couldn't save your changes. Try again.");
        }
      } else {
        console.error('Error upserting user_data in Supabase:', dataResult.error);
        throw new Error(dataResult.error.message || "Couldn't save your changes. Try again.");
      }
    }
    sentSnapshots.remember(userId, 'save-input', inputSnapshot);
    return finalState;
  } catch (e) {
    // The sign-in ended while this save was on its way (a log-out here or in another tab): the
    // server refused it for that reason, not the connection. Same handling as a save that never left.
    if (!(await hasSessionFor(userId))) throw new SessionLostError();
    console.error('Error saving user_data to Supabase:', e);
    throw e;
  }
}

export async function fetchAllProfilesFromSupabase() {
  if (!isSupabaseConfigured) return [];
  try {
    // Stats and past seasons come back only for members this viewer may see in detail.
    const { data, error } = await supabase.rpc('ascend_member_profiles');
    if (error || !data) return [];
    return data;
  } catch (e) {
    console.error('Error fetching profiles from Supabase:', e);
    return [];
  }
}

/**
 * The signed-in member's own private profile columns (email, notification settings, timezones,
 * last username change). Members cannot SELECT these columns on profiles; null on failure.
 */
export async function fetchMyPrivateProfile(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('ascend_my_profile');
  if (error || !data || typeof data !== 'object') return null;
  return data as Record<string, unknown>;
}

/** Profile columns members cannot read back; an upsert (ON CONFLICT DO UPDATE) cannot write them. */
const PRIVATE_PROFILE_COLUMNS = [
  'email',
  'stats',
  'active_habits',
  'last_username_change_at',
  'device_timezone',
];

/**
 * Columns with their own writers (username: `ascend_change_username`; avatar: `updateUserAvatar`).
 * A settings save sends them only when it has to create the row, so a device holding an old
 * avatar can't put it back over one chosen on another device (S4). The row is normally created
 * at sign-in (`insertInitialProfile`), before any save can run.
 */
const IDENTITY_PROFILE_COLUMNS = ['username', 'avatar'];

/**
 * Writes the public profile columns (an update; the full upsert, identity included, only when the
 * row does not exist yet), then the private ones with a plain update. A part identical to the one
 * this tab last wrote for the account is not sent again (the profile triggers cost a round trip each).
 */
async function writeOwnProfile(userId: string, payload: Record<string, any>) {
  const publicPart: Record<string, any> = {};
  const privatePart: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    (PRIVATE_PROFILE_COLUMNS.includes(key) ? privatePart : publicPart)[key] = value;
  }
  const updatePart = Object.fromEntries(
    Object.entries(publicPart).filter(([key]) => key !== 'id' && !IDENTITY_PROFILE_COLUMNS.includes(key))
  );
  // Each part is sent only when it differs from what this tab last wrote for this account.
  const publicSnapshot = snapshotOf(updatePart);
  if (!sentSnapshots.matches(userId, 'profile-public', publicSnapshot)) {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('profiles')
      .update(updatePart)
      .eq('id', userId)
      .select('id');
    if (updateErr) return updateErr;
    if (!updatedRows || updatedRows.length === 0) {
      const { error } = await supabase.from('profiles').upsert(publicPart);
      if (error) return error;
    }
    sentSnapshots.remember(userId, 'profile-public', publicSnapshot);
  }
  if (Object.keys(privatePart).length === 0) return null;
  const privateSnapshot = snapshotOf(privatePart);
  if (sentSnapshots.matches(userId, 'profile-private', privateSnapshot)) return null;
  const { error: privateErr } = await supabase.from('profiles').update(privatePart).eq('id', userId);
  if (!privateErr) sentSnapshots.remember(userId, 'profile-private', privateSnapshot);
  return privateErr;
}

/**
 * Sends the device timezone on its own (app start, back to the tab, back online), so the server's
 * "today" follows the device without waiting for the next change to save. Only with this account's
 * sign-in (never as anon) and only when this tab has not sent this timezone yet. True once the
 * server has it; false when there is no session or no profile row yet (sign-up creates it with it).
 */
export async function sendDeviceTimezone(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const timeZone = deviceTimeZone();
  if (deviceTimezoneSent(userId, timeZone)) return true;
  if (!(await hasSessionFor(userId))) return false;
  const { data, error } = await supabase
    .from('profiles')
    .update({ device_timezone: timeZone })
    .eq('id', userId)
    .select('id');
  if (error) {
    console.warn('Failed to send the device timezone:', error.message);
    return false;
  }
  if (!data || data.length === 0) return false;
  markDeviceTimezoneSent(userId, timeZone);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_TIMEZONE_SENT_EVENT));
  return true;
}

/** A league period whose points the server sums: [start, end), start already clamped to the season. */
export interface LeaguePointsPeriod {
  id: string;
  start: Date;
  end: Date;
}

/**
 * Every member's net points in each period, from the server ledger (ascend_league_points).
 * Returns periodId -> userId -> points (members with 0 points are absent), or null on failure.
 */
export async function fetchLeaguePointsFromSupabase(
  periods: LeaguePointsPeriod[]
): Promise<Record<string, Record<string, number>> | null> {
  if (!isSupabaseConfigured || periods.length === 0) return null;
  try {
    const { data, error } = await supabase.rpc('ascend_league_points', {
      p_starts: periods.map((p) => p.start.toISOString()),
      p_ends: periods.map((p) => p.end.toISOString()),
    });
    if (error || !Array.isArray(data)) return null;
    const result: Record<string, Record<string, number>> = {};
    for (const p of periods) result[p.id] = {};
    for (const row of data as { period: number; user_id: string; points: number }[]) {
      const period = periods[row.period - 1];
      if (period) result[period.id][row.user_id] = row.points;
    }
    return result;
  } catch (e) {
    console.error('Error fetching league points from Supabase:', e);
    return null;
  }
}

export async function fetchProfileByUsernameFromSupabase(username: string) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: rows, error } = await supabase.rpc('ascend_member_profiles', { p_username: username.trim() });
    const data = Array.isArray(rows) ? rows[0] : null;

    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error('Error fetching profile by username from Supabase:', e);
    return null;
  }
}

// Writes to one plan or copy run one at a time, in call order, so a slower earlier upsert can never
// land after a newer one. Each caller still gets its own write's result.
const rowSyncChains = new Map<string, Promise<unknown>>();

function serializeRowSync<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = rowSyncChains.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  rowSyncChains.set(key, next);
  void next.finally(() => {
    if (rowSyncChains.get(key) === next) rowSyncChains.delete(key);
  });
  return next;
}

export function syncPlanToSupabase(plan: ImprovementPlan): Promise<string | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  return serializeRowSync(`plan:${plan.id}`, () => upsertPlanRow(plan));
}

async function upsertPlanRow(plan: ImprovementPlan): Promise<string | null> {
  try {
    // 1. Await absolute current session token
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    let sessionUser = session?.user;

    if (!sessionUser) {
      console.warn('[Supabase Sync Warning] No active session found.', sessionError);
      return null;
    }

    // 2. FORCE creator_id to match session.user.id (single source of truth for RLS)
    const creatorId = sessionUser.id;

    // Ensure profile exists in profiles table first if missing
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', creatorId).maybeSingle();
    if (!existingProfile) {
      const fallbackUsername = plan.creatorUsername || ('User_' + creatorId.substring(0, 6));
      await supabase.from('profiles').insert({
        id: creatorId,
        username: fallbackUsername,
        avatar: plan.creatorAvatar || '🧑',
      });
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const planId = uuidPattern.test(plan.id) ? plan.id : crypto.randomUUID();

    // Build steps JSONB object containing step items and plan type metadata
    const anyPlan = plan as any;
    const stepsItems = Array.isArray(plan.steps)
      ? plan.steps
      : (plan.steps && typeof plan.steps === 'object' && Array.isArray((plan.steps as any).items)
        ? (plan.steps as any).items
        : []);

    const stepsPayload = {
      items: stepsItems,
      planType: plan.planType || anyPlan.plan_type || 'milestone',
      targetValue: plan.targetValue ?? anyPlan.target_value ?? null,
      targetUnit: plan.targetUnit ?? anyPlan.target_unit ?? null,
      currentProgress: plan.currentProgress ?? anyPlan.current_progress ?? 0,
      targetDate: plan.targetDate ?? anyPlan.target_date ?? null,
      cadence: plan.cadence ?? anyPlan.cadence ?? null,
      duration: plan.duration ?? anyPlan.duration ?? null,
      startDate: plan.startDate ?? anyPlan.start_date ?? null,
      streakCount: plan.streakCount ?? anyPlan.streak_count ?? 0,
      lastCompletedDate: plan.lastCompletedDate ?? anyPlan.last_completed_date ?? null,
      previousCompletedDate: plan.previousCompletedDate ?? null,
      targetReviewDate: plan.targetReviewDate ?? anyPlan.target_review_date ?? null,
      reviewCadence: plan.reviewCadence ?? anyPlan.review_cadence ?? null,
      nextReviewDueAt: plan.nextReviewDueAt ?? anyPlan.next_review_due_at ?? null,
      reflectionNotes: Array.isArray(plan.reflectionNotes)
        ? plan.reflectionNotes
        : (Array.isArray(anyPlan.reflection_notes) ? anyPlan.reflection_notes : [])
    };

    // Strict Postgres Snake_Case Mapping: ONLY actual columns of improvement_plans table
    const cleanPayload = {
      id: planId,
      creator_id: creatorId,
      creator_username: plan.creatorUsername || 'Member',
      creator_avatar: plan.creatorAvatar || '🧑',
      title: plan.title || '',
      description: plan.description || '',
      category: plan.category || 'Personal Growth',
      is_public: Boolean(plan.isPublic ?? anyPlan.is_public ?? false),
      steps: stepsPayload,
      review_cadence: plan.reviewCadence || null,
      next_review_due_at: plan.nextReviewDueAt || null,
    };

    // 3. Execute Supabase upsert/insert with forced creator_id
    const { error } = await supabase.from('improvement_plans').upsert(cleanPayload, { onConflict: 'id' });

    if (error) {
      console.warn(`[Supabase Sync Warning] Error syncing plan to Supabase: ${error.message}`, error.details);
      return null;
    }

    return planId;
  } catch (e: any) {
    console.warn(`[Supabase Sync Warning] Supabase plan sync error: ${e.message}`, e);
    return null;
  }
}

/**
 * Deletes one of the user's own plans, after any save still running for it, so a late save can
 * never bring it back. Resolves once the row is gone (or never reached the table); rejects on error.
 */
export function deletePlanFromSupabase(planId: string): Promise<void> {
  return serializeRowSync(`plan:${planId}`, async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Log in and try again.');
    const { error } = await supabase
      .from('improvement_plans')
      .delete()
      .eq('id', planId)
      .eq('creator_id', session.user.id);
    if (error) throw error;
  });
}

/** Upserts this user's copy of a plan; resolves true once the row is saved. */
export function syncFollowedPlanToSupabase(followedPlan: UserPlanFollow): Promise<boolean> {
  if (!isSupabaseConfigured) return Promise.resolve(false);
  return serializeRowSync(`follow:${followedPlan.id}`, () => upsertFollowRow(followedPlan));
}

async function upsertFollowRow(followedPlan: UserPlanFollow): Promise<boolean> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const sessionUser = session?.user;

    if (!sessionUser) {
      console.error('[Supabase SyncFollowedPlan] No active session found.', sessionError);
      return false;
    }

    const userId = sessionUser.id;

    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!existingProfile) {
      const fallbackUsername = 'User_' + userId.substring(0, 6);
      await supabase.from('profiles').insert({
        id: userId,
        username: fallbackUsername,
        avatar: '🧑',
      });
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const followId = uuidPattern.test(followedPlan.id) ? followedPlan.id : crypto.randomUUID();

    const stepsPayload = {
      items: followedPlan.steps || [],
      planType: followedPlan.planType || 'milestone',
      targetValue: followedPlan.targetValue,
      targetUnit: followedPlan.targetUnit,
      currentProgress: followedPlan.currentProgress ?? 0,
      targetDate: followedPlan.targetDate,
      cadence: followedPlan.cadence,
      duration: followedPlan.duration,
      startDate: followedPlan.startDate,
      streakCount: followedPlan.streakCount ?? 0,
      lastCompletedDate: followedPlan.lastCompletedDate,
      previousCompletedDate: followedPlan.previousCompletedDate ?? null,
      sourceUsername: followedPlan.sourceUsername ?? null,
      targetReviewDate: followedPlan.targetReviewDate,
      reviewCadence: followedPlan.reviewCadence ?? null,
      nextReviewDueAt: followedPlan.nextReviewDueAt ?? null,
      reflectionNotes: followedPlan.reflectionNotes || [],
    };

    const { error } = await supabase.from('user_plan_follows').upsert({
      id: followId,
      user_id: userId,
      original_plan_id: followedPlan.originalPlanId,
      title: followedPlan.title,
      description: followedPlan.description,
      steps: stepsPayload,
      is_completed: followedPlan.isCompleted,
      points_awarded: followedPlan.pointsAwarded || 0,
      review_cadence: followedPlan.reviewCadence || null,
      next_review_due_at: followedPlan.nextReviewDueAt || null,
    });

    if (error) {
      console.error('Error syncing followed plan to Supabase:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase followed plan sync error:', e);
    return false;
  }
}

/** Deletes this user's copy of a plan; resolves true once the row is gone (or never existed). */
export async function deleteFollowedPlanFromSupabase(followedPlanId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('user_plan_follows').delete().eq('id', followedPlanId);
    if (error) {
      console.error('Error deleting followed plan from Supabase:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase followed plan delete error:', e);
    return false;
  }
}

function parseArrayField(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

export function mapRowToImprovementPlan(row: any): ImprovementPlan {
  let rawSteps = row?.steps;
  if (typeof rawSteps === 'string') {
    try { rawSteps = JSON.parse(rawSteps); } catch (e) {}
  }
  const isStepsArray = Array.isArray(rawSteps);
  const stepsMeta = !isStepsArray && typeof rawSteps === 'object' && rawSteps !== null ? rawSteps : {};
  const stepsList = isStepsArray ? rawSteps : (Array.isArray(stepsMeta.items) ? stepsMeta.items : []);

  const metaReflections = parseArrayField(stepsMeta.reflectionNotes);
  const rowReflections = parseArrayField(row?.reflection_notes);
  const reflectionNotes = metaReflections.length > 0 ? metaReflections : rowReflections;

  return {
    id: row?.id || '',
    creatorId: row?.creator_id || '',
    creatorUsername: row?.creator_username || 'Member',
    creatorAvatar: row?.creator_avatar || '🧑',
    creatorPoints: row?.creator_points || 0,
    title: row?.title || 'Untitled Plan',
    description: row?.description || '',
    category: row?.category || 'Personal Growth',
    isPublic: Boolean(row?.is_public),
    steps: Array.isArray(stepsList) ? stepsList : [],
    copyCount: typeof row?.copy_count === 'number' ? row.copy_count : 0,
    createdAt: row?.created_at || trustedNow().toISOString(),

    // Phase B Plan Type Properties
    planType: stepsMeta.planType || row?.plan_type || 'milestone',
    targetValue: stepsMeta.targetValue !== undefined ? Number(stepsMeta.targetValue) : (row?.target_value !== undefined && row?.target_value !== null ? Number(row.target_value) : undefined),
    targetUnit: stepsMeta.targetUnit || row?.target_unit || '',
    currentProgress: stepsMeta.currentProgress !== undefined ? Number(stepsMeta.currentProgress) : (row?.current_progress !== undefined && row?.current_progress !== null ? Number(row.current_progress) : 0),
    targetDate: stepsMeta.targetDate || row?.target_date || '',
    cadence: stepsMeta.cadence || row?.cadence || 'daily',
    duration: stepsMeta.duration !== undefined ? Number(stepsMeta.duration) : (row?.duration !== undefined && row?.duration !== null ? Number(row.duration) : 30),
    startDate: stepsMeta.startDate || row?.start_date || trustedNow().toISOString(),
    streakCount: stepsMeta.streakCount !== undefined ? Number(stepsMeta.streakCount) : (row?.streak_count !== undefined && row?.streak_count !== null ? Number(row.streak_count) : 0),
    lastCompletedDate: stepsMeta.lastCompletedDate || row?.last_completed_date || '',
    previousCompletedDate: stepsMeta.previousCompletedDate || undefined,
    targetReviewDate: stepsMeta.targetReviewDate || row?.target_review_date || '',
    reviewCadence: row?.review_cadence || stepsMeta.reviewCadence || null,
    nextReviewDueAt: row?.next_review_due_at || stepsMeta.nextReviewDueAt || null,
    reflectionNotes,
    syncStatus: 'synced',
  };
}

export function mapRowToUserPlanFollow(row: any): UserPlanFollow {
  let rawSteps = row?.steps;
  if (typeof rawSteps === 'string') {
    try { rawSteps = JSON.parse(rawSteps); } catch (e) {}
  }
  const isStepsArray = Array.isArray(rawSteps);
  const stepsMeta = !isStepsArray && typeof rawSteps === 'object' && rawSteps !== null ? rawSteps : {};
  const stepsList = isStepsArray ? rawSteps : (Array.isArray(stepsMeta.items) ? stepsMeta.items : []);

  const metaReflections = parseArrayField(stepsMeta.reflectionNotes);
  const rowReflections = parseArrayField(row?.reflection_notes);
  const reflectionNotes = metaReflections.length > 0 ? metaReflections : rowReflections;

  return {
    id: row?.id || '',
    userId: row?.user_id || '',
    originalPlanId: row?.original_plan_id || '',
    sourceUsername: stepsMeta.sourceUsername || undefined,
    title: row?.title || 'Untitled Plan',
    description: row?.description || '',
    steps: Array.isArray(stepsList) ? stepsList : [],
    isCompleted: Boolean(row?.is_completed),
    pointsAwarded: row?.points_awarded || 0,
    createdAt: row?.created_at || trustedNow().toISOString(),

    // Phase B Plan Type Properties
    planType: stepsMeta.planType || row?.plan_type || 'milestone',
    targetValue: stepsMeta.targetValue !== undefined ? Number(stepsMeta.targetValue) : (row?.target_value !== undefined && row?.target_value !== null ? Number(row.target_value) : undefined),
    targetUnit: stepsMeta.targetUnit || row?.target_unit || '',
    currentProgress: stepsMeta.currentProgress !== undefined ? Number(stepsMeta.currentProgress) : (row?.current_progress !== undefined && row?.current_progress !== null ? Number(row.current_progress) : 0),
    targetDate: stepsMeta.targetDate || row?.target_date || '',
    cadence: stepsMeta.cadence || row?.cadence || 'daily',
    duration: stepsMeta.duration !== undefined ? Number(stepsMeta.duration) : (row?.duration !== undefined && row?.duration !== null ? Number(row.duration) : 30),
    startDate: stepsMeta.startDate || row?.start_date || trustedNow().toISOString(),
    streakCount: stepsMeta.streakCount !== undefined ? Number(stepsMeta.streakCount) : (row?.streak_count !== undefined && row?.streak_count !== null ? Number(row.streak_count) : 0),
    lastCompletedDate: stepsMeta.lastCompletedDate || row?.last_completed_date || '',
    previousCompletedDate: stepsMeta.previousCompletedDate || undefined,
    targetReviewDate: stepsMeta.targetReviewDate || row?.target_review_date || '',
    reviewCadence: row?.review_cadence || stepsMeta.reviewCadence || null,
    nextReviewDueAt: row?.next_review_due_at || stepsMeta.nextReviewDueAt || null,
    reflectionNotes,
  };
}

export interface FetchPublicPlansParams {
  search?: string;
  category?: string;
  planType?: string;
  sortBy?: 'recent' | 'followed' | 'creator_rank';
}

/**
 * Public plans for Discover, filtered and sorted on the server. Resolves null when the request
 * fails, so the page can tell "no matches" from "couldn't load". copy_count is kept by the
 * user_plan_follows trigger. 'creator_rank' comes back newest first; the page orders it by the
 * creators' season points, the same numbers their tier badges show.
 */
export async function fetchPublicPlansFromSupabase(options?: FetchPublicPlansParams): Promise<ImprovementPlan[] | null> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase.from('improvement_plans').select('*').eq('is_public', true);

    if (options?.category && options.category !== 'All') {
      query = query.eq('category', options.category);
    }

    // The type lives in the steps JSON; plans saved before types existed have none and are milestones.
    if (options?.planType && options.planType !== 'all') {
      query =
        options.planType === 'milestone'
          ? query.or('steps->>planType.eq.milestone,steps->>planType.is.null')
          : query.eq('steps->>planType', options.planType);
    }

    // Characters that would break the or() filter syntax are dropped from the search text.
    const search = (options?.search || '').replace(/[,()*%\\]/g, ' ').trim();
    if (search) {
      const term = `%${search}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term}`);
    }

    query =
      options?.sortBy === 'followed'
        ? query.order('copy_count', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error || !data) {
      console.warn('Error querying public plans from Supabase:', error);
      return null;
    }
    return data.map((row) => mapRowToImprovementPlan(row));
  } catch (e) {
    console.error('Error fetching public plans from Supabase:', e);
    return null;
  }
}

export async function sendPartnerInviteSupabase(invite: PartnerInvite) {
  if (!isSupabaseConfigured) return;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const inviteId = uuidPattern.test(invite.id) ? invite.id : crypto.randomUUID();

  // Dynamically resolve sender UUID from active Supabase session or profile
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData?.user?.id;
  const fromUserId = authUserId || (uuidPattern.test(invite.fromUserId) ? invite.fromUserId : null);

  if (!fromUserId) {
    throw new Error("Couldn't send the invite. Sign in again and try again.");
  }

  // 1. Try atomic SECURITY DEFINER RPC first
  const { data: rpcData, error: rpcErr } = await supabase.rpc('send_partner_invite_atomic', {
    p_invite_id: inviteId,
    p_from_user_id: fromUserId,
    p_from_username: invite.fromUsername,
    p_from_avatar: invite.fromAvatar || '🧑',
    p_to_user_id: invite.toUserId,
    p_to_username: invite.toUsername,
  });

  if (!rpcErr && rpcData) {
    if (rpcData.success === false) {
      throw new Error(rpcData.error || "Couldn't send the invite. Try again.");
    }
    return;
  }

  // No direct table insert fallback: the server only accepts invites through the RPC,
  // which enforces the 5-partner cap. Its errors (e.g. invites turned off) reach the user.
  console.error('send_partner_invite_atomic failed:', rpcErr?.message);
  throw new Error(rpcErr?.message || "Couldn't send the invite. Try again.");
}

/** Null when the fetch failed (the caller keeps what it already shows); [] means none. */
export async function fetchPartnerInvitesSupabase(userId: string, username: string): Promise<PartnerInvite[] | null> {
  if (!isSupabaseConfigured) return [];
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    let filterString = `to_username.ilike.${username},from_username.ilike.${username}`;
    if (isUuid) {
      filterString += `,to_user_id.eq.${userId},from_user_id.eq.${userId}`;
    }

    const { data, error } = await supabase
      .from('partner_invites')
      .select('*')
      .or(filterString)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.warn('Supabase fetch partner invites warning:', error.message);
      return null;
    }

    return data.map((row) => ({
      id: row.id,
      fromUserId: row.from_user_id,
      fromUsername: row.from_username,
      fromAvatar: row.from_avatar || '🧑',
      toUserId: row.to_user_id,
      toUsername: row.to_username,
      status: row.status as 'pending' | 'accepted' | 'declined',
      createdAt: row.created_at,
    }));
  } catch (e) {
    console.error('Error fetching partner invites from Supabase:', e);
    return null;
  }
}

export async function cleanupPendingInvitesBetweenUsersSupabase(
  user1Id: string,
  user1Username: string,
  user2Id: string,
  user2Username: string
) {
  if (!isSupabaseConfigured) return;
  try {
    const isUuid1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user1Id);
    const isUuid2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user2Id);

    let orFilter = `and(from_username.ilike.${user1Username},to_username.ilike.${user2Username}),and(from_username.ilike.${user2Username},to_username.ilike.${user1Username})`;
    if (isUuid1 && isUuid2) {
      orFilter += `,and(from_user_id.eq.${user1Id},to_user_id.eq.${user2Id}),and(from_user_id.eq.${user2Id},to_user_id.eq.${user1Id})`;
    }

    await supabase.from('partner_invites').delete().or(orFilter);
  } catch (e) {
    console.warn('Error cleaning up partner invites between users:', e);
  }
}

export async function acceptPartnerInviteAtomicSupabase(
  inviteId: string,
  user1Id: string,
  user1Username: string,
  user2Id: string,
  user2Username: string
): Promise<{ success: true; partnershipId: string } | { success: false; error: string }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Partners need an online account.' };
  // The server builds the partnership from the invite's own two users and returns its id.
  // A failed call throws (the invite stays); a refused invite returns success: false.
  const { data, error } = await supabase.rpc('accept_partner_invite_atomic', {
    p_invite_id: inviteId,
    p_user1_id: user1Id,
    p_user1_username: user1Username,
    p_user2_id: user2Id,
    p_user2_username: user2Username,
  });
  if (error) {
    console.error('RPC accept_partner_invite_atomic failed:', error);
    throw new Error("Couldn't accept the invite. Try again.");
  }
  if (!data?.success || !data.partnership_id) {
    return { success: false, error: data?.error || 'This invite is no longer available' };
  }

  // Always ensure all pending invites between these 2 users are deleted
  await cleanupPendingInvitesBetweenUsersSupabase(user1Id, user1Username, user2Id, user2Username);

  return { success: true, partnershipId: data.partnership_id };
}

/** Recipient declines: the server sends the "declined" notice and removes the invite in one step. */
export async function declinePartnerInviteSupabase(inviteId: string) {
  if (!isSupabaseConfigured || !inviteId) return;
  const { data, error } = await supabase.rpc('decline_partner_invite_atomic', { p_invite_id: inviteId });
  if (error || (data && data.success === false)) {
    console.error('declinePartnerInviteSupabase failed:', error ?? data);
    throw new Error("Couldn't decline the invite. Try again.");
  }
}

export async function deletePartnerInviteSupabase(inviteId: string) {
  if (!isSupabaseConfigured || !inviteId) return;
  try {
    const { error } = await supabase.from('partner_invites').delete().eq('id', inviteId);
    if (error) {
      console.error('Error deleting partner invite in Supabase:', error);
      throw new Error(error.message || "Couldn't remove the invite. Try again.");
    }
  } catch (e) {
    console.error('deletePartnerInviteSupabase failed:', e);
    throw e;
  }
}

export async function fetchPartnershipSupabase(userId: string, username?: string): Promise<Partnership | null> {
  if (!isSupabaseConfigured || (!userId && !username)) return null;
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    let filterString = '';
    if (isUuid) {
      filterString = `user1_id.eq.${userId},user2_id.eq.${userId}`;
    }
    if (username) {
      const userFilter = `user1_username.ilike.${username},user2_username.ilike.${username}`;
      filterString = filterString ? `${filterString},${userFilter}` : userFilter;
    }
    if (!filterString) return null;

    const { data, error } = await supabase
      .from('partnerships')
      .select('*')
      .or(filterString)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      user1Id: data.user1_id,
      user1Username: data.user1_username,
      user2Id: data.user2_id,
      user2Username: data.user2_username,
      pairedAt: data.paired_at,
    };
  } catch (e) {
    console.error('Error fetching partnership from Supabase:', e);
    return null;
  }
}

/** Null when the fetch failed (the caller keeps what it already shows); [] means none. */
export async function fetchPartnershipsSupabase(userId: string): Promise<Partnership[] | null> {
  if (!isSupabaseConfigured || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return [];
  try {
    const { data, error } = await supabase
      .from('partnerships')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error || !data) return null;

    const mapped = data.map((row) => ({
      id: row.id,
      user1Id: row.user1_id,
      user1Username: row.from_username || row.user1_username,
      user2Id: row.user2_id,
      user2Username: row.user2_username,
      pairedAt: row.paired_at,
    }));

    // Sort deterministically by id before deduplication so both partners always select the exact same record
    mapped.sort((a, b) => a.id.localeCompare(b.id));

    // One partnership per pair of users
    const dedupMap = new Map<string, Partnership>();
    for (const p of mapped) {
      const key = [p.user1Id, p.user2Id].sort().join(':::');
      if (!dedupMap.has(key)) {
        dedupMap.set(key, p);
      }
    }
    return Array.from(dedupMap.values());
  } catch (e) {
    console.error('Error fetching partnerships from Supabase:', e);
    return null;
  }
}

export async function deletePartnershipSupabase(partnershipId: string) {
  if (!isSupabaseConfigured || !partnershipId) return;
  try {
    // One server step: tells the partner, then removes the pair's challenges and the partnership.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('end_partnership_atomic', { p_partnership_id: partnershipId });
    if (!rpcErr) {
      if (rpcData?.success === false) {
        throw new Error(rpcData.error || "Couldn't remove the partner. Try again.");
      }
      return;
    }
    console.warn('RPC end_partnership_atomic unavailable, falling back to direct delete:', rpcErr);

    // Fallback (database without the RPC yet): the pair's shared challenges go with the
    // partnership (FK cascade); members cannot delete them directly.
    const { error } = await supabase.from('partnerships').delete().eq('id', partnershipId);
    if (error) {
      console.error('Supabase partnership delete error:', error);
      throw new Error(error.message || "Couldn't end the pairing. Try again.");
    }
  } catch (e) {
    console.error('deletePartnershipSupabase failed:', e);
    throw e;
  }
}

export async function saveSharedChallengeSupabase(challenge: SharedChallenge) {
  if (!isSupabaseConfigured) return;
  try {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const challengeId = uuidPattern.test(challenge.id) ? challenge.id : crypto.randomUUID();

    const u1Scalar = challenge.user1DoneDate || (challenge.user1DoneDates && challenge.user1DoneDates.length ? challenge.user1DoneDates[challenge.user1DoneDates.length - 1] : null);
    const u2Scalar = challenge.user2DoneDate || (challenge.user2DoneDates && challenge.user2DoneDates.length ? challenge.user2DoneDates[challenge.user2DoneDates.length - 1] : null);

    const rpcParams = {
      p_id: challengeId,
      p_partnership_id: challenge.partnershipId,
      p_title: challenge.title,
      p_target_habit_name: challenge.targetHabitName,
      p_duration_days: challenge.durationDays,
      p_joint_streak: challenge.jointStreak || 0,
      p_total_joint_days_completed: challenge.totalJointDaysCompleted ?? 0,
      p_user1_category: challenge.user1Category || 'habit',
      p_user1_target: challenge.user1Target || challenge.targetHabitName || '',
      p_user2_category: challenge.user2Category || 'habit',
      p_user2_target: challenge.user2Target || challenge.targetHabitName || '',
      p_user1_done_date: u1Scalar,
      p_user2_done_date: u2Scalar,
      p_user1_done_dates: challenge.user1DoneDates || [],
      p_user2_done_dates: challenge.user2DoneDates || [],
      // The status is the server's (shared_challenges_guard derives it on every write, the hourly
      // pact expiry ends it once both members' last day is over); the app never sends its own.
      p_status: null,
    };

    // 1. Try atomic SECURITY DEFINER RPC first to bypass client RLS discrepancies
    const { data: rpcData, error: rpcError } = await supabase.rpc('save_shared_challenge_atomic', rpcParams);
    if (!rpcError && rpcData?.success) {
      return;
    }

    if (rpcError) {
      console.warn('RPC save_shared_challenge_atomic reported error, falling back to direct upsert:', rpcError);
    } else if (rpcData && !rpcData.success) {
      console.error('RPC save_shared_challenge_atomic business error:', rpcData.error);
      throw new Error(rpcData.error || "Couldn't save the pact. Try again.");
    }

    // 2. Direct upsert fallback
    const payload: Record<string, any> = {
      id: challengeId,
      partnership_id: challenge.partnershipId,
      title: challenge.title,
      target_habit_name: challenge.targetHabitName,
      duration_days: challenge.durationDays,
      joint_streak: challenge.jointStreak,
      total_joint_days_completed: challenge.totalJointDaysCompleted ?? 0,
      user1_category: challenge.user1Category || 'habit',
      user1_target: challenge.user1Target || challenge.targetHabitName,
      user2_category: challenge.user2Category || 'habit',
      user2_target: challenge.user2Target || challenge.targetHabitName,
      user1_done_date: u1Scalar,
      user2_done_date: u2Scalar,
      user1_done_dates: challenge.user1DoneDates || [],
      user2_done_dates: challenge.user2DoneDates || [],
    };

    let { error } = await supabase.from('shared_challenges').upsert(payload);
    if (error && (error.code === 'PGRST204' || error.message?.includes('user1_done_dates'))) {
      // Fallback: If PostgREST schema cache does not have user1_done_dates/user2_done_dates columns yet, save without them
      delete payload.user1_done_dates;
      delete payload.user2_done_dates;
      const fallbackRes = await supabase.from('shared_challenges').upsert(payload);
      error = fallbackRes.error;
    }

    if (error) {
      console.error('Error saving shared challenge to Supabase:', error);
      throw new Error(error.message || "Couldn't save the pact. Try again.");
    }
  } catch (e: any) {
    console.error('saveSharedChallengeSupabase failed:', e);
    throw e;
  }
}

/** Null when the fetch failed (the caller keeps what it already shows); [] means none. */
export async function fetchSharedChallengesSupabase(partnershipIds: string | string[]): Promise<SharedChallenge[] | null> {
  if (!isSupabaseConfigured) return [];
  const ids = Array.isArray(partnershipIds) ? partnershipIds : [partnershipIds];
  if (ids.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('shared_challenges')
      .select('*')
      .in('partnership_id', ids)
      .order('created_at', { ascending: false });

    if (error || !data) return null;

    const mapped = data
      .map((row) => ({
        id: row.id,
        partnershipId: row.partnership_id,
        title: row.title,
        targetHabitName: row.target_habit_name,
        durationDays: row.duration_days,
        jointStreak: row.joint_streak,
        totalJointDaysCompleted: row.total_joint_days_completed ?? 0,
        user1Category: (row.user1_category as any) || 'habit',
        user1Target: row.user1_target || row.target_habit_name,
        user2Category: (row.user2_category as any) || 'habit',
        user2Target: row.user2_target || row.target_habit_name,
        user1DoneDate: row.user1_done_date || undefined,
        user2DoneDate: row.user2_done_date || undefined,
        user1DoneDates: (Array.isArray(row.user1_done_dates) && row.user1_done_dates.length)
          ? row.user1_done_dates
          : (row.user1_done_date ? [row.user1_done_date] : []),
        user2DoneDates: (Array.isArray(row.user2_done_dates) && row.user2_done_dates.length)
          ? row.user2_done_dates
          : (row.user2_done_date ? [row.user2_done_date] : []),
        status: row.status as 'active' | 'completed' | 'expired',
        createdAt: row.created_at,
      }))
      .map((c) => reconcileSharedChallengeLifecycle(c));

    // Deduplicate active challenges by (partnershipId + normalized title)
    const chalMap = new Map<string, SharedChallenge>();
    for (const c of mapped) {
      const normTitle = (c.title || '').trim().toLowerCase();
      const activeKey = c.status === 'active' ? `ACTIVE:::${c.partnershipId}:::${normTitle}` : c.id;
      if (!chalMap.has(activeKey)) {
        chalMap.set(activeKey, c);
      }
    }
    return Array.from(chalMap.values());
  } catch (e) {
    console.error('Error fetching shared challenges from Supabase:', e);
    return null;
  }
}

export async function deleteSharedChallengeSupabase(challengeId: string) {
  if (!isSupabaseConfigured || !challengeId) return;
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_shared_challenge_atomic', { p_challenge_id: challengeId });
    // The RPC is the only delete path (it tells the partner); members have no direct DELETE.
    if (rpcErr || !rpcData?.success) {
      console.error('RPC delete_shared_challenge_atomic failed:', rpcErr || rpcData?.error);
      throw new Error(rpcData?.error || "Couldn't delete the pact. Try again.");
    }
  } catch (e: any) {
    console.error('deleteSharedChallengeSupabase failed:', e);
    throw e;
  }
}

/* ==========================================
   NOTIFICATION SYSTEM HELPERS
   ========================================== */

/** The inbox window: the newest NOTIFICATION_WINDOW notices from the last NOTIFICATION_MAX_AGE_DAYS
 *  days. The store's sanitize keeps the same window, so the list and the badge never change on reload. */
export const NOTIFICATION_WINDOW = 50;
export const NOTIFICATION_MAX_AGE_DAYS = 30;

/** Null when the fetch failed (the caller keeps the list it already shows); [] means an empty inbox. */
export async function fetchNotificationsSupabase(recipientId: string): Promise<AppNotification[] | null> {
  if (!isSupabaseConfigured || !recipientId) return [];
  try {
    const since = new Date(trustedNowMs() - NOTIFICATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_WINDOW);

    if (error || !data) {
      if (error) console.warn('Supabase fetch notifications warning:', error.message);
      return null;
    }

    return data.map((row) => ({
      id: row.id,
      recipientId: row.recipient_id,
      actorId: row.actor_id || undefined,
      actorUsername: row.actor_username || undefined,
      actorAvatar: row.actor_avatar || undefined,
      type: row.type,
      title: row.title || undefined,
      message: row.message,
      payload: row.payload || {},
      read: row.read ?? false,
      createdAt: row.created_at,
    }));
  } catch (e) {
    console.error('Error fetching notifications from Supabase:', e);
    return null;
  }
}

export async function createNotificationSupabase(
  notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
): Promise<AppNotification | null> {
  if (!isSupabaseConfigured || !notif.recipientId) return null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const actorId = authData?.user?.id || notif.actorId || null;

    // 1. Execute SECURITY DEFINER RPC (executes atomic check, auth validation, and insert)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_notification_atomic', {
      p_recipient_id: notif.recipientId,
      p_actor_id: actorId,
      p_actor_username: notif.actorUsername || null,
      p_actor_avatar: notif.actorAvatar || null,
      p_type: notif.type,
      p_title: notif.title || null,
      p_message: notif.message,
      p_payload: notif.payload || {},
    });

    if (rpcErr) {
      console.error('[createNotificationSupabase] RPC create_notification_atomic failed:', rpcErr.message, 'Code:', rpcErr.code);
      return null;
    }

    if (!rpcData) return null; // Deduplicated or preference-suppressed by atomic Postgres RPC

    if (typeof rpcData !== 'string') {
      console.error('[createNotificationSupabase] Unexpected rpcData return shape, expected string UUID:', rpcData);
      return null;
    }

    return {
      id: rpcData,
      recipientId: notif.recipientId,
      actorId: actorId || undefined,
      actorUsername: notif.actorUsername || undefined,
      actorAvatar: notif.actorAvatar || undefined,
      type: notif.type,
      title: notif.title || undefined,
      message: notif.message,
      payload: notif.payload || {},
      read: false,
      createdAt: trustedNow().toISOString(),
    };
  } catch (e) {
    console.error('createNotificationSupabase error:', e);
    return null;
  }
}

/** Throws when the row could not be updated, so the caller can put the unread state back. */
export async function markNotificationReadSupabase(notificationId: string) {
  if (!isSupabaseConfigured || !notificationId) return;
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  if (error) throw new Error(error.message || "Couldn't mark the notification as read.");
}

/** Throws when the rows could not be updated, so the caller can put the unread state back. */
export async function markAllNotificationsReadSupabase(recipientId: string) {
  if (!isSupabaseConfigured || !recipientId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', recipientId)
    .eq('read', false);
  if (error) throw new Error(error.message || "Couldn't mark notifications as read.");
}

/** Throws when the row could not be deleted, so the caller can put the notification back. */
export async function clearNotificationSupabase(notificationId: string) {
  if (!isSupabaseConfigured || !notificationId) return;
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) throw new Error(error.message || "Couldn't clear the notification.");
}
/** Deletes these (read) notices in one request. Throws on failure so the caller can put them back. */
export async function clearNotificationsSupabase(notificationIds: string[]) {
  if (!isSupabaseConfigured || notificationIds.length === 0) return;
  const { error } = await supabase.from('notifications').delete().in('id', notificationIds);
  if (error) throw new Error(error.message || "Couldn't clear notifications.");
}
