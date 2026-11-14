import { getMissPenaltyMultiplier } from '@/lib/points/missPenalty';
import { TIERS } from '@/lib/leagues/tiers';

/** Miss / slip multipliers for the guides (lib/missPenalty.ts), with the rank where they grow. */
const performer = TIERS.find((t) => t.name === 'Performer') ?? TIERS[0];
export const missRule = {
  rank: performer.name,
  /** Every further bad day in a row below that rank. */
  again: getMissPenaltyMultiplier(2, 0),
  /** From that rank: the 2nd bad day in a row, and the 3rd on. */
  second: getMissPenaltyMultiplier(2, performer.minPoints),
  third: getMissPenaltyMultiplier(3, performer.minPoints),
};
