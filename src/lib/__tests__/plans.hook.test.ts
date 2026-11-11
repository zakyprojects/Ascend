// Hook test (real useAppState + in-process fake Supabase, see harness/): the plan actions of a
// signed-in account. Written for C2 (moving the plan actions out of useAppState).
//   T30  a milestone plan reaches improvement_plans marked synced, and a step tick is saved;
//        a habit journey is done once per day and undone (streak saved); a vision plan's
//        reflection note is added, edited and deleted (saved each time); a plan whose save fails
//        is marked failed, a sharing change on it waits for its save, and the minute tick retries
//        it once the table answers again (synced, shared); copying another member's public plan
//        adds one copy (a second copy is refused), its step tick is saved, and removing it leaves a
//        tombstone and removes the row; deleting a plan removes it, its row, and leaves a tombstone.
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const OTHER = '33333333-3333-4333-8333-333333333333';
const PUBLIC_PLAN = '66666666-6666-4666-8666-666666666666';

type PlanRow = { id: string; creator_id?: string; is_public?: boolean; steps?: { items?: { id: string; completed: boolean }[]; streakCount?: number; reflectionNotes?: { id: string; note: string }[] } };
type FollowRow = { id: string; original_plan_id?: string; steps?: { items?: { id: string; completed: boolean }[] } };

await story('plans.hook (plan actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);
  const planRows = () => server.g('improvement_plans') as PlanRow[];
  const planRow = (id: string) => planRows().find((r) => r.id === id);
  const followRows = () => server.g('user_plan_follows') as FollowRow[];
  const plan = (title: string) => h.s().state.improvementPlans.find((p) => p.title === title);

  // Milestone plan: created, saved, step tick saved.
  h.s().createImprovementPlan('HookPlan', 'desc', false, ['Step A', 'Step B']);
  await until(() => plan('HookPlan'), 'T30: new plan in state');
  const planId = plan('HookPlan')!.id;
  await until(() => planRow(planId), 'T30: new plan reached improvement_plans', 5000);
  await until(() => plan('HookPlan')!.syncStatus === 'synced', 'T30: new plan marked synced');
  eq(planRow(planId)!.creator_id, UID, 'T30: the row belongs to the user');
  const stepId = plan('HookPlan')!.steps[0].id;
  h.s().completePlanStep(planId, stepId);
  await until(() => plan('HookPlan')!.steps[0].completed, 'T30: step ticked in state');
  await until(() => planRow(planId)!.steps?.items?.find((s) => s.id === stepId)?.completed === true, 'T30: step tick reached the row', 5000);

  // Habit journey: done once per day, undone.
  h.s().createImprovementPlan('HookJourney', '', false, [], undefined, 'habit_journey', { cadence: 'daily', duration: 30 });
  await until(() => plan('HookJourney') && planRow(plan('HookJourney')!.id), 'T30: journey reached the table', 5000);
  const journeyId = plan('HookJourney')!.id;
  h.s().markHabitJourneyDone(journeyId);
  await until(() => plan('HookJourney')!.streakCount === 1, 'T30: journey done today');
  await until(() => planRow(journeyId)!.steps?.streakCount === 1, 'T30: journey streak reached the row', 5000);
  h.s().markHabitJourneyDone(journeyId);
  await quiet(1500);
  eq(plan('HookJourney')!.streakCount, 1, 'T30: a second done the same day changes nothing');
  h.s().undoHabitJourneyDone(journeyId);
  await until(() => plan('HookJourney')!.streakCount === 0, 'T30: journey undone');
  await until(() => planRow(journeyId)!.steps?.streakCount === 0, 'T30: undo reached the row', 5000);

  // Vision plan: reflection note added, edited, deleted.
  h.s().createImprovementPlan('HookVision', '', false, [], undefined, 'vision');
  await until(() => plan('HookVision') && planRow(plan('HookVision')!.id), 'T30: vision reached the table', 5000);
  const visionId = plan('HookVision')!.id;
  h.s().addVisionReflectionNote(visionId, 'HookNote');
  await until(() => plan('HookVision')!.reflectionNotes?.[0]?.note === 'HookNote', 'T30: note in state');
  const noteId = plan('HookVision')!.reflectionNotes![0].id;
  await until(() => planRow(visionId)!.steps?.reflectionNotes?.some((n) => n.id === noteId && n.note === 'HookNote'), 'T30: note reached the row', 5000);
  h.s().editVisionReflectionNote(visionId, noteId, 'HookNote2');
  await until(() => planRow(visionId)!.steps?.reflectionNotes?.some((n) => n.id === noteId && n.note === 'HookNote2'), 'T30: edited note reached the row', 5000);
  h.s().deleteVisionReflectionNote(visionId, noteId);
  await until(() => !(plan('HookVision')!.reflectionNotes || []).some((n) => n.id === noteId), 'T30: note deleted in state');
  await until(() => !(planRow(visionId)!.steps?.reflectionNotes || []).some((n) => n.id === noteId), 'T30: note delete reached the row', 5000);

  // A failed save, a sharing change while it is unconfirmed, and the minute-tick retry.
  fake.fail('improvement_plans', 500, ['POST']);
  h.s().createImprovementPlan('HookOffline', '', false, ['Only step']);
  await until(() => plan('HookOffline')?.syncStatus === 'failed', 'T30: failed save marked failed');
  const offlineId = plan('HookOffline')!.id;
  assert(!planRow(offlineId), 'T30: the failed plan has no row');
  await h.s().togglePlanVisibility(offlineId, true);
  await until(() => plan('HookOffline')!.isPublic === true, 'T30: sharing change in state');
  await until(() => plan('HookOffline')!.syncStatus === 'failed', 'T30: its save is still failing');
  fake.unfail('improvement_plans');
  h.intervals.fire(60000);
  await until(() => planRow(offlineId)?.is_public === true, 'T30: minute tick saved the failed plan, shared', 5000);
  await until(() => plan('HookOffline')!.syncStatus === 'synced', 'T30: retried plan marked synced');

  // Copy another member's public plan.
  const original = {
    ...plan('HookPlan')!, id: PUBLIC_PLAN, creatorId: OTHER, creatorUsername: 'other', title: 'TheirPlan', isPublic: true, copyCount: 2, syncStatus: undefined,
  };
  eq(await h.s().copyPublicPlan(original), true, 'T30: first copy added');
  await until(() => h.s().state.followedPlans.some((f) => f.originalPlanId === PUBLIC_PLAN), 'T30: copy in state');
  const follow = () => h.s().state.followedPlans.find((f) => f.originalPlanId === PUBLIC_PLAN)!;
  const followId = follow().id;
  await until(() => followRows().some((r) => r.id === followId && r.original_plan_id === PUBLIC_PLAN), 'T30: copy reached user_plan_follows', 5000);
  await quiet(500);
  eq(await h.s().copyPublicPlan(original), false, 'T30: a second copy of the same plan is refused');
  eq(h.s().state.followedPlans.filter((f) => f.originalPlanId === PUBLIC_PLAN).length, 1, 'T30: one copy only');
  const followStepId = follow().steps[0].id;
  h.s().completeFollowedPlanStep(followId, followStepId);
  await until(() => follow().steps[0].completed, 'T30: copy step ticked in state');
  await until(() => followRows().find((r) => r.id === followId)?.steps?.items?.find((s) => s.id === followStepId)?.completed === true, 'T30: copy step tick reached the row', 5000);
  await h.s().deleteFollowedPlan(followId);
  await until(() => !h.s().state.followedPlans.some((f) => f.id === followId), 'T30: copy removed from state');
  assert((h.s().state.deletedEntityIds || []).includes(followId), 'T30: removed copy has a tombstone');
  await until(() => !followRows().some((r) => r.id === followId), 'T30: copy row removed', 5000);

  // Delete a plan.
  await h.s().deletePlan(planId);
  await until(() => !plan('HookPlan'), 'T30: deleted plan gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(planId), 'T30: deleted plan has a tombstone');
  assert(!planRow(planId), 'T30: deleted plan row removed');
  pass('T30 plans created and saved (milestone step, journey done/undo, vision notes), failed save retried by the minute tick, copy added once/ticked/removed, plan deleted');
});
