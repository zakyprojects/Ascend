import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showRestored, setShowRestored] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9995] max-w-lg w-[calc(100%-2rem)] bg-amber-950/90 border border-amber-500/50 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl shadow-amber-950/50 flex items-center justify-between gap-3 text-amber-200 animate-slide-down"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/20 shrink-0 text-amber-400">
            <WifiOff size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span>You are currently offline</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            </p>
            <p className="text-[11px] text-amber-200/80 truncate">
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
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9995] max-w-lg w-[calc(100%-2rem)] bg-emerald-950/90 border border-emerald-500/50 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl shadow-emerald-950/50 flex items-center gap-3 text-emerald-200 animate-slide-down"
        role="status"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/20 shrink-0 text-emerald-400">
          <Wifi size={16} />
        </div>
        <p className="text-xs font-bold text-emerald-300">
          Connection restored! Back online.
        </p>
      </div>
    );
  }

  return null;
}
