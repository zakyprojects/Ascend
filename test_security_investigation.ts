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

async function testSecurityVulnerability() {
  console.log('======================================================================');
  console.log('       SECURITY INVESTIGATION: UNRELATED THIRD-PARTY UPDATE TEST      ');
  console.log('======================================================================\n');

  // 1. Auth User A (Creator) and User B (Unrelated Third-Party Viewer)
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;

  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;

  console.log(`Creator User A UID: ${userAUid}`);
  console.log(`Unrelated User B UID: ${userBUid}`);

  // 2. User A creates a public Target Goal plan
  const planId = generateUUID();
  const { error: createErr } = await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'CreatorA',
    title: 'Original Creator Plan',
    description: 'Security test plan',
    is_public: true,
    steps: {
      items: [],
      planType: 'target_goal',
      targetValue: 100,
      targetUnit: 'reps',
      currentProgress: 10,
    },
  });

  if (createErr) {
    console.error('Failed to create test plan:', createErr);
    return;
  }
  console.log(`User A created plan ${planId} with currentProgress = 10.`);

  // 3. User B (Unrelated viewer) attempts to UPDATE User A's plan progress to 999
  console.log('\n--> User B attempting to UPDATE User A\'s plan directly via Supabase client...');
  
  // Attempt 1: Direct update query
  const { data: updateData1, error: updateErr1 } = await clientUserB
    .from('improvement_plans')
    .update({
      steps: {
        items: [],
        planType: 'target_goal',
        targetValue: 100,
        targetUnit: 'reps',
        currentProgress: 999,
      },
    })
    .eq('id', planId)
    .select();

  console.log('Attempt 1 (Direct .update()):', {
    modifiedRowsCount: updateData1?.length || 0,
    error: updateErr1?.message || null,
  });

  // Attempt 2: Upsert query (simulating syncPlanToSupabase)
  const { data: updateData2, error: updateErr2 } = await clientUserB
    .from('improvement_plans')
    .upsert({
      id: planId,
      creator_id: userBUid, // User B trying to overwrite creator_id or row
      title: 'Hacked Title',
      steps: {
        items: [],
        planType: 'target_goal',
        targetValue: 100,
        targetUnit: 'reps',
        currentProgress: 999,
      },
    })
    .select();

  console.log('Attempt 2 (Upsert with User B creator_id):', {
    modifiedRowsCount: updateData2?.length || 0,
    error: updateErr2?.message || null,
  });

  // 4. Fetch the real plan row as User A to see if anything changed on DB
  const { data: finalPlan } = await clientUserA
    .from('improvement_plans')
    .select('creator_id, steps')
    .eq('id', planId)
    .single();

  console.log('\nDB Final State check for Creator User A\'s plan:');
  console.log(`- Creator ID: ${finalPlan?.creator_id}`);
  console.log(`- currentProgress: ${finalPlan?.steps?.currentProgress}`);

  const isVulnerable = finalPlan?.steps?.currentProgress === 999 || finalPlan?.creator_id === userBUid;
  if (isVulnerable) {
    console.log('\nResult: ⚠️ REAL SECURITY VULNERABILITY DETECTED! Unrelated User B was able to modify User A\'s plan.');
  } else {
    console.log('\nResult: ✅ SECURE / DEAD UI! Supabase RLS blocked User B\'s attempt. 0 rows modified in DB. The buttons in Discover were purely dead UI that updated local Zustand state only.');
  }

  // Cleanup
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
  console.log('\nCleaned up security test plan.');
  console.log('======================================================================');
}

testSecurityVulnerability();
