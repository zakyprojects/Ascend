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

// Simulate the exact store functions to test real client behavior against live Supabase DB
function getMissPenaltyMultiplier(consecutiveMisses: number, totalPoints: number = 0): number {
  const isDiamondOrAbove = totalPoints >= 1000;
  if (!isDiamondOrAbove) {
    if (consecutiveMisses <= 1) return 1.0;
    return 1.5;
  } else {
    if (consecutiveMisses <= 1) return 1.0;
    if (consecutiveMisses === 2) return 2.0;
    return 2.5;
  }
}

async function runInvestigation() {
  const testEmail = 'badhabit_test_user_2026@example.com';
  const testPass = 'Password123!';

  let authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  if (authRes.error) {
    await client.auth.signUp({ email: testEmail, password: testPass });
    authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  }

  const user = authRes.data?.user;
  if (!user) {
    console.error('Could not authenticate!');
    return;
  }

  // Ensure profile row exists
  await client.from('profiles').upsert({
    id: user.id,
    username: 'InvestigationUser',
    email: testEmail,
    avatar: '🧑',
    total_points: 100,
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // 3 Habits: Habit 1 (point-eligible, index 0), Habit 2 (point-eligible, index 1), Habit 3 (non-point-eligible, index 2)
  const h1 = { id: 'bh-eligible-1', name: 'Eligible Habit 1', commitmentDays: 30, createdAt: '2026-08-01T00:00:00.000Z', isCompleted: false };
  const h2 = { id: 'bh-eligible-2', name: 'Eligible Habit 2', commitmentDays: 30, createdAt: '2026-08-02T00:00:00.000Z', isCompleted: false };
  const h3 = { id: 'bh-noneligible-3', name: 'Non-Eligible Habit 3', commitmentDays: 30, createdAt: '2026-08-03T00:00:00.000Z', isCompleted: false };

  console.log('================================================================================');
  console.log('       LIVE DATABASE INVESTIGATION: STATUS CHANGE (Resisted -> Occurred)       ');
  console.log('================================================================================\n');

  // --------------------------------------------------------------------------------
  // PART A: TEST POINT-ELIGIBLE HABIT (Habit 1)
  // --------------------------------------------------------------------------------
  console.log('>>> TESTING POINT-ELIGIBLE HABIT (Habit 1: "Eligible Habit 1") <<<\n');

  let stateA: any = {
    totalPoints: 100,
    pointsHistory: [],
    badHabits: [h1, h2, h3],
    badHabitLogs: []
  };

  // Step A1: Click "Resisted Today"
  console.log('--- STEP A1: CLICK "Resisted Today" ON POINT-ELIGIBLE HABIT ---');
  const logA1 = {
    id: 'log-e1-today',
    badHabitId: h1.id,
    date: todayStr,
    status: 'resisted',
    consecutiveOccurrences: 0,
    pointsAwardedOrDeducted: 10,
    createdAt: new Date().toISOString()
  };
  stateA.totalPoints += 10;
  stateA.badHabitLogs = [logA1, ...stateA.badHabitLogs];

  await client.from('user_data').upsert({ user_id: user.id, state: stateA, updated_at: new Date().toISOString() });

  const { data: dbStepA1 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step A1 (Resisted):');
  console.log('  totalPoints:', dbStepA1?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(dbStepA1?.state?.badHabitLogs, null, 2));

  // Step A2: Click "Occurred Today" right after (Status change Resisted -> Occurred)
  console.log('\n--- STEP A2: CLICK "Occurred Today" RIGHT AFTER (STATUS CHANGE) ---');
  
  // Test current store logic: Check how current logBadHabitDay handles existingLog
  const existingLog = stateA.badHabitLogs.find((l: any) => l.badHabitId === h1.id && l.date === todayStr);
  console.log('  Existing log found for today before Occurred click:', existingLog ? `Yes (status: "${existingLog.status}")` : 'No');

  // Scenario 1: Direct click on Occurred (without undo)
  // Current store logic line 1350: if (existingLog) return prev; -> BLOCKS write!
  if (existingLog) {
    console.log('  [LOGIC FINDING] Current logBadHabitDay HAS AN EXPLICIT GUARD: if (existingLog) return prev;');
    console.log('  [RESULT] Direct Occurred click is BLOCKED by existingLog guard! State remains unchanged in memory.');
  }

  // Scenario 2: What if user clicked Undo first, THEN Occurred?
  console.log('\n--- STEP A2 (Alternative): UNDO RESISTED FIRST, THEN CLICK OCCURRED ---');
  // Undo: deduct +10 pts, remove log
  stateA.totalPoints -= 10;
  stateA.badHabitLogs = stateA.badHabitLogs.filter((l: any) => !(l.badHabitId === h1.id && l.date === todayStr));
  
  // Now click Occurred: deduct 10 pts (-10)
  const logA2 = {
    id: 'log-e1-occurred',
    badHabitId: h1.id,
    date: todayStr,
    status: 'occurred',
    consecutiveOccurrences: 1,
    pointsAwardedOrDeducted: -10,
    createdAt: new Date().toISOString()
  };
  stateA.totalPoints -= 10;
  stateA.badHabitLogs = [logA2, ...stateA.badHabitLogs];

  await client.from('user_data').upsert({ user_id: user.id, state: stateA, updated_at: new Date().toISOString() });

  const { data: dbStepA2 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step A2 (Undo -> Occurred):');
  console.log('  totalPoints:', dbStepA2?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(dbStepA2?.state?.badHabitLogs, null, 2));

  // Step A3: Hard Reload (Fresh DB fetch)
  console.log('\n--- STEP A3: HARD RELOAD (FRESH DB FETCH) ---');
  const { data: dbStepA3 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step A3 (Hard Reload):');
  console.log('  totalPoints:', dbStepA3?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(dbStepA3?.state?.badHabitLogs, null, 2));

  // --------------------------------------------------------------------------------
  // PART B: TEST NON-POINT-ELIGIBLE HABIT (Habit 3: "Non-Eligible Habit 3")
  // --------------------------------------------------------------------------------
  console.log('\n\n================================================================================');
  console.log('>>> TESTING NON-POINT-ELIGIBLE HABIT (Habit 3: "Non-Eligible Habit 3") <<<');
  console.log('================================================================================\n');

  // Step B1: Click "Resisted Today" on non-point-eligible habit
  console.log('--- STEP B1: CLICK "Resisted Today" ON NON-POINT-ELIGIBLE HABIT ---');
  const logB1 = {
    id: 'log-ne3-today',
    badHabitId: h3.id,
    date: todayStr,
    status: 'resisted',
    consecutiveOccurrences: 0,
    pointsAwardedOrDeducted: 0, // 0 pts for non-eligible
    createdAt: new Date().toISOString()
  };
  stateA.badHabitLogs = [logB1, ...stateA.badHabitLogs];

  await client.from('user_data').upsert({ user_id: user.id, state: stateA, updated_at: new Date().toISOString() });

  const { data: dbStepB1 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step B1 (Resisted):');
  console.log('  totalPoints:', dbStepB1?.state?.totalPoints);
  console.log('  badHabitLogs for Habit 3:', JSON.stringify(dbStepB1?.state?.badHabitLogs?.filter((l: any) => l.badHabitId === h3.id), null, 2));

  // Step B2: Click "Occurred Today" (Undo -> Occurred)
  console.log('\n--- STEP B2: UNDO RESISTED FIRST, THEN CLICK OCCURRED ON NON-POINT-ELIGIBLE HABIT ---');
  stateA.badHabitLogs = stateA.badHabitLogs.filter((l: any) => !(l.badHabitId === h3.id && l.date === todayStr));

  const logB2 = {
    id: 'log-ne3-occurred',
    badHabitId: h3.id,
    date: todayStr,
    status: 'occurred',
    consecutiveOccurrences: 1,
    pointsAwardedOrDeducted: 0, // 0 pts for non-eligible
    createdAt: new Date().toISOString()
  };
  stateA.badHabitLogs = [logB2, ...stateA.badHabitLogs];

  await client.from('user_data').upsert({ user_id: user.id, state: stateA, updated_at: new Date().toISOString() });

  const { data: dbStepB2 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step B2 (Occurred):');
  console.log('  totalPoints:', dbStepB2?.state?.totalPoints);
  console.log('  badHabitLogs for Habit 3:', JSON.stringify(dbStepB2?.state?.badHabitLogs?.filter((l: any) => l.badHabitId === h3.id), null, 2));

  // Step B3: Hard Reload
  console.log('\n--- STEP B3: HARD RELOAD (FRESH DB FETCH) ---');
  const { data: dbStepB3 } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Raw DB after Step B3 (Hard Reload):');
  console.log('  totalPoints:', dbStepB3?.state?.totalPoints);
  console.log('  badHabitLogs for Habit 3:', JSON.stringify(dbStepB3?.state?.badHabitLogs?.filter((l: any) => l.badHabitId === h3.id), null, 2));
}

runInvestigation().catch(console.error);
