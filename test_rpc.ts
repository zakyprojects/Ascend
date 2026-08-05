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

async function setupAndTestRPC() {
  console.log('--- Testing Postgres RPC for incrementing copy_count ---');

  // 1. User A authenticates & creates plan
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  await clientUserA.from('profiles').upsert({ id: userAUid, username: 'UserA_Creator', avatar: '🧑' });

  const planId = crypto.randomUUID();
  console.log('User A publishing plan:', planId);
  await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_Creator',
    creator_avatar: '🧑',
    title: 'RPC Test Plan ' + Date.now(),
    description: 'Testing copy_count RPC increment',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B calls rpc('increment_plan_copy_count')
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  console.log('User B calling rpc increment_plan_copy_count...');
  const { data: rpcRes, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', {
    target_plan_id: planId,
  });

  console.log('RPC Error:', rpcErr);
  console.log('RPC Result:', rpcRes);

  // 3. Check database value
  const { data: checkPlan } = await clientUserA.from('improvement_plans').select('copy_count').eq('id', planId).maybeSingle();
  console.log('Database copy_count after RPC call:', checkPlan?.copy_count);

  // Clean up
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

setupAndTestRPC();
