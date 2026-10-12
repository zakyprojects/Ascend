import { useEffect, useState } from 'react';
import { LeagueType } from '@/types';
import { getTimeUntilReset } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';

const LEAGUE_TYPES: LeagueType[] = ['weekly', 'monthly', 'ninetyDay'];
// setTimeout overflows past 2^31-1 ms (~24.8 days); longer waits simply re-arm.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Re-renders the caller once each time any league period rolls over, so ranks and period
 * labels never go stale, without a per-second page re-render (pair it with LeagueCountdown).
 */
export function useLeaguePeriodRollover(): void {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const now = leagueNow();
    const untilNextReset = Math.min(...LEAGUE_TYPES.map((type) => getTimeUntilReset(type, now)));
    const timer = setTimeout(() => setEpoch((n) => n + 1), Math.min(untilNextReset + 1000, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [epoch]);
}
