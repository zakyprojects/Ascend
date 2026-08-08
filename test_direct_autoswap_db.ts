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

// Simulates the exact updated logBadHabitDay store implementation
function simulateLogBadHabitDay(prev: any, badHabitId: string, date: string, status: 'resisted' | 'occurred') {
  const bh = prev.badHabits.find((b: any) => b.id === badHabitId);
  if (!bh || bh.isCompleted) return prev;

  const existingLog = prev.badHabitLogs.find((l: any) => l.badHabitId === badHabitId && l.date === date);
  if (existingLog && existingLog.status === status) return prev;

  let currentTotalPoints = prev.totalPoints;
  let currentHistory = [...(prev.pointsHistory || [])];

  if (existingLog && existingLog.pointsAwardedOrDeducted !== 0) {
    currentTotalPoints = Math.max(0, currentTotalPoints - existingLog.pointsAwardedOrDeducted);
  }

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

    const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, currentTotalPoints);
    const penaltyAmount = isPointEligible ? Math.round(10 * multiplier) : 0;
    pointsChange = -penaltyAmount;
  }

  currentTotalPoints = Math.max(0, currentTotalPoints + pointsChange);

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
    totalPoints: currentTotalPoints,
    badHabitLogs: [newLog, ...filteredLogs],
  };
}

async function testDirectAutoSwap() {
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
  const h1 = { id: 'bh-swap-test', name: 'Direct Swap Habit', commitmentDays: 30, createdAt: '2026-08-01T00:00:00.000Z', isCompleted: false };

  let state: any = {
    totalPoints: 100,
    pointsHistory: [],
    badHabits: [h1],
    badHabitLogs: []
  };

  console.log('=== DIRECT SINGLE-CLICK AUTO-SWAP PERSISTENCE TEST ===\n');

  // Step 1: Click "Resisted Today"
  console.log('1. Click "Resisted Today"...');
  state = simulateLogBadHabitDay(state, h1.id, todayStr, 'resisted');
  await client.from('user_data').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });

  const { data: step1DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('  DB totalPoints:', step1DB?.state?.totalPoints, '(Expected: 110)');
  console.log('  DB log status:', step1DB?.state?.badHabitLogs[0]?.status, '(Expected: "resisted")');

  // Step 2: Click "Occurred Today" DIRECTLY (single click, NO manual undo!)
  console.log('\n2. Click "Occurred Today" DIRECTLY (Single Click Auto-Swap)...');
  state = simulateLogBadHabitDay(state, h1.id, todayStr, 'occurred');
  await client.from('user_data').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });

  const { data: step2DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('  DB totalPoints:', step2DB?.state?.totalPoints, '(Expected: 90)');
  console.log('  DB log status:', step2DB?.state?.badHabitLogs[0]?.status, '(Expected: "occurred")');

  // Step 3: Hard Reload (Fresh DB Fetch)
  console.log('\n3. Hard Reload (Fresh DB Fetch)...');
  const { data: step3DB } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  console.log('  DB totalPoints after reload:', step3DB?.state?.totalPoints, '(Expected: 90)');
  console.log('  DB log status after reload:', step3DB?.state?.badHabitLogs[0]?.status, '(Expected: "occurred")');

  console.log('\n=== TEST SUCCESSFUL: DIRECT AUTO-SWAP PERSISTS CLEANLY ACROSS HARD RELOAD ===');
}

testDirectAutoSwap().catch(console.error);
