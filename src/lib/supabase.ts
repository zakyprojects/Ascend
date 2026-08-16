import { createClient } from '@supabase/supabase-js';
import { UserProfile, ImprovementPlan, PartnerInvite, Partnership, AppState, SharedChallenge, PartnerNotification, UserPlanFollow, AppNotification, PlanReflectionNote } from '@/types';
import { getHighestUserStreak } from './habitPenalties';
import { calculateUnifiedStreak } from './streakLogic';
import { mergeAppState } from './stateMerger';

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

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

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

export interface UserDataWeight {
  totalPoints: number;
  itemCount: number;
  arrayBreakdown: Record<string, number>;
}

export function computeStateDataWeight(state: Partial<AppState> | null | undefined): UserDataWeight {
  if (!state) return { totalPoints: 0, itemCount: 0, arrayBreakdown: {} };

  const arrayBreakdown: Record<string, number> = {
    habits: state.habits?.length || 0,
    journalEntries: state.journalEntries?.length || 0,
    pointsHistory: state.pointsHistory?.length || 0,
    leagueArchives: state.leagueArchives?.length || 0,
    readLessonIds: state.readLessonIds?.length || 0,
    workouts: state.workouts?.length || 0,
    books: state.books?.length || 0,
    readingLogs: state.readingLogs?.length || 0,
    skills: state.skills?.length || 0,
    skillLogs: state.skillLogs?.length || 0,
    badHabits: state.badHabits?.length || 0,
    badHabitLogs: state.badHabitLogs?.length || 0,
    cravingLogs: state.cravingLogs?.length || 0,
    focusLogs: state.focusLogs?.length || 0,
    decisionLogs: state.decisionLogs?.length || 0,
    emotionLogs: state.emotionLogs?.length || 0,
    weeklyGoals: state.weeklyGoals?.length || 0,
    goals: state.goals?.length || 0,
    projects: state.projects?.length || 0,
    tasks: state.tasks?.length || 0,
    libraryBooks: state.libraryBooks?.length || 0,
    improvementPlans: state.improvementPlans?.length || 0,
    followedPlans: state.followedPlans?.length || 0,
    sharedChallenges: state.sharedChallenges?.length || 0,
    partnerInvites: state.partnerInvites?.length || 0,
    partnerships: state.partnerships?.length || 0,
    partnerNotifications: state.partnerNotifications?.length || 0,
    notifications: state.notifications?.length || 0,
  };

  const totalPoints = typeof state.totalPoints === 'number' ? Math.max(0, state.totalPoints) : 0;
  const itemCount =
    Object.values(arrayBreakdown).reduce((sum, c) => sum + c, 0) +
    (state.addictionTracker ? 1 : 0) +
    (state.exerciseGoal ? 1 : 0) +
    (state.readingGoal ? 1 : 0);

  return { totalPoints, itemCount, arrayBreakdown };
}

const userWatermarkMap = new Map<string, UserDataWeight>();

export function setUserDataWatermark(userId: string, stateOrWeight: AppState | UserDataWeight) {
  if (!userId) return;
  const weight = 'itemCount' in stateOrWeight ? stateOrWeight : computeStateDataWeight(stateOrWeight);
  const existing = userWatermarkMap.get(userId);
  if (!existing) {
    userWatermarkMap.set(userId, weight);
  } else {
    userWatermarkMap.set(userId, {
      totalPoints: Math.max(existing.totalPoints, weight.totalPoints),
      itemCount: Math.max(existing.itemCount, weight.itemCount),
      arrayBreakdown: { ...existing.arrayBreakdown, ...weight.arrayBreakdown },
    });
  }
}

export function getUserDataWatermark(userId: string): UserDataWeight | undefined {
  return userWatermarkMap.get(userId);
}

export function clearUserDataWatermark(userId: string) {
  userWatermarkMap.delete(userId);
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
    return { state: data.state as AppState, exists: true, error: null };
  } catch (e) {
    console.error('Exception fetching user_data from Supabase:', e);
    return { state: null, exists: false, error: e };
  }
}

export async function fetchUserDataFromSupabase(userId: string): Promise<AppState | null> {
  const res = await fetchUserDataWithStatusFromSupabase(userId);
  return res.state;
}

export async function saveUserDataToSupabase(userId: string, state: AppState): Promise<AppState | null> {
  if (!isSupabaseConfigured) return null;

  // SAFETY CHECK 1: Ensure user ID matches the logged-in state user
  if (!userId || !state.currentUser || state.currentUser.id !== userId) {
    console.warn('[GUARD] Blocked saveUserDataToSupabase due to missing or mismatched userId:', {
      userId,
      stateUserId: state.currentUser?.id,
    });
    return null;
  }

  // Client state is the authoritative mutation source for the active session.
  // Data loss protection is enforced via the watermark circuit-breaker below.
  const finalState: AppState = state;

  // SAFETY CHECK 2: Comprehensive Data-Loss Protection Safeguard
  const incomingWeight = computeStateDataWeight(finalState);
  const watermark = userWatermarkMap.get(userId);

  // Check 2A: Active in-memory session watermark guard
  if (watermark && (watermark.itemCount > 0 || watermark.totalPoints > 0)) {
    // Block total wipe: incoming is empty (0 items and 0 points)
    if (incomingWeight.itemCount === 0 && incomingWeight.totalPoints === 0) {
      console.error('[CRITICAL GUARD] Blocked catastrophic zero-out wipe to user_data for established account:', {
        userId,
        watermark,
        incomingWeight,
      });
      return null;
    }

    // Block massive catastrophic entity drop (>70% vanished at once on accounts with >= 3 items)
    if (watermark.itemCount >= 3 && incomingWeight.itemCount < Math.ceil(watermark.itemCount * 0.3)) {
      console.error('[CRITICAL GUARD] Blocked abnormal massive data drop to user_data:', {
        userId,
        watermarkItemCount: watermark.itemCount,
        incomingItemCount: incomingWeight.itemCount,
      });
      return null;
    }
  }

  // Check 2B: Cold baseline check if no session watermark has been registered yet
  if (!watermark && incomingWeight.itemCount === 0 && incomingWeight.totalPoints === 0) {
    const existingRes = await fetchUserDataWithStatusFromSupabase(userId);
    if (existingRes.exists && existingRes.state) {
      const existingWeight = computeStateDataWeight(existingRes.state);
      if (existingWeight.itemCount > 0 || existingWeight.totalPoints > 0) {
        console.error('[CRITICAL GUARD] Blocked cold zero-out wipe over existing rich database state:', {
          userId,
          existingWeight,
          incomingWeight,
        });
        setUserDataWatermark(userId, existingWeight);
        return null;
      }
    }
  }

  // Update session watermark with valid save
  setUserDataWatermark(userId, incomingWeight);

  // Always mirror authenticated user state to local cache for resilient cold boot and offline recovery
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`ascend_user_cache_${userId}`, JSON.stringify(finalState));
    } catch {
      /* ignore */
    }
  }

  try {
    // Execute user_data upsert and profiles upsert in parallel for maximum speed
    const userDataPromise = supabase.from('user_data').upsert({
      user_id: userId,
      state: finalState,
      updated_at: new Date().toISOString(),
    });

    const profilePromise = (async () => {
      if (!finalState.currentUser) return null;

      const habitsCompletedCount = (finalState.habits || []).reduce((acc, h) => acc + (h.completions?.length || 0), 0);
      const habitsCompletedTodayCount = (finalState.habits || []).reduce((acc, h) => {
        const todayStr = new Date().toISOString().split('T')[0];
        return acc + (h.completions?.includes(todayStr) ? 1 : 0);
      }, 0);
      const unified = calculateUnifiedStreak(finalState);
      const exerciseMinutes = (finalState.workouts || []).reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = (finalState.books || []).filter((b) => b.isFinished).length;
      const skillsPracticedCount = (finalState.skillLogs || []).length;

      const userStats = {
        streakDays: unified.currentStreakDays,
        streakSource: unified.currentStreakDays > 0 ? unified.currentStreakCategory : undefined,
        currentStreakDays: unified.currentStreakDays,
        currentStreakCategory: unified.currentStreakCategory,
        currentStreakIsActive: unified.currentStreakIsActive,
        lastActiveDate: unified.lastActiveDate,
        habitsCompletedCount,
        habitsCompletedTodayCount,
        journalEntriesCount: (finalState.journalEntries || []).length,
        exerciseMinutes,
        booksRead,
        skillsPracticedCount,
      };

      const activeHabitsList = (finalState.habits || []).map((h) => ({
        name: h.name,
        category: h.category,
        frequency: h.frequency,
        isPreset: h.isPreset,
      }));

      const profilePayload: Record<string, any> = {
        id: userId,
        username: finalState.currentUser.username,
        email: finalState.currentUser.email,
        avatar: finalState.currentUser.avatar || '🧑',
        is_profile_public: finalState.currentUser.isProfilePublic ?? true,
        accept_partner_invites: finalState.currentUser.acceptPartnerInvites ?? true,
        notif_daily_reminder: finalState.currentUser.notifDailyReminder ?? true,
        notif_partner_activity: finalState.currentUser.notifPartnerActivity ?? true,
        notif_league_updates: finalState.currentUser.notifLeagueUpdates ?? true,
        total_points: finalState.totalPoints || 0,
        points_history: finalState.pointsHistory || [],
        stats: userStats,
        active_habits: activeHabitsList,
      };

      if (finalState.currentUser.uid) {
        profilePayload.uid = finalState.currentUser.uid;
      }

      if (finalState.currentUser.lastUsernameChangeAt) {
        profilePayload.last_username_change_at = finalState.currentUser.lastUsernameChangeAt;
      }

      let { error: profErr } = await supabase.from('profiles').upsert(profilePayload);

      if (profErr) {
        if (profErr.message?.includes('accept_partner_invites')) {
          delete profilePayload.accept_partner_invites;
        }
        if (profErr.message?.includes('notif_')) {
          delete profilePayload.notif_daily_reminder;
          delete profilePayload.notif_partner_activity;
          delete profilePayload.notif_league_updates;
        }
        if (profErr.message?.includes('last_username_change_at')) {
          delete profilePayload.last_username_change_at;
        }
        if (profErr.message?.includes('uid')) {
          delete profilePayload.uid;
        }
        const { error: fallbackErr } = await supabase.from('profiles').upsert(profilePayload);
        profErr = fallbackErr;
      }

      if (profErr) {
        console.error('Error upserting profile in Supabase:', profErr);
      }
      return profErr;
    })();

    const [dataResult] = await Promise.all([userDataPromise, profilePromise]);

    if (dataResult.error) {
      if (dataResult.error.code === '23503') {
        // Foreign key constraint: Wait for profile creation then retry user_data upsert
        await profilePromise;
        const { error: retryErr } = await supabase.from('user_data').upsert({
          user_id: userId,
          state: finalState,
          updated_at: new Date().toISOString(),
        });
        if (retryErr) {
          console.error('Error retrying user_data upsert in Supabase:', retryErr);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('app-toast-error', {
                detail: {
                  title: 'Cloud Sync Failed',
                  message: 'Could not sync user data to cloud.',
                },
              })
            );
            window.dispatchEvent(new CustomEvent('app-network-error'));
          }
        }
      } else {
        console.error('Error upserting user_data in Supabase:', dataResult.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: 'Cloud Sync Failed',
                message: 'Could not sync user data to cloud.',
              },
            })
          );
          window.dispatchEvent(new CustomEvent('app-network-error'));
        }
      }
    }
    return finalState;
  } catch (e) {
    console.error('Error saving user_data to Supabase:', e);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app-toast-error', {
          detail: {
            title: 'Cloud Sync Failed',
            message: 'Network error saving data. Please check connection.',
          },
        })
      );
      window.dispatchEvent(new CustomEvent('app-network-error'));
    }
    return null;
  }
}

export async function fetchAllProfilesFromSupabase() {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error || !data) return [];
    return data;
  } catch (e) {
    console.error('Error fetching profiles from Supabase:', e);
    return [];
  }
}

export async function fetchProfileByUsernameFromSupabase(username: string) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', username.trim())
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error('Error fetching profile by username from Supabase:', e);
    return null;
  }
}

const planSyncLocks = new Map<string, boolean>();
const planPendingPayloads = new Map<string, any>();

export async function syncPlanToSupabase(plan: ImprovementPlan): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  if (planSyncLocks.get(plan.id)) {
    planPendingPayloads.set(plan.id, plan);
    return null;
  }

  planSyncLocks.set(plan.id, true);

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

    // Preserve existing database copy_count so updates/saves never reset copy_count to 0
    const { data: existingPlanRow } = await supabase
      .from('improvement_plans')
      .select('copy_count')
      .eq('id', planId)
      .maybeSingle();

    const dbCopyCount = existingPlanRow?.copy_count ?? 0;
    const rawCopyCount = plan.copyCount !== undefined && plan.copyCount !== null ? plan.copyCount : 0;
    const finalCopyCount = Math.max(rawCopyCount, dbCopyCount);
    
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
      copy_count: finalCopyCount,
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
  } finally {
    planSyncLocks.set(plan.id, false);

    if (planPendingPayloads.has(plan.id)) {
      const nextPlan = planPendingPayloads.get(plan.id);
      planPendingPayloads.delete(plan.id);
      void syncPlanToSupabase(nextPlan);
    }
  }
}

export async function deletePlanFromSupabase(planId: string) {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from('improvement_plans').delete().eq('id', planId);
    if (error) {
      console.error('Error deleting plan from Supabase:', error);
    }
  } catch (e) {
    console.warn('Supabase plan delete error:', e);
  }
}

export async function syncFollowedPlanToSupabase(followedPlan: UserPlanFollow) {
  if (!isSupabaseConfigured) return;
  try {
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    let sessionUser = session?.user;

    if (!sessionUser) {
      console.error('[Supabase SyncFollowedPlan] No active session found.', sessionError);
      return;
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
    }
  } catch (e) {
    console.warn('Supabase followed plan sync error:', e);
  }
}

export async function incrementPlanCopyCountSupabase(planId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  console.log('[Supabase] Executing incrementPlanCopyCountSupabase for planId:', planId);
  try {
    // 1. Attempt RPC call (atomic SECURITY DEFINER execution)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('increment_plan_copy_count', {
      target_plan_id: planId,
    });

    if (rpcErr) {
      console.error('[Supabase] RPC increment_plan_copy_count error:', rpcErr);
    } else {
      console.log('[Supabase] RPC increment_plan_copy_count success, return value:', rpcData);
      if (typeof rpcData === 'number' && rpcData > 0) {
        return rpcData;
      }
    }

    // 2. Direct atomic SQL update attempt (if RLS update policy granted)
    const { data: fetchCurrent } = await supabase
      .from('improvement_plans')
      .select('copy_count')
      .eq('id', planId)
      .maybeSingle();

    const newCount = (fetchCurrent?.copy_count || 0) + 1;
    const { data: updatedRows, error: updateErr } = await supabase
      .from('improvement_plans')
      .update({ copy_count: newCount })
      .eq('id', planId)
      .select();

    if (updateErr) {
      console.error('[Supabase] Direct update copy_count error:', updateErr);
    }

    if (updatedRows && updatedRows.length > 0) {
      return updatedRows[0].copy_count;
    }

    // 3. Fallback count from user_plan_follows table
    const { count, error: countErr } = await supabase
      .from('user_plan_follows')
      .select('*', { count: 'exact', head: true })
      .eq('original_plan_id', planId);

    if (countErr) {
      console.error('[Supabase] Follow count query error:', countErr);
    }

    return count || newCount;
  } catch (e) {
    console.error('Error incrementing plan copy count:', e);
    return 0;
  }
}

export async function deleteFollowedPlanFromSupabase(followedPlanId: string) {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from('user_plan_follows').delete().eq('id', followedPlanId);
    if (error) {
      console.error('Error deleting followed plan from Supabase:', error);
    }
  } catch (e) {
    console.warn('Supabase followed plan delete error:', e);
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
    createdAt: row?.created_at || new Date().toISOString(),

    // Phase B Plan Type Properties
    planType: stepsMeta.planType || row?.plan_type || 'milestone',
    targetValue: stepsMeta.targetValue !== undefined ? Number(stepsMeta.targetValue) : (row?.target_value !== undefined && row?.target_value !== null ? Number(row.target_value) : undefined),
    targetUnit: stepsMeta.targetUnit || row?.target_unit || '',
    currentProgress: stepsMeta.currentProgress !== undefined ? Number(stepsMeta.currentProgress) : (row?.current_progress !== undefined && row?.current_progress !== null ? Number(row.current_progress) : 0),
    targetDate: stepsMeta.targetDate || row?.target_date || '',
    cadence: stepsMeta.cadence || row?.cadence || 'daily',
    duration: stepsMeta.duration !== undefined ? Number(stepsMeta.duration) : (row?.duration !== undefined && row?.duration !== null ? Number(row.duration) : 30),
    startDate: stepsMeta.startDate || row?.start_date || new Date().toISOString(),
    streakCount: stepsMeta.streakCount !== undefined ? Number(stepsMeta.streakCount) : (row?.streak_count !== undefined && row?.streak_count !== null ? Number(row.streak_count) : 0),
    lastCompletedDate: stepsMeta.lastCompletedDate || row?.last_completed_date || '',
    targetReviewDate: stepsMeta.targetReviewDate || row?.target_review_date || '',
    reviewCadence: row?.review_cadence || stepsMeta.reviewCadence || null,
    nextReviewDueAt: row?.next_review_due_at || stepsMeta.nextReviewDueAt || null,
    reflectionNotes,
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
    title: row?.title || 'Untitled Plan',
    description: row?.description || '',
    steps: Array.isArray(stepsList) ? stepsList : [],
    isCompleted: Boolean(row?.is_completed),
    pointsAwarded: row?.points_awarded || 0,
    createdAt: row?.created_at || new Date().toISOString(),

    // Phase B Plan Type Properties
    planType: stepsMeta.planType || row?.plan_type || 'milestone',
    targetValue: stepsMeta.targetValue !== undefined ? Number(stepsMeta.targetValue) : (row?.target_value !== undefined && row?.target_value !== null ? Number(row.target_value) : undefined),
    targetUnit: stepsMeta.targetUnit || row?.target_unit || '',
    currentProgress: stepsMeta.currentProgress !== undefined ? Number(stepsMeta.currentProgress) : (row?.current_progress !== undefined && row?.current_progress !== null ? Number(row.current_progress) : 0),
    targetDate: stepsMeta.targetDate || row?.target_date || '',
    cadence: stepsMeta.cadence || row?.cadence || 'daily',
    duration: stepsMeta.duration !== undefined ? Number(stepsMeta.duration) : (row?.duration !== undefined && row?.duration !== null ? Number(row.duration) : 30),
    startDate: stepsMeta.startDate || row?.start_date || new Date().toISOString(),
    streakCount: stepsMeta.streakCount !== undefined ? Number(stepsMeta.streakCount) : (row?.streak_count !== undefined && row?.streak_count !== null ? Number(row.streak_count) : 0),
    lastCompletedDate: stepsMeta.lastCompletedDate || row?.last_completed_date || '',
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

export async function fetchPublicPlansFromSupabase(options?: FetchPublicPlansParams): Promise<ImprovementPlan[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase
      .from('improvement_plans')
      .select('*, profiles:creator_id(total_points, username, avatar)')
      .eq('is_public', true);

    if (options?.category && options.category !== 'All') {
      query = query.eq('category', options.category);
    }

    if (options?.planType && options.planType !== 'all') {
      query = query.or(`plan_type.eq.${options.planType},steps->>planType.eq.${options.planType}`);
    }

    if (options?.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term}`);
    }

    if (options?.sortBy === 'followed') {
      query = query.order('copy_count', { ascending: false });
    } else if (options?.sortBy === 'creator_rank') {
      query = query.order('profiles(total_points)', { ascending: false, foreignTable: 'profiles' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: plansData, error } = await query;

    if (error || !plansData) {
      console.warn('Error querying public plans from Supabase:', error);
      return [];
    }

    // Fetch follow counts directly from user_plan_follows table
    const { data: followsData } = await supabase
      .from('user_plan_follows')
      .select('original_plan_id');

    const followCounts: Record<string, number> = {};
    if (followsData) {
      followsData.forEach((f) => {
        if (f.original_plan_id) {
          followCounts[f.original_plan_id] = (followCounts[f.original_plan_id] || 0) + 1;
        }
      });
    }

    return plansData.map((row) => {
      const plan = mapRowToImprovementPlan(row);
      const actualFollows = followCounts[row.id] || 0;
      plan.copyCount = Math.max(plan.copyCount || 0, actualFollows);
      if (row.profiles && typeof row.profiles === 'object' && row.profiles?.total_points !== undefined) {
        plan.creatorPoints = Number(row.profiles.total_points) || 0;
      }
      return plan;
    });
  } catch (e) {
    console.error('Error fetching public plans from Supabase:', e);
    return [];
  }
}

export async function fetchPlanReflectionNotes(
  planId: string,
  isFollowed: boolean = false
): Promise<PlanReflectionNote[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const col = isFollowed ? 'followed_plan_id' : 'original_plan_id';
    const { data, error } = await supabase
      .from('plan_reflection_notes')
      .select('*')
      .eq(col, planId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((r) => ({
      id: r.id,
      originalPlanId: r.original_plan_id,
      followedPlanId: r.followed_plan_id,
      ownerId: r.owner_id,
      note: r.note,
      createdAt: r.created_at,
    }));
  } catch (e) {
    console.error('Error fetching reflection notes:', e);
    return [];
  }
}

export async function addReflectionNoteToSupabase(params: {
  originalPlanId?: string;
  followedPlanId?: string;
  note: string;
  nextReviewDueAt?: string | null;
  reviewCadence?: 'weekly' | 'monthly' | null;
}): Promise<PlanReflectionNote | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const ownerId = session?.user?.id;
    if (!ownerId) return null;

    const noteId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('plan_reflection_notes')
      .insert({
        id: noteId,
        original_plan_id: params.originalPlanId || null,
        followed_plan_id: params.followedPlanId || null,
        owner_id: ownerId,
        note: params.note,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting reflection note:', error);
      return null;
    }

    // Recalculate and update next_review_due_at on target plan table
    if (params.nextReviewDueAt !== undefined) {
      if (params.originalPlanId) {
        await supabase
          .from('improvement_plans')
          .update({ next_review_due_at: params.nextReviewDueAt })
          .eq('id', params.originalPlanId);
      } else if (params.followedPlanId) {
        await supabase
          .from('user_plan_follows')
          .update({ next_review_due_at: params.nextReviewDueAt })
          .eq('id', params.followedPlanId);
      }
    }

    return {
      id: data.id,
      originalPlanId: data.original_plan_id,
      followedPlanId: data.followed_plan_id,
      ownerId: data.owner_id,
      note: data.note,
      createdAt: data.created_at,
    };
  } catch (e) {
    console.error('Error in addReflectionNoteToSupabase:', e);
    return null;
  }
}

export async function deleteReflectionNoteFromSupabase(noteId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('plan_reflection_notes').delete().eq('id', noteId);
    return !error;
  } catch (e) {
    console.error('Error deleting reflection note:', e);
    return false;
  }
}

export async function sendPartnerInviteSupabase(invite: PartnerInvite) {
  if (!isSupabaseConfigured) return;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const inviteId = uuidPattern.test(invite.id) ? invite.id : crypto.randomUUID();

  const payload: Record<string, any> = {
    id: inviteId,
    from_user_id: invite.fromUserId,
    from_username: invite.fromUsername,
    from_avatar: invite.fromAvatar || '🧑',
    to_user_id: invite.toUserId,
    to_username: invite.toUsername,
    status: invite.status,
  };

  let { error } = await supabase.from('partner_invites').insert(payload);
  if (error && error.message?.includes('duplicate key')) {
    const { error: updateErr } = await supabase
      .from('partner_invites')
      .update({ status: invite.status })
      .eq('id', inviteId);
    error = updateErr;
  }

  if (error) {
    console.error('Error sending partner invite to Supabase:', error);
    throw new Error(error.message || 'Failed to persist invite in database.');
  }
}

export async function fetchPartnerInvitesSupabase(userId: string, username: string): Promise<PartnerInvite[]> {
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
      return [];
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
    return [];
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
): Promise<{ success: boolean; partnershipId?: string; error?: string }> {
  if (!isSupabaseConfigured) return { success: true, partnershipId: crypto.randomUUID() };
  try {
    const { data, error } = await supabase.rpc('accept_partner_invite_atomic', {
      p_invite_id: inviteId,
      p_user1_id: user1Id,
      p_user1_username: user1Username,
      p_user2_id: user2Id,
      p_user2_username: user2Username,
    });

    if (error) {
      console.warn('RPC accept_partner_invite_atomic fallback check:', error.message);
      const { data: invCheck } = await supabase.from('partner_invites').select('id, status').eq('id', inviteId).maybeSingle();
      if (!invCheck || invCheck.status !== 'pending') {
        return { success: false, error: 'This invite is no longer available' };
      }
      await savePartnershipSupabase({
        id: crypto.randomUUID(),
        user1Id,
        user1Username,
        user2Id,
        user2Username,
        pairedAt: new Date().toISOString(),
      });
      await cleanupPendingInvitesBetweenUsersSupabase(user1Id, user1Username, user2Id, user2Username);
      return { success: true };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'This invite is no longer available' };
    }

    // Always ensure all pending invites between these 2 users are deleted
    await cleanupPendingInvitesBetweenUsersSupabase(user1Id, user1Username, user2Id, user2Username);

    return { success: true, partnershipId: data?.partnership_id };
  } catch (e: any) {
    console.error('Error in acceptPartnerInviteAtomicSupabase:', e);
    return { success: false, error: e.message || 'This invite is no longer available' };
  }
}

export async function savePartnershipSupabase(partnership: Partnership) {
  if (!isSupabaseConfigured) return;
  try {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let partId = uuidPattern.test(partnership.id) ? partnership.id : crypto.randomUUID();

    // Deduplication check: see if a partnership between these 2 users already exists in DB
    const { data: existing } = await supabase
      .from('partnerships')
      .select('id')
      .or(`and(user1_username.ilike.${partnership.user1Username},user2_username.ilike.${partnership.user2Username}),and(user1_username.ilike.${partnership.user2Username},user2_username.ilike.${partnership.user1Username})`)
      .maybeSingle();

    if (existing?.id) {
      partId = existing.id;
    }

    const { error: pErr } = await supabase.from('partnerships').upsert({
      id: partId,
      user1_id: partnership.user1Id,
      user1_username: partnership.user1Username,
      user2_id: partnership.user2Id,
      user2_username: partnership.user2Username,
      user1_allow_stats: partnership.user1AllowStats ?? false,
      user2_allow_stats: partnership.user2AllowStats ?? false,
      paired_at: partnership.pairedAt,
    });
    if (pErr) {
      console.warn('Supabase partnership save warning:', pErr.message);
      throw new Error(pErr.message || 'Failed to save partnership in database');
    }

    // Delete or update invite status in DB for both users
    await cleanupPendingInvitesBetweenUsersSupabase(
      partnership.user1Id,
      partnership.user1Username,
      partnership.user2Id,
      partnership.user2Username
    );
  } catch (e) {
    console.error('Error saving partnership in Supabase:', e);
    throw e;
  }
}

export async function togglePartnerStatsVisibilitySupabase(
  partnershipId: string,
  currentUserId: string,
  allow: boolean
) {
  if (!isSupabaseConfigured || !partnershipId) return;
  try {
    const { data: existing } = await supabase
      .from('partnerships')
      .select('user1_id, user2_id')
      .eq('id', partnershipId)
      .maybeSingle();

    if (!existing) return;

    const isUser1 = existing.user1_id === currentUserId;
    const updatePayload = isUser1 ? { user1_allow_stats: allow } : { user2_allow_stats: allow };

    const { error } = await supabase.from('partnerships').update(updatePayload).eq('id', partnershipId);
    if (error) {
      console.warn('Supabase stats visibility update warning:', error.message);
      if (error.message.includes('column') || error.message.includes('schema cache')) {
        throw new Error('Database migration pending: Please run the SQL migration script in your Supabase Dashboard to enable stats sharing.');
      }
      throw new Error(error.message || 'Failed to toggle stats visibility in database');
    }
  } catch (e) {
    console.warn('togglePartnerStatsVisibilitySupabase warning:', e);
    throw e;
  }
}

export async function deletePartnerInviteSupabase(inviteId: string) {
  if (!isSupabaseConfigured || !inviteId) return;
  try {
    const { error } = await supabase.from('partner_invites').delete().eq('id', inviteId);
    if (error) {
      console.error('Error deleting partner invite in Supabase:', error);
      throw new Error(error.message || 'Failed to delete partner invite in database');
    }
  } catch (e) {
    console.error('deletePartnerInviteSupabase failed:', e);
    throw e;
  }
}

export async function fetchPartnershipSupabase(userId: string): Promise<Partnership | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('partnerships')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      user1Id: data.user1_id,
      user1Username: data.user1_username,
      user2Id: data.user2_id,
      user2Username: data.user2_username,
      user1AllowStats: data.user1_allow_stats ?? false,
      user2AllowStats: data.user2_allow_stats ?? false,
      pairedAt: data.paired_at,
    };
  } catch (e) {
    console.error('Error fetching partnership from Supabase:', e);
    return null;
  }
}

export async function fetchPartnershipsSupabase(userId: string): Promise<Partnership[]> {
  if (!isSupabaseConfigured || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('partnerships')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      user1Id: row.user1_id,
      user1Username: row.from_username || row.user1_username,
      user2Id: row.user2_id,
      user2Username: row.user2_username,
      user1AllowStats: row.user1_allow_stats ?? false,
      user2AllowStats: row.user2_allow_stats ?? false,
      pairedAt: row.paired_at,
    }));
  } catch (e) {
    console.error('Error fetching partnerships from Supabase:', e);
    return [];
  }
}

export async function deletePartnershipSupabase(partnershipId: string) {
  if (!isSupabaseConfigured || !partnershipId) return;
  try {
    // Delete associated shared challenges first
    await supabase.from('shared_challenges').delete().eq('partnership_id', partnershipId);

    const { error } = await supabase.from('partnerships').delete().eq('id', partnershipId);
    if (error) {
      console.error('Error deleting partnership in Supabase:', error);
      throw new Error(error.message || 'Failed to delete partnership in database');
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

    const payload: Record<string, any> = {
      id: challengeId,
      partnership_id: challenge.partnershipId,
      title: challenge.title,
      target_habit_name: challenge.targetHabitName,
      duration_days: challenge.durationDays,
      joint_streak: challenge.jointStreak,
      user1_category: challenge.user1Category || 'habit',
      user1_target: challenge.user1Target || challenge.targetHabitName,
      user2_category: challenge.user2Category || 'habit',
      user2_target: challenge.user2Target || challenge.targetHabitName,
      user1_done_date: challenge.user1DoneDate || null,
      user2_done_date: challenge.user2DoneDate || null,
      status: challenge.status,
    };

    const { error } = await supabase.from('shared_challenges').upsert(payload);
    if (error) {
      console.warn('Supabase shared challenge sync warning:', error.message);
    }
  } catch (e) {
    console.warn('Supabase shared challenge sync skipped:', e);
  }
}

export async function fetchSharedChallengesSupabase(partnershipIds: string | string[]): Promise<SharedChallenge[]> {
  if (!isSupabaseConfigured) return [];
  const ids = Array.isArray(partnershipIds) ? partnershipIds : [partnershipIds];
  if (ids.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('shared_challenges')
      .select('*')
      .in('partnership_id', ids)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      partnershipId: row.partnership_id,
      title: row.title,
      targetHabitName: row.target_habit_name,
      durationDays: row.duration_days,
      jointStreak: row.joint_streak,
      user1Category: (row.user1_category as any) || 'habit',
      user1Target: row.user1_target || row.target_habit_name,
      user2Category: (row.user2_category as any) || 'habit',
      user2Target: row.user2_target || row.target_habit_name,
      user1DoneDate: row.user1_done_date || undefined,
      user2DoneDate: row.user2_done_date || undefined,
      status: row.status as 'active' | 'completed',
      createdAt: row.created_at,
    }));
  } catch (e) {
    console.error('Error fetching shared challenges from Supabase:', e);
    return [];
  }
}

export async function deleteSharedChallengeSupabase(challengeId: string) {
  if (!isSupabaseConfigured || !challengeId) return;
  try {
    const { error } = await supabase.from('shared_challenges').delete().eq('id', challengeId);
    if (error) {
      console.error('Error deleting shared challenge in Supabase:', error);
      throw new Error(error.message || 'Failed to delete shared challenge in database');
    }
  } catch (e) {
    console.error('deleteSharedChallengeSupabase failed:', e);
    throw e;
  }
}

/* ==========================================
   NOTIFICATION SYSTEM HELPERS
   ========================================== */

export async function fetchNotificationsSupabase(recipientId: string): Promise<AppNotification[]> {
  if (!isSupabaseConfigured || !recipientId) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) return [];

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
    return [];
  }
}

export async function createNotificationSupabase(
  notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
): Promise<AppNotification | null> {
  if (!isSupabaseConfigured || !notif.recipientId) return null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const actorId = authData?.user?.id || notif.actorId || null;

    // 1. Try SECURITY DEFINER RPC first (executes atomic check-and-insert in 1 database transaction)
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

    if (!rpcErr) {
      if (!rpcData) return null; // Deduplicated by atomic Postgres RPC
      return {
        id: rpcData.id,
        recipientId: rpcData.recipient_id,
        actorId: rpcData.actor_id || undefined,
        actorUsername: rpcData.actor_username || undefined,
        actorAvatar: rpcData.actor_avatar || undefined,
        type: rpcData.type,
        title: rpcData.title || undefined,
        message: rpcData.message,
        payload: rpcData.payload || {},
        read: rpcData.read ?? false,
        createdAt: rpcData.created_at,
      };
    } else {
      console.warn('[createNotificationSupabase] RPC create_notification_atomic failed:', rpcErr.message, 'Code:', rpcErr.code);
    }

    // 2. Direct table SELECT/INSERT fallback
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('notif_partner_activity, notif_league_updates, notif_daily_reminder')
      .eq('id', notif.recipientId)
      .maybeSingle();

    if (recipientProfile) {
      if (['partner_nudge', 'challenge_completed'].includes(notif.type) && recipientProfile.notif_partner_activity === false) {
        console.info(`[createNotificationSupabase] Notification type '${notif.type}' suppressed for user ${notif.recipientId} (notif_partner_activity is false)`);
        return null;
      }
      if (['league_reset', 'league_promotion', 'league_demotion', 'league_update'].includes(notif.type) && recipientProfile.notif_league_updates === false) {
        console.info(`[createNotificationSupabase] Notification type '${notif.type}' suppressed for user ${notif.recipientId} (notif_league_updates is false)`);
        return null;
      }
      if (['daily_reminder'].includes(notif.type) && recipientProfile.notif_daily_reminder === false) {
        console.info(`[createNotificationSupabase] Notification type '${notif.type}' suppressed for user ${notif.recipientId} (notif_daily_reminder is false)`);
        return null;
      }
    }

    const payloadRow = {
      recipient_id: notif.recipientId,
      actor_id: actorId,
      actor_username: notif.actorUsername || null,
      actor_avatar: notif.actorAvatar || null,
      type: notif.type,
      title: notif.title || null,
      message: notif.message,
      payload: notif.payload || {},
      read: false,
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert(payloadRow)
      .select()
      .single();

    if (error || !data) {
      if (error?.code === '23505' || error?.message?.includes('unique constraint') || error?.message?.includes('idx_notifications_dedup')) {
        console.info('[createNotificationSupabase] Notification deduplicated via idx_notifications_dedup constraint');
        return null;
      }
      console.warn('Supabase notification insertion warning:', error?.message);
      return null;
    }

    return {
      id: data.id,
      recipientId: data.recipient_id,
      actorId: data.actor_id || undefined,
      actorUsername: data.actor_username || undefined,
      actorAvatar: data.actor_avatar || undefined,
      type: data.type,
      title: data.title || undefined,
      message: data.message,
      payload: data.payload || {},
      read: data.read ?? false,
      createdAt: data.created_at,
    };
  } catch (e) {
    console.warn('createNotificationSupabase skipped:', e);
    return null;
  }
}

export async function markNotificationReadSupabase(notificationId: string) {
  if (!isSupabaseConfigured || !notificationId) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  } catch (e) {
    console.warn('markNotificationReadSupabase skipped:', e);
  }
}

export async function markAllNotificationsReadSupabase(recipientId: string) {
  if (!isSupabaseConfigured || !recipientId) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', recipientId).eq('read', false);
  } catch (e) {
    console.warn('markAllNotificationsReadSupabase skipped:', e);
  }
}

export async function clearNotificationSupabase(notificationId: string) {
  if (!isSupabaseConfigured || !notificationId) return;
  try {
    await supabase.from('notifications').delete().eq('id', notificationId);
  } catch (e) {
    console.warn('clearNotificationSupabase skipped:', e);
  }
}
