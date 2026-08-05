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

async function testCopyCountRLS() {
  console.log('--- Testing RLS on incrementing copy_count by User B ---');

  // 1. User A authenticates & creates profile + public plan
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  await clientUserA.from('profiles').upsert({ id: userAUid, username: 'UserA_Creator', avatar: '🧑' });

  const planId = crypto.randomUUID();
  console.log('User A publishing plan:', planId);
  const { error: insErr } = await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_Creator',
    creator_avatar: '🧑',
    title: 'Test Plan RLS ' + Date.now(),
    description: 'Testing copy_count update from User B',
    category: 'Test',
    is_public: true,
    steps: [],
    copy_count: 0,
  });
  console.log('Plan creation error:', insErr);

  // 2. User B authenticates
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  await clientUserB.from('profiles').upsert({ id: userBUid, username: 'UserB_Follower', avatar: '🐱' });
  console.log('User B authenticated UID:', userBUid);

  // 3. User B tries to increment copy_count on User A's plan!
  console.log('User B attempting to update copy_count on User A plan...');
  const { data: fetchResult } = await clientUserB.from('improvement_plans').select('copy_count').eq('id', planId).maybeSingle();
  const currentCount = fetchResult?.copy_count || 0;
  console.log('User B read copy_count before update:', currentCount);

  const { data: updateData, error: updateErr } = await clientUserB
    .from('improvement_plans')
    .update({ copy_count: currentCount + 1 })
    .eq('id', planId)
    .select();

  console.log('User B update error:', updateErr);
  console.log('User B update returned rows:', updateData);

  // 4. User A checks copy_count in database
  const { data: finalFetch } = await clientUserA.from('improvement_plans').select('copy_count').eq('id', planId).maybeSingle();
  console.log('Final copy_count in database seen by User A:', finalFetch?.copy_count);

  // Clean up
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testCopyCountRLS();
