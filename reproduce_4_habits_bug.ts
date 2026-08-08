import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { processBadHabitNoReports } from './src/lib/habitPenalties';

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

async function testFourHabits() {
  console.log('======================================================================');
  console.log('       TESTING 4-HABIT THRESHOLD ON RESISTED -> UNDO -> OCCURRED       ');
  console.log('======================================================================\n');

  const today = todayKey();
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);
  const pastISO = pastDate.toISOString();

  // Create 4 habits created 3 days ago so past days are unlogged
  const h1 = { id: 'bh-1', name: 'Habit 1', commitmentDays: 30, createdAt: pastISO, isCompleted: false };
  const h2 = { id: 'bh-2', name: 'Habit 2', commitmentDays: 30, createdAt: pastISO, isCompleted: false };
  const h3 = { id: 'bh-3', name: 'Habit 3', commitmentDays: 30, createdAt: pastISO, isCompleted: false };
  const h4 = { id: 'bh-4', name: 'Habit 4', commitmentDays: 30, createdAt: pastISO, isCompleted: false };

  let state: any = {
    totalPoints: 100,
    pointsHistory: [],
    badHabits: [h1, h2, h3, h4],
    badHabitLogs: []
  };

  // Step 1: Click Resisted on Habit 4
  console.log('Step 1: Log Resisted on Habit 4');
  state.badHabitLogs.unshift({
    id: 'log-h4-resisted',
    badHabitId: h4.id,
    date: today,
    status: 'resisted',
    consecutiveOccurrences: 0,
    pointsAwardedOrDeducted: 0,
    createdAt: new Date().toISOString()
  });

  // Step 2: Undo Resisted on Habit 4
  console.log('Step 2: Undo Resisted on Habit 4');
  state.badHabitLogs = state.badHabitLogs.filter((l: any) => !(l.badHabitId === h4.id && l.date === today));

  // Step 3: Log Occurred on Habit 4
  console.log('Step 3: Log Occurred on Habit 4');
  state.badHabitLogs.unshift({
    id: 'log-h4-occurred',
    badHabitId: h4.id,
    date: today,
    status: 'occurred',
    consecutiveOccurrences: 1,
    pointsAwardedOrDeducted: 0,
    createdAt: new Date().toISOString()
  });

  console.log('\nState BEFORE Hydration / processBadHabitNoReports:');
  console.log('  Logs for Habit 4:', JSON.stringify(state.badHabitLogs.filter((l: any) => l.badHabitId === h4.id), null, 2));

  // Step 4: Run processBadHabitNoReports (simulating hydration / mount)
  console.log('\nStep 4: Running processBadHabitNoReports (Hydration / Mount)...');
  const hydratedState = processBadHabitNoReports(state);

  console.log('\nState AFTER Hydration / processBadHabitNoReports:');
  console.log('  Logs for Habit 4:', JSON.stringify(hydratedState.badHabitLogs.filter((l: any) => l.badHabitId === h4.id), null, 2));
  console.log('  All Logs count:', hydratedState.badHabitLogs.length);
}

testFourHabits().catch(console.error);
