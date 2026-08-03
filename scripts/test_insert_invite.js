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

async function testInviteFlow() {
  console.log('=== TEST 1: Checking if partner_invites table is accessible ===');
  const testInviteId = crypto.randomUUID();
  const testUser1Id = crypto.randomUUID();
  const testUser2Id = crypto.randomUUID();

  console.log('Testing upsert with valid UUIDs...');
  const { data: invData, error: invErr } = await supabase
    .from('partner_invites')
    .upsert({
      id: testInviteId,
      from_user_id: testUser1Id,
      from_username: 'Test_Inviter',
      from_avatar: '🦊',
      to_user_id: testUser2Id,
      to_username: 'Test_Recipient',
      status: 'pending',
    })
    .select('*');

  if (invErr) {
    console.error('Invite Upsert Error:', invErr);
  } else {
    console.log('Invite Upsert Success:', invData);
  }

  console.log('\n=== TEST 2: Querying inserted invite ===');
  const { data: fetchRes, error: fetchErr } = await supabase
    .from('partner_invites')
    .select('*')
    .eq('id', testInviteId);

  if (fetchErr) {
    console.error('Fetch Error:', fetchErr);
  } else {
    console.log('Fetch Result:', fetchRes);
  }

  // Cleanup
  if (invData && invData.length > 0) {
    await supabase.from('partner_invites').delete().eq('id', testInviteId);
    console.log('Cleaned up test invite row.');
  }
}

testInviteFlow().catch(console.error);
