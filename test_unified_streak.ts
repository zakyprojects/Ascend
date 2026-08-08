import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) envVars[k.trim()] = v.trim();
});

const url = envVars.VITE_SUPABASE_URL || '';
const key = envVars.VITE_SUPABASE_ANON_KEY || '';
const client = createClient(url, key);

function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function testUnifiedStreak() {
  console.log('--- TESTING UNIFIED STREAK CALCULATION FOR asdf, qwer, YousafKhan ---\n');

  const usernames = ['asdf', 'qwer', 'YousafKhan'];

  for (const username of usernames) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, username, stats, points_history, active_habits')
      .eq('username', username);

    const { data: userDataRows } = await client
      .from('user_data')
      .select('state')
      .eq('user_id', profiles?.[0]?.id || '');

    const state = userDataRows?.[0]?.state;
    const profile = profiles?.[0];

    console.log(`\n========================================`);
    console.log(`USER: ${username}`);
    console.log(`========================================`);

    if (state) {
      console.log('Full AppState found in user_data table!');
      console.log('  Habits count:', state.habits?.length || 0);
      console.log('  Workouts count:', state.workouts?.length || 0);
      console.log('  Reading logs count:', state.readingLogs?.length || 0);
      console.log('  Bad habits count:', state.badHabits?.length || 0);
      console.log('  Skill logs count:', state.skillLogs?.length || 0);
    } else {
      console.log('No user_data blob, using profile payload.');
    }

    if (profile) {
      console.log('Profile points_history count:', profile.points_history?.length || 0);
      console.log('Profile stats:', JSON.stringify(profile.stats));
    }
  }
}

testUnifiedStreak().catch(console.error);
