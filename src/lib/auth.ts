import { AppState, UserProfile, LeagueCompetitor, LeagueType, ImprovementPlan, PartnerInvite, Partnership } from '@/types';
import { SEED_ACCOUNTS } from './seedAccounts';
import { getLeaguePeriodStart, calculatePeriodPoints } from './leagues';
import {
  supabase,
  isSupabaseConfigured,
  saveUserDataToSupabase,
  fetchProfileByUsernameFromSupabase,
  fetchAllProfilesFromSupabase,
  fetchPublicPlansFromSupabase,
  fetchPartnerInvitesSupabase,
  savePartnershipSupabase,
  deletePartnershipSupabase,
} from './supabase';

let cachedProfiles: any[] = [];
let cachedPublicPlans: ImprovementPlan[] = [];

export function setCachedProfiles(profiles: any[]) {
  cachedProfiles = profiles;
}

export function setCachedPublicPlans(plans: ImprovementPlan[]) {
  cachedPublicPlans = plans;
}

/**
 * Check if a username is available (case-insensitive check against seed accounts and Supabase profiles).
 */
export async function isUsernameAvailable(
  username: string,
  currentUserId?: string
): Promise<{ available: boolean; reason?: string }> {
  const trimmed = username.trim();
  if (!trimmed) {
    return { available: false, reason: 'Username cannot be empty' };
  }
  if (trimmed.length < 3) {
    return { available: false, reason: 'Username must be at least 3 characters' };
  }
  if (trimmed.length > 20) {
    return { available: false, reason: 'Username must be 20 characters or less' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { available: false, reason: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  const lower = trimmed.toLowerCase();

  const seedMatch = SEED_ACCOUNTS.some((s) => s.username.toLowerCase() === lower);
  if (seedMatch) {
    return { available: false, reason: 'This username is reserved' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', trimmed);

      if (error) {
        console.warn('Username check query error:', error.message);
      } else if (data && data.length > 0) {
        const taken = data.some((p) => p.id !== currentUserId && p.username.toLowerCase() === lower);
        if (taken) {
          return { available: false, reason: 'Username is already taken' };
        }
      }
    } catch (e) {
      console.warn('Username check failed:', e);
    }
  }

  return { available: true };
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
 * Also stores signup metadata (username, avatar, guestState) in sessionStorage so the
 * onAuthStateChange listener can pick it up and use it when creating the profile.
 */
export async function signUpUser(
  email: string,
  password: string,
  username: string,
  avatar: string,
  guestStateToMigrate?: AppState
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
        avatar: avatar || '🧑',
        guestState: guestStateToMigrate ?? null,
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
        avatar: avatar || '🧑',
      },
    },
  });

  if (authError) {
    sessionStorage.removeItem('ascend_signup_defaults');
    throw new Error(authError.message || 'Failed to create account in Supabase.');
  }

  if (!authData.user) {
    sessionStorage.removeItem('ascend_signup_defaults');
    throw new Error('Failed to create account in Supabase.');
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

/**
 * Log in an existing user account with Supabase Auth.
 *
 * IMPORTANT: This function ONLY calls supabase.auth.signInWithPassword() and returns.
 * It does NOT hydrate profile/user_data or set any app state.
 * All state setup is handled by onAuthStateChange in store.ts (single source of truth).
 */
export async function loginUser(email: string, password: string): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (authError) {
    const msg = authError.message || 'Invalid email or password.';
    if (msg.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Invalid email or password. Please check your credentials and try again.');
    }
    throw new Error(msg);
  }
  // Success: onAuthStateChange fires SIGNED_IN, hydrates profile+state in store.ts
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
    throw new Error(error.message || 'Failed to continue as guest.');
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

  if (trimmedUsername) {
    const { data: { user } } = await supabase.auth.getUser();
    const check = await isUsernameAvailable(trimmedUsername, user?.id);
    if (!check.available) {
      throw new Error(check.reason || 'Username is not available.');
    }
  }

  const userMetadata: Record<string, any> = {};
  if (trimmedUsername) userMetadata.username = trimmedUsername;
  if (newAvatar) userMetadata.avatar = newAvatar;

  const { data, error } = await supabase.auth.updateUser({
    email: trimmedEmail,
    password,
    data: userMetadata,
  });

  if (error) {
    throw new Error(error.message || 'Failed to upgrade account.');
  }

  if (data.user) {
    const updates: Record<string, any> = { email: trimmedEmail };
    if (trimmedUsername) updates.username = trimmedUsername;
    if (newAvatar) updates.avatar = newAvatar;

    await supabase.from('profiles').update(updates).eq('id', data.user.id);
  }
}

/**
 * Logout current user session from Supabase.
 */
export async function logoutUser(): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
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
    const { data: prof, error: fetchErr } = await supabase
      .from('profiles')
      .select('last_username_change_at')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.warn('Failed to check last username change timestamp:', fetchErr.message);
    }

    if (prof?.last_username_change_at) {
      const lastChanged = new Date(prof.last_username_change_at).getTime();
      const now = Date.now();
      const msElapsed = now - lastChanged;
      const cooldownMs = 24 * 60 * 60 * 1000;

      if (msElapsed < cooldownMs) {
        const msLeft = cooldownMs - msElapsed;
        const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
        const minsLeft = Math.ceil((msLeft % (1000 * 60 * 60)) / (1000 * 60));
        throw new Error(
          `Username can only be changed once per 24 hours. Next change available in ${hoursLeft}h ${minsLeft}m.`
        );
      }
    }

    // 3. Update profiles table and Supabase auth metadata
    const nowIso = new Date().toISOString();
    let { error: updateErr } = await supabase
      .from('profiles')
      .update({
        username: trimmed,
        last_username_change_at: nowIso,
      })
      .eq('id', userId);

    if (updateErr && (updateErr.message?.includes('last_username_change_at') || updateErr.code === 'PGRST204')) {
      console.warn('last_username_change_at column missing in Supabase schema cache, updating username only.');
      const { error: fallbackErr } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', userId);
      updateErr = fallbackErr;
    }

    if (updateErr) {
      throw new Error(updateErr.message || 'Failed to update username in database.');
    }

    // Propagate metadata to Auth
    await supabase.auth.updateUser({
      data: { username: trimmed },
    });

    return nowIso;
  }

  return new Date().toISOString();
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
    throw new Error(error.message || 'Failed to update avatar in database.');
  }

  await supabase.auth.updateUser({
    data: { avatar: newAvatar },
  });
}

/**
 * Change current user password in Supabase Auth.
 */
export async function changeUserPassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message || 'Failed to update password.');
  }
}

/**
 * Fully delete user profile and all associated data from Supabase DB, then sign out.
 */
export async function deleteUserProfileAndData(userId: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      // 1. Delete user_data state row
      await supabase.from('user_data').delete().eq('user_id', userId);

      // 2. Delete improvement plans created by user
      await supabase.from('improvement_plans').delete().eq('creator_id', userId);

      // 3. Delete partner invites to/from user
      await supabase
        .from('partner_invites')
        .delete()
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

      // 4. Delete partnerships involving user
      await supabase
        .from('partnerships')
        .delete()
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      // 5. Delete profile row (foreign key root)
      await supabase.from('profiles').delete().eq('id', userId);
    } catch (e) {
      console.error('Error purging user data from Supabase:', e);
    }

    // 6. Sign out user from Supabase Auth
    await supabase.auth.signOut();
  }
}

/**
 * Update profile privacy setting in Supabase.
 */
export async function updateProfilePrivacy(
  userId: string,
  isProfilePublic: boolean
): Promise<UserProfile | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_profile_public: isProfilePublic })
      .eq('id', userId)
      .select('*')
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email || '',
      username: data.username,
      avatar: data.avatar || '🧑',
      createdAt: data.created_at,
      isProfilePublic: data.is_profile_public ?? true,
    };
  } catch (e) {
    console.error('Error updating profile privacy:', e);
    return null;
  }
}

/**
 * Get all registered real users as LeagueCompetitors for a specific league period.
 */
export function getRegisteredCompetitors(
  type: LeagueType,
  currentUserId?: string,
  now: Date = new Date(),
  profilesOverride?: any[]
): LeagueCompetitor[] {
  const profiles = profilesOverride || cachedProfiles;
  const competitors: LeagueCompetitor[] = [];
  const start = getLeaguePeriodStart(type, now);

  for (const p of profiles) {
    if (p.id === currentUserId) continue;

    const pointsHistory = p.points_history || [];
    const periodPoints = calculatePeriodPoints(pointsHistory, start, now);
    const stats = p.stats || {
      streakDays: 1,
      habitsCompletedCount: 0,
      journalEntriesCount: 0,
      exerciseMinutes: 0,
      booksRead: 0,
      skillsPracticedCount: 0,
    };

    competitors.push({
      id: p.id,
      name: p.username || 'Member',
      avatar: p.avatar || '🧑',
      points: periodPoints,
      totalPoints: p.total_points || 0,
      isRealUser: true,
      isSeed: false,
      isProfilePublic: p.is_profile_public ?? true,
      stats,
      activeHabits: p.active_habits || [],
    });
  }

  return competitors;
}

/**
 * Get all public improvement plans created across all registered users.
 */
export function getAllPublicImprovementPlans(plansOverride?: ImprovementPlan[]): ImprovementPlan[] {
  const plans = plansOverride || cachedPublicPlans;
  const plansMap = new Map<string, ImprovementPlan>();

  for (const plan of plans) {
    if (plan.isPublic) {
      plansMap.set(plan.id, plan);
    }
  }

  return Array.from(plansMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Fetch profile by 6-digit numeric UID from Supabase profiles or SEED_ACCOUNTS.
 */
export async function fetchProfileByUidFromSupabase(
  targetUid: string
): Promise<{ id: string; username: string; avatar: string; uid: string } | null> {
  const trimmed = targetUid.trim();
  if (!trimmed) return null;

  if (isSupabaseConfigured) {
    try {
      // 1. Try RPC get_profile_by_uid (bypasses client RLS restrictions safely)
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc('get_profile_by_uid', { target_uid: trimmed });

      if (!rpcErr && rpcData && rpcData.length > 0) {
        return rpcData[0] as { id: string; username: string; avatar: string; uid: string };
      }

      // 2. Direct table SELECT fallback
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar, uid')
        .eq('uid', trimmed)
        .maybeSingle();

      if (error) {
        console.warn('Supabase UID lookup warning:', error.message);
      } else if (data) {
        return data as { id: string; username: string; avatar: string; uid: string };
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
    };
  }

  // Fallback 2: Search in seed accounts
  const seedMatch = SEED_ACCOUNTS.find((s) => s.uid === trimmed);
  if (seedMatch) {
    return {
      id: seedMatch.id,
      username: seedMatch.username,
      avatar: seedMatch.avatar,
      uid: seedMatch.uid,
    };
  }

  return null;
}

/**
 * Legacy compatibility functions (no-ops or redirected to Supabase)
 */
export function getCurrentSessionUserId(): string | null {
  return null;
}
export function getRegisteredUsers(): Record<string, any> {
  return {};
}
export function saveUserState(userId: string, state: AppState) {
  saveUserDataToSupabase(userId, state);
}
export function addPartnerInviteAcrossUsers(invite: PartnerInvite) {}
export function updatePartnerInviteStatusAcrossUsers(inviteId: string, status: 'accepted' | 'declined') {}
export function setPartnershipAcrossUsers(partnership: Partnership) {}
export function removePartnershipAcrossUsers(user1Username: string, user2Username: string) {}
export function getAllPartnerInvitesForUser(username: string): PartnerInvite[] {
  return [];
}
