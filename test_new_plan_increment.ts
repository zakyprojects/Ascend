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

async function testNewPlanIncrement() {
  console.log('=== Testing Newly Created Plan Copy & Increment ===');

  // 1. User A creates a brand new plan with generateUUID()
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'NewCreator_' + Date.now();
  await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });

  const newPlanId = generateUUID();
  console.log('1. User A creating brand new plan with ID:', newPlanId);

  const { error: insErr } = await clientUserA.from('improvement_plans').insert({
    id: newPlanId,
    creator_id: userAUid,
    creator_username: usernameA,
    creator_avatar: '🧑',
    title: 'Brand New Created Plan ' + Date.now(),
    description: 'Testing increment on newly created plan',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 'step_1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  });

  console.log('Insert Error:', insErr);

  // 2. User B authenticates & copies this brand new plan
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'NewFollower_' + Date.now();
  await clientUserB.from('profiles').upsert({ id: userBUid, username: usernameB, avatar: '🐱' });

  const followId = generateUUID();
  console.log('2. User B copying plan -> inserting into user_plan_follows...');
  const { error: followErr } = await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: newPlanId,
    title: 'Brand New Created Plan',
    description: 'Copied',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });
  console.log('User B follow insert error:', followErr);

  // 3. User B calls increment RPC
  console.log('3. User B calling RPC increment_plan_copy_count for newPlanId...');
  const { data: rpcData, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: newPlanId });
  console.log('RPC Error:', rpcErr);
  console.log('RPC Resulting copy_count:', rpcData);

  // 4. Query Database
  console.log('4. Querying plan row in Supabase...');
  const { data: fetchedRow } = await clientUserA.from('improvement_plans').select('*').eq('id', newPlanId).single();
  console.log('Fetched copy_count from DB:', fetchedRow?.copy_count);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', newPlanId);
}

testNewPlanIncrement();
