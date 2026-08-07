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

async function inspectRealUserPlans() {
  console.log('======================================================================');
  console.log('       LIVE DATABASE INSPECTION FOR REAL ACCOUNTS (asdf & qwer)       ');
  console.log('======================================================================\n');

  // 1. Fetch profile for asdf
  const { data: asdfProfile } = await client
    .from('profiles')
    .select('*')
    .ilike('username', 'asdf')
    .maybeSingle();

  console.log('Profile for "asdf":', asdfProfile);

  if (!asdfProfile) {
    console.error('Profile for "asdf" not found in profiles table!');
  } else {
    // 2. Fetch user_data for asdf
    const { data: asdfUserData } = await client
      .from('user_data')
      .select('*')
      .eq('user_id', asdfProfile.id)
      .maybeSingle();

    console.log('\n--- asdf user_data (savedState) ---');
    console.log('totalPoints:', asdfUserData?.state?.totalPoints);
    console.log('improvementPlans in savedState:');
    asdfUserData?.state?.improvementPlans?.forEach((p: any) => {
      console.log(`  - Title: "${p.title}", ID: ${p.id}, streakCount: ${p.streakCount}, lastCompletedDate: ${p.lastCompletedDate}`);
    });
  }

  // 3. Query improvement_plans table in Supabase for all plans created by asdf or matching title "asd"
  console.log('\n--- improvement_plans TABLE ROWS IN SUPABASE ---');
  const { data: plansRows } = await client
    .from('improvement_plans')
    .select('*');

  plansRows?.forEach((p) => {
    if (p.title.includes('asd') || p.title.includes('Discipline') || p.creator_username === 'asdf' || (asdfProfile && p.creator_id === asdfProfile.id)) {
      console.log(`\nPLAN ROW IN DB:`);
      console.log(`  ID: ${p.id}`);
      console.log(`  Title: "${p.title}"`);
      console.log(`  Creator ID: ${p.creator_id}`);
      console.log(`  Creator Username: ${p.creator_username}`);
      console.log(`  is_public: ${p.is_public}`);
      console.log(`  Root streak_count column: ${p.streak_count}`);
      console.log(`  Root last_completed_date column: ${p.last_completed_date}`);
      console.log(`  Raw steps payload in DB:`, JSON.stringify(p.steps, null, 2));
    }
  });
}

inspectRealUserPlans().catch(console.error);
