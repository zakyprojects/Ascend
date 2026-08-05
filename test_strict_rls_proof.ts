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

const clientUserA = createClient(url, key);
const clientUserB = createClient(url, key);

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function verifyStrictRlsProof() {
  console.log('=== STRICT RLS & SECURITY DEFINER RPC VERIFICATION ===\n');

  // 1. User A authenticates & creates plan
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'StrictUserA_' + Date.now();
  console.log('1. User A authenticated with UID:', userAUid);

  await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });

  const planId = generateUUID();
  console.log('2. User A creating plan with ID:', planId);

  const { data: insData, error: insErr } = await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid, // FORCED to session.user.id
    creator_username: usernameA,
    creator_avatar: '🧑',
    title: 'Strict RLS Test Plan ' + Date.now(),
    description: 'Testing strict RLS policies',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  }).select();

  console.log('   Plan Insert Error (Must be null):', insErr);
  console.log('   Plan Insert Status:', insData ? 'SUCCESS' : 'FAILED');

  // 2. User B authenticates
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'StrictUserB_' + Date.now();
  console.log('\n3. User B authenticated with UID:', userBUid);

  // 3. User B tries to HACK/UPDATE User A's plan title directly (Must be BLOCKED by RLS)
  console.log('4. User B attempting direct SQL update on User A\'s plan title...');
  const { data: hackRes, error: hackErr } = await clientUserB
    .from('improvement_plans')
    .update({ title: 'HACKED TITLE BY USER B' })
    .eq('id', planId)
    .select();

  console.log('   Direct SQL Update Result (Must be empty/blocked):', hackRes);
  console.log('   Direct SQL Update Error:', hackErr);

  // 4. User B calls SECURITY DEFINER RPC to increment copy_count (Must SUCCEED)
  console.log('\n5. User B invoking SECURITY DEFINER increment_plan_copy_count RPC...');
  const { data: rpcRes, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: planId });

  console.log('   RPC Error (Must be null):', rpcErr);
  console.log('   RPC Incremented copy_count:', rpcRes);

  // 5. Query final state of plan
  const { data: finalPlan } = await clientUserA.from('improvement_plans').select('*').eq('id', planId).single();
  console.log('\n6. Final Database Plan Row Inspection:');
  console.log('   Title (Must NOT be hacked):', finalPlan?.title);
  console.log('   copy_count (Must be 1):', finalPlan?.copy_count);

  // Clean up
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

verifyStrictRlsProof();
