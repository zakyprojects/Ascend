import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file directly
const envPath = path.join(__dirname, '../.env');
let supabaseUrl = '';
let supabaseKey = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const [k, v] = line.split('=');
    if (k && v) {
      if (k.trim() === 'VITE_SUPABASE_URL') supabaseUrl = v.trim();
      if (k.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseKey = v.trim();
    }
  });
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase env vars missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhase3() {
  console.log('=== VERIFYING PHASE 3 IMPLEMENTATION ===');

  // Test 1: Check Database Schema Columns
  console.log('\n--- 1. Testing Database Columns ---');
  const { data: pData, error: pErr } = await supabase
    .from('partnerships')
    .select('id, user1_id, user1_username, user2_id, user2_username, user1_allow_stats, user2_allow_stats')
    .limit(1);

  if (pErr) {
    console.error('FAIL: Partnerships query error:', pErr.message);
  } else {
    console.log('PASS: Partnerships columns user1_allow_stats, user2_allow_stats verified.');
  }

  const { data: scData, error: scErr } = await supabase
    .from('shared_challenges')
    .select('id, partnership_id, title, user1_category, user1_target, user2_category, user2_target')
    .limit(1);

  if (scErr) {
    console.error('FAIL: Shared challenges query error:', scErr.message);
  } else {
    console.log('PASS: Shared challenges category and target columns verified.');
  }

  // Test 2: Verify Atomic RPC and Stats Toggle functionality
  console.log('\n--- 2. Testing RPC & Stats Toggle Logic ---');
  const userA_id = '00000000-0000-0000-0000-0000000000a1';
  const userB_id = '00000000-0000-0000-0000-0000000000b2';
  const testInviteId = '00000000-0000-0000-0000-0000000000i1';

  // Cleanup past test data
  await supabase.from('shared_challenges').delete().eq('title', 'Phase3 Test Challenge');
  await supabase.from('partnerships').delete().or(`user1_id.eq.${userA_id},user2_id.eq.${userA_id}`);
  await supabase.from('partner_invites').delete().eq('id', testInviteId);

  // Insert test invite
  await supabase.from('partner_invites').insert({
    id: testInviteId,
    from_user_id: userA_id,
    from_username: 'Phase3UserA',
    from_avatar: '🧑',
    to_user_id: userB_id,
    to_username: 'Phase3UserB',
    status: 'pending',
  });

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('accept_partner_invite_atomic', {
    p_invite_id: testInviteId,
    p_user1_id: userA_id,
    p_user1_username: 'Phase3UserA',
    p_user2_id: userB_id,
    p_user2_username: 'Phase3UserB',
  });

  if (rpcErr || !rpcRes?.success) {
    console.error('FAIL: accept_partner_invite_atomic error:', rpcErr?.message || rpcRes?.error);
  } else {
    console.log('PASS: accept_partner_invite_atomic succeeded, partnership_id:', rpcRes.partnership_id);

    // Test Multi-Category Shared Challenge Insertion
    const { error: scInsertErr } = await supabase.from('shared_challenges').insert({
      id: crypto.randomUUID(),
      partnership_id: rpcRes.partnership_id,
      title: 'Phase3 Test Challenge',
      target_habit_name: '20-min Exercise',
      duration_days: 7,
      joint_streak: 1,
      user1_category: 'exercise',
      user1_target: 'Running 5km',
      user2_category: 'reading',
      user2_target: 'Atomic Habits Book',
      status: 'active',
    });

    if (scInsertErr) {
      console.error('FAIL: Multi-category shared challenge insert error:', scInsertErr.message);
    } else {
      console.log('PASS: Multi-category shared challenge inserted successfully!');
    }

    // Cleanup test data
    await supabase.from('shared_challenges').delete().eq('title', 'Phase3 Test Challenge');
    await supabase.from('partnerships').delete().eq('id', rpcRes.partnership_id);
  }

  console.log('\n=== ALL PHASE 3 VERIFICATIONS COMPLETE ===');
}

verifyPhase3();
