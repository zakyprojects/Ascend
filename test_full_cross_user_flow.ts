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

async function testFullFlow() {
  console.log('--- Testing Full Cross-User Plan Flow ---');

  // 1. Sign in User A anonymously
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  console.log('User A auth UID:', userAUid);

  // Ensure profile A exists
  await clientUserA.from('profiles').upsert({
    id: userAUid,
    username: 'UserA_PublicTester',
    avatar: '🧑'
  });

  // 2. Sign in User B anonymously
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  console.log('User B auth UID:', userBUid);

  // Ensure profile B exists
  await clientUserB.from('profiles').upsert({
    id: userBUid,
    username: 'UserB_Viewer',
    avatar: '🐱'
  });

  // 3. User A creates a public plan
  const planId = crypto.randomUUID();
  console.log('User A publishing plan:', planId);

  const { error: insertErr } = await clientUserA.from('improvement_plans').upsert({
    id: planId,
    creator_id: userAUid,
    creator_username: 'UserA_PublicTester',
    creator_avatar: '🧑',
    title: 'Cross-User Plan ' + Date.now(),
    description: 'This plan should be visible to User B',
    category: 'Productivity',
    is_public: true,
    steps: [{ id: '1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0
  });

  console.log('User A insert error:', insertErr);

  // 4. User B queries public plans
  const { data: publicPlansForB, error: fetchErr } = await clientUserB
    .from('improvement_plans')
    .select('*')
    .eq('is_public', true);

  console.log('User B fetch error:', fetchErr);
  console.log('Total public plans visible to User B:', publicPlansForB?.length);

  const foundMyPlan = publicPlansForB?.some((p) => p.id === planId);
  console.log('User B can see User A plan?:', foundMyPlan);

  if (publicPlansForB) {
    console.log('All public plans seen by User B:', publicPlansForB.map(p => ({
      id: p.id,
      title: p.title,
      creator: p.creator_username,
      is_public: p.is_public
    })));
  }

  // Clean up
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testFullFlow();
