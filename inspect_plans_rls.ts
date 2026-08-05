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

async function inspectTable() {
  console.log('--- Inspecting improvement_plans schema & RLS ---');
  
  // Direct query on improvement_plans table
  const { data: rawPlans, error: rawErr } = await supabase
    .from('improvement_plans')
    .select('*');

  console.log('Raw plans query error:', rawErr);
  console.log('Total raw plans in database:', rawPlans?.length);
  if (rawPlans) {
    console.log('Raw plans details:', rawPlans.map(p => ({
      id: p.id,
      title: p.title,
      is_public: p.is_public,
      creator_id: p.creator_id,
      creator_username: p.creator_username,
      created_at: p.created_at
    })));
  }
}

inspectTable();
