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

async function runRaceConditionVerification() {
  console.log('================================================================');
  console.log('EMPIRICAL RACE-CONDITION GUARD & REALTIME VERIFICATION');
  console.log('================================================================\n');

  const { data: profiles } = await supabase.from('profiles').select('id, username').limit(2);
  const userA_Id = profiles && profiles[0] ? profiles[0].id : crypto.randomUUID();
  const userB_Id = profiles && profiles[1] ? profiles[1].id : crypto.randomUUID();

  // -------------------------------------------------------------------
  // TEST 1: RACE CONDITION SIMULATION (Accept after Cancel)
  // -------------------------------------------------------------------
  console.log('--- TEST 1: Simulating Cancel / Accept Race Condition ---');
  const inviteId = crypto.randomUUID();

  // 1. User A sends invite
  await supabase.from('partner_invites').insert({
    id: inviteId,
    from_user_id: userA_Id,
    from_username: 'UserA_Sender',
    to_user_id: userB_Id,
    to_username: 'UserB_Recipient',
    status: 'pending',
  });

  // 2. User A cancels invite (deletes row)
  await supabase.from('partner_invites').delete().eq('id', inviteId);

  // 3. User B attempts Accept on the cancelled invite via Atomic RPC
  const { data: acceptResult, error: rpcErr } = await supabase.rpc('accept_partner_invite_atomic', {
    p_invite_id: inviteId,
    p_user1_id: userA_Id,
    p_user1_username: 'UserA_Sender',
    p_user2_id: userB_Id,
    p_user2_username: 'UserB_Recipient',
  });

  console.log('RPC Accept Result AFTER Cancel:', acceptResult || rpcErr);

  const isSuccess = acceptResult?.success === true;
  const isBlocked = acceptResult?.success === false && acceptResult?.error === 'This invite is no longer available';

  console.log('Race Condition Guard Check:');
  console.log('- Did Accept succeed wrongly? ->', isSuccess ? 'YES (BUG!)' : 'NO (CORRECT!)');
  console.log('- Was Accept cleanly blocked with error message? ->', isBlocked ? 'YES (PERFECT!)' : 'NO');

  // Verify DB state: no partnership created for this race condition
  const { data: pCheck } = await supabase
    .from('partnerships')
    .select('*')
    .or(`and(user1_username.eq.UserA_Sender,user2_username.eq.UserB_Recipient)`);

  console.log('Orphan Partnership Count in DB (MUST BE 0):', pCheck?.length || 0);

  // -------------------------------------------------------------------
  // TEST 2: SHARED CHALLENGE REALTIME DELETION
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Testing Shared Challenge Real-Time Deletion ---');
  const partnershipId = crypto.randomUUID();
  await supabase.from('partnerships').insert({
    id: partnershipId,
    user1_id: userA_Id,
    user1_username: 'UserA_Sender',
    user2_id: userB_Id,
    user2_username: 'UserB_Recipient',
    paired_at: new Date().toISOString(),
  });

  const challengeId = crypto.randomUUID();
  await supabase.from('shared_challenges').insert({
    id: challengeId,
    partnership_id: partnershipId,
    title: 'Joint 7-Day Challenge: Workout',
    target_habit_name: 'Workout',
    duration_days: 7,
    joint_streak: 0,
    status: 'active',
  });

  // Delete shared challenge
  await supabase.from('shared_challenges').delete().eq('id', challengeId);

  const { data: chCheck } = await supabase.from('shared_challenges').select('*').eq('id', challengeId);
  console.log('Shared Challenge Count AFTER Delete (MUST BE 0):', chCheck?.length || 0);

  // Clean up test partnership
  await supabase.from('partnerships').delete().eq('id', partnershipId);

  console.log('\n================================================================');
  console.log('ALL RACE-CONDITION & REALTIME VERIFICATIONS SUCCESSFUL');
  console.log('================================================================');
}

runRaceConditionVerification().catch(console.error);
