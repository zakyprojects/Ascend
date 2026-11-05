import type { FocusSessionLog, Skill, SkillSessionLog } from '@/types';
import { creditedFocusMinutes } from './focusAwards';

/**
 * A Deep Focus session with a skill chosen adds a normal skill practice log (Zakria 2026-11-05):
 * the same row the Skills page's Log practice writes, for that skill, with the session's credited
 * focus minutes, on the session's day, the reflection as its note. It earns skill points under the
 * normal skill rules and caps, counts everywhere a skill log counts, and is deleted on its own
 * (deleting it leaves the focus log, deleting the focus log leaves it).
 * Its id comes from the focus log id, so a second write (another device, a retry) is the same row.
 */
export const focusSkillLogId = (focusLogId: string): string => `skill_${focusLogId}`;

/** The skill log for a new focus log, or null (no skill, skill deleted, no minutes, already made or deleted). */
export function focusSkillLogFor(
  focusLog: FocusSessionLog,
  skills: readonly Skill[],
  skillLogs: readonly SkillSessionLog[],
  deletedIds: readonly string[]
): SkillSessionLog | null {
  if (!focusLog.skillId || !skills.some((s) => s && s.id === focusLog.skillId)) return null;
  const id = focusSkillLogId(focusLog.id);
  if (skillLogs.some((l) => l && l.id === id) || deletedIds.includes(id)) return null;
  // Credited minutes: the active minutes, never more than the plan or the wall time between start and end.
  const minutes = creditedFocusMinutes(focusLog) || Math.max(0, Math.floor(Number(focusLog.durationMinutes) || 0));
  if (minutes <= 0) return null;
  return {
    id,
    skillId: focusLog.skillId,
    date: focusLog.date,
    durationMinutes: minutes,
    note: (focusLog.reflection || '').trim(),
    pointsAwarded: 0,
    createdAt: focusLog.createdAt,
  };
}

/**
 * The reflection saved after Complete goes onto the session's skill log note, unless the note was
 * already changed to something else (then it is left as it is). Returns the same array when nothing changes.
 */
export function withReflectionNote(
  skillLogs: SkillSessionLog[],
  focusLogId: string,
  oldReflection: string | undefined,
  newReflection: string
): SkillSessionLog[] {
  const id = focusSkillLogId(focusLogId);
  const idx = skillLogs.findIndex((l) => l && l.id === id);
  if (idx === -1) return skillLogs;
  const current = (skillLogs[idx].note || '').trim();
  const next = newReflection.trim();
  if (current === next || (current !== '' && current !== (oldReflection || '').trim())) return skillLogs;
  const out = [...skillLogs];
  out[idx] = { ...skillLogs[idx], note: next };
  return out;
}
