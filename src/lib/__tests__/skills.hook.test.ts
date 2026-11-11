// Hook test (real useAppState + in-process fake Supabase, see harness/): the skill actions of a
// signed-in account. Written for C2 (moving them out of useAppState).
//   T23  a new skill reaches skills; a practice log reaches skill_logs; a rename and a log edit read
//        current state and save; a log delete removes the row; deleting the skill removes it and the
//        weekly goal linked to it.
import { bootHook, story, until, quiet, rows, assert, pass, server, UID } from './harness/bootHook';
import { getNow, weekKey } from '../dates';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('skills.hook (skill actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);
  const today = (await import('../dates')).todayKey();
  const week = weekKey(getNow());

  const skill = h.s().addSkill('HookSkill');
  const mine = () => h.s().state.skills.find((s) => s.id === skill.id);
  await until(mine, 'T23: skill in state');
  await until(() => rows('skills').some((r) => r.id === skill.id), 'T23: skill reached skills', 5000);

  h.s().addWeeklyGoalItem(week, { title: 'HookSkillGoal', priority: 'medium', linkedModule: 'skill', linkedItemId: skill.id, linkedMetricKey: 'minutes_practiced', targetValue: 600 });
  const goal = () => h.s().state.weeklyGoals.find((w) => w.weekKey === week)?.goals.find((g) => g.title === 'HookSkillGoal');
  await until(goal, 'T23 precondition: linked weekly goal in state');

  h.s().logSkillPractice(skill.id, 40, 'HookNote');
  const log = () => h.s().state.skillLogs.find((l) => l.skillId === skill.id && l.date === today);
  await until(log, 'T23: practice log in state');
  const logId = log()!.id;
  await until(() => rows('skill_logs').some((r) => r.id === logId), 'T23: practice log reached skill_logs', 5000);

  await h.s().updateSkill(skill.id, { name: 'HookSkillRenamed', category: '' });
  await until(() => mine()?.name === 'HookSkillRenamed', 'T23: skill renamed in state');
  await h.s().updateSkillLog(logId, { durationMinutes: 50, note: 'HookNoteEdited' });
  await until(() => log()?.note === 'HookNoteEdited' && log()?.durationMinutes === 50, 'T23: practice log edited in state');
  await until(() => rows('skill_logs').some((r) => r.id === logId && JSON.stringify(r).includes('HookNoteEdited')), 'T23: log edit reached the row', 5000);

  h.s().deleteSkillLog(logId);
  await until(() => !log(), 'T23: practice log gone from state');
  await until(() => !rows('skill_logs').some((r) => r.id === logId), 'T23: practice log row deleted', 5000);

  h.s().deleteSkill(skill.id);
  await until(() => !mine(), 'T23: skill gone from state');
  await until(() => !goal(), 'T23: linked weekly goal removed with the skill');
  assert((h.s().state.deletedEntityIds || []).includes(skill.id), 'T23: deleted skill has a tombstone');
  await until(() => !rows('skills').some((r) => r.id === skill.id), 'T23: skill row deleted', 5000);
  pass('T23 skill add, practice log, rename, log edit, deletes and linked goal saved');
});
