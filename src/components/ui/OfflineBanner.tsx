import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const wasOfflineRef = useRef<boolean>(!isOnline);

  const performHeartbeatCheck = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Fast check: if browser explicitly says offline, set false immediately
    if (navigator.onLine === false) {
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

      const res = await fetch(`/favicon.svg?_hb=${Date.now()}`, {
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
    const handleOnline = () => {
      performHeartbeatCheck();
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowRestored(false);
    };

    const handleNetworkErrorEvent = () => {
      performHeartbeatCheck();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('app-network-error', handleNetworkErrorEvent);

    // Initial check on mount
    performHeartbeatCheck();

    // Active heartbeat check every 12 seconds
    const heartbeatInterval = setInterval(performHeartbeatCheck, 12000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('app-network-error', handleNetworkErrorEvent);
      clearInterval(heartbeatInterval);
    };
  }, [performHeartbeatCheck]);

  if (!isOnline) {
    return (
      <div
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9995] max-w-lg w-[calc(100%-2rem)] bg-amber-500/15 border border-amber-500/30 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-slide-down"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/20 shrink-0 text-warning-text">
            <WifiOff size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-warning-text flex items-center gap-1.5">
              <span>You are currently offline</span>
              <span className="w-1.5 h-1.5 rounded-full bg-warning-text animate-ping" />
            </p>
            <p className="text-[11px] text-warning-text-muted truncate">
              Actions won't save until connection is restored. Please reconnect.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9995] max-w-lg w-[calc(100%-2rem)] bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-3 animate-slide-down"
        role="status"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/20 shrink-0 text-success-text">
          <Wifi size={16} />
        </div>
        <p className="text-xs font-bold text-success-text">
          Connection restored! Back online.
        </p>
      </div>
    );
  }

  return null;
}
