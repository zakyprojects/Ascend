import { useState, useEffect } from 'react';
import { trustedNow } from '@/lib/clock';
import { timeStringToMinutes } from '@/lib/timeTracker';

interface LiveCountdownProps {
  endTime: string; // "HH:mm" (24h); "24:00" = midnight
  className?: string;
}

function secondsUntil(endTime: string): number {
  if (!endTime) return 0;
  const now = trustedNow();
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return Math.max(0, timeStringToMinutes(endTime) * 60 - nowSeconds);
}

/** Time left in today's block: "1h 12m left", seconds only in its last minute. */
export function LiveCountdown({ endTime, className = '' }: LiveCountdownProps) {
  const [seconds, setSeconds] = useState<number>(() => secondsUntil(endTime));

  useEffect(() => {
    setSeconds(secondsUntil(endTime));
    const interval = setInterval(() => setSeconds(secondsUntil(endTime)), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const text =
    seconds <= 0 ? 'ending now' : seconds < 60 ? `${seconds}s left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;

  return <span className={className}>{text}</span>;
}
