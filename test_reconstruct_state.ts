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

export function reconstructStateFromProfile(p: any): any {
  const pointsHistory = p.points_history || [];
  const activeHabits = p.active_habits || [];

  // Group habit completion dates by habit name from points_history
  const habitCompletionsMap: Record<string, string[]> = {};
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const dateStr = todayKey(new Date(e.timestamp));
    if (e.source === 'habit_completed' || (e.reason && e.reason.startsWith('Habit completed:'))) {
      const habitName = e.reason ? e.reason.replace('Habit completed: ', '').trim() : 'Habit';
      if (!habitCompletionsMap[habitName]) habitCompletionsMap[habitName] = [];
      if (!habitCompletionsMap[habitName].includes(dateStr)) {
        habitCompletionsMap[habitName].push(dateStr);
      }
    }
  });

  const habits = activeHabits.map((h: any) => ({
    id: h.name,
    name: h.name,
    category: h.category,
    frequency: h.frequency || 'daily',
    completions: habitCompletionsMap[h.name] || [],
  }));

  // Workout dates from points_history
  const workoutDates: string[] = [];
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const dateStr = todayKey(new Date(e.timestamp));
    if (e.source === 'workout_logged' || (e.reason && e.reason.includes('Workout'))) {
      if (!workoutDates.includes(dateStr)) workoutDates.push(dateStr);
    }
  });

  const workouts = workoutDates.map((d, i) => ({
    id: `w-${i}`,
    date: d,
    activityType: 'Workout',
    durationMinutes: 30,
    createdAt: d,
  }));

  // Reading dates from points_history
  const readingDates: string[] = [];
  pointsHistory.forEach((e: any) => {
    if (!e || e.amount <= 0 || !e.timestamp) return;
    const dateStr = todayKey(new Date(e.timestamp));
    if (e.source === 'book_read' || (e.reason && e.reason.includes('Book'))) {
      if (!readingDates.includes(dateStr)) readingDates.push(dateStr);
    }
  });

  const readingLogs = readingDates.map((d, i) => ({
    id: `r-${i}`,
    date: d,
    pagesRead: 10,
    createdAt: d,
  }));

  return {
    totalPoints: p.total_points || 0,
    habits,
    workouts,
    readingLogs,
    badHabits: [],
    badHabitLogs: [],
    skillLogs: [],
  };
}

async function runTest() {
  const usernames = ['asdf', 'qwer', 'YousafKhan'];

  for (const username of usernames) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, username, stats, points_history, active_habits')
      .eq('username', username);

    const p = profiles?.[0];
    if (!p) continue;

    const reconstructedState = reconstructStateFromProfile(p);
    console.log(`\nUser: ${username}`);
    console.log('Reconstructed Workouts count:', reconstructedState.workouts.length);
    console.log('Reconstructed Habits count:', reconstructedState.habits.length);
    console.log('Stored stats.streakDays:', p.stats?.streakDays, 'streakSource:', p.stats?.streakSource);
  }
}

runTest().catch(console.error);
