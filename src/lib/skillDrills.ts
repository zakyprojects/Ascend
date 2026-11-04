import type { Skill, SkillDrill, SkillDrillCount, SkillSessionLog, WeeklyGoalItem } from '@/types';
import { nameTaken, sameName } from './uniqueNames';

/**
 * Drills: things inside a skill that are counted, not timed (Guitar → Scales, 50 reps; Zakria
 * 2026-11-04). A drill lives in its skill's doc; a practice log can carry counts per drill next to
 * its minutes. Minutes stay required and are the only thing that earns points; counts earn
 * nothing on their own. A weekly goal counts one drill through linkedMetricKey 'drill_count:<id>'
 * (linkedItemId = the skill), a field older app versions keep as it is.
 */

/** Most of one drill one log can hold. */
export const DRILL_COUNT_MAX = 9999;
/** Largest weekly target for a drill goal (same as every weekly goal target). */
export const DRILL_WEEKLY_TARGET_MAX = 100000;
export const DRILL_UNIT_DEFAULT = 'reps';
export const DRILL_UNIT_MAX_LENGTH = 16;
export const DRILL_NAME_MAX_LENGTH = 40;
/** A sanity cap on one skill's live drills. */
export const DRILLS_PER_SKILL_MAX = 20;

export const DRILL_METRIC_PREFIX = 'drill_count:';

/** The weekly goal metric key that counts one drill. */
export const drillMetricKey = (drillId: string): string => `${DRILL_METRIC_PREFIX}${drillId}`;

/** The drill a weekly goal metric key counts, or null when it is not a drill metric. */
export function parseDrillMetricKey(key: string | undefined | null): string | null {
  if (!key || !key.startsWith(DRILL_METRIC_PREFIX)) return null;
  const id = key.slice(DRILL_METRIC_PREFIX.length);
  return id ? id : null;
}

/** A count a log may hold: a whole number from 1 to DRILL_COUNT_MAX. */
export const isValidDrillCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= DRILL_COUNT_MAX;

/** The skill's drills that are not deleted, in the order they were added. */
export const liveDrills = (skill: Pick<Skill, 'drills'> | undefined | null): SkillDrill[] =>
  (skill?.drills || []).filter((d) => d && d.id && !d.deletedAt);

/** A drill of the skill by id, deleted ones included (old logs still show their name). */
export const findDrill = (skill: Pick<Skill, 'drills'> | undefined | null, drillId: string): SkillDrill | undefined =>
  (skill?.drills || []).find((d) => d && d.id === drillId);

/** The unit as saved: trimmed, inner spaces collapsed, cut to its length, "reps" when empty. */
export function normalizeDrillUnit(unit: string | undefined | null): string {
  const clean = (unit ?? '').trim().replace(/\s+/g, ' ').slice(0, DRILL_UNIT_MAX_LENGTH).trim();
  return clean || DRILL_UNIT_DEFAULT;
}

/** The name as saved: trimmed, inner spaces collapsed, cut to its length. */
export const normalizeDrillName = (name: string | undefined | null): string =>
  (name ?? '').trim().replace(/\s+/g, ' ').slice(0, DRILL_NAME_MAX_LENGTH).trim();

/**
 * Why a drill name can't be used in this skill, or null when it can. Names are unique among the
 * skill's live drills (a deleted drill's name is free again); `editingId` may keep its own name.
 */
export function drillNameProblem(name: string, skill: Pick<Skill, 'drills'>, editingId?: string): string | null {
  const clean = normalizeDrillName(name);
  if (!clean) return 'Fill in this field.';
  const live = liveDrills(skill);
  const editing = editingId ? live.find((d) => d.id === editingId) ?? null : null;
  if (nameTaken(clean, live, { editing })) return 'You already have a count with this name.';
  if (!editing && live.length >= DRILLS_PER_SKILL_MAX) return `A skill can have up to ${DRILLS_PER_SKILL_MAX} counts.`;
  return null;
}

/** How many of a drill one log did (0 when it has none, or only a count that is not valid). */
export function logDrillCount(log: Pick<SkillSessionLog, 'counts'>, drillId: string): number {
  const counts = Array.isArray(log.counts) ? log.counts : [];
  const hit = counts.find((c) => c && c.drillId === drillId && isValidDrillCount(c.count));
  return hit ? hit.count : 0;
}

/**
 * The counts a new log saves: rows for this skill's live drills only, each a valid count, one row
 * per drill. Returns a problem instead when a row breaks a rule (the form shows the same rules).
 */
export function cleanDrillCounts(
  rows: readonly { drillId: string; count: number | null | undefined }[],
  skill: Pick<Skill, 'drills'>
):
  | { counts: SkillDrillCount[]; problem?: undefined }
  | { counts?: undefined; problem: { index: number; field: 'drill' | 'count'; message: string } } {
  const liveIds = new Set(liveDrills(skill).map((d) => d.id));
  const seen = new Set<string>();
  const counts: SkillDrillCount[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row.drillId || !liveIds.has(row.drillId)) return { problem: { index, field: 'drill', message: 'Choose an option.' } };
    if (seen.has(row.drillId)) return { problem: { index, field: 'drill', message: 'This count is already in the list.' } };
    if (row.count === null || row.count === undefined || !isValidDrillCount(row.count)) {
      return { problem: { index, field: 'count', message: `Enter a whole number from 1 to ${DRILL_COUNT_MAX.toLocaleString('en-US')}.` } };
    }
    seen.add(row.drillId);
    counts.push({ drillId: row.drillId, count: row.count });
  }
  return { counts };
}

/** A drill's count over some logs of its skill (e.g. this week's logs). */
export const drillCountInLogs = (logs: readonly SkillSessionLog[], skillId: string, drillId: string): number =>
  logs.reduce((sum, l) => (l && l.skillId === skillId ? sum + logDrillCount(l, drillId) : sum), 0);

/** A drill's all-time count: its logs plus the counts of logs that were deleted or cleared. */
export function drillTotal(skill: Pick<Skill, 'id' | 'drills'>, logs: readonly SkillSessionLog[], drillId: string): number {
  const cleared = findDrill(skill, drillId)?.clearedCount;
  const kept = typeof cleared === 'number' && Number.isFinite(cleared) && cleared > 0 ? cleared : 0;
  return kept + drillCountInLogs(logs, skill.id, drillId);
}

/**
 * The skills after some earlier-day logs are deleted or cleared: each drill keeps the counts of
 * those logs in clearedCount (like clearedMinutes), so its total never drops. Skills whose drills
 * gain nothing come back unchanged (same object).
 */
export function foldClearedCounts(skills: readonly Skill[], removedLogs: readonly SkillSessionLog[], nowIso: string): Skill[] {
  const bySkill = new Map<string, Map<string, number>>();
  for (const l of removedLogs) {
    if (!l || !Array.isArray(l.counts)) continue;
    // Each drill once per log, read by the same rule as every total (logDrillCount).
    for (const drillId of new Set(l.counts.map((c) => c?.drillId).filter((id): id is string => Boolean(id)))) {
      const count = logDrillCount(l, drillId);
      if (count <= 0) continue;
      const perDrill = bySkill.get(l.skillId) ?? new Map<string, number>();
      perDrill.set(drillId, (perDrill.get(drillId) || 0) + count);
      bySkill.set(l.skillId, perDrill);
    }
  }
  if (bySkill.size === 0) return skills as Skill[];
  return skills.map((s) => {
    const perDrill = bySkill.get(s.id);
    if (!perDrill || !Array.isArray(s.drills)) return s;
    let changed = false;
    const drills = s.drills.map((d) => {
      const add = d ? perDrill.get(d.id) || 0 : 0;
      if (add <= 0) return d;
      changed = true;
      return { ...d, clearedCount: (d.clearedCount || 0) + add };
    });
    return changed ? { ...s, drills, updatedAt: nowIso } : s;
  });
}

/** "1,250 reps". */
export const formatDrillCount = (count: number, unit: string): string => `${count.toLocaleString('en-US')} ${unit}`;

/** Whether a weekly goal counts this drill of this skill. */
export const isDrillGoal = (
  goal: Pick<WeeklyGoalItem, 'linkedModule' | 'linkedItemId' | 'linkedMetricKey'>,
  skillId: string,
  drillId: string
): boolean => goal.linkedModule === 'skill' && goal.linkedItemId === skillId && parseDrillMetricKey(goal.linkedMetricKey) === drillId;

/**
 * The counts a log may keep, for a writer that can't show a problem: rows for the skill's live
 * drills with a valid count, the first row of each drill. Forms check with cleanDrillCounts first.
 */
export function keepValidDrillCounts(counts: readonly SkillDrillCount[] | undefined, skill: Pick<Skill, 'drills'>): SkillDrillCount[] {
  const liveIds = new Set(liveDrills(skill).map((d) => d.id));
  const seen = new Set<string>();
  const kept: SkillDrillCount[] = [];
  for (const c of counts || []) {
    if (!c || !liveIds.has(c.drillId) || seen.has(c.drillId) || !isValidDrillCount(c.count)) continue;
    seen.add(c.drillId);
    kept.push({ drillId: c.drillId, count: c.count });
  }
  return kept;
}

/** A drill the Log practice form creates as it saves, with the count of this log. */
export type NewLogDrill = { name: string; unit: string; count: number };

/**
 * One drill row of the Log practice form: an existing drill (drillId) or a new one (drillId null,
 * name + unit typed in the form). count null = left empty.
 */
export type LogDrillRow = { drillId: string | null; name?: string; unit?: string; count: number | null };

/**
 * What a log saves from the form's drill rows (Zakria 2026-11-04: drills are asked about while
 * logging practice): counts for existing drills and the new drills to create, each with its count.
 * An empty row (no count, and no name on a new one) is skipped, so a minutes-only log stays fine.
 * A new name follows the drill dialog's rules (drillNameProblem) against the skill's live drills
 * and the new rows above it. Returns the first problem instead, with its row and field.
 */
export function prepareLogDrills(
  rows: readonly LogDrillRow[],
  skill: Pick<Skill, 'drills'>
):
  | { counts: SkillDrillCount[]; newDrills: NewLogDrill[]; problem?: undefined }
  | { counts?: undefined; newDrills?: undefined; problem: { index: number; field: 'drill' | 'name' | 'count'; message: string } } {
  const liveIds = new Set(liveDrills(skill).map((d) => d.id));
  const seen = new Set<string>();
  const counts: SkillDrillCount[] = [];
  const newDrills: NewLogDrill[] = [];
  // The skill as it would be with the new rows above added, so names and the cap are checked in order.
  let grown: Pick<Skill, 'drills'> = { drills: liveDrills(skill) };
  const countProblem = (index: number) => ({
    problem: { index, field: 'count' as const, message: `Enter a whole number from 1 to ${DRILL_COUNT_MAX.toLocaleString('en-US')}.` },
  });
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const hasCount = row.count !== null && row.count !== undefined;
    if (row.drillId !== null) {
      if (!hasCount) continue;
      if (!row.drillId || !liveIds.has(row.drillId)) return { problem: { index, field: 'drill', message: 'Choose an option.' } };
      if (seen.has(row.drillId)) return { problem: { index, field: 'drill', message: 'This count is already in the list.' } };
      if (!isValidDrillCount(row.count)) return countProblem(index);
      seen.add(row.drillId);
      counts.push({ drillId: row.drillId, count: row.count });
      continue;
    }
    const name = normalizeDrillName(row.name);
    if (!name && !hasCount) continue;
    if (!name) return { problem: { index, field: 'name', message: 'Fill in this field.' } };
    if (newDrills.some((d) => sameName(d.name, name))) return { problem: { index, field: 'name', message: 'This count is already in the list.' } };
    const problem = drillNameProblem(name, grown);
    if (problem) return { problem: { index, field: 'name', message: problem } };
    if (!hasCount) return { problem: { index, field: 'count', message: 'Enter 1 or more.' } };
    if (!isValidDrillCount(row.count)) return countProblem(index);
    const unit = normalizeDrillUnit(row.unit);
    newDrills.push({ name, unit, count: row.count });
    grown = { drills: [...(grown.drills || []), { id: `new-${index}`, name, unit, createdAt: '' }] };
  }
  return { counts, newDrills };
}

/**
 * The skill with the log's new drills added (ids already made, so a repeated state update adds
 * the same drills), and the counts that go on the log. Each name is checked by the drill dialog's
 * rule against the skill as it grows; the first that can't be used comes back as a problem.
 */
export function addLogDrills<S extends Pick<Skill, 'drills'>>(
  skill: S,
  made: readonly { drill: SkillDrill; count: number }[],
  nowIso: string
): { skill: S; counts: SkillDrillCount[]; problem?: undefined } | { skill?: undefined; counts?: undefined; problem: string } {
  if (made.length === 0) return { skill, counts: [] };
  let drills = [...(skill.drills || [])];
  const counts: SkillDrillCount[] = [];
  for (const { drill, count } of made) {
    const problem = drillNameProblem(drill.name, { drills });
    if (problem) return { problem };
    drills = [...drills, drill];
    if (isValidDrillCount(count)) counts.push({ drillId: drill.id, count });
  }
  return { skill: { ...skill, drills, updatedAt: nowIso }, counts };
}
