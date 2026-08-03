/**
 * Mirrors the exact Ascend auth flow: onAuthStateChange + signUpUser/loginUser in parallel.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

async function fetchUserDataFromSupabase(userId) {
  const { data, error } = await supabase.from('user_data').select('state').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return data.state;
}

async function saveUserDataToSupabase(userId, state) {
  if (state.currentUser) {
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: userId,
      username: state.currentUser.username,
      email: state.currentUser.email,
      avatar: state.currentUser.avatar || '🧑',
      is_profile_public: state.currentUser.isProfilePublic ?? true,
      total_points: state.totalPoints || 0,
      points_history: state.pointsHistory || [],
      stats: {},
      active_habits: [],
    });
    if (profErr) console.log('profile upsert error:', profErr.message);
  }
  const { error: dataErr } = await supabase.from('user_data').upsert({
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  });
  if (dataErr) console.log('user_data upsert error:', dataErr.message);
}

// Mirror store.ts listener EXACTLY
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('[listener] event:', event);
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
    console.log('[listener] fetching user_data...');
    const remoteState = await fetchUserDataFromSupabase(session.user.id);
    console.log('[listener] fetch done, has state:', !!remoteState);
  }
});

async function signUpUser(email, password, username) {
  console.log('[signUpUser] checking username...');
  const { data: profiles } = await supabase.from('profiles').select('id, username').ilike('username', username);
  console.log('[signUpUser] username check done, matches:', profiles?.length);

  console.log('[signUpUser] calling signUp...');
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  console.log('[signUpUser] signUp returned, error:', authError?.message, 'session:', !!authData?.session);

  if (authError || !authData.user) throw new Error(authError?.message || 'signUp failed');

  const profile = { id: authData.user.id, email, username, avatar: '🧑', isProfilePublic: true };
  const initialState = { currentUser: profile, username, totalPoints: 0, pointsHistory: [], habits: [] };

  console.log('[signUpUser] saving user data...');
  await saveUserDataToSupabase(authData.user.id, initialState);
  console.log('[signUpUser] save complete');
  return { user: profile, state: initialState };
}

async function loginUser(email, password) {
  console.log('[loginUser] calling signInWithPassword...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  console.log('[loginUser] signIn returned, error:', authError?.message);

  if (authError || !authData.user) throw new Error(authError?.message || 'login failed');

  console.log('[loginUser] fetching profile...');
  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  console.log('[loginUser] profile fetch done');

  console.log('[loginUser] fetching user_data...');
  const savedState = await fetchUserDataFromSupabase(authData.user.id);
  console.log('[loginUser] user_data fetch done, has state:', !!savedState);
  return { profileData, savedState };
}

async function withTimeout(label, fn, ms = 15000) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} TIMEOUT after ${ms}ms`)), ms));
  return Promise.race([fn(), timeout]);
}

const email = `flow-test-${Date.now()}@test.local`;
const password = 'TestPassword123!';
const username = `user_${Date.now()}`;

try {
  console.log('\n=== SIGN UP FLOW ===');
  await withTimeout('signUpUser', () => signUpUser(email, password, username));
  console.log('SIGN UP: SUCCESS\n');

  await supabase.auth.signOut();
  console.log('Signed out\n');

  console.log('=== LOGIN FLOW ===');
  await withTimeout('loginUser', () => loginUser(email.toLowerCase(), password));
  console.log('LOGIN: SUCCESS');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
