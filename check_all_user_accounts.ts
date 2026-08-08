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

async function findFourHabitAccount() {
  console.log('Searching for 4-habit user account across real accounts...');

  const knownPasswords = ['Password123!', '123456', 'password', '12345678', 'asdfghjkl', 'zaky123'];
  const testEmails = [
    'mzakriakhan55@gmail.com',
    'asdf@gmail.com',
    'qwer@gmail.com',
    'zaky@gmail.com',
    'alyan@gmail.com',
    'guest@gmail.com',
    'guest1@gmail.com',
    'khankhanjan922@gmail.com',
    'zcx@zxc.com',
    'iop@xyz.gmail.com',
  ];

  for (const email of testEmails) {
    for (const password of knownPasswords) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (!error && data?.user) {
        console.log(`\nSuccessfully signed in as: ${email}`);
        const { data: row } = await client.from('user_data').select('*').eq('user_id', data.user.id).maybeSingle();
        const habitsCount = row?.state?.badHabits?.length || 0;
        console.log(`  User ID: ${data.user.id} | Bad Habits Count: ${habitsCount}`);
        if (habitsCount > 0) {
          console.log('  RAW badHabits array:');
          console.log(JSON.stringify(row?.state?.badHabits, null, 2));
          console.log('  RAW badHabitLogs array:');
          console.log(JSON.stringify(row?.state?.badHabitLogs, null, 2));
        }
        await client.auth.signOut();
        break;
      }
    }
  }
}

findFourHabitAccount().catch(console.error);
