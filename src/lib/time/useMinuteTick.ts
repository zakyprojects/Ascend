import { useEffect, useState } from 'react';
import { trustedNowMs } from './clock';

const minuteNow = () => Math.floor(trustedNowMs() / 60_000);

/**
 * The current minute (trusted clock); the component re-renders when it changes (checked every
 * 60 s and when the tab becomes visible), for time-of-day parts like a greeting or "late in the day".
 */
export function useMinuteTick(): number {
  const [minute, setMinute] = useState(minuteNow);

  useEffect(() => {
    const check = () => setMinute(minuteNow());
    const intervalId = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return minute;
}
