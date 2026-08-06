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

    // SINGLE SOURCE OF TRUTH: improvement_plans table + savedState metadata fallback
    const { data: dbPlans, error: dbPlansErr } = await supabase
      .from('improvement_plans')
      .select('*')
      .eq('creator_id', userId);

    console.log('[REAL-USER DEBUG: STAGE 1 RAW DB FETCH]', {
      dbPlans: dbPlans?.map((r) => ({ id: r.id, title: r.title, steps: r.steps })),
      savedStatePlans: savedState?.improvementPlans?.map((p: any) => ({ id: p.id, title: p.title, streakCount: p.streakCount, lastCompletedDate: p.lastCompletedDate, steps: p.steps })),
      savedStatePoints: savedState?.totalPoints,
    });

    const savedPlansMap = new Map<string, any>();
    if (savedState?.improvementPlans) {
      savedState.improvementPlans.forEach((p: any) => savedPlansMap.set(p.id, p));
    }

    if (dbPlans && !dbPlansErr) {
      state.improvementPlans = dbPlans.map((row) => {
        const mapped = mapRowToImprovementPlan(row);
        const savedPlan = savedPlansMap.get(mapped.id);

        let streakCount = mapped.streakCount || 0;
        let lastCompletedDate = mapped.lastCompletedDate || '';
        let steps = mapped.steps || [];

        if (savedPlan) {
          const savedStreak = savedPlan.streakCount || 0;
          if (savedStreak > streakCount) {
            streakCount = savedStreak;
          }
          if (savedPlan.lastCompletedDate) {
            if (!lastCompletedDate || new Date(savedPlan.lastCompletedDate) > new Date(lastCompletedDate)) {
              lastCompletedDate = savedPlan.lastCompletedDate;
            }
          }

          // Merge step items: true wins for completed flag
          steps = mergePlanSteps(mapped.steps, savedPlan.steps);
        }

        const merged = {
          ...savedPlan,
          ...mapped,
          steps,
          streakCount,
          lastCompletedDate,
        };

        console.log('[REAL-USER DEBUG: STAGE 2 MAPPED & MERGED PLAN]', {
          id: merged.id,
          title: merged.title,
          planType: merged.planType,
          streakCount: merged.streakCount,
          lastCompletedDate: merged.lastCompletedDate,
          cadence: merged.cadence,
          steps: merged.steps,
        });

        return merged;
      });
    } else if (savedState?.improvementPlans && savedState.improvementPlans.length > 0) {
      state.improvementPlans = savedState.improvementPlans;
    } else {
      state.improvementPlans = [];
    }

    // SINGLE SOURCE OF TRUTH FOR FOLLOWED PLANS: user_plan_follows table + savedState fallback
    const { data: dbFollows, error: dbFollowsErr } = await supabase
      .from('user_plan_follows')
      .select('*')
      .eq('user_id', userId);

    const savedFollowsMap = new Map<string, any>();
    if (savedState?.followedPlans) {
      savedState.followedPlans.forEach((f: any) => savedFollowsMap.set(f.id, f));
    }

    if (dbFollows && !dbFollowsErr) {
      state.followedPlans = dbFollows.map((row) => {
        const mapped = mapRowToUserPlanFollow(row);
        const savedFollow = savedFollowsMap.get(mapped.id);

        let streakCount = mapped.streakCount || 0;
        let lastCompletedDate = mapped.lastCompletedDate || '';
        let steps = mapped.steps || [];

        if (savedFollow) {
          const savedStreak = savedFollow.streakCount || 0;
          if (savedStreak > streakCount) {
            streakCount = savedStreak;
          }
          if (savedFollow.lastCompletedDate) {
            if (!lastCompletedDate || new Date(savedFollow.lastCompletedDate) > new Date(lastCompletedDate)) {
              lastCompletedDate = savedFollow.lastCompletedDate;
            }
          }

          // Merge step items: true wins for completed flag
          steps = mergePlanSteps(mapped.steps, savedFollow.steps);
        }

        return {
          ...savedFollow,
          ...mapped,
          steps,
          streakCount,
          lastCompletedDate,
        };
      });
    } else if (savedState?.followedPlans && savedState.followedPlans.length > 0) {
      state.followedPlans = savedState.followedPlans;
    }
  } catch (e) {
    console.warn('Skipped loading partner social data or plans during hydration:', e);
  }

  if (!profileData || !savedState) {
    await saveUserDataToSupabase(userId, state);
  }

  return { user, state };
}
