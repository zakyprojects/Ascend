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

async function testRlsFixProof() {
  console.log('=== Proof Test: Brand New Plan Creation & Copy Increment ===');

  // 1. User A authenticates & creates profile
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'ProofUserA_' + Date.now();
  console.log('User A authenticated with UID:', userAUid);

  const { error: profAErr } = await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });
  console.log('User A profile insert error:', profAErr);

  // 2. User A creates brand new plan
  const planId = generateUUID();
  console.log('User A inserting new plan with ID:', planId);

  const { data: insData, error: insErr } = await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: usernameA,
    creator_avatar: '🧑',
    title: 'Brand New Plan Proof ' + Date.now(),
    description: 'Testing end-to-end plan creation and increment',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  }).select();

  console.log('Insert Error (Must be null):', insErr);
  console.log('Inserted Row:', insData ? 'SUCCESS' : 'FAILED');

  // 3. User B authenticates & copies plan
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'ProofUserB_' + Date.now();
  await clientUserB.from('profiles').upsert({ id: userBUid, username: usernameB, avatar: '🐱' });

  const followId = generateUUID();
  const { error: followErr } = await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Brand New Plan Proof',
    description: 'Copied',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });
  console.log('User B follow insert error:', followErr);

  // 4. User B calls increment RPC
  console.log('User B calling RPC increment_plan_copy_count...');
  const { data: rpcData, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: planId });
  console.log('RPC Error:', rpcErr);
  console.log('RPC Resulting copy_count:', rpcData);

  // 5. Query plan row in Supabase
  const { data: fetchedRow } = await clientUserA.from('improvement_plans').select('*').eq('id', planId).single();
  console.log('DB row copy_count after increment:', fetchedRow?.copy_count);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testRlsFixProof();
