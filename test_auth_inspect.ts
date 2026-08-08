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

async function testWithLiveUser() {
  const testEmail = 'badhabit_test_user_2026@example.com';
  const testPass = 'Password123!';

  let authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  if (authRes.error) {
    await client.auth.signUp({ email: testEmail, password: testPass });
    authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  }

  const user = authRes.data?.user;
  if (!user) return;

  // 1. Upsert profile row first to satisfy FK
  await client.from('profiles').upsert({
    id: user.id,
    username: 'BadHabitTester',
    email: testEmail,
    avatar: '🧑',
    total_points: 90
  });

  // Query DB Step 1
  const { data: initialRow } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('\n--- LIVE DB STEP 1: INITIAL STATE IN user_data TABLE ---');
  console.log('user_id:', user.id);
  console.log('updated_at:', initialRow?.updated_at);
  console.log('raw state payload:', JSON.stringify(initialRow?.state, null, 2));

  // Perform action write (Occurred Today)
  const todayStr = new Date().toISOString().split('T')[0];
  const updatedState = {
    totalPoints: 90,
    badHabits: [
      { id: 'bh-real-1', name: 'Doomscrolling', commitmentDays: 30, createdAt: new Date().toISOString() }
    ],
    badHabitLogs: [
      {
        id: 'log-101',
        badHabitId: 'bh-real-1',
        date: todayStr,
        status: 'occurred',
        consecutiveOccurrences: 1,
        pointsAwardedOrDeducted: -10,
        createdAt: new Date().toISOString()
      }
    ]
  };

  await client.from('user_data').upsert({
    user_id: user.id,
    state: updatedState,
    updated_at: new Date().toISOString()
  });

  // Query DB Step 2 (Immediately after write)
  const { data: step2Row } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('\n--- LIVE DB STEP 2: IMMEDIATELY AFTER CLICKING "Occurred Today" ---');
  console.log('user_id:', user.id);
  console.log('updated_at:', step2Row?.updated_at);
  console.log('raw state payload in DB:');
  console.log(JSON.stringify(step2Row?.state, null, 2));

  // Query DB Step 3 (Simulated Hard Reload / Fresh Fetch)
  const { data: step3Row } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('\n--- LIVE DB STEP 3: AFTER HARD RELOAD (FRESH DB FETCH) ---');
  console.log('user_id:', user.id);
  console.log('updated_at:', step3Row?.updated_at);
  console.log('raw state payload in DB:');
  console.log(JSON.stringify(step3Row?.state, null, 2));
}

testWithLiveUser().catch(console.error);
