import { User } from '@supabase/supabase-js';
import { AppState, DEFAULT_STATE, UserProfile, PlanStep } from '@/types';
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
  mapRowToImprovementPlan,
  mapRowToUserPlanFollow,
  syncPlanToSupabase,
  syncFollowedPlanToSupabase,
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

function mergePlanSteps(dbSteps: PlanStep[] = [], savedSteps: PlanStep[] = []): PlanStep[] {
  if (!Array.isArray(dbSteps) || dbSteps.length === 0) {
    return Array.isArray(savedSteps) ? savedSteps : [];
  }
  if (!Array.isArray(savedSteps) || savedSteps.length === 0) {
    return dbSteps;
  }

  const savedMap = new Map<string, PlanStep>();
  savedSteps.forEach((s) => {
    if (s && s.id) savedMap.set(s.id, s);
  });

  return dbSteps.map((dbStep) => {
    const savedStep = savedMap.get(dbStep.id);
    if (!savedStep) return dbStep;

    const completed = Boolean(dbStep.completed || savedStep.completed);
    return {
      ...savedStep,
      ...dbStep,
      completed,
    };
  });
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
  // Fetch profile and saved user_data in parallel
  const [profileData, savedState] = await Promise.all([
    fetchProfileForUser(userId),
    fetchUserDataFromSupabase(userId),
  ]);

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

    state.partnerInvites = fetchedInvites;
    state.partnerships = activePartnerships;
    state.partnership = activePartnerships[0] || null;

    if (activePartnerships.length > 0) {
      const pIds = activePartnerships.map((p) => p.id);
      state.sharedChallenges = await fetchSharedChallengesSupabase(pIds);
    } else {
      state.sharedChallenges = [];
    }

    state.notifications = fetchedNotifs;

    const { data: dbPlans, error: dbPlansErr } = dbPlansResult;

    const savedPlansMap = new Map<string, any>();
    if (savedState?.improvementPlans) {
      savedState.improvementPlans.forEach((p: any) => savedPlansMap.set(p.id, p));
    }

    if (dbPlans && !dbPlansErr) {
      const dbPlanIds = new Set(dbPlans.map((r) => r.id));

      state.improvementPlans = dbPlans.map((row) => {
        const mapped = mapRowToImprovementPlan(row);
        const savedPlan = savedPlansMap.get(mapped.id);

        let streakCount = mapped.streakCount || 0;
        let lastCompletedDate = mapped.lastCompletedDate || '';
        let steps = mapped.steps || [];

        let needsSyncBack = false;
        if (savedPlan) {
          const savedStreak = savedPlan.streakCount || 0;
          if (savedStreak > streakCount) {
            streakCount = savedStreak;
            needsSyncBack = true;
          }
          if (savedPlan.lastCompletedDate) {
            if (!lastCompletedDate || new Date(savedPlan.lastCompletedDate) > new Date(lastCompletedDate)) {
              lastCompletedDate = savedPlan.lastCompletedDate;
              needsSyncBack = true;
            }
          }

          // Merge step items: dbStep.completed takes priority for existing plans
          steps = mergePlanSteps(mapped.steps, savedPlan.steps);

          // Check if savedPlan completed any steps that the DB had as false
          const hasUnsyncedCompletedStep = steps.some((ms: any, i: number) => ms.completed && (!mapped.steps || !mapped.steps[i] || !mapped.steps[i].completed));
          if (hasUnsyncedCompletedStep) {
            needsSyncBack = true;
          }
        }

        const merged = {
          ...savedPlan,
          ...mapped,
          steps,
          streakCount,
          lastCompletedDate,
        };

        // EXPLICIT GUARD: Never sync back a plan that does not exist in dbPlans (never resurrect deleted plans)
        if (needsSyncBack && dbPlanIds.has(merged.id)) {
          void syncPlanToSupabase(merged);
        }

        return merged;
      });

      // CLEANUP STALE DELETED PLANS IN USER_DATA
      if (savedState?.improvementPlans) {
        const cleanedPlans = savedState.improvementPlans.filter((p: any) => dbPlanIds.has(p.id));
        if (cleanedPlans.length !== savedState.improvementPlans.length) {
          console.log('[HYDRATION CLEANUP] Cleaning deleted plans out of user_data');
          void saveUserDataToSupabase(userId, { ...savedState, improvementPlans: cleanedPlans });
        }
      }
    } else if (savedState?.improvementPlans && savedState.improvementPlans.length > 0) {
      state.improvementPlans = savedState.improvementPlans;
    } else {
      state.improvementPlans = [];
    }

    // SINGLE SOURCE OF TRUTH FOR FOLLOWED PLANS: user_plan_follows table + savedState fallback
    const { data: dbFollows, error: dbFollowsErr } = dbFollowsResult;

    const savedFollowsMap = new Map<string, any>();
    if (savedState?.followedPlans) {
      savedState.followedPlans.forEach((f: any) => savedFollowsMap.set(f.id, f));
    }

    if (dbFollows && !dbFollowsErr) {
      const dbFollowIds = new Set(dbFollows.map((r) => r.id));

      state.followedPlans = dbFollows.map((row) => {
        const mapped = mapRowToUserPlanFollow(row);
        const savedFollow = savedFollowsMap.get(mapped.id);

        let streakCount = mapped.streakCount || 0;
        let lastCompletedDate = mapped.lastCompletedDate || '';
        let steps = mapped.steps || [];

        let needsSyncBack = false;
        if (savedFollow) {
          const savedStreak = savedFollow.streakCount || 0;
          if (savedStreak > streakCount) {
            streakCount = savedStreak;
            needsSyncBack = true;
          }
          if (savedFollow.lastCompletedDate) {
            if (!lastCompletedDate || new Date(savedFollow.lastCompletedDate) > new Date(lastCompletedDate)) {
              lastCompletedDate = savedFollow.lastCompletedDate;
              needsSyncBack = true;
            }
          }

          // Merge step items: dbStep.completed takes priority for existing plans
          steps = mergePlanSteps(mapped.steps, savedFollow.steps);
        }

        const merged = {
          ...savedFollow,
          ...mapped,
          steps,
          streakCount,
          lastCompletedDate,
        };

        // EXPLICIT GUARD: Never sync back a followed plan that does not exist in dbFollows (never resurrect deleted followed plans)
        if (needsSyncBack && dbFollowIds.has(merged.id)) {
          void syncFollowedPlanToSupabase(merged);
        }

        return merged;
      });

      // CLEANUP STALE DELETED FOLLOWED PLANS IN USER_DATA
      if (savedState?.followedPlans) {
        const cleanedFollows = savedState.followedPlans.filter((f: any) => dbFollowIds.has(f.id));
        if (cleanedFollows.length !== savedState.followedPlans.length) {
          console.log('[HYDRATION CLEANUP] Cleaning deleted followed plans out of user_data');
          void saveUserDataToSupabase(userId, { ...savedState, followedPlans: cleanedFollows });
        }
      }
    } else if (savedState?.followedPlans && savedState.followedPlans.length > 0) {
      state.followedPlans = savedState.followedPlans;
    } else {
      state.followedPlans = [];
    }
  } catch (e) {
    console.warn('Skipped loading partner social data or plans during hydration:', e);
  }

  // Clear stale guest localStorage data upon authenticated user hydration
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('ascend_guest_state_v2');
    } catch (e) {}
  }

  if (!profileData || !savedState) {
    await saveUserDataToSupabase(userId, state);
  }

  return { user, state };
}
