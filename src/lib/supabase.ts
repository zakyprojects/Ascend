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
      const streakDays = Math.min(30, Math.floor(habitsCompletedCount / 2) + 1);
      const exerciseMinutes = (state.workouts || []).reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = (state.books || []).filter((b) => b.isFinished).length;
      const skillsPracticedCount = (state.skillLogs || []).length;

      const userStats = {
        streakDays,
        habitsCompletedCount,
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

export async function savePartnershipSupabase(partnership: Partnership) {
  if (!isSupabaseConfigured) return;
  try {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const partId = uuidPattern.test(partnership.id) ? partnership.id : crypto.randomUUID();

    const { error: pErr } = await supabase.from('partnerships').upsert({
      id: partId,
      user1_id: partnership.user1Id,
      user1_username: partnership.user1Username,
      user2_id: partnership.user2Id,
      user2_username: partnership.user2Username,
      paired_at: partnership.pairedAt,
    });
    if (pErr) console.warn('Supabase partnership save warning:', pErr.message);

    // Update invite status in DB for both users
    const isUser1Uuid = uuidPattern.test(partnership.user1Id);
    const isUser2Uuid = uuidPattern.test(partnership.user2Id);
    if (isUser1Uuid && isUser2Uuid) {
      await supabase
        .from('partner_invites')
        .update({ status: 'accepted' })
        .or(`and(from_user_id.eq.${partnership.user1Id},to_user_id.eq.${partnership.user2Id}),and(from_user_id.eq.${partnership.user2Id},to_user_id.eq.${partnership.user1Id})`);
    }
  } catch (e) {
    console.warn('Supabase partnership sync skipped:', e);
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
      pairedAt: data.paired_at,
    };
  } catch (e) {
    console.error('Error fetching partnership from Supabase:', e);
    return null;
  }
}

export async function deletePartnershipSupabase(partnershipId: string) {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('partnerships').delete().eq('id', partnershipId);
  } catch (e) {
    console.error('Error deleting partnership in Supabase:', e);
  }
}
