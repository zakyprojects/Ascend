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

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL DATABASE VERIFICATION');
  console.log('====================================================\n');

  const testInviteId = crypto.randomUUID();
  const testUser1Id = crypto.randomUUID();
  const testUser2Id = crypto.randomUUID();
  const testPartnershipId = crypto.randomUUID();

  // 1. TEST INVITE INSERT
  console.log('--- TEST 1: Insert Partner Invite ---');
  const { data: invIns, error: invInsErr } = await supabase
    .from('partner_invites')
    .insert({
      id: testInviteId,
      from_user_id: testUser1Id,
      from_username: 'TestSender',
      from_avatar: '🧑',
      to_user_id: testUser2Id,
      to_username: 'TestRecipient',
      status: 'pending',
    })
    .select();

  console.log('Insert Invite Result:', invIns ? 'SUCCESS' : 'FAILED', invInsErr || '');

  // Query DB directly
  const { data: invCheck1 } = await supabase.from('partner_invites').select('*').eq('id', testInviteId);
  console.log('DB Query BEFORE Cancel/Delete (count should be 1):', invCheck1?.length);

  // 2. TEST INVITE CANCEL / DELETE
  console.log('\n--- TEST 2: Delete Partner Invite (Cancel) ---');
  const { error: invDelErr } = await supabase.from('partner_invites').delete().eq('id', testInviteId);
  console.log('Delete Invite Result Error:', invDelErr || 'NONE');

  // Query DB directly
  const { data: invCheck2 } = await supabase.from('partner_invites').select('*').eq('id', testInviteId);
  console.log('DB Query AFTER Cancel/Delete (count MUST be 0):', invCheck2?.length);

  // 3. TEST PARTNERSHIP INSERT
  console.log('\n--- TEST 3: Create Partnership ---');
  const { data: partIns, error: partInsErr } = await supabase
    .from('partnerships')
    .insert({
      id: testPartnershipId,
      user1_id: testUser1Id,
      user1_username: 'TestSender',
      user2_id: testUser2Id,
      user2_username: 'TestRecipient',
      paired_at: new Date().toISOString(),
    })
    .select();

  console.log('Insert Partnership Result:', partIns ? 'SUCCESS' : 'FAILED', partInsErr || '');

  // Query DB directly for both users
  const { data: partCheck1 } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${testUser1Id},user2_id.eq.${testUser1Id}`);

  console.log('DB Query for User 1 BEFORE End Pairing (count should be 1):', partCheck1?.length);

  const { data: partCheck1User2 } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${testUser2Id},user2_id.eq.${testUser2Id}`);

  console.log('DB Query for User 2 BEFORE End Pairing (count should be 1):', partCheck1User2?.length);

  // 4. TEST PARTNERSHIP DELETE (End Pairing)
  console.log('\n--- TEST 4: Delete Partnership (End Pairing) ---');
  const { error: partDelErr } = await supabase.from('partnerships').delete().eq('id', testPartnershipId);
  console.log('Delete Partnership Result Error:', partDelErr || 'NONE');

  // Query DB directly for BOTH users
  const { data: partCheck2User1 } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${testUser1Id},user2_id.eq.${testUser1Id}`);

  const { data: partCheck2User2 } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user1_id.eq.${testUser2Id},user2_id.eq.${testUser2Id}`);

  console.log('DB Query for User 1 AFTER End Pairing (count MUST be 0):', partCheck2User1?.length);
  console.log('DB Query for User 2 AFTER End Pairing (count MUST be 0):', partCheck2User2?.length);

  console.log('\n====================================================');
  console.log('VERIFICATION COMPLETE');
  console.log('====================================================');
}

runVerification().catch(console.error);
