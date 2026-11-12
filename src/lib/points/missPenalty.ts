/**
 * Mirror of ascend_miss_multiplier: how much a missed library habit, a slip or an unlogged bad-habit
 * day costs, by how many bad periods in a row it ends (this one included) and the season points.
 * On its own (no imports) so the public feature pages can show the same numbers
 * (src/marketing); habitPenalties.ts re-exports it for the app.
 */
export function getMissPenaltyMultiplier(consecutiveMisses: number, seasonPoints: number = 0): number {
  const isPerformerOrAbove = seasonPoints >= 2000;

  if (!isPerformerOrAbove) {
    if (consecutiveMisses <= 1) return 1.0;
    return 1.5;
  } else {
    if (consecutiveMisses <= 1) return 1.0;
    if (consecutiveMisses === 2) return 2.0;
    return 2.5;
  }
}
