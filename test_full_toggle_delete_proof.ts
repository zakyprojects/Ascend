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

const clientCreator = createClient(url, key);
const clientAccount2 = createClient(url, key);

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

async function runMandatoryProofTest() {
  console.log('======================================================================');
  console.log('   MANDATORY PROOF TEST: SERVER-AUTHORITATIVE TOGGLE & DELETION      ');
  console.log('======================================================================\n');

  // 1. Authenticate Creator and Second Account
  const { data: authCreator } = await clientCreator.auth.signInAnonymously();
  const creatorUid = authCreator.user?.id;
  const creatorUsername = 'ProofCreator_' + Date.now();
  await clientCreator.from('profiles').upsert({ id: creatorUid, username: creatorUsername, avatar: '🧑' });

  const { data: authAcc2 } = await clientAccount2.auth.signInAnonymously();
  const acc2Uid = authAcc2.user?.id;
  const acc2Username = 'ProofAccount2_' + Date.now();
  await clientAccount2.from('profiles').upsert({ id: acc2Uid, username: acc2Username, avatar: '🦊' });

  console.log(`Creator Session UID: ${creatorUid} (${creatorUsername})`);
  console.log(`Account 2 Session UID: ${acc2Uid} (${acc2Username})`);

  // 2. Create a Public Plan
  const planId = generateUUID();
  console.log(`\n--- STEP 1: Creator creates new PUBLIC plan (ID: ${planId}) ---`);

  const { error: insErr } = await clientCreator.from('improvement_plans').insert({
    id: planId,
    creator_id: creatorUid,
    creator_username: creatorUsername,
    creator_avatar: '🧑',
    title: 'Mandatory Proof Plan ' + Date.now(),
    description: 'Testing live toggle and delete persistence across accounts',
    category: 'Personal Growth',
    is_public: true,
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
    copy_count: 0,
  });

  if (insErr) {
    console.error('Plan Insertion Failed:', insErr);
    return;
  }

  // Query DB directly
  let { data: dbCheck } = await clientCreator.from('improvement_plans').select('id, title, is_public').eq('id', planId).single();
  console.log(`DB Query Result: Plan ID ${dbCheck?.id} -> is_public = ${dbCheck?.is_public}`);

  // Second Account checks Discover
  let { data: discoverCheck } = await clientAccount2.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId);
  console.log(`Account 2 Discover Query: Plan visible in Discover? ${discoverCheck && discoverCheck.length > 0 ? 'YES (PUBLIC)' : 'NO'}`);

  // 3. Creator Toggles Plan to PRIVATE
  console.log(`\n--- STEP 2: Creator toggles plan from PUBLIC to PRIVATE ---`);
  const { data: updatePrivateData, error: upPrivErr } = await clientCreator
    .from('improvement_plans')
    .update({ is_public: false })
    .eq('id', planId)
    .eq('creator_id', creatorUid)
    .select();

  console.log('Supabase UPDATE (.update({ is_public: false })) Result:', updatePrivateData);
  console.log('Update Error:', upPrivErr);

  // Query DB directly
  ({ data: dbCheck } = await clientCreator.from('improvement_plans').select('id, title, is_public').eq('id', planId).single());
  console.log(`DB Direct Query AFTER making Private: is_public = ${dbCheck?.is_public}`);

  // Second Account checks Discover
  ({ data: discoverCheck } = await clientAccount2.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log(`Account 2 Discover Query AFTER Private: Plan visible in Discover? ${discoverCheck && discoverCheck.length > 0 ? 'YES' : 'NO (HIDDEN AS EXPECTED)'}`);

  // 4. Creator Toggles Plan Back to PUBLIC
  console.log(`\n--- STEP 3: Creator toggles plan back to PUBLIC ---`);
  const { data: updatePublicData, error: upPubErr } = await clientCreator
    .from('improvement_plans')
    .update({ is_public: true })
    .eq('id', planId)
    .eq('creator_id', creatorUid)
    .select();

  console.log('Supabase UPDATE (.update({ is_public: true })) Result:', updatePublicData);
  console.log('Update Error:', upPubErr);

  // Query DB directly
  ({ data: dbCheck } = await clientCreator.from('improvement_plans').select('id, title, is_public').eq('id', planId).single());
  console.log(`DB Direct Query AFTER making Public again: is_public = ${dbCheck?.is_public}`);

  // Second Account checks Discover
  ({ data: discoverCheck } = await clientAccount2.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log(`Account 2 Discover Query AFTER Public again: Plan visible in Discover? ${discoverCheck && discoverCheck.length > 0 ? 'YES (VISIBLE AGAIN)' : 'NO'}`);

  // 5. Creator DELETES the Plan
  console.log(`\n--- STEP 4: Creator DELETES the plan ---`);
  const { data: deleteData, error: deleteErr } = await clientCreator
    .from('improvement_plans')
    .delete()
    .eq('id', planId)
    .eq('creator_id', creatorUid)
    .select();

  console.log('Supabase DELETE (.delete()) Result:', deleteData);
  console.log('Delete Error:', deleteErr);

  // Query DB directly to prove row is 100% deleted
  const { data: dbCheckDeleted } = await clientCreator.from('improvement_plans').select('id').eq('id', planId).maybeSingle();
  console.log(`DB Direct Query AFTER Deletion: Row exists in DB? ${dbCheckDeleted ? 'YES (FAILED)' : 'NO (100% PURGED FROM DB)'}`);

  // Second Account checks Discover
  ({ data: discoverCheck } = await clientAccount2.from('improvement_plans').select('id, title').eq('is_public', true).eq('id', planId));
  console.log(`Account 2 Discover Query AFTER Deletion: Plan visible in Discover? ${discoverCheck && discoverCheck.length > 0 ? 'YES (STALE)' : 'NO (GONE FOR ALL USERS)'}`);

  console.log('\n======================================================================');
  console.log('                 PROOF VERIFICATION COMPLETE                         ');
  console.log('======================================================================');
}

runMandatoryProofTest();
