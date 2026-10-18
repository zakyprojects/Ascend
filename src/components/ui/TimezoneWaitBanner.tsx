import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { trustedNow, trustedNowMs } from '@/lib/clock';
import { todayKey } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { readTimezoneWait, type TimezoneWait } from '@/lib/timezoneStatus';

const REFRESH_MS = 10 * 60 * 1000;

function formatResume(resumesAt: Date): string {
  const time = resumesAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (todayKey(resumesAt) === todayKey(trustedNow())) return time;
  return `${resumesAt.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** Explains why today's ticks earn no points while a timezone change waits on the server. */
export function TimezoneWaitBanner() {
  const [wait, setWait] = useState<TimezoneWait | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      readTimezoneWait()
        .then((next) => {
          if (active) setWait(next);
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Re-read once the change should have been applied, so the banner leaves on its own.
  useEffect(() => {
    if (!wait) return;
    const delay = Math.max(wait.resumesAt.getTime() - trustedNowMs(), 0) + 60_000;
    const timer = setTimeout(() => {
      readTimezoneWait()
        .then(setWait)
        .catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [wait]);

  if (!wait || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;

  return (
    <div
      className="fixed top-[calc(0.5rem_+_env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-popover max-w-lg w-[calc(100%-2rem)] bg-bg-700 border border-overlay-default px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3 animate-slide-down"
      role="status"
    >
      <div className="p-1.5 rounded-lg bg-overlay-subtle shrink-0 text-content-secondary">
        <Clock size={16} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-content-primary">Your timezone change is waiting</p>
        <p className="text-micro text-content-secondary">
          Today's ticks earn points from about {formatResume(wait.resumesAt)}.
        </p>
      </div>
    </div>
  );
}
