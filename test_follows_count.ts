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

async function testFollowsCount() {
  console.log('--- Testing user_plan_follows table insertion & query by User B ---');

  // 1. User A creates plan
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
    title: 'Test Plan Follows ' + Date.now(),
    description: 'Testing user_plan_follows insertion',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B creates profile & copies plan -> inserts into user_plan_follows
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  console.log('User B auth UID:', userBUid);
  const { error: profBError } = await clientUserB.from('profiles').upsert({ id: userBUid, username: 'UserB_' + Date.now(), avatar: '🐱' });
  console.log('User B profile creation error:', profBError);

  const followId = crypto.randomUUID();
  console.log('User B inserting into user_plan_follows with followId:', followId);

  const { data: followInsData, error: followInsErr } = await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Test Plan Follows',
    description: 'Copied plan',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  }).select();

  console.log('Follow insert error:', followInsErr);
  console.log('Follow insert result:', followInsData ? 'SUCCESS' : 'FAILED');

  // 3. Query follow count for planId
  const { count, error: countErr } = await clientUserB
    .from('user_plan_follows')
    .select('*', { count: 'exact', head: true })
    .eq('original_plan_id', planId);

  console.log('User B count error:', countErr);
  console.log('User B query result count for planId:', count);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testFollowsCount();
