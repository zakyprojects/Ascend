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

async function debugLiveIncrement() {
  console.log('=== Debugging Live Increment & Page Reload Fetch ===');

  const planId = crypto.randomUUID();
  console.log('1. Inserting public plan into Supabase:', planId);

  const { data: insData, error: insErr } = await client.from('improvement_plans').insert({
    id: planId,
    creator_id: '00000000-0000-0000-0000-000000000000',
    creator_username: 'TestCreator',
    creator_avatar: '🧑',
    title: 'Debug Plan ' + Date.now(),
    description: 'Testing copy count persistence',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  }).select();

  console.log('Plan Insert Error:', insErr);
  console.log('Plan Insert Result:', insData);

  // 2. Test RPC call
  console.log('2. Calling RPC increment_plan_copy_count...');
  const { data: rpcData, error: rpcErr } = await client.rpc('increment_plan_copy_count', { target_plan_id: planId });
  console.log('RPC Error:', rpcErr);
  console.log('RPC Data:', rpcData);

  // 3. Test direct update
  console.log('3. Calling direct update copy_count...');
  const { data: fetchCurrent } = await client
    .from('improvement_plans')
    .select('copy_count')
    .eq('id', planId)
    .maybeSingle();
  console.log('Fetched current copy_count:', fetchCurrent);

  const newCount = (fetchCurrent?.copy_count || 0) + 1;
  const { data: updData, error: updErr } = await client
    .from('improvement_plans')
    .update({ copy_count: newCount })
    .eq('id', planId)
    .select();

  console.log('Direct update error:', updErr);
  console.log('Direct update data:', updData);

  // 4. Test fetch query
  console.log('4. Executing select query as done in fetchPublicPlansFromSupabase...');
  const { data: publicPlans, error: fetchErr } = await client
    .from('improvement_plans')
    .select('*')
    .eq('is_public', true)
    .eq('id', planId);

  console.log('Fetch Error:', fetchErr);
  console.log('Fetched plan row from DB:', publicPlans);

  // Clean up
  await client.from('improvement_plans').delete().eq('id', planId);
}

debugLiveIncrement();
