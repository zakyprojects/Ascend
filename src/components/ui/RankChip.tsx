import { useEffect, useState } from 'react';
import { TierBadge } from './TierBadge';
import { useToast } from './Toast';
import { getCurrentTier, getTierIndex } from '@/lib/tiers';
import { leagueNow } from '@/lib/leagueTime';

/**
 * A tier change only counts as a rank-up moment when the newest ledger entry was
 * written just now. Hydration, cross-device merges and logins bring in older
 * entries, so they move the rank silently, as they should.
 */
const RANK_UP_FRESHNESS_MS = 10_000;

interface RankChipProps {
  seasonPoints: number;
  /** Timestamp of the newest points-ledger entry (pointsHistory[0]). */
  latestEntryTimestamp?: string;
}

export function RankChip({ seasonPoints, latestEntryTimestamp }: RankChipProps) {
  const { showToast } = useToast();
  const tierIndex = getTierIndex(seasonPoints);
  const tier = getCurrentTier(seasonPoints);
  const tierKey = tier.name.toLowerCase();

  // Compare against the previous render so nothing fires on mount.
  const [prevTierIndex, setPrevTierIndex] = useState(tierIndex);
  const [rankUpId, setRankUpId] = useState(0);
  if (tierIndex !== prevTierIndex) {
    setPrevTierIndex(tierIndex);
    const entryTime = latestEntryTimestamp ? new Date(latestEntryTimestamp).getTime() : NaN;
    const isFreshAward = leagueNow().getTime() - entryTime < RANK_UP_FRESHNESS_MS;
    if (tierIndex > prevTierIndex && isFreshAward) {
      setRankUpId((id) => id + 1);
    }
  }

  // The toast carries the moment on mobile, where this chip (in the desktop
  // sidebar) is not visible.
  useEffect(() => {
    if (rankUpId === 0) return;
    showToast({
      type: 'success',
      title: `Rank up! You're now ${tier.name}`,
      message: `${seasonPoints.toLocaleString()} points this season.`,
      dedupKey: `rank-up:${tier.name}`,
    });
    // Fires once per rank-up; tier and points are read at that moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankUpId]);

  return (
    <div className="relative">
      {rankUpId > 0 && (
        <div
          key={rankUpId}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-2xl animate-rank-glow"
          // The --rank-*-glow tokens (8-10% alpha) are tuned for resting shadows and
          // are too faint for a moment, so the glow is mixed from the rank's text colour.
          style={{
            background: `radial-gradient(closest-side, color-mix(in srgb, var(--rank-${tierKey}-text) 35%, transparent), transparent)`,
          }}
        />
      )}
      <div className="relative card px-3 py-2 flex items-center justify-between">
        <div key={rankUpId} className={rankUpId > 0 ? 'animate-celebrate' : undefined}>
          <TierBadge totalPoints={seasonPoints} size="sm" showName />
        </div>
        <span className="text-xs text-content-disabled tabular-nums">
          {seasonPoints.toLocaleString()} points
        </span>
      </div>
    </div>
  );
}
