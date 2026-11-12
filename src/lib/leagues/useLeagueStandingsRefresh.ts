import { useEffect } from 'react';
import type { AppStore } from '@/lib/store';

const POLL_MS = 60_000;

/**
 * Keeps other members' league standings fresh while the caller is shown: refetches on mount, when
 * the tab becomes visible again and when the device comes back online, and (with `poll`) every
 * minute while the tab is visible. The store dedupes and throttles, so triggers may overlap.
 */
export function useLeagueStandingsRefresh(store: AppStore, { poll = true }: { poll?: boolean } = {}): void {
  const refresh = store.refreshLeagueStandings;
  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) void refresh();
    };
    refreshIfVisible();
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    const timer = poll ? window.setInterval(refreshIfVisible, POLL_MS) : null;
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [refresh, poll]);
}
