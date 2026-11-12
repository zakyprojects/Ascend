import { useEffect, useState } from 'react';
import { trustedNow } from './clock';
import { todayKey } from './dates';

const CHECK_INTERVAL_MS = 30000;

/**
 * Today's local date key; the component re-renders when the day changes (checked every 30 s and
 * when the tab becomes visible), so "today" views roll over at midnight without a reload.
 */
export function useLocalDayKey(): string {
  const [dayKey, setDayKey] = useState(() => todayKey(trustedNow()));

  useEffect(() => {
    const check = () => setDayKey(todayKey(trustedNow()));
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return dayKey;
}
