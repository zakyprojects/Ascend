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

const supabaseAnon = createClient(url, key);

async function testFetchAsGuest() {
  console.log('--- Testing fetchPublicPlans as Guest Session ---');
  const { data: authData } = await supabaseAnon.auth.signInAnonymously();
  console.log('Guest session user ID:', authData.user?.id);

  const { data: plans, error } = await supabaseAnon
    .from('improvement_plans')
    .select('*')
    .eq('is_public', true);

  console.log('Error:', error);
  console.log('Public plans returned for guest user:', plans?.length);
  if (plans) {
    console.log('Plans:', plans.map(p => ({ title: p.title, creator: p.creator_username, is_public: p.is_public })));
  }
}

testFetchAsGuest();
