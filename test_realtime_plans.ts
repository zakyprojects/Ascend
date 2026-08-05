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

const supabase1 = createClient(url, key);
const supabase2 = createClient(url, key);

async function testRealtimeAndRLS() {
  console.log('--- Testing Realtime and Fetch for Public Plans (With Profile First) ---');

  // Sign in User A anonymously to get valid auth.uid()
  const { data: userAAuth } = await supabase1.auth.signInAnonymously();
  const userAUid = userAAuth.user?.id;
  console.log('User A authenticated UID:', userAUid);

  // 1. Ensure Profile exists in profiles table
  const { error: profErr } = await supabase1.from('profiles').upsert({
    id: userAUid,
    username: 'UserA_Tester',
    avatar: '🧑',
    total_points: 50,
  });
  console.log('Profile upsert error:', profErr);

  // User B listens to Realtime changes
  let receivedRealtimeEvent = false;
  const channel = supabase2
    .channel('test_channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'improvement_plans' },
      (payload) => {
        console.log('REALTIME EVENT RECEIVED BY USER B:', payload.eventType, payload.new);
        receivedRealtimeEvent = true;
      }
    )
    .subscribe((status) => {
      console.log('User B Realtime subscription status:', status);
    });

  // Wait 2 seconds for subscription to join
  await new Promise((r) => setTimeout(r, 2000));

  // 2. User A creates a new plan with matching creator_id = userAUid
  const testPlanId = crypto.randomUUID();
  console.log('User A creating plan:', testPlanId);
  const { data: insertData, error: insertError } = await supabase1
    .from('improvement_plans')
    .insert({
      id: testPlanId,
      creator_id: userAUid,
      creator_username: 'UserA_Tester',
      creator_avatar: '🧑',
      title: 'Public Plan Realtime Test ' + Date.now(),
      description: 'Testing if User B receives this',
      category: 'Test',
      is_public: true,
      steps: [{ id: '1', title: 'Step 1', orderIndex: 0, completed: false }],
      copy_count: 0,
    })
    .select();

  console.log('Plan insert error:', insertError);
  console.log('Plan insert result:', insertData ? 'SUCCESS' : 'FAILED');

  // Wait 3 seconds to see if Realtime received
  await new Promise((r) => setTimeout(r, 3000));

  // Now User B queries fetchPublicPlansFromSupabase
  const { data: userBPlans, error: userBErr } = await supabase2
    .from('improvement_plans')
    .select('*')
    .eq('is_public', true);

  console.log('User B fetch error:', userBErr);
  const sawPlan = userBPlans?.some(p => p.id === testPlanId);
  console.log('User B saw plan in database query?:', sawPlan);
  console.log('User B received Realtime event?:', receivedRealtimeEvent);

  // Clean up
  await supabase1.from('improvement_plans').delete().eq('id', testPlanId);
  supabase2.removeChannel(channel);
}

testRealtimeAndRLS();
