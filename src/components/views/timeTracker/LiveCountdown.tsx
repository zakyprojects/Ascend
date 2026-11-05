import { useState, useEffect } from 'react';
import { trustedNowMs } from '@/lib/clock';
import { formatTimeLeft } from '@/lib/timeTracker';

interface LiveCountdownProps {
  /** Real end instant of the block (computeLiveSchedule's activeBlockEndMs): a block ending at
   * 24:00 or an old overnight block ending 07:00 the next morning counts down correctly. */
  endMs: number;
  className?: string;
}

function secondsUntil(endMs: number): number {
  if (!endMs) return 0;
  return Math.max(0, Math.ceil((endMs - trustedNowMs()) / 1000));
}

/** Time left in today's block: "1h 12m left", seconds only in its last minute. */
export function LiveCountdown({ endMs, className = '' }: LiveCountdownProps) {
  const [seconds, setSeconds] = useState<number>(() => secondsUntil(endMs));

  useEffect(() => {
    setSeconds(secondsUntil(endMs));
    const interval = setInterval(() => setSeconds(secondsUntil(endMs)), 1000);
    return () => clearInterval(interval);
  }, [endMs]);

  return <span className={className}>{formatTimeLeft(seconds)}</span>;
}
