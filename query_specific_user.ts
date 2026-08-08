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

async function inspectProfilesData() {
  console.log('======================================================================');
  console.log('       INSPECTING ALL 19 USER PROFILES AND THEIR ACTIVE HABITS          ');
  console.log('======================================================================\n');

  const { data: profiles, error } = await client.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  for (const p of profiles || []) {
    console.log(`Profile Username: "${p.username}" | Email: "${p.email}" | Points: ${p.total_points}`);
    console.log('  User ID:', p.id);
    if (p.active_habits && p.active_habits.length > 0) {
      console.log('  Active Habits:', JSON.stringify(p.active_habits, null, 2));
    }
    if (p.stats) {
      console.log('  Stats:', JSON.stringify(p.stats, null, 2));
    }
    console.log('----------------------------------------------------------------------');
  }
}

inspectProfilesData().catch(console.error);
