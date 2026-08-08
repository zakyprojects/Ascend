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

async function inspectRealUserData() {
  const testEmail = 'badhabit_test_user_2026@example.com';
  const testPass = 'Password123!';

  let authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  if (authRes.error) {
    await client.auth.signUp({ email: testEmail, password: testPass });
    authRes = await client.auth.signInWithPassword({ email: testEmail, password: testPass });
  }

  const user = authRes.data?.user;
  if (!user) {
    console.error('Auth failed!');
    return;
  }

  console.log('======================================================================');
  console.log('       LIVE SUPABASE DATABASE QUERY FOR ACTIVE USER DATA ROW           ');
  console.log('======================================================================\n');
  console.log('Authenticated User ID:', user.id);
  console.log('Authenticated User Email:', user.email);

  const { data: row, error } = await client.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
  if (error) {
    console.error('Error fetching user_data row:', error);
    return;
  }

  console.log('\nUpdated At:', row?.updated_at);
  console.log('\nRaw badHabits Array in Supabase DB:');
  console.log(JSON.stringify(row?.state?.badHabits, null, 2));

  console.log('\nRaw badHabitLogs Array in Supabase DB:');
  console.log(JSON.stringify(row?.state?.badHabitLogs, null, 2));
}

inspectRealUserData().catch(console.error);
