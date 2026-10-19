import type { PointsEntry, Skill, SkillSessionLog } from '@/types';
import { SKILLS_POINTS, calculateSkillPoints } from './pointsConfig';
import { todayKey } from './dates';

/**
 * Skill practice points are written by the server (supabase/migrations/20261015150000_server_skill_awards.sql):
 * one row per local day, the day's sessions' points up to the daily cap. The app computes the same
 * row only to show it before the server's copy arrives; it never uploads it, and the server skips
 * any app write to it. Change both sides together.
 */

/** First local day whose skill points come from the server; older app-written rows stay. */
export const SKILL_AWARDS_SERVER_SINCE = '2026-10-15';

export const skillAwardId = (day: string) => `skill_award_${day}`;

const localDayOf = (timestamp: string): string | null => {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

/** A skill award the app wrote itself ("Skill practiced"), on the local day it was logged. */
const appWrittenAwardDay = (entry: PointsEntry): string | null =>
  !(entry.id || '').startsWith('skill_award_') && entry.source === 'skill' && entry.amount > 0
    ? localDayOf(entry.timestamp)
    : null;

/** The day's award row: the server's own, or one the app wrote for a day the server owns. */
export const isSkillDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.id === skillAwardId(day) || (day >= SKILL_AWARDS_SERVER_SINCE && appWrittenAwardDay(entry) === day);

/** An app-written skill award for a day the server owns: the server retired every such row. */
export const isRetiredAppSkillAward = (entry: PointsEntry): boolean => {
  const day = appWrittenAwardDay(entry);
  return day !== null && day >= SKILL_AWARDS_SERVER_SINCE;
};

const timeOf = (value: string): number => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Infinity : ms;
};

/** Mirror of ascend_skill_session_points: only a numeric duration counts. */
const sessionMinutes = (log: SkillSessionLog): number =>
  typeof log.durationMinutes === 'number' && Number.isFinite(log.durationMinutes) ? log.durationMinutes : 0;

/**
 * Mirror of ascend_recompute_skill_awards: the award entry of one local day (null when the day
 * earns nothing), and each counted session's share of the cap in log order (shown on the session).
 * Sessions of a skill that no longer exists count for nothing.
 * The row's time follows the server: a day whose row already exists (existing, the live ledger row)
 * keeps that row's time and only the amount changes; a new row is stamped at the day's first
 * earning log, clamped to [dayStartMs, nowMs].
 */
export function computeSkillAwards(
  logs: SkillSessionLog[],
  skills: Skill[],
  day: string,
  dayStartMs: number,
  nowMs: number,
  existing?: PointsEntry | null
): { entry: PointsEntry | null; sessionPoints: Map<string, number> } {
  const skillIds = new Set(skills.filter(Boolean).map((s) => s.id));
  const daySessions = logs
    .filter((l) => l && l.date === day && skillIds.has(l.skillId))
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const sessionPoints = new Map<string, number>();
  let used = 0;
  let firstMs: number | null = null;
  for (const l of daySessions) {
    const { pointsToAward } = calculateSkillPoints(sessionMinutes(l), SKILLS_POINTS.dailyCap - used);
    sessionPoints.set(l.id, pointsToAward);
    used += pointsToAward;
    if (firstMs === null && used > 0) firstMs = timeOf(l.createdAt);
  }
  if (used <= 0) return { entry: null, sessionPoints };

  const at = Math.min(Math.max(firstMs !== null && Number.isFinite(firstMs) ? firstMs : nowMs, dayStartMs), nowMs);
  const id = skillAwardId(day);
  return {
    entry: {
      id,
      amount: used,
      reason: `Skill practice (${daySessions.length})`,
      source: 'skill',
      timestamp: existing && existing.id === id ? existing.timestamp : new Date(at).toISOString(),
      metadata: { date: day, sessions: daySessions.length },
    },
    sessionPoints,
  };
}
