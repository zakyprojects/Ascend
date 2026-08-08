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

async function testNegativePointsDb() {
  console.log('Testing Supabase DB behavior on "Occurred" negative points write...\n');

  const testEmail = 'badhabit_test_user_2026@example.com';
  const testPass = 'Password123!';

  let authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  if (authRes.error) {
    await client.auth.signUp({ email: testEmail, password: testPass });
    authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  }

  const user = authRes.data?.user;
  if (!user) return;

  // Test 1: Try writing total_points: -10 to profiles
  console.log('1. Attempting profiles upsert with total_points: -10 ...');
  const { error: profErr } = await client.from('profiles').upsert({
    id: user.id,
    username: 'NegativePointsTester',
    email: testEmail,
    total_points: -10
  });

  if (profErr) {
    console.log('  [PROFILES ERROR DETECTED!]', profErr);
  } else {
    console.log('  Profiles upsert succeeded.');
  }

  // Test 2: Try writing user_data state with totalPoints: 0 and badHabitLogs with pointsAwardedOrDeducted: -10
  console.log('\n2. Attempting user_data upsert with status: "occurred", points: -10 ...');
  const { error: dataErr } = await client.from('user_data').upsert({
    user_id: user.id,
    state: {
      totalPoints: 0,
      badHabits: [{ id: 'bh-test', name: 'Test Habit', commitmentDays: 30, createdAt: new Date().toISOString() }],
      badHabitLogs: [{
        id: 'log-neg-1',
        badHabitId: 'bh-test',
        date: new Date().toISOString().split('T')[0],
        status: 'occurred',
        pointsAwardedOrDeducted: -10,
        createdAt: new Date().toISOString()
      }],
      pointsHistory: [{
        id: 'ph-neg-1',
        amount: -10,
        reason: 'Bad habit occurred (1x penalty): Test Habit',
        source: 'bad_habit_occurred',
        timestamp: new Date().toISOString()
      }]
    },
    updated_at: new Date().toISOString()
  });

  if (dataErr) {
    console.log('  [USER_DATA ERROR DETECTED!]', dataErr);
  } else {
    console.log('  user_data upsert succeeded.');
  }
}

testNegativePointsDb().catch(console.error);
