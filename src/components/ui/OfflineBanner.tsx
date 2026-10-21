import { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { elapsedMark, isMarkOlderThan, trustedNowMs } from '@/lib/clock';

/** A tab return re-checks only when the server last answered at least this long ago. */
const VISIBLE_STALE_MS = 60 * 1000;

export type ConnectionStatus = 'online' | 'offline' | 'restored';

/** Watches the connection (browser events + checks; a heartbeat only while unreachable). "restored" lasts 4 s after a return. */
export function useConnectionStatus(): ConnectionStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const wasOfflineRef = useRef<boolean>(!isOnline);
  const lastReachableMarkRef = useRef<number | null>(null);

  /** True when the app's own server answered. */
  const performHeartbeatCheck = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;

    // Fast check: if browser explicitly says offline, set false immediately
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline((prev) => {
        if (prev) wasOfflineRef.current = true;
        return false;
      });
      setShowRestored(false);
      return false;
    }

    // Active reachability check via HEAD fetch to local asset
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`/favicon.svg?_hb=${trustedNowMs()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        lastReachableMarkRef.current = elapsedMark();
        setIsOnline((prev) => {
          if (!prev || wasOfflineRef.current) {
            setShowRestored(true);
            setTimeout(() => setShowRestored(false), 4000);
            wasOfflineRef.current = false;
          }
          return true;
        });
        return true;
      } else {
        setIsOnline((prev) => {
          if (prev) wasOfflineRef.current = true;
          return false;
        });
        setShowRestored(false);
        return false;
      }
    } catch {
      setIsOnline((prev) => {
        if (prev) wasOfflineRef.current = true;
        return false;
      });
      setShowRestored(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let heartbeatInterval: any = null;
    // A check still on its way at cleanup must not start a heartbeat afterwards.
    let disposed = false;

    // One check on start, on a return to the tab (when the last answer is a minute or more old, or
    // the app shows offline), back online and after a failed app request. The
    // 12 s heartbeat runs only while a check fails although the browser reports a network
    // (connected without internet), until the server answers; never while the tab is hidden.
    const check = async () => {
      if (await performHeartbeatCheck()) stopHeartbeat();
      else startHeartbeat();
    };

    const startHeartbeat = () => {
      if (
        !disposed &&
        !heartbeatInterval &&
        (typeof navigator === 'undefined' || navigator.onLine) &&
        !document.hidden
      ) {
        heartbeatInterval = setInterval(() => void check(), 12000);
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    const handleOnline = () => {
      void check();
    };

    const handleOffline = () => {
      stopHeartbeat();
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowRestored(false);
    };

    const handleNetworkErrorEvent = () => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void check();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopHeartbeat();
      } else if (
        (typeof navigator === 'undefined' || navigator.onLine) &&
        (wasOfflineRef.current || isMarkOlderThan(lastReachableMarkRef.current, VISIBLE_STALE_MS))
      ) {
        void check();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('app-network-error', handleNetworkErrorEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial check on mount
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void check();
    } else {
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowRestored(false);
    }

    return () => {
      disposed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('app-network-error', handleNetworkErrorEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopHeartbeat();
    };
  }, [performHeartbeatCheck]);

  if (!isOnline) return 'offline';
  if (showRestored) return 'restored';
  return 'online';
}

/** One in-flow banner (BannerStack decides which one shows); never fixed over the header. */
export function OfflineBanner({ status }: { status: Exclude<ConnectionStatus, 'online'> }) {
  if (status === 'offline') {
    return (
      <div
        className="w-full max-w-lg bg-bg-700 border border-overlay-default px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3 animate-slide-down"
        role="alert"
        aria-live="assertive"
      >
        <div className="p-1.5 rounded-lg bg-overlay-subtle shrink-0 text-content-secondary">
          <WifiOff size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-content-primary">You’re offline</p>
          <p className="text-micro text-content-secondary">Changes stay on this device and sync when you’re back online.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-lg bg-bg-700 border border-emerald-500/30 px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3 animate-slide-down"
      role="status"
    >
      <div className="p-1.5 rounded-lg bg-emerald-500/15 shrink-0 text-success-text">
        <Wifi size={16} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium text-content-primary">Back online. Your changes are syncing.</p>
    </div>
  );
}
