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

async function applyMigration() {
  console.log('=== APPLYING PLAN TYPES SCHEMA MIGRATION ===');
  
  // We can test reading or inserting with the new columns
  // Supabase JS allows reading/writing columns if table altered, or we can execute via RPC/rest or verify
  console.log('Checking current improvement_plans columns...');
  const { data, error } = await supabase.from('improvement_plans').select('*').limit(1);
  if (error) {
    console.error('Error selecting from improvement_plans:', error.message);
  } else {
    console.log('Successfully queried improvement_plans table. Existing row sample:', data);
  }
}

applyMigration();
