import { useEffect, useState } from 'react';
import { LeagueType } from '@/types';
import { formatCountdown, getTimeUntilReset } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';

/** Live time-to-reset; owns its 1s tick so only this text re-renders, never the page around it. */
export function LeagueCountdown({ type, className }: { type: LeagueType; className?: string }) {
  const [now, setNow] = useState(leagueNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(leagueNow()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className={className}>{formatCountdown(getTimeUntilReset(type, now))}</span>;
}
