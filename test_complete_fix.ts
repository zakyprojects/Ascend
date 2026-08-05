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

async function testCompleteFix() {
  console.log('--- Testing Complete Copy Count Fix ---');

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
    title: 'Complete Fix Test ' + Date.now(),
    description: 'Testing copy count synchronization across clients',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B authenticates & copies plan
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  await clientUserB.from('profiles').upsert({ id: userBUid, username: 'UserB_' + Date.now(), avatar: '🐱' });

  const followId = crypto.randomUUID();
  // Insert follow row
  const { error: followErr } = await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Copied Plan',
    description: 'Copied',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });
  console.log('User B follow insert error:', followErr);

  // Try RPC or update
  const { data: rpcData, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: planId });
  console.log('RPC error:', rpcErr?.message);
  console.log('RPC result:', rpcData);

  // Fallback update check
  const { data: currentPlan } = await clientUserB.from('improvement_plans').select('copy_count').eq('id', planId).single();
  const newCount = (currentPlan?.copy_count || 0) + 1;
  const { data: updData, error: updErr } = await clientUserB.from('improvement_plans').update({ copy_count: newCount }).eq('id', planId).select();
  console.log('Update fallback error:', updErr?.message);
  console.log('Update fallback result:', updData);

  // 3. User A & User B query the plan from database
  const { data: planForA } = await clientUserA.from('improvement_plans').select('*').eq('id', planId).single();
  const { data: planForB } = await clientUserB.from('improvement_plans').select('*').eq('id', planId).single();

  console.log('Database copy_count seen by Creator (User A):', planForA?.copy_count);
  console.log('Database copy_count seen by Follower (User B):', planForB?.copy_count);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testCompleteFix();
