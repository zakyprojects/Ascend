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

// Simulates logBadHabitDay with strict guard if (existingLog) return prev;
function simulateLogBadHabitDay(prev: any, badHabitId: string, date: string, status: 'resisted' | 'occurred') {
  const bh = prev.badHabits.find((b: any) => b.id === badHabitId);
  if (!bh || bh.isCompleted) return prev;

  const existingLog = prev.badHabitLogs.find((l: any) => l.badHabitId === badHabitId && l.date === date);
  if (existingLog) return prev;

  const activeHabits = prev.badHabits
    .filter((h: any) => !h.isCompleted)
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeIndex = activeHabits.findIndex((h: any) => h.id === badHabitId);
  const isPointEligible = activeIndex >= 0 && activeIndex < 2;

  let pointsChange = 0;
  let consecutiveOccurrences = 0;

  if (status === 'resisted') {
    pointsChange = isPointEligible ? 10 : 0;
  } else {
    const pastLogs = prev.badHabitLogs
      .filter((l: any) => l.badHabitId === badHabitId && l.date < date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date));

    consecutiveOccurrences = 1;
    for (const log of pastLogs) {
      if (log.status === 'occurred' || log.status === 'no_report') {
        consecutiveOccurrences++;
      } else {
        break;
      }
    }

    const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, prev.totalPoints);
    const penaltyAmount = isPointEligible ? Math.round(10 * multiplier) : 0;
    pointsChange = -penaltyAmount;
  }

  const newTotalPoints = Math.max(0, prev.totalPoints + pointsChange);
  const newLog = {
    id: 'log-' + Date.now(),
    badHabitId,
    date,
    status,
    consecutiveOccurrences: status === 'occurred' ? consecutiveOccurrences : 0,
    pointsAwardedOrDeducted: pointsChange,
    createdAt: new Date().toISOString(),
  };

  const filteredLogs = prev.badHabitLogs.filter((l: any) => !(l.badHabitId === badHabitId && l.date === date));

  return {
    ...prev,
    totalPoints: newTotalPoints,
    badHabitLogs: [newLog, ...filteredLogs],
  };
}

// Simulates undoTodayBadHabitLog
function simulateUndoTodayBadHabitLog(prev: any, badHabitId: string, date: string) {
  const target = prev.badHabitLogs.find((l: any) => l.badHabitId === badHabitId && l.date === date);
  if (!target || target.status === 'no_report') return prev;

  const reverseAmount = -target.pointsAwardedOrDeducted;
  const newTotalPoints = Math.max(0, prev.totalPoints + reverseAmount);

  return {
    ...prev,
    totalPoints: newTotalPoints,
    badHabitLogs: prev.badHabitLogs.filter((l: any) => !(l.badHabitId === badHabitId && l.date === date)),
  };
}

async function runUndoRelogInvestigation() {
  const testEmail = 'badhabit_test_user_2026@example.com';
  const testPass = 'Password123!';

  let authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  if (authRes.error) {
    await client.auth.signUp({ email: testEmail, password: testPass });
    authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  }

  const user = authRes.data?.user;
  if (!user) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const h1 = { id: 'bh-undo-relog-habit', name: 'Undo Relog Habit', commitmentDays: 30, createdAt: '2026-08-01T00:00:00.000Z', isCompleted: false };

  let state: any = {
    totalPoints: 100,
    pointsHistory: [],
    badHabits: [h1],
    badHabitLogs: []
  };

  console.log('======================================================================');
  console.log('    RAW DB INVESTIGATION: RESISTED -> UNDO -> OCCURRED -> HARD RELOAD  ');
  console.log('======================================================================\n');

  // STEP 1: Click "Resisted Today"
  console.log('--- STEP 1: CLICK "Resisted Today" ---');
  state = simulateLogBadHabitDay(state, h1.id, todayStr, 'resisted');
  await client.from('user_data').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });

  const { data: step1DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('RAW DB Payload Step 1:');
  console.log('  totalPoints:', step1DB?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(step1DB?.state?.badHabitLogs, null, 2));

  // STEP 2: Click "Undo Today's Action"
  console.log('\n--- STEP 2: CLICK "Undo Today\'s Action" ---');
  state = simulateUndoTodayBadHabitLog(state, h1.id, todayStr);
  await client.from('user_data').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });

  const { data: step2DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('RAW DB Payload Step 2 (After Undo):');
  console.log('  totalPoints:', step2DB?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(step2DB?.state?.badHabitLogs, null, 2));

  // STEP 3: Click "Occurred Today"
  console.log('\n--- STEP 3: CLICK "Occurred Today" ---');
  state = simulateLogBadHabitDay(state, h1.id, todayStr, 'occurred');
  await client.from('user_data').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });

  const { data: step3DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('RAW DB Payload Step 3 (After Occurred):');
  console.log('  totalPoints:', step3DB?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(step3DB?.state?.badHabitLogs, null, 2));

  // STEP 4: Hard Reload (Fresh DB Fetch)
  console.log('\n--- STEP 4: HARD RELOAD (FRESH DB FETCH FROM SUPABASE) ---');
  const { data: step4DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('RAW DB Payload Step 4 (After Hard Reload):');
  console.log('  totalPoints:', step4DB?.state?.totalPoints);
  console.log('  badHabitLogs:', JSON.stringify(step4DB?.state?.badHabitLogs, null, 2));
}

runUndoRelogInvestigation().catch(console.error);
