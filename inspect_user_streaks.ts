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

async function inspectUserStreaks() {
  console.log('--- INSPECTING REAL SUPABASE DATA FOR YousafKhan AND qwer ---\n');

  // 1. Fetch profiles
  const { data: profiles, error: profErr } = await client
    .from('profiles')
    .select('id, username, stats, points_history, active_habits')
    .in('username', ['YousafKhan', 'qwer']);

  if (profErr) {
    console.error('Error fetching profiles:', profErr);
    return;
  }

  console.log('PROFILES TABLE DATA:');
  profiles?.forEach((p) => {
    console.log(`User: ${p.username} (id: ${p.id})`);
    console.log('  Stored stats in profiles table:', JSON.stringify(p.stats));
    console.log('  Active habits count:', p.active_habits?.length || 0);
  });

  // 2. Fetch user_data blobs
  console.log('\nUSER_DATA TABLE STATE BLOBS:');
  for (const p of profiles || []) {
    const { data: userDataRows, error: udErr } = await client
      .from('user_data')
      .select('state, updated_at')
      .eq('user_id', p.id);

    if (udErr) {
      console.error(`Error fetching user_data for ${p.username}:`, udErr);
      continue;
    }

    if (!userDataRows || userDataRows.length === 0) {
      console.log(`  No user_data blob found for ${p.username}`);
      continue;
    }

    const state = userDataRows[0].state;
    console.log(`\n--- ${p.username} (user_data state analysis) ---`);
    console.log('  Total Points:', state.totalPoints);
    console.log('  Habits count:', state.habits?.length || 0);
    if (state.habits && state.habits.length > 0) {
      state.habits.forEach((h: any) => {
        console.log(`    Habit "${h.name}": completions count = ${h.completions?.length || 0}, dates =`, h.completions);
      });
    }
    console.log('  Workouts (Exercise) count:', state.workouts?.length || 0);
    if (state.workouts && state.workouts.length > 0) {
      const dates = state.workouts.map((w: any) => w.date);
      console.log('    Workout dates:', dates);
    }
    console.log('  Books / Reading logs count:', state.books?.length || 0, state.readingLogs?.length || 0);
    if (state.readingLogs && state.readingLogs.length > 0) {
      console.log('    Reading log dates:', state.readingLogs.map((r: any) => r.date));
    }
    console.log('  Bad habits count:', state.badHabits?.length || 0);
    if (state.badHabitLogs && state.badHabitLogs.length > 0) {
      console.log('    Bad habit log count:', state.badHabitLogs.length);
    }
    console.log('  Skill logs count:', state.skillLogs?.length || 0);
  }
}

inspectUserStreaks().catch(console.error);
