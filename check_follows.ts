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

const supabase = createClient(url, key);

async function checkFollowsTable() {
  console.log('--- Checking user_plan_follows table in Supabase ---');
  const { data, error } = await supabase.from('user_plan_follows').select('*');
  console.log('Error:', error);
  console.log('Data:', data);
}

checkFollowsTable();
