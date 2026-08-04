import { User } from '@supabase/supabase-js';
import { AppState, DEFAULT_STATE, UserProfile } from '@/types';
import { generateNumericUID } from './dates';
import {
  fetchUserDataFromSupabase,
  fetchPartnerInvitesSupabase,
  fetchPartnershipSupabase,
  fetchPartnershipsSupabase,
  fetchSharedChallengesSupabase,
  fetchNotificationsSupabase,
  saveUserDataToSupabase,
  supabase,
} from './supabase';

export type SignUpDefaults = {
  username: string;
  avatar: string;
  guestState?: AppState;
};

export async function fetchProfileForUser(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to fetch user profile:', error.message);
      return null;
    }
    return data as Record<string, unknown> | null;
  } catch (e) {
    console.error('Error fetching profile from Supabase:', e);
    return null;
  }
}

export function buildUserProfile(
  userId: string,
  email: string,
  profileData: Record<string, unknown> | null,
  authUser?: User | null,
  signupDefaults?: SignUpDefaults
): UserProfile {
  const isAnonymous = authUser?.is_anonymous ?? false;

  // Retrieve stable UID: 1. DB profile, 2. Guest state, 3. Cached localStorage key, 4. Generate once & cache
  let userUid = profileData?.uid as string | undefined;
  if (!userUid && signupDefaults?.guestState?.currentUser?.uid) {
    userUid = signupDefaults.guestState.currentUser.uid;
  }
  if (!userUid) {
    try {
      const cached = localStorage.getItem(`ascend_uid_${userId}`);
      if (cached) userUid = cached;
    } catch {
      /* ignore */
    }
  }
  if (!userUid) {
    userUid = generateNumericUID();
    try {
      localStorage.setItem(`ascend_uid_${userId}`, userUid);
    } catch {
      /* ignore */
    }
  }

  if (signupDefaults && !profileData) {
    return {
      id: userId,
      uid: userUid,
      email,
      username: signupDefaults.username,
      avatar: signupDefaults.avatar || '🧑',
      createdAt: new Date().toISOString(),
      isProfilePublic: true,
      isAnonymous,
    };
  }

  const metadata = authUser?.user_metadata ?? {};

  let username =
    (profileData?.username as string | undefined) ||
    (metadata.username as string | undefined);

  if (!username) {
    if (isAnonymous || !email) {
      const suffix = userId.replace(/-/g, '').slice(-4).toUpperCase();
      username = `Guest_${suffix}`;
    } else {
      username = email.split('@')[0];
    }
  }

  return {
    id: userId,
    uid: userUid,
    email,
    username,
    avatar: (profileData?.avatar as string | undefined) || (metadata.avatar as string | undefined) || '🧑',
    createdAt:
      (profileData?.created_at as string | undefined) ||
      authUser?.created_at ||
      new Date().toISOString(),
    isProfilePublic: (profileData?.is_profile_public as boolean | undefined) ?? true,
    isAnonymous,
    lastUsernameChangeAt: (profileData?.last_username_change_at as string | undefined) || undefined,
  };
}

/**
 * Load or create the user's profile + app state from Supabase.
 * Gracefully handles missing profiles/user_data rows.
 *
 * Called exclusively from onAuthStateChange in store.ts — never from auth.ts.
 */
export async function hydrateUserSession(
  userId: string,
  email: string,
  authUser?: User | null,
  signupDefaults?: SignUpDefaults
): Promise<{ user: UserProfile; state: AppState }> {
  const profileData = await fetchProfileForUser(userId);
  const user = buildUserProfile(userId, email, profileData, authUser, signupDefaults);

  // If DB profile row does not exist yet, insert it ONCE with permanent uid
  if (!profileData) {
    try {
      await supabase.from('profiles').insert({
        id: userId,
        uid: user.uid,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        is_profile_public: user.isProfilePublic ?? true,
      });
    } catch (e) {
      console.warn('Initial profile row creation skipped:', e);
    }
  } else if (!profileData.uid) {
    // DB profile exists but lacks uid (created prior to migration) — backfill it once
    try {
      await supabase.from('profiles').update({ uid: user.uid }).eq('id', userId);
    } catch (e) {
      console.warn('Profile UID backfill skipped:', e);
    }
  }

  let savedState = await fetchUserDataFromSupabase(userId);

  let state: AppState;
  if (savedState) {
    state = {
      ...DEFAULT_STATE,
      ...savedState,
      currentUser: user,
      username: user.username,
    };
  } else if (signupDefaults?.guestState) {
    state = {
      ...DEFAULT_STATE,
      ...signupDefaults.guestState,
      currentUser: user,
      username: user.username,
    };
  } else {
    // Check if there is pre-existing guest state in localStorage to preserve
    let localState: AppState | null = null;
    try {
      const raw = localStorage.getItem('ascend_guest_state_v2');
      if (raw) {
        localState = JSON.parse(raw);
      }
    } catch {
      /* ignore */
    }

    if (localState && (localState.totalPoints > 0 || (localState.habits && localState.habits.length > 0))) {
      state = {
        ...DEFAULT_STATE,
        ...localState,
        currentUser: user,
        username: user.username,
      };
    } else {
      state = {
        ...DEFAULT_STATE,
        currentUser: user,
        username: user.username,
      };
    }
  }

  // Authoritative real-time fetch for partner invites, active partnerships, and shared challenges from Supabase DB
  try {
    const fetchedInvites = await fetchPartnerInvitesSupabase(userId, user.username);
    state.partnerInvites = fetchedInvites;

    const activePartnerships = await fetchPartnershipsSupabase(userId);
    state.partnerships = activePartnerships;
    state.partnership = activePartnerships[0] || null;

    if (activePartnerships.length > 0) {
      const pIds = activePartnerships.map((p) => p.id);
      const challenges = await fetchSharedChallengesSupabase(pIds);
      state.sharedChallenges = challenges;
    } else {
      state.sharedChallenges = [];
    }

    const fetchedNotifs = await fetchNotificationsSupabase(userId);
    state.notifications = fetchedNotifs;
  } catch (e) {
    console.warn('Skipped loading partner social data during hydration:', e);
  }

  if (!profileData || !savedState) {
    await saveUserDataToSupabase(userId, state);
  }

  return { user, state };
}
