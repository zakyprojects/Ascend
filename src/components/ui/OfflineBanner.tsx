import { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { trustedNowMs } from '@/lib/clock';

export type ConnectionStatus = 'online' | 'offline' | 'restored';

/** Watches the connection (browser events + a light heartbeat). "restored" lasts 4 s after a return. */
export function useConnectionStatus(): ConnectionStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const wasOfflineRef = useRef<boolean>(!isOnline);

  const performHeartbeatCheck = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Fast check: if browser explicitly says offline, set false immediately
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline((prev) => {
        if (prev) wasOfflineRef.current = true;
        return false;
      });
      setShowRestored(false);
      return;
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
        setIsOnline((prev) => {
          if (!prev || wasOfflineRef.current) {
            setShowRestored(true);
            setTimeout(() => setShowRestored(false), 4000);
            wasOfflineRef.current = false;
          }
          return true;
        });
      } else {
        setIsOnline((prev) => {
          if (prev) wasOfflineRef.current = true;
          return false;
        });
        setShowRestored(false);
      }
    } catch {
      setIsOnline((prev) => {
        if (prev) wasOfflineRef.current = true;
        return false;
      });
      setShowRestored(false);
    }
  }, []);

  useEffect(() => {
    let heartbeatInterval: any = null;

    const startHeartbeat = () => {
      if (!heartbeatInterval && (typeof navigator === 'undefined' || navigator.onLine)) {
        heartbeatInterval = setInterval(performHeartbeatCheck, 12000);
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    const handleOnline = () => {
      startHeartbeat();
      performHeartbeatCheck();
    };

    const handleOffline = () => {
      stopHeartbeat();
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowRestored(false);
    };

    const handleNetworkErrorEvent = () => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        performHeartbeatCheck();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('app-network-error', handleNetworkErrorEvent);

    // Initial check on mount
    if (typeof navigator === 'undefined' || navigator.onLine) {
      startHeartbeat();
      performHeartbeatCheck();
    } else {
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowRestored(false);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('app-network-error', handleNetworkErrorEvent);
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
