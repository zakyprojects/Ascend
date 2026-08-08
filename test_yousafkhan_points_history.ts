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

async function inspectYousafKhanPointsHistory() {
  const { data: profiles } = await client
    .from('profiles')
    .select('id, username, stats, points_history, active_habits')
    .eq('username', 'YousafKhan');

  if (!profiles || profiles.length === 0) {
    console.log('YousafKhan not found');
    return;
  }

  const p = profiles[0];
  const history = p.points_history || [];
  console.log(`YousafKhan points_history count: ${history.length}`);
  
  const positiveEntries = history.filter((e: any) => e.amount > 0);
  console.log(`Positive entries count: ${positiveEntries.length}`);

  const dates = Array.from(
    new Set(positiveEntries.map((e: any) => todayKey(new Date(e.timestamp))))
  ).sort();

  console.log('Unique earned dates:', dates);

  let streak = 0;
  let cursor = new Date();
  const todayStr = todayKey(cursor);

  if (!dates.includes(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const k = todayKey(cursor);
    if (dates.includes(k)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  console.log(`\n===> TRUE COMPUTED STREAK FROM POINTS HISTORY FOR YousafKhan: ${streak} days`);
}

inspectYousafKhanPointsHistory().catch(console.error);
