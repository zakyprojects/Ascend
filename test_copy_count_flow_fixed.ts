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

async function testCopyCountFlowFixed() {
  console.log('--- Testing Copy Count Flow with user_plan_follows Sync ---');

  // 1. User A creates public plan
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  await clientUserA.from('profiles').upsert({ id: userAUid, username: 'UserA_' + Date.now(), avatar: '🧑' });

  const planId = crypto.randomUUID();
  console.log('User A publishing plan:', planId);
  await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_' + Date.now(),
    creator_avatar: '🧑',
    title: 'Flow Test Plan ' + Date.now(),
    description: 'Testing copy count synchronization',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B authenticates & copies plan -> inserts into user_plan_follows
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  await clientUserB.from('profiles').upsert({ id: userBUid, username: 'UserB_' + Date.now(), avatar: '🐱' });

  const followId = crypto.randomUUID();
  await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Flow Test Plan',
    description: 'Copied plan',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });

  // 3. User B queries fetchPublicPlans logic (with user_plan_follows count)
  const { data: plansData } = await clientUserB.from('improvement_plans').select('*').eq('id', planId);
  const { data: followRows } = await clientUserB.from('user_plan_follows').select('original_plan_id').eq('original_plan_id', planId);

  const followCount = followRows?.length || 0;
  const resultPlan = plansData ? { ...plansData[0], copyCount: Math.max(plansData[0].copy_count || 0, followCount) } : null;

  console.log('Result plan copyCount seen by User B:', resultPlan?.copyCount);

  // 4. User A queries the same logic
  const { data: plansDataA } = await clientUserA.from('improvement_plans').select('*').eq('id', planId);
  const { data: followRowsA } = await clientUserA.from('user_plan_follows').select('original_plan_id').eq('original_plan_id', planId);

  const followCountA = followRowsA?.length || 0;
  const resultPlanA = plansDataA ? { ...plansDataA[0], copyCount: Math.max(plansDataA[0].copy_count || 0, followCountA) } : null;

  console.log('Result plan copyCount seen by User A:', resultPlanA?.copyCount);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testCopyCountFlowFixed();
