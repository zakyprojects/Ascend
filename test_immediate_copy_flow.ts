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

async function testImmediateCopyFlow() {
  console.log('=== Testing Immediate Copy Flow (No ID Swap Race Condition) ===');

  // 1. User A authenticates & creates plan with client-generated UUIDv4
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'Creator_' + Date.now();
  await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });

  // STRICT CLIENT UUIDv4
  const planId = generateUUID();
  console.log('1. User A instantiated plan with strict UUIDv4:', planId);

  // Sync to database
  const syncPromise = clientUserA.from('improvement_plans').insert({
    id: planId,
    creator_id: userAUid,
    creator_username: usernameA,
    creator_avatar: '🧑',
    title: 'Immediate Copy Plan ' + Date.now(),
    description: 'Testing 0ms immediate copy',
    category: 'Personal Growth',
    is_public: true,
    steps: [],
    copy_count: 0,
  });

  // 2. User B IMMEDIATELY (concurrently) copies plan using THAT EXACT planId
  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'Follower_' + Date.now();
  await clientUserB.from('profiles').upsert({ id: userBUid, username: usernameB, avatar: '🐱' });

  // Wait for insert to complete
  await syncPromise;

  console.log('2. User B copying plan immediately with ID:', planId);
  const followId = generateUUID();
  await clientUserB.from('user_plan_follows').insert({
    id: followId,
    user_id: userBUid,
    original_plan_id: planId,
    title: 'Immediate Copy Plan',
    description: 'Copied',
    steps: [],
    is_completed: false,
    points_awarded: 0,
  });

  console.log('3. User B triggering increment RPC with planId:', planId);
  const { data: rpcData, error: rpcErr } = await clientUserB.rpc('increment_plan_copy_count', { target_plan_id: planId });
  console.log('RPC error:', rpcErr);
  console.log('RPC updated copy_count:', rpcData);

  // 4. Check DB row
  const { data: fetchedRow } = await clientUserA.from('improvement_plans').select('*').eq('id', planId).single();
  console.log('DB row copy_count:', fetchedRow?.copy_count);

  // Clean up
  await clientUserB.from('user_plan_follows').delete().eq('id', followId);
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
}

testImmediateCopyFlow();
