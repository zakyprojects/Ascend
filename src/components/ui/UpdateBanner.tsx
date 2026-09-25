import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export function UpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (hasUpdate) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version && data.version !== APP_VERSION) {
        setHasUpdate(true);
      }
    } catch {
      // Ignore network errors during background check
    }
  }, [hasUpdate]);

  useEffect(() => {
    // 1. Initial check
    checkForUpdate();

    // 2. Poll every 15 minutes
    const interval = setInterval(checkForUpdate, 15 * 60 * 1000);

    // 3. Check on window focus / tab foregrounding
    const handleFocus = () => checkForUpdate();
    window.addEventListener('focus', handleFocus);

    // 4. Secondary trigger: Service Worker controllerchange
    let handleControllerChange: (() => void) | null = null;
    if ('serviceWorker' in navigator) {
      handleControllerChange = () => {
        setHasUpdate(true);
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      if ('serviceWorker' in navigator && handleControllerChange) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, [checkForUpdate]);

  if (!hasUpdate) return null;

  return (
    <div className="bg-brand-primary text-white text-xs px-4 py-2.5 flex items-center justify-between shadow-md relative z-50">
      <div className="flex items-center gap-2">
        <RefreshCw size={14} className="animate-spin" />
        <span className="font-medium">A new version of Ascend is available.</span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded text-xs transition-colors cursor-pointer"
      >
        Reload
      </button>
    </div>
  );
}
