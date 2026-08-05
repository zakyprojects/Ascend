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

async function runToggleAndDeleteProof() {
  console.log('=== EMPIRICAL PROOF TEST: TOGGLE VISIBILITY & DELETE PLAN ===\n');

  // 1. Authenticate User A & User B
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'TestUserA_' + Date.now();
  await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });

  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'TestUserB_' + Date.now();
  await clientUserB.from('profiles').upsert({ id: userBUid, username: usernameB, avatar: '🐱' });

  console.log('User A UID:', userAUid);
  console.log('User B UID:', userBUid);

  // 2. User A creates a public plan
  const planId = generateUUID();
  console.log('\nSTEP 1: User A creating plan with ID:', planId);

  const { error: insErr } = await clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: usernameA,
    creator_avatar: '🧑',
    title: 'Proof Plan ' + Date.now(),
    description: 'Testing toggle and delete persistence',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  });

  if (insErr) {
    console.error('Plan Insert Failed:', insErr);
    return;
  }

  // Query DB directly as User A
  let { data: dbRow } = await clientUserA.from('improvement_plans').select('is_public').eq('id', planId).single();
  console.log('DB row is_public immediately after creation:', dbRow?.is_public);

  // User B queries Discover public plans
  let { data: publicPlansB } = await clientUserB.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId);
  console.log('User B sees plan in Discover:', publicPlansB && publicPlansB.length > 0 ? 'YES' : 'NO');

  // 3. User A toggles plan to PRIVATE
  console.log('\nSTEP 2: User A toggles plan to PRIVATE (is_public = false)...');
  const { data: updateResPrivate, error: upErr1 } = await clientUserA
    .from('improvement_plans')
    .update({ is_public: false })
    .eq('id', planId)
    .eq('creator_id', userAUid)
    .select();

  console.log('Update Result (Private):', updateResPrivate);
  console.log('Update Error (Private):', upErr1);

  // Query DB directly
  ({ data: dbRow } = await clientUserA.from('improvement_plans').select('is_public').eq('id', planId).single());
  console.log('DB row is_public AFTER making private:', dbRow?.is_public);

  // User B queries Discover public plans
  ({ data: publicPlansB } = await clientUserB.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log('User B sees plan in Discover AFTER made private:', publicPlansB && publicPlansB.length > 0 ? 'YES' : 'NO');

  // 4. User A toggles plan back to PUBLIC
  console.log('\nSTEP 3: User A toggles plan back to PUBLIC (is_public = true)...');
  const { data: updateResPublic, error: upErr2 } = await clientUserA
    .from('improvement_plans')
    .update({ is_public: true })
    .eq('id', planId)
    .eq('creator_id', userAUid)
    .select();

  console.log('Update Result (Public):', updateResPublic);
  console.log('Update Error (Public):', upErr2);

  // Query DB directly
  ({ data: dbRow } = await clientUserA.from('improvement_plans').select('is_public').eq('id', planId).single());
  console.log('DB row is_public AFTER making public again:', dbRow?.is_public);

  // User B queries Discover public plans
  ({ data: publicPlansB } = await clientUserB.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log('User B sees plan in Discover AFTER made public again:', publicPlansB && publicPlansB.length > 0 ? 'YES' : 'NO');

  // 5. User A DELETES the plan
  console.log('\nSTEP 4: User A deletes the plan...');
  const { data: deleteRes, error: delErr } = await clientUserA
    .from('improvement_plans')
    .delete()
    .eq('id', planId)
    .eq('creator_id', userAUid)
    .select();

  console.log('Delete Result:', deleteRes);
  console.log('Delete Error:', delErr);

  // Query DB directly
  const { data: deletedRowCheck } = await clientUserA.from('improvement_plans').select('id').eq('id', planId).maybeSingle();
  console.log('DB row exists AFTER deletion:', deletedRowCheck ? 'YES' : 'NO (FULLY DELETED FROM DB)');

  // User B queries Discover public plans
  ({ data: publicPlansB } = await clientUserB.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log('User B sees plan in Discover AFTER deletion:', publicPlansB && publicPlansB.length > 0 ? 'YES' : 'NO');

  console.log('\n=============================================================');
}

runToggleAndDeleteProof();
