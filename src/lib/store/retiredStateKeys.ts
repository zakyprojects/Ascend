import type { AppState } from '@/types';

/**
 * Keys older app versions wrote into the saved state that no code reads any more
 * (the eviction counters and ledgers of the retired 500-entry cap, partner notifications before their table, the
 * old reading goal, the weekly exercise goal removed 2026-10-17, the per-entity unsynced list the dirty flag replaced). Dropped
 * on load and kept out of the blob save, so they leave the blob at its next save
 * instead of riding along forever.
 */
const RETIRED_STATE_KEYS = [
  'partnerNotifications',
  'readingGoal',
  'exerciseGoal',
  'excisedEntryIds',
  'evictedPos',
  'evictedNeg',
  'evictedPointsOffset',
  'evictedExcisedPos',
  'evictedExcisedNeg',
  'seasonExcisedPosOffset',
  'seasonExcisedNegOffset',
  'unsyncedEntityIds',
  'seasonEvictedPos',
  'seasonEvictedNeg',
  'evictedExcisionRecords',
  'evictedEntryIds',
] as const;

export function withoutRetiredKeys<T extends Partial<AppState>>(state: T): T {
  if (!RETIRED_STATE_KEYS.some((key) => key in state)) return state;
  const copy: Record<string, unknown> = { ...state };
  for (const key of RETIRED_STATE_KEYS) delete copy[key];
  return copy as T;
}

/**
 * Keys the app still has in memory but never saves to the blob: season and total points are
 * derived from the points ledger on every load, and `books` is always empty after its old
 * entries are absorbed into libraryBooks on load (older blobs can still carry some, so these
 * keys are not dropped on load). Older blobs lose them at their next save.
 */
const UNSAVED_BLOB_KEYS = ['books', 'totalPoints', 'seasonPoints'] as const;

export function withoutUnsavedBlobKeys<T extends Partial<AppState>>(state: T): T {
  if (!UNSAVED_BLOB_KEYS.some((key) => key in state)) return state;
  const copy: Record<string, unknown> = { ...state };
  for (const key of UNSAVED_BLOB_KEYS) delete copy[key];
  return copy as T;
}
