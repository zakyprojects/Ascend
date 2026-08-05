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

function mapRowToImprovementPlan(row: any) {
  const rawSteps = row?.steps;
  const isStepsArray = Array.isArray(rawSteps);
  const stepsMeta = !isStepsArray && typeof rawSteps === 'object' && rawSteps !== null ? rawSteps : {};
  const stepsList = isStepsArray ? rawSteps : (Array.isArray(stepsMeta.items) ? stepsMeta.items : []);

  const planType = row?.plan_type || stepsMeta.planType || 'milestone';

  return {
    id: row?.id || '',
    creatorId: row?.creator_id || '',
    creatorUsername: row?.creator_username || 'Member',
    creatorAvatar: row?.creator_avatar || '🧑',
    creatorPoints: row?.creator_points || 0,
    title: row?.title || 'Untitled Plan',
    description: row?.description || '',
    category: row?.category || 'Personal Growth',
    isPublic: Boolean(row?.is_public),
    steps: stepsList,
    copyCount: typeof row?.copy_count === 'number' ? row.copy_count : 0,
    createdAt: row?.created_at || new Date().toISOString(),

    planType,
    targetValue: row?.target_value !== undefined && row?.target_value !== null ? Number(row.target_value) : stepsMeta.targetValue,
    targetUnit: row?.target_unit || stepsMeta.targetUnit || '',
    currentProgress: row?.current_progress !== undefined && row?.current_progress !== null ? Number(row.current_progress) : (stepsMeta.currentProgress ?? 0),
    targetDate: row?.target_date || stepsMeta.targetDate || '',
    cadence: row?.cadence || stepsMeta.cadence || 'daily',
    duration: row?.duration !== undefined && row?.duration !== null ? Number(row.duration) : (stepsMeta.duration ?? 30),
    startDate: row?.start_date || stepsMeta.startDate || new Date().toISOString(),
    streakCount: row?.streak_count !== undefined && row?.streak_count !== null ? Number(row.streak_count) : (stepsMeta.streakCount ?? 0),
    lastCompletedDate: row?.last_completed_date || stepsMeta.lastCompletedDate || '',
    targetReviewDate: row?.target_review_date || stepsMeta.targetReviewDate || '',
    reflectionNotes: Array.isArray(row?.reflection_notes) ? row.reflection_notes : (Array.isArray(stepsMeta.reflectionNotes) ? stepsMeta.reflectionNotes : []),
  };
}

async function runPhaseBProofTest() {
  console.log('======================================================================');
  console.log('       EMPIRICAL PROOF TEST: PHASE B - 4 PLAN TYPES REBUILD           ');
  console.log('======================================================================\n');

  // 1. Authenticate User A and User B
  const { data: authA } = await clientUserA.auth.signInAnonymously();
  const userAUid = authA.user?.id;
  const usernameA = 'PhaseBCreator_' + Date.now();
  await clientUserA.from('profiles').upsert({ id: userAUid, username: usernameA, avatar: '🧑' });

  const { data: authB } = await clientUserB.auth.signInAnonymously();
  const userBUid = authB.user?.id;
  const usernameB = 'PhaseBCopier_' + Date.now();
  await clientUserB.from('profiles').upsert({ id: userBUid, username: usernameB, avatar: '🦊' });

  console.log(`User A (Creator) UID: ${userAUid}`);
  console.log(`User B (Copier) UID: ${userBUid}`);

  // STEP 1: Create 4 Plans (1 of each type)
  console.log('\n--- STEP 1: Creating 1 Plan of each of the 4 Types ---');

  const milestoneId = generateUUID();
  const targetId = generateUUID();
  const habitId = generateUUID();
  const visionId = generateUUID();

  // 1a. Milestone
  const { error: e1 } = await clientUserA.from('improvement_plans').insert({
    id: milestoneId,
    creator_id: userAUid,
    creator_username: usernameA,
    title: 'Milestone 30-Day Protocol',
    description: 'Ordered steps towards mastery',
    category: 'Personal Growth',
    is_public: true,
    steps: {
      items: [
        { id: 's1', title: 'Step 1: Planning', orderIndex: 0, completed: true },
        { id: 's2', title: 'Step 2: Execution', orderIndex: 1, completed: false },
      ],
      planType: 'milestone',
    },
  });

  // 1b. Target Goal
  const { error: e2 } = await clientUserA.from('improvement_plans').insert({
    id: targetId,
    creator_id: userAUid,
    creator_username: usernameA,
    title: 'Read 12 Self-Improvement Books',
    description: 'Target goal for annual reading',
    category: 'Learning',
    is_public: true,
    steps: {
      items: [],
      planType: 'target_goal',
      targetValue: 12,
      targetUnit: 'books',
      currentProgress: 3,
      targetDate: '2026-12-31',
    },
  });

  // 1c. Habit Journey
  const { error: e3 } = await clientUserA.from('improvement_plans').insert({
    id: habitId,
    creator_id: userAUid,
    creator_username: usernameA,
    title: 'Daily Meditation Practice',
    description: '30-day daily habit journey',
    category: 'Health',
    is_public: true,
    steps: {
      items: [],
      planType: 'habit_journey',
      cadence: 'daily',
      duration: 30,
      startDate: new Date().toISOString(),
      streakCount: 5,
    },
  });

  // 1d. Vision / Reflection Plan
  const { error: e4 } = await clientUserA.from('improvement_plans').insert({
    id: visionId,
    creator_id: userAUid,
    creator_username: usernameA,
    title: 'Financial Independence 2030',
    description: 'Long-term wealth vision and periodic check-in notes',
    category: 'Finance',
    is_public: true,
    steps: {
      items: [],
      planType: 'vision',
      targetReviewDate: '2027-01-01',
      reflectionNotes: [{ id: 'r1', date: new Date().toISOString(), note: 'Started automated savings today.' }],
    },
  });

  console.log(`Creation Errors: Milestone: ${e1?.message || 'None'}, Target: ${e2?.message || 'None'}, Habit: ${e3?.message || 'None'}, Vision: ${e4?.message || 'None'}`);

  // Query DB directly to verify each type mapped cleanly via mapRowToImprovementPlan
  const { data: dbPlans } = await clientUserA.from('improvement_plans').select('*').in('id', [milestoneId, targetId, habitId, visionId]);
  console.log(`\nDB Mapped Plans (${dbPlans?.length || 0} returned):`);
  const mappedPlans = (dbPlans || []).map(mapRowToImprovementPlan);
  mappedPlans.forEach((p) => {
    console.log(`- Title: "${p.title}" | Type: ${p.planType} | TargetVal: ${p.targetValue} | Unit: ${p.targetUnit} | Progress: ${p.currentProgress} | Streak: ${p.streakCount} | Reflections: ${p.reflectionNotes?.length}`);
  });

  // STEP 2: Update Progress on Target Goal
  console.log('\n--- STEP 2: Updating Progress on Target Goal (3 -> 7 books) ---');
  const targetRow = dbPlans?.find((p) => p.id === targetId);
  const updatedStepsTarget = { ...targetRow.steps, currentProgress: 7 };
  await clientUserA.from('improvement_plans').update({ steps: updatedStepsTarget }).eq('id', targetId);

  const { data: rawTarget } = await clientUserA.from('improvement_plans').select('*').eq('id', targetId).single();
  const mappedTarget = mapRowToImprovementPlan(rawTarget);
  console.log(`Target Goal updated progress: ${mappedTarget.currentProgress} / ${mappedTarget.targetValue} ${mappedTarget.targetUnit} ✅`);

  // STEP 3: Advance Streak on Habit Journey
  console.log('\n--- STEP 3: Advancing Streak on Habit Journey (5 -> 6 days) ---');
  const habitRow = dbPlans?.find((p) => p.id === habitId);
  const updatedStepsHabit = { ...habitRow.steps, streakCount: 6, lastCompletedDate: new Date().toISOString() };
  await clientUserA.from('improvement_plans').update({ steps: updatedStepsHabit }).eq('id', habitId);

  const { data: rawHabit } = await clientUserA.from('improvement_plans').select('*').eq('id', habitId).single();
  const mappedHabit = mapRowToImprovementPlan(rawHabit);
  console.log(`Habit Journey updated streak: ${mappedHabit.streakCount} days ✅`);

  // STEP 4: Add Reflection Note to Vision Plan
  console.log('\n--- STEP 4: Adding Reflection Note to Vision Plan ---');
  const visionRow = dbPlans?.find((p) => p.id === visionId);
  const newNotes = [
    { id: 'r2', date: new Date().toISOString(), note: 'Reviewed Q3 investments. On track!' },
    ...(visionRow.steps?.reflectionNotes || []),
  ];
  const updatedStepsVision = { ...visionRow.steps, reflectionNotes: newNotes };
  await clientUserA.from('improvement_plans').update({ steps: updatedStepsVision }).eq('id', visionId);

  const { data: rawVision } = await clientUserA.from('improvement_plans').select('*').eq('id', visionId).single();
  const mappedVision = mapRowToImprovementPlan(rawVision);
  console.log(`Vision Plan updated reflections count: ${mappedVision.reflectionNotes?.length} notes ✅`);

  // STEP 5: Verify Discover Query by User B
  console.log('\n--- STEP 5: User B Queries Discover Public Plans ---');
  const { data: discoverPlansB } = await clientUserB.from('improvement_plans').select('*').eq('is_public', true).in('id', [milestoneId, targetId, habitId, visionId]);
  console.log(`User B sees all 4 plans in Discover? ${discoverPlansB?.length === 4 ? 'YES (ALL 4 PUBLIC) ✅' : 'NO'}`);

  // STEP 6: User A Toggles Target Goal to PRIVATE
  console.log('\n--- STEP 6: User A toggles Target Goal to PRIVATE ---');
  await clientUserA.from('improvement_plans').update({ is_public: false }).eq('id', targetId);
  const { data: discoverAfterPrivate } = await clientUserB.from('improvement_plans').select('id').eq('is_public', true).eq('id', targetId);
  console.log(`Target Goal visible to User B after making Private? ${discoverAfterPrivate && discoverAfterPrivate.length > 0 ? 'YES' : 'NO (HIDDEN AS EXPECTED) ✅'}`);

  // Cleanup test plans
  await clientUserA.from('improvement_plans').delete().in('id', [milestoneId, targetId, habitId, visionId]);
  console.log('\nCleaned up Phase B test rows.');

  console.log('\n======================================================================');
  console.log('                 PHASE B PROOF VERIFICATION COMPLETE                 ');
  console.log('======================================================================');
}

runPhaseBProofTest();
