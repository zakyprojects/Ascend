import { createClient } from '@supabase/supabase-js';

const url = 'https://qokeodigrywwsyglcfjj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFva2VvZGlncnl3d3N5Z2xjZmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTMzMzQsImV4cCI6MjEwMTE4OTMzNH0.sflkGr6JLOugxhQe7A7Jvuf8FTkmxETE1kqquXFZ8XE';

const clientUserA = createClient(url, key);
const clientUserB = createClient(url, key);

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function run() {
  console.log('--- STARTING SECURITY TEST WITH PROFILES ---');

  // Sign in User A and User B
  const resA = await clientUserA.auth.signInAnonymously();
  const resB = await clientUserB.auth.signInAnonymously();

  const userA = resA.data?.user?.id;
  const userB = resB.data?.user?.id;

  console.log('User A UID:', userA);
  console.log('User B UID:', userB);

  // Upsert profiles for A & B
  await clientUserA.from('profiles').upsert({ id: userA, username: 'SecUserA', avatar: '🧑' });
  await clientUserB.from('profiles').upsert({ id: userB, username: 'SecUserB', avatar: '🦊' });

  const planId = generateUUID();

  // User A creates a plan
  const { data: created, error: errCreate } = await clientUserA
    .from('improvement_plans')
    .insert({
      id: planId,
      creator_id: userA,
      creator_username: 'SecUserA',
      title: 'Security Target Plan',
      description: 'Testing third party update vulnerability',
      is_public: true,
      steps: { planType: 'target_goal', targetValue: 100, currentProgress: 10 },
    })
    .select();

  console.log('User A created plan ID:', created ? created[0].id : null, 'Error:', errCreate?.message || 'None');

  // User B attempts to update User A's plan progress to 999
  const { data: updatedB, error: errUpdateB } = await clientUserB
    .from('improvement_plans')
    .update({
      steps: { planType: 'target_goal', targetValue: 100, currentProgress: 999 },
    })
    .eq('id', planId)
    .select();

  console.log('User B update attempt returned modified rows count:', updatedB ? updatedB.length : 0);
  console.log('User B update error:', errUpdateB ? errUpdateB.message : 'None');

  // Check DB state as User A
  const { data: dbCheck } = await clientUserA
    .from('improvement_plans')
    .select('steps, creator_id')
    .eq('id', planId)
    .single();

  console.log('Current DB state for currentProgress:', dbCheck ? dbCheck.steps.currentProgress : null);

  if (dbCheck && dbCheck.steps.currentProgress === 999) {
    console.log('RESULT: ⚠️ VULNERABLE! User B was able to modify User A\'s plan!');
  } else {
    console.log('RESULT: ✅ SECURE / DEAD UI! Supabase RLS blocked User B. 0 rows modified.');
  }

  // Cleanup
  await clientUserA.from('improvement_plans').delete().eq('id', planId);
  console.log('--- TEST FINISHED ---');
}

run().catch(console.error);
