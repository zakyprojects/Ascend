import type { RankCelebrated } from '@/types';
import { TIERS } from './tiers';

/*
 * Rank-up memory (settings doc `rankCelebrated`): the highest rank already celebrated in a season.
 * Each rank celebrates at most once per season; a drop and re-climb never repeats it, and a new
 * season starts again from Beginner. Missing memory (accounts from before the celebration, new
 * accounts) is filled with the current rank silently.
 */

function isValid(memory: RankCelebrated | null | undefined): memory is RankCelebrated {
  return (
    !!memory &&
    Number.isInteger(memory.season) &&
    Number.isInteger(memory.tierIndex) &&
    memory.tierIndex >= 0 &&
    memory.tierIndex < TIERS.length
  );
}

/** Two devices converge: the newer season wins, within a season the higher rank. */
export function mergeRankCelebrated(
  base: RankCelebrated | null | undefined,
  incoming: RankCelebrated | null | undefined
): RankCelebrated | null {
  if (!isValid(base)) return isValid(incoming) ? incoming : null;
  if (!isValid(incoming)) return base;
  if (incoming.season !== base.season) return incoming.season > base.season ? incoming : base;
  return incoming.tierIndex > base.tierIndex ? incoming : base;
}

export type RankUpDecision =
  | { kind: 'none' }
  /** Store `memory` without showing anything. */
  | { kind: 'baseline'; memory: RankCelebrated }
  /** Show the climb `from` -> `to`, then store `memory`. */
  | { kind: 'celebrate'; from: number; to: number; memory: RankCelebrated };

export function decideRankUp(stored: RankCelebrated | null | undefined, season: number, tierIndex: number): RankUpDecision {
  const memory = { season, tierIndex };
  if (!isValid(stored)) return { kind: 'baseline', memory };
  // Memory from a later season (another device's clock): leave it, never celebrate against it.
  if (stored.season > season) return { kind: 'none' };
  // A new season counts from Beginner; the reset to Beginner itself shows nothing.
  const celebrated = stored.season === season ? stored.tierIndex : 0;
  if (tierIndex > celebrated) return { kind: 'celebrate', from: celebrated, to: tierIndex, memory };
  return stored.season === season ? { kind: 'none' } : { kind: 'baseline', memory: { season, tierIndex: 0 } };
}
