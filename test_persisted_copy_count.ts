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

async function testPersistedCopyCount() {
  console.log('=== Testing Persisted Copy Count Across Saves & Reloads ===');

  // 1. User A creates public plan
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  await clientUserA.from('profiles').upsert({ id: userAUid, username: 'UserA_' + Date.now(), avatar: '🧑' });

  const planId = crypto.randomUUID();
  console.log('1. User A creating public plan:', planId);
  await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_' + Date.now(),
    creator_avatar: '🧑',
    title: 'Persistence Test ' + Date.now(),
    description: 'Testing persistence across reloads and syncs',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B copies plan -> inserts into user_plan_follows & calls RPC increment_plan_copy_count
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  await clientUserB.from('profiles').upsert({ id: userBUid, username: 'UserB_' + Date.now(), avatar: '🐱' });

  const followId = crypto.randomUUID();
  console.log('2. User B inserting into user_plan_follows...');
  await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Persistence Test',
    description: 'Copied',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });

  console.log('3. User B incrementing copy count via RPC...');
  await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: planId });

  // 3. User A edits plan (syncPlanToSupabase simulation with Math.max)
  console.log('4. User A editing plan with syncPlanToSupabase logic...');
  const { data: existingRow } = await clientUserA
    .from('improvement_plans')
    .select('copy_count')
    .eq('id', planId)
    .maybeSingle();

  const dbCopyCount = existingRow?.copy_count ?? 0;
  const finalCopyCount = Math.max(0, dbCopyCount); // simulating local plan.copyCount = 0

  await clientUserA.from('improvement_plans').upsert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_' + Date.now(),
    creator_avatar: '🧑',
    title: 'Persistence Test (Edited)',
    description: 'Updated description',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: finalCopyCount,
  });

  // 4. Simulate page reload fetch (fetchPublicPlansFromSupabase with user_plan_follows count)
  console.log('5. Simulating full page reload fetch (fetchPublicPlansFromSupabase)...');
  const { data: fetchedPlans } = await clientUserA
    .from('improvement_plans')
    .select('*')
    .eq('is_public', true)
    .eq('id', planId);

  const { data: followsData } = await clientUserA
    .from('user_plan_follows')
    .select('original_plan_id')
    .eq('original_plan_id', planId);

  const followCount = followsData?.length || 0;
  const planResult = fetchedPlans ? { ...fetchedPlans[0], copyCount: Math.max(fetchedPlans[0].copy_count || 0, followCount) } : null;

  console.log('Persisted copyCount after reload:', planResult?.copyCount);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testPersistedCopyCount();
