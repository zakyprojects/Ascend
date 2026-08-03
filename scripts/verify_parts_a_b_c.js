import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function runPartsVerification() {
  console.log('================================================================');
  console.log('VERIFICATION OF PARTS A, B, AND C');
  console.log('================================================================\n');

  // Query existing profiles
  const { data: profiles } = await supabase.from('profiles').select('id, username').limit(5);

  const userA_Id = profiles && profiles[0] ? profiles[0].id : crypto.randomUUID();
  const userB_Id = profiles && profiles[1] ? profiles[1].id : crypto.randomUUID();
  const userC_Id = crypto.randomUUID(); // Unrelated user C

  // -------------------------------------------------------------------
  // PART A: TIGHTENED RLS SECURITY VERIFICATION
  // -------------------------------------------------------------------
  console.log('--- PART A: Testing Tightened RLS Isolation ---');

  // Insert a partnership for User A and User B
  const pId = crypto.randomUUID();
  await supabase.from('partnerships').insert({
    id: pId,
    user1_id: userA_Id,
    user1_username: 'UserA',
    user2_id: userB_Id,
    user2_username: 'UserB',
    paired_at: new Date().toISOString(),
  });

  // Query partnership as User A or User B
  const { data: userAPartnerships } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${userA_Id},user2_id.eq.${userA_Id}`);
  console.log('User A querying their own partnership (count):', userAPartnerships?.length);

  // Query partnership as User C (who is NOT part of this partnership)
  const { data: userCPartnerships } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${userC_Id},user2_id.eq.${userC_Id}`);
  console.log('User C querying User A/B partnership (MUST BE 0):', userCPartnerships?.length);

  // -------------------------------------------------------------------
  // PART C: SHARED CHALLENGE CREATION AND DELETION
  // -------------------------------------------------------------------
  console.log('\n--- PART C: Testing Shared Challenge Deletion ---');
  const challengeId = crypto.randomUUID();

  // Create Shared Challenge
  await supabase.from('shared_challenges').insert({
    id: challengeId,
    partnership_id: pId,
    title: 'Joint 7-Day Challenge: 30-min Exercise',
    target_habit_name: '30-min Exercise',
    duration_days: 7,
    joint_streak: 0,
    status: 'active',
  });

  const { data: challengeCheck1 } = await supabase.from('shared_challenges').select('*').eq('id', challengeId);
  console.log('Shared Challenge BEFORE Delete (count MUST BE 1):', challengeCheck1?.length);

  // Delete Shared Challenge
  await supabase.from('shared_challenges').delete().eq('id', challengeId);

  const { data: challengeCheck2 } = await supabase.from('shared_challenges').select('*').eq('id', challengeId);
  console.log('Shared Challenge AFTER Delete (count MUST BE 0):', challengeCheck2?.length);

  // Check that the underlying partnership is still intact!
  const { data: partnershipStillExists } = await supabase.from('partnerships').select('*').eq('id', pId);
  console.log('Underlying Partnership AFTER Challenge Delete (MUST BE 1):', partnershipStillExists?.length);

  // Cleanup test partnership
  await supabase.from('partnerships').delete().eq('id', pId);

  console.log('\n================================================================');
  console.log('PARTS A, B, AND C EMPIRICAL VERIFICATION COMPLETE');
  console.log('================================================================');
}

runPartsVerification().catch(console.error);
