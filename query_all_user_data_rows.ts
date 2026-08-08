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

async function queryAllUserDataRows() {
  console.log('======================================================================');
  console.log('       QUERYING ALL REAL USER DATA ROWS IN SUPABASE DATABASE           ');
  console.log('======================================================================\n');

  // Query profiles table
  const { data: profiles, error: profErr } = await client.from('profiles').select('*');
  if (profErr) {
    console.error('Error querying profiles:', profErr);
    return;
  }

  console.log(`Found ${profiles?.length || 0} user profiles in database:\n`);
  (profiles || []).forEach((p) => {
    console.log(`- User ID: ${p.id} | Email: ${p.email} | Username: ${p.username} | Points: ${p.total_points}`);
  });

  // Query user_data table for all users
  const { data: dataRows, error: dataErr } = await client.from('user_data').select('*');
  if (dataErr) {
    console.error('Error querying user_data:', dataErr);
    return;
  }

  console.log(`\nFound ${dataRows?.length || 0} user_data rows in database:\n`);

  for (const row of dataRows || []) {
    const userProf = profiles?.find((p) => p.id === row.user_id);
    console.log('----------------------------------------------------------------------');
    console.log(`User ID: ${row.user_id} (${userProf?.email || userProf?.username || 'Unknown email'})`);
    console.log(`Updated At: ${row.updated_at}`);
    console.log('Habits Count:', row.state?.badHabits?.length || 0);
    console.log('Raw badHabits array:');
    console.log(JSON.stringify(row.state?.badHabits, null, 2));
    console.log('\nRaw badHabitLogs array:');
    console.log(JSON.stringify(row.state?.badHabitLogs, null, 2));
    console.log('----------------------------------------------------------------------\n');
  }
}

queryAllUserDataRows().catch(console.error);
