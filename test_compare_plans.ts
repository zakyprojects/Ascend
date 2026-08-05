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

const client = createClient(url, key);

async function comparePlans() {
  console.log('=== Comparing Premade vs Newly Created Plans in Supabase ===');

  // Fetch all public plans currently in Supabase
  const { data: allPlans, error: fetchErr } = await client.from('improvement_plans').select('*');
  console.log('Fetch error:', fetchErr);
  console.log('Total public plans in database:', allPlans?.length || 0);

  if (allPlans && allPlans.length > 0) {
    console.log('\nSample Plan Row Structure from DB:');
    console.log(JSON.stringify(allPlans[0], null, 2));

    // Test increment RPC on the first plan
    const targetId = allPlans[0].id;
    console.log('\nTesting RPC increment_plan_copy_count on plan ID:', targetId);
    const { data: rpcRes, error: rpcErr } = await client.rpc('increment_plan_copy_count', { target_plan_id: targetId });
    console.log('RPC Error:', rpcErr);
    console.log('RPC New copy_count:', rpcRes);
  }

  // Now create a NEW plan as User A and increment as User B
  const planId = crypto.randomUUID();
  console.log('\nCreating NEW plan with ID:', planId);

  const { data: insData, error: insErr } = await client.from('improvement_plans').insert({
    id: planId,
    creator_id: '00000000-0000-0000-0000-000000000000',
    creator_username: 'TestUser_A',
    creator_avatar: '🧑',
    title: 'Comparison New Plan ' + Date.now(),
    description: 'Testing comparison between premade and new plans',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  }).select();

  console.log('New Plan Insert Error:', insErr);
  console.log('New Plan Inserted Row:', insData);

  console.log('\nCalling increment_plan_copy_count RPC on NEW Plan ID:', planId);
  const { data: newRpcRes, error: newRpcErr } = await client.rpc('increment_plan_copy_count', { target_plan_id: planId });
  console.log('New Plan RPC Error:', newRpcErr);
  console.log('New Plan RPC New copy_count:', newRpcRes);

  // Clean up
  await client.from('improvement_plans').delete().eq('id', planId);
}

comparePlans();
