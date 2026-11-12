// Hook test (real useAppState + in-process fake Supabase, see harness/): the weekly goal actions of a
// signed-in account. Written for C2 (moving them out of useAppState).
//   T24  a goal added to this week reaches state and the week's weekly_goals row; an edit (title,
//        done) saves; an unfinished goal of last week is carried over into this week; deleting the
//        goal removes it from state and the row; deleting the carried copy dismisses its source in
//        last week. (Reflections depend on the reflection window, so
//        they are not driven here; weeklyAwards has their unit tests.)
import { bootHook, story, until, quiet, rows, assert, pass, server, UID } from './harness/bootHook';
import { trustedNow } from '../clock';
import { weekKey } from '../dates';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('weeklyGoals.hook (weekly goal actions)', async () => {
  const week = weekKey(trustedNow());
  const lastWeek = weekKey(new Date(trustedNow().getTime() - 7 * 24 * 3600 * 1000));
  assert(lastWeek < week, 'T24 precondition: last week key sorts before this week');
  const oldGoal = { id: 'g-last', title: 'HookLastWeekGoal', priority: 'medium', completed: false, createdAt: blobAt };
  const lastWeekDoc = { id: 'wg-last', weekKey: lastWeek, goals: [oldGoal], deletedGoalIds: [], createdAt: blobAt };
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  server.upsert('weekly_goals', [{ id: lastWeek, user_id: UID, week_key: lastWeek, data: lastWeekDoc, updated_at: blobAt }], 'seed');
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().state.weeklyGoals.some((w) => w.weekKey === lastWeek), 'T24 precondition: last week loaded');
  await quiet(1500);

  const thisWeek = () => h.s().state.weeklyGoals.find((w) => w.weekKey === week);
  const weekRow = () => rows('weekly_goals').find((r) => r.id === week || JSON.stringify(r).includes(`"weekKey":"${week}"`));
  h.s().addWeeklyGoalItem(week, { title: 'HookGoal', priority: 'high' });
  const goal = () => thisWeek()?.goals.find((g) => g.title === 'HookGoal' || g.title === 'HookGoalEdited');
  await until(goal, 'T24: goal in this week');
  const goalId = goal()!.id;
  await until(() => JSON.stringify(weekRow() ?? '').includes(goalId), 'T24: goal reached the weekly_goals row', 5000);

  h.s().updateWeeklyGoalItem(week, goalId, { title: 'HookGoalEdited', completed: true });
  await until(() => goal()?.title === 'HookGoalEdited' && goal()?.completed === true, 'T24: goal edit in state');
  await until(() => JSON.stringify(weekRow() ?? '').includes('HookGoalEdited'), 'T24: goal edit reached the row', 5000);

  h.s().carryOverGoal(lastWeek, week, 'g-last');
  await until(() => thisWeek()?.goals.some((g) => g.carriedOverFromGoalId === 'g-last'), 'T24: last week goal carried over');

  h.s().syncLinkedWeeklyGoals();
  h.s().deleteWeeklyGoalItem(week, goalId);
  await until(() => !goal(), 'T24: goal gone from state');
  await until(() => !JSON.stringify(weekRow()?.data?.goals ?? []).includes(goalId), 'T24: goal gone from the row', 5000);
  const carried = thisWeek()?.goals.find((g) => g.carriedOverFromGoalId === 'g-last');
  assert(carried, 'T24: the carried-over goal stays');
  // Deleting a carried-over goal settles its source in last week (marked dismissed).
  h.s().deleteWeeklyGoalItem(week, carried.id);
  await until(() => h.s().state.weeklyGoals.find((w) => w.weekKey === lastWeek)?.goals.find((g) => g.id === 'g-last')?.carryOverDismissed === true, 'T24: last week source marked dismissed');
  pass('T24 weekly goal add, edit, carry-over and delete saved');
});
