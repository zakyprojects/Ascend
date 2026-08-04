import { createClient } from '@supabase/supabase-js';
import { UserProfile, ImprovementPlan, PartnerInvite, Partnership, AppState, SharedChallenge, PartnerNotification } from '@/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing from environment variables.');
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
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

export async function fetchUserDataFromSupabase(userId: string): Promise<AppState | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.state as AppState;
  } catch (e) {
    console.error('Error fetching user_data from Supabase:', e);
    return null;
  }
}

export async function saveUserDataToSupabase(userId: string, state: AppState) {
  if (!isSupabaseConfigured) return;
  try {
    // 1. MUST upsert profiles FIRST to satisfy foreign key constraint user_data_user_id_fkey
    if (state.currentUser) {
      const habitsCompletedCount = (state.habits || []).reduce((acc, h) => acc + (h.completions?.length || 0), 0);
      const habitsCompletedTodayCount = (state.habits || []).reduce((acc, h) => {
        const todayStr = new Date().toISOString().split('T')[0];
        return acc + (h.completions?.includes(todayStr) ? 1 : 0);
      }, 0);
      const streakDays = habitsCompletedCount === 0 ? 0 : Math.max(1, Math.min(30, Math.floor(habitsCompletedCount / 2) + (habitsCompletedTodayCount > 0 ? 1 : 0)));
      const exerciseMinutes = (state.workouts || []).reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = (state.books || []).filter((b) => b.isFinished).length;
      const skillsPracticedCount = (state.skillLogs || []).length;

      const userStats = {
        streakDays,
        habitsCompletedCount,
        habitsCompletedTodayCount,
        journalEntriesCount: (state.journalEntries || []).length,
        exerciseMinutes,
        booksRead,
        skillsPracticedCount,
      };

      const activeHabitsList = (state.habits || []).map((h) => ({
        name: h.name,
        category: h.category,
        frequency: h.frequency,
        isPreset: h.isPreset,
      }));

      const profilePayload: Record<string, any> = {
        id: userId,
        username: state.currentUser.username,
        email: state.currentUser.email,
        avatar: state.currentUser.avatar || '🧑',
        is_profile_public: state.currentUser.isProfilePublic ?? true,
        total_points: state.totalPoints || 0,
        points_history: state.pointsHistory || [],
        stats: userStats,
        active_habits: activeHabitsList,
      };

      if (state.currentUser.uid) {
        profilePayload.uid = state.currentUser.uid;
      }

      if (state.currentUser.lastUsernameChangeAt) {
        profilePayload.last_username_change_at = state.currentUser.lastUsernameChangeAt;
      }

      let { error: profErr } = await supabase.from('profiles').upsert(profilePayload);

      if (profErr) {
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
    }

    // 2. Save full state to user_data table SECOND
    const { error: dataErr } = await supabase.from('user_data').upsert({
      user_id: userId,
      state: state,
      updated_at: new Date().toISOString(),
    });

    if (dataErr) {
      console.error('Error upserting user_data in Supabase:', dataErr);
    }
  } catch (e) {
    console.error('Error saving user_data to Supabase:', e);
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

export async function syncPlanToSupabase(plan: ImprovementPlan) {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from('improvement_plans').upsert({
      id: plan.id,
      creator_id: plan.creatorId,
      creator_username: plan.creatorUsername,
      creator_avatar: plan.creatorAvatar || '🧑',
      title: plan.title,
      description: plan.description,
      category: plan.category || 'Personal Growth',
      is_public: plan.isPublic,
      steps: plan.steps,
      copy_count: plan.copyCount,
    });
    if (error) {
      console.error('Error syncing plan to Supabase:', error);
    }
  } catch (e) {
    console.warn('Supabase plan sync error:', e);
  }
}

export async function fetchPublicPlansFromSupabase(): Promise<ImprovementPlan[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('improvement_plans')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      creatorId: row.creator_id,
      creatorUsername: row.creator_username,
      creatorAvatar: row.creator_avatar || '🧑',
      title: row.title,
      description: row.description,
      category: row.category || 'Personal Growth',
      isPublic: row.is_public,
      steps: row.steps || [],
      copyCount: row.copy_count || 0,
      createdAt: row.created_at,
    }));
  } catch (e) {
    console.error('Error fetching public plans from Supabase:', e);
    return [];
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
      await deletePartnerInviteSupabase(inviteId);
      return { success: true };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'This invite is no longer available' };
    }

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
    await supabase
      .from('partner_invites')
      .delete()
      .or(`and(from_username.ilike.${partnership.user1Username},to_username.ilike.${partnership.user2Username}),and(from_username.ilike.${partnership.user2Username},to_username.ilike.${partnership.user1Username})`);
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

    // 1. Try SECURITY DEFINER RPC first (same reliable execution model as daily reminders)
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

    if (!rpcErr && rpcData) {
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
    }

    // 2. Direct table SELECT/INSERT fallback
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
