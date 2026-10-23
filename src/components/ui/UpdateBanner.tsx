import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_BUILD_ID } from '@/lib/version';
import { trustedNowMs } from '@/lib/clock';
import { isDeviceOffline } from '@/lib/deviceOffline';

// A browser can open the app from its own copy of an old build (a tab restored at browser start
// is not revalidated). Found that early, before the user has done anything, the newer build loads
// at once instead of waiting behind the banner. Once per build per tab, so it can never loop.
const BOOT_UPDATE_WINDOW_MS = 10_000;
const BOOT_RELOAD_KEY = 'ascend-boot-reload-build';
let userHasInteracted = false;
if (typeof window !== 'undefined') {
  const markInteracted = () => {
    userHasInteracted = true;
  };
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, markInteracted, { once: true, capture: true });
  }
}

/** Reloads into the newer build when the page has only just opened; false when the banner should show. */
function reloadIfJustOpened(buildId: string): boolean {
  if (userHasInteracted || performance.now() > BOOT_UPDATE_WINDOW_MS) return false;
  try {
    if (sessionStorage.getItem(BOOT_RELOAD_KEY) === buildId) return false;
    sessionStorage.setItem(BOOT_RELOAD_KEY, buildId);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** True once a newer build is live (version.json differs, or a service worker replaced the old one). */
export function useUpdateAvailable(): boolean {
  const [hasUpdate, setHasUpdate] = useState(false);
  // A page that had no controller (first visit, new device, cleared data) gets one through
  // clients.claim(): that first controllerchange is not an update.
  const hadControllerRef = useRef(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller)
  );

  const checkForUpdate = useCallback(async () => {
    // Offline the check can only fail; the next focus or interval tick checks again.
    if (hasUpdate || isDeviceOffline()) return;
    try {
      const res = await fetch(`/version.json?t=${trustedNowMs()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.buildId && data.buildId !== APP_BUILD_ID) {
        if (reloadIfJustOpened(String(data.buildId))) return;
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
        if (!hadControllerRef.current) {
          hadControllerRef.current = true;
          return;
        }
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

  return hasUpdate;
}

export function UpdateBanner() {
  return (
    <div
      role="status"
      className="w-full max-w-lg bg-primary-700 text-white text-xs pl-4 pr-2 py-1.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw size={14} aria-hidden="true" className="shrink-0" />
        <span className="font-medium">A new version of Ascend is ready.</span>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 px-3 bg-white hover:bg-primary-50 text-primary-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700"
      >
        Reload
      </button>
    </div>
  );
}
