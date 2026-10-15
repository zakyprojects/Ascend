import type { AddictionTracker, PointsEntry } from '@/types';
import { SOBRIETY_MILESTONE_POINTS } from './pointsConfig';
import { getSeasonNumber, getSeasonStart } from './leagueTime';

/**
 * Sobriety milestone points are written by the server
 * (supabase/migrations/20261015240000_server_recovery_awards.sql), from the live tracker's own
 * streak start, on every tracker write and by an hourly job:
 *   * 1 week and 90 days earn once per season, 1 month once per streak.
 *   * A milestone is dated when it was reached (a season's re-earn: the season's start).
 *   * When the streak ends (relapse or tracker deleted), this season's awards of every other
 *     streak are taken back (recovery_revoke_<awardId>); earlier seasons stay as they are.
 *   * Milestones reached before RECOVERY_AWARDS_SERVER_SINCE are not backfilled.
 * The app computes the same rows only to show them before the server's copies arrive; it never
 * uploads them. Change both sides together.
 */

export const RECOVERY_AWARDS_SERVER_SINCE = '2026-10-15T00:00:00.000Z';

export const RECOVERY_MILESTONES = [
  { key: '1w', hours: 168, label: '1 Week Clean', reason: 'Sobriety Milestone: 1 Week Clean! 🏅' },
  { key: '1m', hours: 720, label: '1 Month Clean', reason: 'Sobriety Milestone: 1 Month Clean! 🏆' },
  { key: '90d', hours: 2160, label: '90 Days Clean', reason: 'Sobriety Milestone: 90 Days Clean! 👑' },
] as const;

export type RecoveryMilestoneKey = (typeof RECOVERY_MILESTONES)[number]['key'];

const AWARD_ID = /^recovery_([A-Za-z0-9]+)_(1w|1m|90d)_([0-9]+)(?:_s[0-9]+)?$/;
const REVOKE_PREFIX = 'recovery_revoke_';

/** Point entry ids only the server writes (awards and take-backs). */
export const isServerOwnedRecoveryPointId = (id: string): boolean => id.startsWith('recovery_');

/** 1 month is once per streak; 1 week and 90 days once per season (season 1 ids carry no suffix). */
export const recoveryAwardId = (trackerId: string, key: RecoveryMilestoneKey, startMs: number, season: number) =>
  `recovery_${trackerId}_${key}_${startMs}${key !== '1m' && season > 1 ? `_s${season}` : ''}`;

const isoOf = (ms: number) => new Date(ms).toISOString();

const timeOf = (timestamp: string | undefined): number => {
  const ms = new Date(timestamp || '').getTime();
  return Number.isNaN(ms) ? NaN : ms;
};

/** The tracker's streak start in epoch ms, or null when it does not parse. */
export const trackerStartMs = (tracker: AddictionTracker | null | undefined): number | null => {
  const ms = timeOf(tracker?.startDate);
  return Number.isNaN(ms) ? null : ms;
};

interface ParsedAward {
  entry: PointsEntry;
  trackerId: string;
  key: RecoveryMilestoneKey;
  startMs: string;
}

const parseAward = (entry: PointsEntry): ParsedAward | null => {
  const m = AWARD_ID.exec(entry.id || '');
  if (!m || !(entry.amount > 0)) return null;
  return { entry, trackerId: m[1], key: m[2] as RecoveryMilestoneKey, startMs: m[3] };
};

/** The tracker was deleted the old way: one app-written deduction row for the whole tracker. */
const hasLegacyTrackerDeduction = (history: PointsEntry[], trackerId: string) =>
  history.some(
    (e) =>
      e.source === 'addiction_recovery' &&
      !(e.id || '').startsWith(REVOKE_PREFIX) &&
      (e.metadata as { trackerId?: string } | undefined)?.trackerId === trackerId
  );

/**
 * Mirror of ascend_recompute_recovery_awards: the award and take-back rows the server would add
 * now for this tracker (null when there is none) and these points. Rows already present are skipped.
 */
export function computeRecoveryChanges(
  tracker: AddictionTracker | null | undefined,
  history: PointsEntry[],
  nowMs: number
): PointsEntry[] {
  const now = new Date(nowMs);
  const season = getSeasonNumber(now);
  const seasonStartMs = getSeasonStart(now).getTime();
  const sinceMs = timeOf(RECOVERY_AWARDS_SERVER_SINCE);
  const ids = new Set(history.map((e) => e.id));
  const changes: PointsEntry[] = [];

  const startMs = tracker?.id ? trackerStartMs(tracker) : null;
  if (tracker?.id && startMs !== null) {
    for (const m of RECOVERY_MILESTONES) {
      const reachedMs = startMs + m.hours * 3600000;
      if (reachedMs > nowMs) continue;
      if (m.key === '1m' && reachedMs < seasonStartMs) continue;
      const atMs = m.key === '1m' ? reachedMs : Math.max(reachedMs, seasonStartMs);
      if (atMs < sinceMs) continue;
      const id = recoveryAwardId(tracker.id, m.key, startMs, season);
      if (ids.has(id)) continue;
      changes.push({
        id,
        amount: SOBRIETY_MILESTONE_POINTS[m.key],
        reason: m.reason,
        source: 'recovery_milestone',
        timestamp: isoOf(atMs),
        metadata: { trackerId: tracker.id, milestone: m.key, seasonNumber: season, streakStart: isoOf(startMs) },
      });
    }
  }

  for (const entry of history) {
    const award = parseAward(entry);
    if (!award) continue;
    const atMs = timeOf(entry.timestamp);
    if (Number.isNaN(atMs) || atMs < seasonStartMs) continue;
    if (tracker?.id && award.trackerId === tracker.id && startMs !== null && award.startMs === String(startMs)) continue;
    const revokeId = `${REVOKE_PREFIX}${entry.id}`;
    if (ids.has(revokeId) || hasLegacyTrackerDeduction(history, award.trackerId)) continue;
    const label = RECOVERY_MILESTONES.find((m) => m.key === award.key)!.label;
    changes.push({
      id: revokeId,
      amount: -entry.amount,
      reason: `Sobriety milestone taken back: ${label}`,
      source: 'addiction_recovery',
      timestamp: isoOf(nowMs),
      metadata: { trackerId: award.trackerId, milestone: award.key, seasonNumber: season, revokedAwardId: entry.id },
    });
  }

  return changes;
}

/** The tracker's milestones that hold points this season (awarded and not taken back), with their points. */
export function recoveryAwardsThisSeason(
  history: PointsEntry[],
  trackerId: string | undefined,
  nowMs: number
): Map<RecoveryMilestoneKey, number> {
  const held = new Map<RecoveryMilestoneKey, number>();
  if (!trackerId) return held;
  const seasonStartMs = getSeasonStart(new Date(nowMs)).getTime();
  const ids = new Set(history.map((e) => e.id));
  for (const entry of history) {
    const award = parseAward(entry);
    if (!award || award.trackerId !== trackerId) continue;
    const atMs = timeOf(entry.timestamp);
    if (Number.isNaN(atMs) || atMs < seasonStartMs || ids.has(`${REVOKE_PREFIX}${entry.id}`)) continue;
    held.set(award.key, (held.get(award.key) || 0) + entry.amount);
  }
  return held;
}
