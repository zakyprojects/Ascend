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
const supabase = createClient(url, key);

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

async function testInsertPlanTypes() {
  console.log('=== TESTING INSERTION OF 4 PLAN TYPES ===\n');

  const { data: auth } = await supabase.auth.signInAnonymously();
  const uid = auth.user?.id;
  if (!uid) {
    console.error('Auth failed');
    return;
  }
  await supabase.from('profiles').upsert({ id: uid, username: 'TestTypeUser_' + Date.now(), avatar: '🧑' });

  // 1. Milestone Plan
  const milestoneId = generateUUID();
  const { data: d1, error: e1 } = await supabase.from('improvement_plans').insert({
    id: milestoneId,
    creator_id: uid,
    creator_username: 'TestUser',
    title: 'Milestone Test Plan',
    description: 'Milestone description',
    category: 'Personal Growth',
    is_public: true,
    plan_type: 'milestone',
    steps: [{ id: 's1', title: 'Step 1', orderIndex: 0, completed: false }],
  }).select();

  console.log('Milestone Insert:', e1 ? 'ERROR: ' + e1.message : 'SUCCESS', d1 ? d1[0].plan_type : '');

  // 2. Target Goal Plan
  const targetId = generateUUID();
  const { data: d2, error: e2 } = await supabase.from('improvement_plans').insert({
    id: targetId,
    creator_id: uid,
    creator_username: 'TestUser',
    title: 'Read 12 Books',
    description: 'Read 12 self-improvement books',
    category: 'Learning',
    is_public: true,
    plan_type: 'target_goal',
    target_value: 12,
    target_unit: 'books',
    current_progress: 3,
    target_date: '2026-12-31',
  }).select();

  console.log('Target Goal Insert:', e2 ? 'ERROR: ' + e2.message : 'SUCCESS', d2 ? d2[0] : '');

  // 3. Habit Journey Plan
  const habitId = generateUUID();
  const { data: d3, error: e3 } = await supabase.from('improvement_plans').insert({
    id: habitId,
    creator_id: uid,
    creator_username: 'TestUser',
    title: 'Daily Meditation',
    description: 'Meditate 10m daily for 30 days',
    category: 'Health',
    is_public: true,
    plan_type: 'habit_journey',
    cadence: 'daily',
    duration: 30,
    start_date: new Date().toISOString(),
    streak_count: 5,
  }).select();

  console.log('Habit Journey Insert:', e3 ? 'ERROR: ' + e3.message : 'SUCCESS', d3 ? d3[0] : '');

  // 4. Vision / Reflection Plan
  const visionId = generateUUID();
  const { data: d4, error: e4 } = await supabase.from('improvement_plans').insert({
    id: visionId,
    creator_id: uid,
    creator_username: 'TestUser',
    title: 'Financial Independence Vision',
    description: 'Long-term wealth building vision',
    category: 'Finance',
    is_public: true,
    plan_type: 'vision',
    target_review_date: '2027-01-01',
    reflection_notes: [{ id: 'r1', date: new Date().toISOString(), note: 'Started budgeting today.' }],
  }).select();

  console.log('Vision Insert:', e4 ? 'ERROR: ' + e4.message : 'SUCCESS', d4 ? d4[0] : '');

  // Cleanup test plans
  await supabase.from('improvement_plans').delete().in('id', [milestoneId, targetId, habitId, visionId]);
  console.log('\nCleaned up test rows.');
}

testInsertPlanTypes();
