import type { AppState } from '@/types';

/**
 * Keys older app versions wrote into the saved state that no code reads any more
 * (the pre-season eviction counters, partner notifications before their table, the
 * old reading goal, the per-entity unsynced list the dirty flag replaced). Dropped
 * on load and kept out of the blob save, so they leave the blob at its next save
 * instead of riding along forever.
 */
const RETIRED_STATE_KEYS = [
  'partnerNotifications',
  'readingGoal',
  'excisedEntryIds',
  'evictedPos',
  'evictedNeg',
  'evictedPointsOffset',
  'evictedExcisedPos',
  'evictedExcisedNeg',
  'seasonExcisedPosOffset',
  'seasonExcisedNegOffset',
  'unsyncedEntityIds',
] as const;

export function withoutRetiredKeys<T extends Partial<AppState>>(state: T): T {
  if (!RETIRED_STATE_KEYS.some((key) => key in state)) return state;
  const copy: Record<string, unknown> = { ...state };
  for (const key of RETIRED_STATE_KEYS) delete copy[key];
  return copy as T;
}
