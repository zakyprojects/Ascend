import { AppState, LeagueCompetitor, LeagueType, SeasonHistoryEntry, NotificationPreferenceKey } from '@/types';
import { newPasswordProblem } from './passwordRules';
import { sanitizePointsHistory } from './leagues';
import { leagueNow, getSeasonNumber, getWeekPeriodId, getMonthPeriodId } from './leagueTime';
import { todayKey, parseDate } from './dates';
import { getHighestUserStreak } from './habitPenalties';
import { clearSyncStorage } from './sync/outbox';
import {
  supabase,
  isSupabaseConfigured,
  clearUserDataWatermark,
  fetchMyPrivateProfile,
  verifyAccountPassword,
} from './supabase';
import { trustedNow, trustedNowMs } from './clock';
import { isUsernameTakenError, looksLikeUsername, sameUsername, USERNAME_TAKEN, usernameFormatProblem } from './usernameRules';
import { NETWORK_MESSAGE } from './userMessage';
import { FunctionsHttpError } from '@supabase/supabase-js';

let cachedProfiles: any[] = [];

export function setCachedProfiles(profiles: any[]) {
  cachedProfiles = profiles;
}

/** Weekly/monthly league points per period id, then per member id (from ascend_league_points). */
let cachedLeaguePoints: Record<string, Record<string, number>> = {};

/** null = none yet (signed out): standings read as 0. */
export function setCachedLeaguePoints(points: Record<string, Record<string, number>> | null) {
  cachedLeaguePoints = points ?? {};
}

export function computeCompetitorLeaguePoints(
  profile: any,
  type: LeagueType,
  now: Date
): number {
  if (type === 'ninetyDay') {
    // The server derives both: season_points for the season running now, season_history for
    // closed ones. The member's own season_id is not trusted (it lags until they open the app).
    const season = getSeasonNumber(now);
    if (season === getSeasonNumber(leagueNow())) {
      return typeof profile.season_points === 'number' ? profile.season_points : 0;
    }
    const seasonHistory: SeasonHistoryEntry[] = profile.season_history || [];
    const closed = seasonHistory.find((e) => e && e.seasonNumber === season);
    return closed && typeof closed.points === 'number' ? closed.points : 0;
  }

  // Weekly / monthly: summed by the server from the full ledger (profiles carry no point entries).
  const periodId = type === 'weekly' ? getWeekPeriodId(now) : getMonthPeriodId(now);
  return cachedLeaguePoints[periodId]?.[profile.id] ?? 0;
}

export function getProfileSeasonPointsByUsername(
  username: string,
  type: LeagueType,
  now: Date
): number {
  if (!username) return 0;
  const lower = username.toLowerCase();

  // Check cached profiles
  const profile = cachedProfiles.find((p) => p.username?.toLowerCase() === lower);
  if (profile) {
    return computeCompetitorLeaguePoints(profile, type, now);
  }

  return 0;
}

/**
 * Check if a username is available (case-insensitive check against Supabase profiles).
 */
export async function isUsernameAvailable(
  username: string,
  currentUserId?: string
): Promise<{ available: boolean; reason?: string; unknown?: boolean }> {
  const trimmed = username.trim();
  const formatProblem = usernameFormatProblem(trimmed);
  if (formatProblem) {
    return { available: false, reason: formatProblem };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        // No wildcards = case-insensitive equality; "_" is a LIKE wildcard, so it is escaped.
        .ilike('username', trimmed.replace(/_/g, '\\_'));

      if (error) {
        // Not known: the server still refuses a taken name when it is saved.
        console.warn('Username check query error:', error.message);
        return { available: true, unknown: true };
      } else if (data && data.length > 0) {
        const taken = data.some((p) => p.id !== currentUserId && sameUsername(p.username, trimmed));
        if (taken) {
          return { available: false, reason: USERNAME_TAKEN };
        }
      }
    } catch (e) {
      console.warn('Username check failed:', e);
      return { available: true, unknown: true };
    }
  }

  return { available: true };
}

/** Never confirms that an email already has an account; other Supabase messages pass through. */
function signUpErrorMessage(message?: string): string {
  if (!message) return "Couldn't create your account. Try again.";
  if (/already (been )?registered|already exists|email_exists|user_already_exists/i.test(message)) {
    return "Couldn't create an account with this email. If you already have one, log in instead.";
  }
  return message;
}

export type SignUpResult =
  | { type: 'session' }
  | { type: 'email_confirmation'; email: string };

/**
 * Register a new user account with Supabase Auth.
 *
 * IMPORTANT: This function ONLY calls supabase.auth.signUp() and returns.
 * It does NOT hydrate profile/user_data or set any app state.
 * All state setup is handled by onAuthStateChange in store.ts (single source of truth).
 *
 * Also stores signup metadata (username, avatar) in sessionStorage so the
 * onAuthStateChange listener can pick it up and use it when creating the profile.
 */
export async function signUpUser(
  email: string,
  password: string,
  username: string,
  avatar: string
): Promise<SignUpResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedUsername = username.trim();

  const check = await isUsernameAvailable(trimmedUsername);
  if (!check.available) {
    throw new Error(check.reason || 'Username is not available.');
  }

  // Store signup defaults in sessionStorage so the auth listener can access them
  try {
    sessionStorage.setItem(
      'ascend_signup_defaults',
      JSON.stringify({
        username: trimmedUsername,
        avatar,
      })
    );
  } catch {
    // sessionStorage may be unavailable in some environments — not critical
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        username: trimmedUsername,
        avatar,
      },
    },
  });

  if (authError) {
    sessionStorage.removeItem('ascend_signup_defaults');
    throw new Error(signUpErrorMessage(authError.message));
  }

  if (!authData.user) {
    sessionStorage.removeItem('ascend_signup_defaults');
    throw new Error("Couldn't create your account. Try again.");
  }

  if (!authData.session) {
    // Email confirmation is enabled — no active session yet
    sessionStorage.removeItem('ascend_signup_defaults');
    return { type: 'email_confirmation', email: trimmedEmail };
  }

  // Session is active (email confirmation disabled).
  // onAuthStateChange will fire SIGNED_IN and hydrate state.
  return { type: 'session' };
}

/** Shown for a wrong password or an unknown account alike, so it never says which. */
const WRONG_EMAIL_LOGIN = 'Wrong email or password.';
const WRONG_USERNAME_LOGIN = 'Wrong username or password.';

/**
 * Log in an existing user account with Supabase Auth, by email or by username (one field: an
 * entry with "@" is an email; usernames can't contain one).
 *
 * IMPORTANT: This function ONLY signs in with Supabase Auth and returns.
 * It does NOT hydrate profile/user_data or set any app state.
 * All state setup is handled by onAuthStateChange in store.ts (single source of truth).
 */
export async function loginUser(identifier: string, password: string): Promise<void> {
  const trimmed = identifier.trim();
  if (!trimmed.includes('@')) {
    await loginWithUsername(trimmed, password);
    return;
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: trimmed.toLowerCase(),
    password,
  });

  if (authError) {
    const msg = authError.message || WRONG_EMAIL_LOGIN;
    if (authError.code === 'invalid_credentials' || msg.toLowerCase().includes('invalid login credentials')) {
      throw new Error(WRONG_EMAIL_LOGIN);
    }
    throw authError;
  }
  // Success: onAuthStateChange fires SIGNED_IN, hydrates profile+state in store.ts
}

/**
 * Username sign-in: the sign-in-username Edge Function finds the account's email on the server
 * (it is never sent to the app), signs in, and returns the session, which setSession stores. That
 * fires SIGNED_IN like an email sign-in does.
 */
async function loginWithUsername(username: string, password: string): Promise<void> {
  if (!looksLikeUsername(username)) throw new Error(WRONG_USERNAME_LOGIN);

  const { data, error } = await supabase.functions.invoke<{ access_token?: string; refresh_token?: string }>(
    'sign-in-username',
    { body: { username, password } }
  );

  if (error) {
    const status = error instanceof FunctionsHttpError ? (error.context as Response | undefined)?.status : undefined;
    if (status === 401) throw new Error(WRONG_USERNAME_LOGIN);
    if (status === 403) throw new Error('Confirm your email first: open the link we sent you, then sign in.');
    if (status === 429) throw new Error('Too many sign-in attempts. Wait a few minutes, or sign in with your email.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NETWORK_MESSAGE);
    console.error('Username sign-in failed:', error);
    throw new Error('Couldn’t sign in with your username right now. Try your email instead.');
  }
  if (!data?.access_token || !data.refresh_token) {
    throw new Error('Couldn’t sign in with your username right now. Try your email instead.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw new Error('Couldn’t finish signing in. Try again.');
  // Success: setSession fires SIGNED_IN, hydrates profile+state in store.ts
}

/**
 * Sign in as an anonymous guest user with Supabase Auth.
 *
 * IMPORTANT: This function ONLY calls supabase.auth.signInWithAnonymous() and returns.
 * State hydration is handled by onAuthStateChange in store.ts (single source of truth).
 */
export async function signInAsGuest(): Promise<void> {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(error.message || "Couldn't sign in as a guest. Try again.");
  }
}

/**
 * Upgrade an anonymous guest user account to a permanent email/password account.
 *
 * Uses supabase.auth.updateUser({ email, password }) to preserve the user's UUID and data.
 */
export async function upgradeAnonymousUser(
  email: string,
  password: string,
  newUsername?: string,
  newAvatar?: string
): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedUsername = newUsername?.trim();

  // 1. Retrieve current user to obtain their ID
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You're not signed in. Sign in and try again.");
  }

  // 2. Validate username availability if provided
  if (trimmedUsername) {
    const check = await isUsernameAvailable(trimmedUsername, user.id);
    if (!check.available) {
      throw new Error(check.reason || 'Username is not available.');
    }
  }

  // 3. Update profiles table FIRST so DB row is authoritative before auth events fire
  // profiles.email is copied from the auth user by the database, never written here.
  const updates: Record<string, any> = {};
  if (trimmedUsername) updates.username = trimmedUsername;
  if (newAvatar) updates.avatar = newAvatar;

  // Stop here if the profile refuses the name (the database keeps usernames unique in any case),
  // so the account is never created under a username the profile does not have.
  if (Object.keys(updates).length > 0) {
    const { error: profileError } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (profileError) {
      if (isUsernameTakenError(profileError)) throw new Error(USERNAME_TAKEN);
      throw new Error("Couldn't save your profile. Try again.");
    }
  }

  // 4. Clear stale local cache
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem("ascend_user_cache_" + user.id);
      localStorage.removeItem('ascend_guest_state_v2');
    } catch {
      /* ignore */
    }
  }

  // 5. FINALLY, update auth user. This fires USER_UPDATED when DB and cache are already correct
  const userMetadata: Record<string, any> = {};
  if (trimmedUsername) userMetadata.username = trimmedUsername;
  if (newAvatar) userMetadata.avatar = newAvatar;

  const { error } = await supabase.auth.updateUser({
    email: trimmedEmail,
    password,
    data: userMetadata,
  });

  if (error) {
    throw new Error(signUpErrorMessage(error.message));
  }
}

// Set when the user signs out on purpose (logout, account deletion), so the sign-in gate can tell
// that apart from a session that expired on its own (which returns to its page after sign-in).
let signOutByUser = false;

/** True once after a sign-out the user asked for; reading it clears it. */
export function consumeSignOutByUser(): boolean {
  const value = signOutByUser;
  signOutByUser = false;
  return value;
}

/**
 * Logout current user session from Supabase.
 * `scope: 'local'` only clears this device's session (used after account deletion,
 * when the server no longer knows the user and a global sign-out would fail).
 */
export async function logoutUser({ scope = 'global' }: { scope?: 'global' | 'local' } = {}): Promise<void> {
  signOutByUser = true;
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      console.error('Error signing out from Supabase:', error);
      throw new Error(error.message || "Couldn't log out. Try again.");
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('ascend_active_focus_session');
      sessionStorage.removeItem('ascend_focus_tab_alive');
    } catch (e) {
      /* ignore */
    }
  }
}

/**
 * Update username with strict 24-hour rolling cooldown enforcement.
 */
export async function updateUsernameWithCooldown(
  userId: string,
  newUsername: string
): Promise<string> {
  const trimmed = newUsername.trim();
  if (!trimmed) {
    throw new Error('Username cannot be empty.');
  }

  // 1. Check username availability (case-insensitive)
  const check = await isUsernameAvailable(trimmed, userId);
  if (!check.available) {
    throw new Error(check.reason || 'Username is not available.');
  }

  if (isSupabaseConfigured) {
    // 2. Fetch current user profile to check last_username_change_at timestamp
    const prof = (await fetchMyPrivateProfile()) as { last_username_change_at?: string } | null;

    if (!prof) {
      console.warn('Failed to check last username change timestamp.');
    }

    if (prof?.last_username_change_at) {
      const lastChanged = new Date(prof.last_username_change_at).getTime();
      const now = trustedNowMs();
      const msElapsed = now - lastChanged;
      const cooldownMs = 24 * 60 * 60 * 1000;

      if (msElapsed < cooldownMs) {
        const totalMinsLeft = Math.ceil((cooldownMs - msElapsed) / (1000 * 60));
        const hoursLeft = Math.floor(totalMinsLeft / 60);
        const minsLeft = totalMinsLeft % 60;
        throw new Error(
          `Username can only be changed once per 24 hours. Next change available in ${hoursLeft}h ${minsLeft}m.`
        );
      }
    }

    // 3. Rename on the server, which enforces the format, uniqueness and the 24-hour cooldown
    // (ascend_change_username) and stamps the change on its own clock.
    const { data: changedAt, error: updateErr } = await supabase.rpc('ascend_change_username', {
      p_username: trimmed,
    });

    if (updateErr) {
      if (isUsernameTakenError(updateErr)) throw new Error(USERNAME_TAKEN);
      throw new Error(updateErr.message || "Couldn't change your username. Try again.");
    }
    const nowIso = typeof changedAt === 'string' ? changedAt : trustedNow().toISOString();

    // Propagate metadata to Auth
    await supabase.auth.updateUser({
      data: { username: trimmed },
    });

    return nowIso;
  }

  return trustedNow().toISOString();
}

/**
 * Update user avatar instantly (no cooldown).
 */
export async function updateUserAvatar(userId: string, newAvatar: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar: newAvatar })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message || "Couldn't change your avatar. Try again.");
  }

  await supabase.auth.updateUser({
    data: { avatar: newAvatar },
  });
}

/** The current password typed to confirm a change is not the account's. */
export class WrongCurrentPasswordError extends Error {
  constructor() {
    super("That password isn't right.");
    this.name = 'WrongCurrentPasswordError';
  }
}

/**
 * Change current user password in Supabase Auth. With `current`, the current password is checked
 * first (D-S3).
 */
export async function changeUserPassword(newPassword: string, current?: { email: string; password: string }): Promise<void> {
  const problem = newPasswordProblem(newPassword);
  if (problem) {
    throw new Error(`Password: ${problem.toLowerCase()}.`);
  }
  if (current) {
    if ((await verifyAccountPassword(current.email, current.password)) === 'wrong') {
      throw new WrongCurrentPasswordError();
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message || "Couldn't change your password. Try again.");
  }
}

/**
 * Sends a password-reset email. The link opens `/reset-password` on this site (the address must be
 * on the Supabase redirect allow-list). Supabase answers the same whether or not the email has an
 * account, so the screen never says which. Throws Supabase's error as is (429 = too many emails).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

/** Sets a new password for the session a reset link opened (no current password: the email proved it). */
export async function setRecoveredPassword(newPassword: string): Promise<void> {
  const problem = newPasswordProblem(newPassword);
  if (problem) throw new Error(`${problem}.`);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Permanently delete the signed-in user's account. The `delete_own_account` RPC removes the
 * auth user; every user row (profile, user_data, partnerships, plans, notifications...)
 * cascades from it. Throws when the server refuses, so the caller can keep the user signed in.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      throw new Error(error.message || "Couldn't delete your account. Try again.");
    }
  }

  clearLocalUserData(userId);
}

/** Removes everything this device keeps for one account (cache, sync queue, ids). */
export function clearLocalUserData(userId: string): void {
  clearUserDataWatermark(userId);
  clearSyncStorage(userId);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`ascend_user_cache_${userId}`);
      localStorage.removeItem(`ascend_dirty_${userId}`);
      localStorage.removeItem(`ascend_uid_${userId}`);
    } catch {
      /* ignore */
    }
  }
}

/** Writes whether the profile is public. Throws when the write fails, so the caller can put the switch back. */
export async function updateProfilePrivacy(userId: string, isProfilePublic: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('profiles').update({ is_profile_public: isProfilePublic }).eq('id', userId);
  if (error) throw error;
}

/** Writes whether new partner invites are accepted. Throws when the write fails, so the caller can put the switch back. */
export async function updateProfileAcceptPartnerInvites(userId: string, accept: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('profiles').update({ accept_partner_invites: accept }).eq('id', userId);
  if (error) throw error;
}

/**
 * Writes notification preferences to the user's profile. Throws when the write fails,
 * so the caller can put the switch back.
 */
export async function updateProfileNotificationPreferences(
  userId: string,
  prefs: Partial<Record<NotificationPreferenceKey, boolean>>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const payload: Record<string, boolean> = {};
  if (prefs.notifDailyReminder !== undefined) payload.notif_daily_reminder = prefs.notifDailyReminder;
  if (prefs.notifPartnerActivity !== undefined) payload.notif_partner_activity = prefs.notifPartnerActivity;
  if (prefs.notifSundayPlanning !== undefined) payload.notif_sunday_planning = prefs.notifSundayPlanning;

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
}

export function reconstructStateFromProfile(p: any): AppState {
  const pointsHistory = p.points_history || [];
  const activeHabits = p.active_habits || [];

  const habitCompletionsMap: Record<string, string[]> = {};
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const parsedDate = parseDate(e.timestamp);
    if (!parsedDate) return;
    const dateStr = todayKey(parsedDate);
    if (e.source === 'habit_completed' || (e.reason && e.reason.startsWith('Habit completed:'))) {
      const habitName = e.reason ? e.reason.replace('Habit completed: ', '').trim() : 'Habit';
      if (!habitCompletionsMap[habitName]) habitCompletionsMap[habitName] = [];
      if (!habitCompletionsMap[habitName].includes(dateStr)) {
        habitCompletionsMap[habitName].push(dateStr);
      }
    }
  });

  const nowIso = trustedNow().toISOString();
  const habits = activeHabits.map((h: any, i: number) => {
    const dates: string[] = habitCompletionsMap[h.name] || [];
    const completionsMap: Record<string, { done: boolean; updatedAt: string }> = {};
    dates.forEach((d) => {
      completionsMap[d] = { done: true, updatedAt: nowIso };
    });
    return {
      id: `h-${i}`,
      name: h.name,
      category: h.category,
      frequency: h.frequency || 'daily',
      completions: completionsMap,
      createdAtPeriod: todayKey(),
    };
  });

  const workoutDates: string[] = [];
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const parsedDate = parseDate(e.timestamp);
    if (!parsedDate) return;
    const dateStr = todayKey(parsedDate);
    if (e.source === 'workout_logged' || (e.reason && e.reason.toLowerCase().includes('workout'))) {
      if (!workoutDates.includes(dateStr)) workoutDates.push(dateStr);
    }
  });

  const workouts = workoutDates.map((d, i) => ({
    id: `w-${i}`,
    type: 'workout' as const,
    activityType: 'Workout',
    durationMinutes: 30,
    date: d,
    createdAt: d,
    pointsAwarded: 10,
  }));

  const readingDates: string[] = [];
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const parsedDate = parseDate(e.timestamp);
    if (!parsedDate) return;
    const dateStr = todayKey(parsedDate);
    if (e.source === 'book_read' || (e.reason && e.reason.toLowerCase().includes('book'))) {
      if (!readingDates.includes(dateStr)) readingDates.push(dateStr);
    }
  });

  const readingLogs = readingDates.map((d, i) => ({
    id: `r-${i}`,
    bookId: `b-${i}`,
    pagesRead: 10,
    date: d,
    createdAt: d,
    pointsAwarded: 10,
  }));

  return {
    currentUser: null,
    habits,
    journalEntries: [],
    totalPoints: p.total_points || 0,
    pointsHistory: sanitizePointsHistory(p.points_history || []),
    leagueArchives: [],
    readLessonIds: [],
    workouts,
    readingLogs,
    badHabits: [],
    badHabitLogs: [],
    skillLogs: [],
    books: [],
    skills: [],
    improvementPlans: [],
    followedPlans: [],
    focusLogs: [],
  } as unknown as AppState;
}

/**
 * Get all registered real users as LeagueCompetitors for a specific league period.
 */
export function getRegisteredCompetitors(
  type: LeagueType,
  currentUserId: string | undefined,
  now: Date,
  profilesOverride?: any[]
): LeagueCompetitor[] {
  const profiles = profilesOverride || cachedProfiles;
  const competitors: LeagueCompetitor[] = [];

  for (const p of profiles) {
    if (p.id === currentUserId) continue;

    const periodPoints = computeCompetitorLeaguePoints(p, type, now);

    const reconstructedState = reconstructStateFromProfile(p);
    const highestInfo = getHighestUserStreak(reconstructedState, now);

    const prefCurrentDays = p.stats?.currentStreakDays ?? highestInfo.currentStreak.days;
    const prefCurrentCat = p.stats?.currentStreakCategory ?? highestInfo.currentStreak.category;
    const prefCurrentActive = p.stats?.currentStreakIsActive !== undefined
      ? p.stats.currentStreakIsActive
      : highestInfo.currentStreak.isActive;
    // The server sends stats = null when this viewer may not see them: keep them undefined, never
    // zeros that would read as real numbers in the profile dialog (C4).
    const stats = p.stats ? {
      streakDays: prefCurrentDays,
      streakSource: prefCurrentDays > 0 ? prefCurrentCat : undefined,
      currentStreakDays: prefCurrentDays,
      currentStreakCategory: prefCurrentCat,
      currentStreakIsActive: prefCurrentActive,
      habitsCompletedCount: p.stats?.habitsCompletedCount || 0,
      journalEntriesCount: p.stats?.journalEntriesCount || 0,
      exerciseMinutes: p.stats?.exerciseMinutes || 0,
      booksRead: p.stats?.booksRead || 0,
      skillsPracticedCount: p.stats?.skillsPracticedCount || 0,
    } : undefined;

    competitors.push({
      id: p.id,
      uid: p.uid,
      name: p.username || 'Member',
      avatar: p.avatar || '🧑',
      points: periodPoints,
      totalPoints: p.total_points || 0,
      isRealUser: true,
      isProfilePublic: p.is_profile_public ?? true,
      stats,
      activeHabits: p.active_habits || [],
      season_history: p.season_history || [],
    });
  }

  return competitors;
}

/**
 * Fetch profile by 6-digit numeric UID from Supabase profiles or SEED_ACCOUNTS.
 */
export async function fetchProfileByUidFromSupabase(
  targetUid: string
): Promise<{ id: string; username: string; avatar: string; uid: string; accept_partner_invites?: boolean; acceptPartnerInvites?: boolean } | null> {
  const trimmed = targetUid.trim();
  if (!trimmed) return null;

  if (isSupabaseConfigured) {
    try {
      // 1. Try RPC get_profile_by_uid (bypasses client RLS restrictions safely)
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc('get_profile_by_uid', { target_uid: trimmed });

      if (!rpcErr && rpcData && rpcData.length > 0) {
        const item = rpcData[0];
        return {
          ...item,
          accept_partner_invites: item.accept_partner_invites ?? true,
          acceptPartnerInvites: item.accept_partner_invites ?? item.acceptPartnerInvites ?? true,
        };
      }

      // 2. Direct table SELECT fallback
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar, uid, accept_partner_invites')
        .eq('uid', trimmed)
        .maybeSingle();

      if (error) {
        console.warn('Supabase UID lookup warning:', error.message);
      } else if (data) {
        return {
          ...data,
          accept_partner_invites: data.accept_partner_invites ?? true,
          acceptPartnerInvites: data.accept_partner_invites ?? true,
        };
      }
    } catch (e) {
      console.warn('Error executing UID lookup query:', e);
    }
  }

  // Fallback 1: Search in cached public profiles memory array
  const cachedMatch = cachedProfiles.find((p) => p.uid === trimmed);
  if (cachedMatch) {
    return {
      id: cachedMatch.id,
      username: cachedMatch.username,
      avatar: cachedMatch.avatar || '🧑',
      uid: cachedMatch.uid,
      accept_partner_invites: cachedMatch.accept_partner_invites ?? cachedMatch.acceptPartnerInvites ?? true,
      acceptPartnerInvites: cachedMatch.accept_partner_invites ?? cachedMatch.acceptPartnerInvites ?? true,
    };
  }

  return null;
}
