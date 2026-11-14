// Fixtures for the Prefrontal Cortex text edits (Zakria 2026-11-07): only words change on a focus
// session, a decision or an emotion entry. Minutes, dates, times, plan, skill tag, intensity and
// points stay, and the linked skill log note follows a focus reflection edit.
import type { DecisionLog, EmotionLog, FocusSessionLog, SkillSessionLog } from '@/types';
import { editDecisionText, editEmotionNote, editFocusLogText, FOCUS_TASK_MAX } from '../focus/pfcLogEdits';
import { focusSkillLogId } from '../focus/focusSkillLog';
import { computeFocusAwards } from '../points/focusAwards';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const DAY = '2026-11-05';
const focus = (extra: Partial<FocusSessionLog> = {}): FocusSessionLog => ({
  id: 'f1',
  date: DAY,
  taskName: 'Deep Work',
  skillId: 'g',
  durationMinutes: 50,
  pointsAwarded: 4,
  reflection: 'Went well',
  createdAt: '2026-11-05T10:00:00.000Z',
  plannedMinutes: 50,
  startedAt: '2026-11-05T09:10:00.000Z',
  milestonesAt: ['2026-11-05T09:35:00.000Z', '2026-11-05T09:45:00.000Z'],
  ...extra,
});
const skillLog = (note: string): SkillSessionLog => ({
  id: focusSkillLogId('f1'),
  skillId: 'g',
  date: DAY,
  durationMinutes: 50,
  note,
  pointsAwarded: 3,
  createdAt: '2026-11-05T10:00:00.000Z',
});
const other: SkillSessionLog = { ...skillLog('other'), id: 'other' };

// --- Focus: task name + reflection, nothing else -------------------------------------------------
{
  const logs = [focus(), focus({ id: 'f2', taskName: 'Reading' })];
  const skills = [skillLog('Went well'), other];
  const out = editFocusLogText(logs, skills, 'f1', { taskName: '  Thesis chapter 2 ', reflection: ' Got 3 pages done ' });
  assert(out !== null, 'edit applied');
  const f = out!.focusLogs[0];
  assert(f.taskName === 'Thesis chapter 2' && f.reflection === 'Got 3 pages done', 'text trimmed and saved');
  const { taskName: _a, reflection: _b, ...restNew } = f;
  const { taskName: _c, reflection: _d, ...restOld } = logs[0];
  assert(JSON.stringify(restNew) === JSON.stringify(restOld), 'every other field (minutes, date, plan, skill, times, points) unchanged');
  assert(out!.focusLogs[1] === logs[1], 'other session untouched (same object)');
  const s = out!.skillLogs.find((l) => l.id === focusSkillLogId('f1'))!;
  assert(s.note === 'Got 3 pages done', 'linked skill log note follows the reflection');
  const { note: _e, ...sNew } = s;
  const { note: _f, ...sOld } = skills[0];
  assert(JSON.stringify(sNew) === JSON.stringify(sOld), 'skill log keeps date, skill, minutes, createdAt (server guard passes any day)');
  assert(out!.skillLogs[1] === other, 'unrelated skill log untouched');

  // Same award before and after (points never move from a text edit).
  const dayStart = new Date(`${DAY}T00:00:00`).getTime();
  const nowMs = dayStart + 22 * 3600_000;
  const before = computeFocusAwards(logs, DAY, dayStart, nowMs).entry?.amount ?? 0;
  const after = computeFocusAwards(out!.focusLogs, DAY, dayStart, nowMs).entry?.amount ?? 0;
  assert(before === after, `focus award unchanged (${before} = ${after})`);
}
{
  // Task name only: skill logs are the same array.
  const skills = [skillLog('Went well')];
  const out = editFocusLogText([focus()], skills, 'f1', { taskName: 'New name', reflection: 'Went well' });
  assert(out !== null && out.skillLogs === skills, 'task-name-only edit leaves skill logs as they are');
}
{
  // A skill note the user changed on the Skills page stays as it is.
  const skills = [skillLog('My own note')];
  const out = editFocusLogText([focus()], skills, 'f1', { taskName: 'Deep Work', reflection: 'Changed' });
  assert(out !== null && out.skillLogs === skills, 'edited skill note is kept');
}
{
  // Clearing the reflection removes it; the skill note that matched it clears too.
  const out = editFocusLogText([focus()], [skillLog('Went well')], 'f1', { taskName: 'Deep Work', reflection: '   ' });
  assert(out !== null && !('reflection' in out.focusLogs[0]), 'empty reflection removed');
  assert(out!.skillLogs[0].note === '', 'matching skill note cleared');
}
{
  // Empty task name keeps the old one; nothing changed = null; unknown id = null; long name clipped.
  assert(editFocusLogText([focus()], [], 'f1', { taskName: '  ', reflection: 'Went well' }) === null, 'empty name + same note = no change');
  assert(editFocusLogText([focus()], [], 'nope', { taskName: 'x', reflection: '' }) === null, 'deleted session = null');
  const long = editFocusLogText([focus()], [], 'f1', { taskName: 'a'.repeat(300), reflection: 'Went well' });
  assert(long!.focusLogs[0].taskName.length === FOCUS_TASK_MAX, 'task name clipped');
  // A session without a skill log edits fine.
  const noSkill = editFocusLogText([focus({ skillId: undefined })], [], 'f1', { taskName: 'Deep Work', reflection: 'x' });
  assert(noSkill !== null && noSkill.skillLogs.length === 0, 'no skill log needed');
}

// --- Decisions: words only, revisit day and reflected state stay ----------------------------------
const decision = (extra: Partial<DecisionLog> = {}): DecisionLog => ({
  id: 'd1',
  title: 'Switch framework',
  rationale: 'Faster builds',
  expectedOutcome: 'Ship sooner',
  revisitDate: '2026-11-20',
  isReflected: false,
  createdAt: '2026-11-01T08:00:00.000Z',
  ...extra,
});
{
  const out = editDecisionText([decision()], 'd1', { title: ' Move to Vite ', rationale: 'Builds', expectedOutcome: '', reflection: 'ignored' });
  const d = out![0];
  assert(d.title === 'Move to Vite' && d.rationale === 'Builds' && d.expectedOutcome === '', 'words saved, outcome may be cleared');
  assert(d.revisitDate === '2026-11-20' && d.isReflected === false && d.createdAt === '2026-11-01T08:00:00.000Z', 'dates and state stay');
  assert(d.reflection === undefined, 'no reflection added before reflecting');
  assert(editDecisionText([decision()], 'd1', { title: '', rationale: '', expectedOutcome: 'Ship sooner' }) === null, 'empty required = keep = no change');
  const reflected = editDecisionText([decision({ isReflected: true, reflection: 'It worked' })], 'd1', {
    title: 'Switch framework',
    rationale: 'Faster builds',
    expectedOutcome: 'Ship sooner',
    reflection: 'It mostly worked',
  });
  assert(reflected![0].reflection === 'It mostly worked' && reflected![0].isReflected, 'reflection edited once reflected');
  const blank = editDecisionText([decision({ isReflected: true, reflection: 'It worked' })], 'd1', {
    title: 'Switch framework',
    rationale: 'Faster builds',
    expectedOutcome: 'Ship sooner',
    reflection: ' ',
  });
  assert(blank === null, 'blank reflection keeps the old one');
  assert(editDecisionText([decision()], 'x', { title: 'a', rationale: 'b', expectedOutcome: '' }) === null, 'deleted decision = null');
}

// --- Emotions: note only ---------------------------------------------------------------------------
{
  const e: EmotionLog = {
    id: 'e1',
    date: '2026-11-03T12:00:00.000Z',
    emotion: 'Anxiety',
    intensity: 7,
    context: 'Exam',
    pointsAwarded: 0,
    createdAt: '2026-11-03T12:00:00.000Z',
  };
  const out = editEmotionNote([e], 'e1', ' Exam tomorrow ');
  assert(out![0].context === 'Exam tomorrow', 'note saved');
  assert(
    out![0].emotion === 'Anxiety' && out![0].intensity === 7 && out![0].date === e.date && out![0].createdAt === e.createdAt && out![0].pointsAwarded === 0,
    'emotion, intensity, time and points stay'
  );
  assert(editEmotionNote([e], 'e1', 'Exam') === null, 'same note = no change');
  assert(editEmotionNote([e], 'e1', '')![0].context === '', 'note can be cleared');
  assert(editEmotionNote([e], 'zz', 'x') === null, 'deleted entry = null');
}

console.log('pfcLogEdits fixtures: all passed');
