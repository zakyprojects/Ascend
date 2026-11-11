// Hook test (real useAppState + in-process fake Supabase, see harness/): the prefrontal-cortex actions
// of a signed-in account (focus sessions, decisions, emotions). Written for C2 (moving them out of
// useAppState).
//   T22  a focus session with a skill reaches focus_logs and adds the linked skill practice log; its
//        text edit reads current state and saves; a decision is added, reflected, edited and deleted;
//        an emotion is logged, its note edited and deleted; deleting the focus session removes it.
import { bootHook, story, until, quiet, rows, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('pfc.hook (focus, decision, emotion actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);

  const skill = h.s().addSkill('HookSkill');
  await until(() => h.s().state.skills.some((s) => s.id === skill.id), 'T22 precondition: skill in state');
  const focusId = h.s().logFocusSession('HookFocus', 25, skill.id);
  const focus = () => h.s().state.focusLogs.find((f) => f.id === focusId);
  await until(focus, 'T22: focus session in state');
  await until(() => h.s().state.skillLogs.some((l) => l.skillId === skill.id), 'T22: linked skill practice log in state');
  await until(() => rows('focus_logs').some((r) => r.id === focusId), 'T22: focus session reached focus_logs', 5000);

  // updateFocusLogText checks the session in current state (get()) first.
  await h.s().updateFocusLogText(focusId, { taskName: 'HookFocusEdited', reflection: 'calm' });
  await until(() => focus()?.taskName === 'HookFocusEdited', 'T22: focus text edited in state');
  await until(() => rows('focus_logs').some((r) => r.id === focusId && JSON.stringify(r).includes('HookFocusEdited')), 'T22: focus edit reached the row', 5000);

  h.s().addDecision('HookDecision', 'because', 'better', '2026-12-01');
  const decision = () => h.s().state.decisionLogs.find((d) => d.title.startsWith('HookDecision'));
  await until(decision, 'T22: decision in state');
  const decisionId = decision()!.id;
  await until(() => rows('decision_logs').some((r) => r.id === decisionId), 'T22: decision reached decision_logs', 5000);
  h.s().reflectDecision(decisionId, 'it worked');
  await until(() => decision()?.isReflected === true, 'T22: decision reflected');
  await h.s().updateDecisionText(decisionId, { title: 'HookDecisionEdited', rationale: 'because', expectedOutcome: 'better', reflection: 'it worked' });
  await until(() => decision()?.title === 'HookDecisionEdited', 'T22: decision text edited');

  h.s().logEmotion('calm', 4, 'HookContext');
  const emotion = () => h.s().state.emotionLogs.find((e) => e.context.startsWith('HookContext') || e.context === 'HookNote');
  await until(emotion, 'T22: emotion in state');
  const emotionId = emotion()!.id;
  await until(() => rows('emotion_logs').some((r) => r.id === emotionId), 'T22: emotion reached emotion_logs', 5000);
  await h.s().updateEmotionNote(emotionId, 'HookNote');
  await until(() => emotion()?.context === 'HookNote', 'T22: emotion note edited');

  h.s().deleteEmotionLog(emotionId);
  h.s().deleteDecisionLog(decisionId);
  h.s().deleteFocusLog(focusId);
  await until(() => !emotion() && !decision() && !focus(), 'T22: emotion, decision and focus session gone from state');
  await until(() => !rows('emotion_logs').some((r) => r.id === emotionId) && !rows('decision_logs').some((r) => r.id === decisionId) && !rows('focus_logs').some((r) => r.id === focusId), 'T22: their rows deleted', 5000);
  assert((h.s().state.deletedEntityIds || []).includes(focusId), 'T22: deleted focus session has a tombstone');
  pass('T22 focus session + linked skill log, decision, emotion edits and deletes saved');
});
