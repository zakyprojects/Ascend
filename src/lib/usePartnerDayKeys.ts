import { useEffect, useState } from 'react';
import { getNow, todayKeyInZone } from './dates';
import { isSupabaseConfigured, supabase } from './supabase';
import { isDeviceOffline } from './deviceOffline';

const CHECK_INTERVAL_MS = 30000;

type DayKeys = Record<string, string>;

function dayKeysFor(timeZones: Record<string, string>): DayKeys {
  const now = getNow();
  const keys: DayKeys = {};
  for (const [userId, timeZone] of Object.entries(timeZones)) {
    const key = todayKeyInZone(timeZone, now);
    if (key) keys[userId] = key;
  }
  return keys;
}

const sameKeys = (a: DayKeys, b: DayKeys) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, key]) => b[id] === key);

/**
 * Each partner's own "today" (YYYY-MM-DD in their server timezone, the day their challenge ticks are
 * stored under), by partner user id. Re-read when the partner list changes and when the tab is
 * shown; re-checked every 30 s so it rolls over at each partner's own midnight. A partner missing
 * from the result (guest, failed read, the server function not deployed yet) has no entry: callers
 * fall back to the viewer's day.
 */
export function usePartnerDayKeys(partnerIds: readonly string[]): DayKeys {
  const idsKey = [...new Set(partnerIds.filter(Boolean))].sort().join(',');
  const [timeZones, setTimeZones] = useState<Record<string, string>>({});
  const [dayKeys, setDayKeys] = useState<DayKeys>({});

  useEffect(() => {
    if (!isSupabaseConfigured || !idsKey) {
      setTimeZones({});
      return;
    }
    let active = true;
    const read = async () => {
      const { data, error } = await supabase.rpc('ascend_partner_timezones');
      if (!active || error || !Array.isArray(data)) return;
      const next: Record<string, string> = {};
      for (const row of data as { user_id?: string; timezone?: string }[]) {
        if (row?.user_id && row.timezone) next[row.user_id] = row.timezone;
      }
      setTimeZones(next);
    };
    // Offline the read can only fail; the online event reads again.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !isDeviceOffline()) void read().catch(() => undefined);
    };
    const onOnline = () => void read().catch(() => undefined);
    void read().catch(() => undefined);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [idsKey]);

  useEffect(() => {
    const check = () => {
      const next = dayKeysFor(timeZones);
      setDayKeys((prev) => (sameKeys(prev, next) ? prev : next));
    };
    check();
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timeZones]);

  return dayKeys;
}
