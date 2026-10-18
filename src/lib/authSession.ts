import { User } from '@supabase/supabase-js';
import { AppState, DEFAULT_STATE, UserProfile, Partnership } from '@/types';
import { generateNumericUID, getNow, weekKey } from './dates';
import { reconcileSharedChallengeLifecycle } from './pactLifecycle';
import { cachedSyncedCollections } from './sync/syncedCollections';
import { cachedDeviceLocalState } from './deviceLocalState';
import { applyRemoteChanges, pullSyncedRows, type PullResult } from './sync/pull';
import { applyPresetHabitRemovalMigration } from './store';
import {
  fetchUserDataWithStatusFromSupabase,
  setUserDataWatermark,
  setUserHydrationComplete,
  fetchPartnerInvitesSupabase,
  fetchPartnershipsSupabase,
  fetchSharedChallengesSupabase,
  fetchNotificationsSupabase,
  saveUserDataToSupabase,
  supabase,
  mapRowToImprovementPlan,
  mapRowToUserPlanFollow,
  deleteFollowedPlanFromSupabase,
  cleanupPendingInvitesBetweenUsersSupabase,
  fetchMyPrivateProfile,
} from './supabase';
import { trustedNow } from './clock';

export type SignUpDefaults = {
  username: string;
  avatar: string;
};

export async function fetchProfileForUser(userId: string): Promise<{ data: Record<string, unknown> | null; error: any | null }> {
  try {
    // Private columns (notification settings, last username change) come from ascend_my_profile.
    const [{ data, error }, privateCols] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, uid, username, avatar, created_at, is_profile_public, accept_partner_invites')
        .eq('id', userId)
        .maybeSingle(),
      fetchMyPrivateProfile(),
    ]);

    if (error) {
      console.warn('Failed to fetch user profile:', error.message);
      return { data: null, error };
    }
    if (!data) return { data: null, error: null };
    return { data: { ...privateCols, ...(data as Record<string, unknown>) }, error: null };
  } catch (e) {
    console.error('Error fetching profile from Supabase:', e);
    return { data: null, error: e };
  }
}

const PROFILE_INSERT_ATTEMPTS = 3;

/**
 * Creates the account's profile row. The username was checked before sign-up, but someone can take
 * it in between (unique index on lower(username)), and the random uid can collide: either one gets a
 * fresh value and another try, so the account never stays without a profile. Throws when it still fails.
 */
async function insertInitialProfile(userId: string, user: UserProfile): Promise<UserProfile> {
  let candidate = user;
  for (let attempt = 1; attempt <= PROFILE_INSERT_ATTEMPTS; attempt++) {
    // profiles.email is copied from the auth user by the database.
    const { error } = await supabase.from('profiles').insert({
      id: userId,
      uid: candidate.uid,
      username: candidate.username,
      avatar: candidate.avatar,
      is_profile_public: candidate.isProfilePublic ?? true,
    });
    if (!error) {
      if (candidate.username !== user.username && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-error', {
            detail: {
              title: `@${user.username} was just taken`,
              message: `You're @${candidate.username} for now. You can change it in Settings.`,
            },
          })
        );
      }
      return candidate;
    }
    // Another tab or an earlier boot created it already: use the row as it is.
    if (error.code === '23505' && /profiles_pkey/.test(error.message)) return candidate;
    if (error.code !== '23505' || attempt === PROFILE_INSERT_ATTEMPTS) {
      throw new Error(`Failed to create profile for ${userId}: ${error.message}`);
    }
    if (/uid/.test(error.message)) {
      const uid = generateNumericUID();
      try {
        localStorage.setItem(`ascend_uid_${userId}`, uid);
      } catch {
        /* ignore */
      }
      candidate = { ...candidate, uid };
    } else {
      const suffix = String(Math.floor(1000 + Math.random() * 9000));
      candidate = { ...candidate, username: `${user.username.slice(0, 16)}${suffix}` };
    }
  }
  return candidate;
}

export function buildUserProfile(
  userId: string,
  email: string,
  profileData: Record<string, unknown> | null,
  authUser?: User | null,
  signupDefaults?: SignUpDefaults
): UserProfile {
  const isAnonymous = authUser?.is_anonymous ?? false;

  // Retrieve stable UID: 1. DB profile, 2. Cached localStorage key, 3. Generate once & cache
  let userUid = profileData?.uid as string | undefined;
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
      createdAt: trustedNow().toISOString(),
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
      trustedNow().toISOString(),
    isProfilePublic: (profileData?.is_profile_public as boolean | undefined) ?? true,
    acceptPartnerInvites: (profileData?.accept_partner_invites as boolean | undefined) ?? true,
    notifDailyReminder: (profileData?.notif_daily_reminder as boolean | undefined) ?? true,
    notifPartnerActivity: (profileData?.notif_partner_activity as boolean | undefined) ?? true,
    notifSundayPlanning: (profileData?.notif_sunday_planning as boolean | undefined) ?? true,
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
): Promise<{ user: UserProfile; state: AppState; tablesRead: boolean }> {
  // Fetch profile and saved user_data in parallel
  const [profileRes, userDataRes, tablePull] = await Promise.all([
    fetchProfileForUser(userId),
    fetchUserDataWithStatusFromSupabase(userId),
    // Table-backed modules are read before boot finishes, so points and streak
    // reconciliation never runs on a state that is missing them.
    pullSyncedRows(userId, true).catch((err): PullResult => {
      console.error('[HYDRATION] Table read failed, using device cache:', err);
      return { changes: [], everyTableRead: false };
    }),
  ]);
  const profileData = profileRes.data;

  // If user_data fetch encountered a network/query error, try recovering from local cache
  let savedState = userDataRes.state;
  if ((userDataRes.error || profileRes.error) && !savedState) {
    console.warn('Network error fetching user_data, attempting to restore from local cache:', userDataRes.error || profileRes.error);
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`ascend_user_cache_${userId}`);
        if (cached) {
          savedState = JSON.parse(cached);
          console.log('Successfully recovered user state from local cache');
        }
      } catch (e) {
        console.error('Failed reading user cache from localStorage:', e);
      }
    }
  }

  // If there is still no savedState AND either fetch had a network error on an existing account,
  // THROW hydration error so we do NOT initialize an empty state and mark as hydrated!
  const hadFetchError = Boolean(profileRes.error) || Boolean(userDataRes.error);
  if (!savedState && hadFetchError) {
    throw new Error(
      `Failed to fetch user data for established user ${userId}: ${
        userDataRes.error?.message || profileRes.error?.message || 'Network error'
      }`
    );
  }

  let user = buildUserProfile(userId, email, profileData, authUser, signupDefaults);

  // If DB profile row does not exist yet, insert it ONCE with permanent uid
  if (!profileData && !profileRes.error) {
    user = await insertInitialProfile(userId, user);
  } else if (profileData && !profileData.uid) {
    // DB profile exists but lacks uid (created prior to migration) — backfill it once
    try {
      await supabase.from('profiles').update({ uid: user.uid }).eq('id', userId);
    } catch (e) {
      console.warn('Profile UID backfill skipped:', e);
    }
  }

  let state: AppState;
  if (savedState) {
    state = {
      ...DEFAULT_STATE,
      // Collections that live in their own tables are not in the blob (DB normalization S4).
      ...cachedSyncedCollections(userId),
      ...savedState,
      // Tombstones and pending ids stay on this device (batch H); the blob no longer has them.
      ...cachedDeviceLocalState(userId),
      currentUser: user,
      username: user.username,
    };
    state = applyRemoteChanges(state, tablePull.changes);
    state = applyPresetHabitRemovalMigration(state, weekKey(getNow()));
    setUserDataWatermark(userId, state);
  } else {
    // A new account starts empty. A guest keeps their data by upgrading their anonymous
    // account (same id), so nothing local is carried over here.
    state = {
      ...DEFAULT_STATE,
      currentUser: user,
      username: user.username,
    };
  }

  // Authoritative real-time fetch in parallel for partner invites, active partnerships, notifications, improvement plans, and followed plans
  try {
    const [
      fetchedInvites,
      activePartnerships,
      fetchedNotifs,
      dbPlansResult,
      dbFollowsResult,
    ] = await Promise.all([
      fetchPartnerInvitesSupabase(userId, user.username),
      fetchPartnershipsSupabase(userId),
      fetchNotificationsSupabase(userId),
      supabase.from('improvement_plans').select('*').eq('creator_id', userId),
      supabase.from('user_plan_follows').select('*').eq('user_id', userId),
    ]);

    const tombstoneSet = new Set(state.deletedEntityIds || []);

    // A fetch that failed gives null: that part keeps what the state already holds (the device
    // cache), instead of showing an empty inbox or no partners until the next good fetch.
    if (activePartnerships) {
      const dedupPartnershipsMap = new Map<string, Partnership>();
      for (const p of activePartnerships) {
        if (!p || tombstoneSet.has(p.id)) continue;
        const u1 = (p.user1Username || '').toLowerCase();
        const u2 = (p.user2Username || '').toLowerCase();
        const key = [u1, u2].sort().join(':::');
        if (!dedupPartnershipsMap.has(key)) {
          dedupPartnershipsMap.set(key, p);
        }
      }

      state.partnerships = Array.from(dedupPartnershipsMap.values());
      state.partnership = state.partnerships[0] || null;
    }

    const partnershipsNow = state.partnerships || [];
    if (!fetchedInvites) {
      // Keep the invites already held.
    } else if (partnershipsNow.length > 0) {
      const activePartnerUsernames = new Set(
        partnershipsNow.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])
      );
      const activePartnerUserIds = new Set(
        partnershipsNow.flatMap((p) => [p.user1Id, p.user2Id])
      );

      state.partnerInvites = fetchedInvites.filter((inv) => {
        if (inv.status !== 'pending' || tombstoneSet.has(inv.id)) return false;
        const otherUserId = inv.fromUserId === userId ? inv.toUserId : inv.fromUserId;
        const otherUsername = (
          inv.fromUsername.toLowerCase() === user.username.toLowerCase() ? inv.toUsername : inv.fromUsername
        ).toLowerCase();

        const isAlreadyPartner =
          (otherUserId && activePartnerUserIds.has(otherUserId)) ||
          (otherUsername && activePartnerUsernames.has(otherUsername));

        return !isAlreadyPartner;
      });

      if (activePartnerships) {
        for (const p of partnershipsNow) {
          cleanupPendingInvitesBetweenUsersSupabase(p.user1Id, p.user1Username, p.user2Id, p.user2Username).catch(() => {});
        }
      }
    } else {
      state.partnerInvites = fetchedInvites.filter((inv) => !tombstoneSet.has(inv.id));
    }

    if (activePartnerships) {
      if (partnershipsNow.length > 0) {
        const pIds = partnershipsNow.map((p) => p.id);
        const fetchedChallenges = await fetchSharedChallengesSupabase(pIds);
        if (fetchedChallenges) {
          state.sharedChallenges = fetchedChallenges
            .filter((c) => !tombstoneSet.has(c.id) && !tombstoneSet.has(c.partnershipId))
            .map((c) => reconcileSharedChallengeLifecycle(c));
        }
      } else {
        state.sharedChallenges = [];
      }
    }

    if (fetchedNotifs) {
      state.notifications = fetchedNotifs.filter((n) => !tombstoneSet.has(n.id));
    }

    const { data: dbPlans, error: dbPlansErr } = dbPlansResult;
    // This device's copies (the blob no longer stores plans). A copy marked pending or failed holds
    // an edit the table has not confirmed, so it wins over the row and the store's retry saves it;
    // every other copy takes the row, so an Undo or an unchecked step made on another device sticks.
    const localPlans = state.improvementPlans || [];
    const localFollows = state.followedPlans || [];
    const isUnconfirmed = (item: { syncStatus?: string } | undefined) =>
      item?.syncStatus === 'pending' || item?.syncStatus === 'failed';

    if (dbPlans && !dbPlansErr) {
      const dbPlanIds = new Set(dbPlans.map((r) => r.id));
      const savedPlansMap = new Map(localPlans.map((p) => [p.id, p]));

      state.improvementPlans = dbPlans.map((row) => {
        const mapped = mapRowToImprovementPlan(row);
        const savedPlan = savedPlansMap.get(mapped.id);
        if (!isUnconfirmed(savedPlan)) return mapped;
        // Server-owned fields always come from the row.
        return {
          ...savedPlan!,
          copyCount: mapped.copyCount,
          creatorUsername: mapped.creatorUsername,
          creatorAvatar: mapped.creatorAvatar,
        };
      });

      // Plans created on this device that never reached the table.
      const unconfirmedPlans = localPlans.filter((p) => !dbPlanIds.has(p.id) && isUnconfirmed(p));
      if (unconfirmedPlans.length > 0) {
        state.improvementPlans = [...state.improvementPlans, ...unconfirmedPlans];
      }
    } else {
      state.improvementPlans = localPlans;
    }

    const { data: dbFollows, error: dbFollowsErr } = dbFollowsResult;

    if (dbFollows && !dbFollowsErr) {
      const dbFollowIds = new Set(dbFollows.map((r) => r.id));
      const savedFollowsMap = new Map(localFollows.map((f) => [f.id, f]));

      state.followedPlans = dbFollows
        .filter((row) => {
          // A copy deleted on this device whose table delete did not go through: finish it.
          if (!tombstoneSet.has(row.id)) return true;
          void deleteFollowedPlanFromSupabase(row.id);
          return false;
        })
        .map((row) => {
          const mapped = mapRowToUserPlanFollow(row);
          const savedFollow = savedFollowsMap.get(mapped.id);
          return isUnconfirmed(savedFollow) ? savedFollow! : { ...mapped, syncStatus: 'synced' as const };
        });

      const unconfirmedFollows = localFollows.filter(
        (f) => !dbFollowIds.has(f.id) && !tombstoneSet.has(f.id) && isUnconfirmed(f)
      );
      if (unconfirmedFollows.length > 0) {
        state.followedPlans = [...state.followedPlans, ...unconfirmedFollows];
      }
    } else {
      state.followedPlans = localFollows.filter((f) => !tombstoneSet.has(f.id));
    }
  } catch (e) {
    console.warn('Skipped loading partner social data or plans during hydration:', e);
  }

  // Mark session hydration fully complete (including relational-table enrichment) for floor exemption eligibility
  setUserHydrationComplete(userId, true);

  // Clear stale guest localStorage data upon authenticated user hydration
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('ascend_guest_state_v2');
    } catch (e) {}
  }

  // Only push an immediate save during hydration if this is explicitly a fresh signup with initial defaults
  if (signupDefaults) {
    try {
      await saveUserDataToSupabase(userId, state);
    } catch (saveErr) {
      console.error('[HYDRATION SIGNUP SAVE] Failed to save initial signup defaults to Supabase:', saveErr);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-error', {
            detail: {
              title: "Some account details didn't save",
              message: "They'll save the next time you make a change.",
            },
          })
        );
      }
    }
  }

  // `tablesRead` also means the settings doc came from the server, not the device cache
  // (the rank-up memory lives there; a cached copy could be older and replay a celebration).
  const settingsFromServer = !userDataRes.error && !profileRes.error;
  return { user, state, tablesRead: tablePull.everyTableRead && settingsFromServer };
}