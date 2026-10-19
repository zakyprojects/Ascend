import type { JournalEntry, PointsEntry } from '@/types';
import { JOURNAL_POINTS } from './pointsConfig';
import { todayKey } from './dates';

/**
 * Journal points are written by the server (supabase/migrations/20261015190000_server_journal_awards.sql):
 * one row per local day, +2 while that day has an entry with content. Only today is recomputed,
 * so an earlier day's points stay when its entry is deleted. The app computes the same row only
 * to show it before the server's copy arrives; it never uploads it, and the server skips any
 * app write to it. Change both sides together.
 */

/** First local day whose journal points come from the server; older app-written rows stay. */
export const JOURNAL_AWARDS_SERVER_SINCE = '2026-10-15';

export const journalAwardId = (day: string) => `journal_award_${day}`;

/** Point entry ids only the server writes. */
export const isServerOwnedJournalPointId = (id: string): boolean => id.startsWith('journal_award_');

const localDayOf = (timestamp: string): string | null => {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

/** A journal row the app wrote itself (award or deduction), on the local day it was written. */
const appWrittenRowDay = (entry: PointsEntry): string | null =>
  !isServerOwnedJournalPointId(entry.id || '') && entry.source === 'journal' ? localDayOf(entry.timestamp) : null;

/** The day's award row: the server's own, or one the app wrote on a day the server owns. */
export const isJournalDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.id === journalAwardId(day) || (day >= JOURNAL_AWARDS_SERVER_SINCE && appWrittenRowDay(entry) === day);

/** An app-written journal row on a day the server owns: the server retired every such row. */
export const isRetiredAppJournalAward = (entry: PointsEntry): boolean => {
  const day = appWrittenRowDay(entry);
  return day !== null && day >= JOURNAL_AWARDS_SERVER_SINCE;
};

/** Mirror of the server's content check: anything but whitespace counts. */
export const journalEntryEarns = (entry: JournalEntry): boolean => (entry.content ?? '').trim().length > 0;

/**
 * Mirror of ascend_recompute_journal_awards: the award entry of one local day, or null when the
 * day has no entry with content. The row's time follows the server: an existing row (existing, the
 * live ledger row) keeps its time; a new row is stamped at the day's first entry with content,
 * clamped to [dayStartMs, nowMs].
 */
export function computeJournalAward(
  entries: JournalEntry[],
  day: string,
  dayStartMs: number,
  nowMs: number,
  existing?: PointsEntry | null
): PointsEntry | null {
  let firstMs = Infinity;
  let found = false;
  for (const e of entries) {
    if (!e || e.date !== day || !journalEntryEarns(e)) continue;
    found = true;
    const ms = new Date(e.createdAt).getTime();
    if (!Number.isNaN(ms)) firstMs = Math.min(firstMs, ms);
  }
  if (!found) return null;

  const at = Math.min(Math.max(Number.isFinite(firstMs) ? firstMs : nowMs, dayStartMs), nowMs);
  const id = journalAwardId(day);
  return {
    id,
    amount: JOURNAL_POINTS.entryCompleted,
    reason: 'Journal entry completed',
    source: 'journal',
    timestamp: existing && existing.id === id ? existing.timestamp : new Date(at).toISOString(),
    metadata: { date: day },
  };
}
