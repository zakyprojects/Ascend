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

async function inspectBadHabits() {
  console.log('=== INSPECTING LIVE SUPABASE DATABASE ===\n');

  // Fetch all profiles
  const { data: profiles, error: profErr } = await client.from('profiles').select('*');
  if (profErr) console.error('Profiles error:', profErr);
  console.log(`Found ${profiles?.length || 0} profiles:`);
  profiles?.forEach((p) => {
    console.log(`  - User: "${p.username}" (ID: ${p.id}, points: ${p.total_points})`);
  });

  // Fetch user_data for all users
  const { data: userDataRows, error: dataErr } = await client.from('user_data').select('*');
  if (dataErr) console.error('user_data error:', dataErr);
  console.log(`\nFound ${userDataRows?.length || 0} user_data rows:\n`);

  userDataRows?.forEach((row) => {
    const prof = profiles?.find((p) => p.id === row.user_id);
    const username = prof?.username || row.user_id;
    console.log(`--- USER DATA FOR: "${username}" (${row.user_id}) ---`);
    console.log(`  updated_at in DB: ${row.updated_at}`);
    console.log(`  totalPoints: ${row.state?.totalPoints}`);
    console.log(`  badHabits (${row.state?.badHabits?.length || 0}):`);
    row.state?.badHabits?.forEach((bh: any) => {
      console.log(`    * [${bh.id}] "${bh.name}" (commitment: ${bh.commitmentDays}d, completed: ${bh.isCompleted}, created: ${bh.createdAt})`);
    });
    console.log(`  badHabitLogs (${row.state?.badHabitLogs?.length || 0}):`);
    row.state?.badHabitLogs?.forEach((l: any) => {
      console.log(`    * Log ID: ${l.id}, badHabitId: ${l.badHabitId}, date: ${l.date}, status: "${l.status}", pts: ${l.pointsAwardedOrDeducted}, created: ${l.createdAt}`);
    });
    console.log('');
  });
}

inspectBadHabits().catch(console.error);
