import type { DecisionLog, EmotionLog, FocusSessionLog, SkillSessionLog } from '@/types';
import { withReflectionNote } from './focusSkillLog';

/**
 * Text edits on the Prefrontal Cortex logs (Zakria 2026-11-07): only words change. Minutes, times,
 * dates, plan length, skill tag, intensity and points stay exactly as they are, so no award moves
 * and no day guard on the server refuses the row (focus_logs pins log_date; skill_logs lets an
 * earlier day's note change while its day, skill, minutes and createdAt stay).
 * Each helper returns null when the log is gone or nothing changes.
 */

export const FOCUS_TASK_MAX = 120;
export const FOCUS_REFLECTION_MAX = 2000;
export const DECISION_TITLE_MAX = 150;
export const DECISION_RATIONALE_MAX = 2000;
export const DECISION_OUTCOME_MAX = 300;
export const DECISION_REFLECTION_MAX = 2000;
export const EMOTION_CONTEXT_MAX = 1000;

const clip = (text: string, max: number) => text.trim().slice(0, max);

/** Task name and reflection of a focus session. The linked skill log note follows the reflection. */
export function editFocusLogText(
  focusLogs: FocusSessionLog[],
  skillLogs: SkillSessionLog[],
  logId: string,
  changes: { taskName: string; reflection: string }
): { focusLogs: FocusSessionLog[]; skillLogs: SkillSessionLog[] } | null {
  const idx = focusLogs.findIndex((f) => f && f.id === logId);
  if (idx === -1) return null;
  const current = focusLogs[idx];
  const taskName = clip(changes.taskName, FOCUS_TASK_MAX) || current.taskName;
  const reflection = clip(changes.reflection, FOCUS_REFLECTION_MAX);
  const reflectionChanged = reflection !== (current.reflection || '').trim();
  if (taskName === current.taskName && !reflectionChanged) return null;

  const { reflection: _old, ...rest } = current;
  const updated: FocusSessionLog = { ...rest, taskName, ...(reflection ? { reflection } : {}) };
  const nextFocus = [...focusLogs];
  nextFocus[idx] = updated;
  const nextSkill = reflectionChanged ? withReflectionNote(skillLogs, logId, current.reflection, reflection) : skillLogs;
  return { focusLogs: nextFocus, skillLogs: nextSkill };
}

/** Title, why, expected outcome, and (once reflected) the reflection of a decision. */
export function editDecisionText(
  decisions: DecisionLog[],
  decisionId: string,
  changes: { title: string; rationale: string; expectedOutcome: string; reflection?: string }
): DecisionLog[] | null {
  const idx = decisions.findIndex((d) => d && d.id === decisionId);
  if (idx === -1) return null;
  const current = decisions[idx];
  const title = clip(changes.title, DECISION_TITLE_MAX) || current.title;
  const rationale = clip(changes.rationale, DECISION_RATIONALE_MAX) || current.rationale;
  const expectedOutcome = clip(changes.expectedOutcome, DECISION_OUTCOME_MAX);
  // The reflection is only edited once written: an empty one keeps what was there.
  const reflection =
    current.isReflected && changes.reflection !== undefined
      ? clip(changes.reflection, DECISION_REFLECTION_MAX) || current.reflection
      : current.reflection;
  if (
    title === current.title &&
    rationale === current.rationale &&
    expectedOutcome === (current.expectedOutcome || '') &&
    reflection === current.reflection
  ) {
    return null;
  }
  const updated: DecisionLog = { ...current, title, rationale, expectedOutcome, ...(reflection !== undefined ? { reflection } : {}) };
  const next = [...decisions];
  next[idx] = updated;
  return next;
}

/** The note ("What triggered it?") of an emotion entry. */
export function editEmotionNote(emotions: EmotionLog[], emotionId: string, context: string): EmotionLog[] | null {
  const idx = emotions.findIndex((e) => e && e.id === emotionId);
  if (idx === -1) return null;
  const current = emotions[idx];
  const nextContext = clip(context, EMOTION_CONTEXT_MAX);
  if (nextContext === (current.context || '')) return null;
  const next = [...emotions];
  next[idx] = { ...current, context: nextContext };
  return next;
}
