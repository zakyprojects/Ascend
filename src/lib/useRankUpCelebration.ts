import { useEffect, useState } from 'react';
import type { AppStore } from './store';
import { decideRankUp } from './rankCelebration';
import { getTierIndex } from './tiers';
import { getSeasonNumber, leagueNow } from './leagueTime';

/** After the boot loader has left (OVERLAY_EXIT_MS) and a tick's own sound has played. */
const SHOW_DELAY_MS = 900;

/**
 * Decides when the rank-up overlay shows (memory rules in lib/rankCelebration). Only once the
 * signed-in account's server data is applied (`isServerDataApplied`), never on a device cache, so
 * a stale cache cannot fake a climb; a rank reached while the app was closed shows on the next
 * open. The memory is saved before the overlay opens, so a reload or another device never repeats it.
 */
export function useRankUpCelebration(store: AppStore, seasonPoints: number) {
  const ready = store.isServerDataApplied && !store.isSessionLoading && Boolean(store.state.currentUser);
  const season = getSeasonNumber(leagueNow());
  const tierIndex = getTierIndex(seasonPoints);
  const stored = store.state.rankCelebrated;
  const storedSeason = stored?.season;
  const storedTier = stored?.tierIndex;
  const { setRankCelebrated } = store;

  const [queued, setQueued] = useState<{ from: number; to: number } | null>(null);
  const [open, setOpen] = useState(false);

  // Signed out or switching accounts: drop anything pending for the previous account.
  if (!ready && (queued || open)) {
    setQueued(null);
    setOpen(false);
  }

  useEffect(() => {
    // One at a time: a further climb during the show is decided again after Continue.
    if (!ready || queued) return;
    const memory = storedSeason === undefined || storedTier === undefined ? null : { season: storedSeason, tierIndex: storedTier };
    const decision = decideRankUp(memory, season, tierIndex);
    if (decision.kind === 'none') return;
    setRankCelebrated(decision.memory);
    if (decision.kind === 'celebrate') setQueued({ from: decision.from, to: decision.to });
  }, [ready, queued, storedSeason, storedTier, season, tierIndex, setRankCelebrated]);

  useEffect(() => {
    if (!queued || open) return;
    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queued, open]);

  return {
    celebration: open ? queued : null,
    closeCelebration: () => {
      setOpen(false);
      setQueued(null);
    },
  };
}
