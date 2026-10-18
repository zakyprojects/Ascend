/**
 * Recovers a page whose build files did not load: the main stylesheet came back empty or broken
 * (a bad copy in the service worker's asset cache, or a deploy that happened mid-load), or a lazy
 * page chunk failed to import (Vite's `vite:preloadError`). Either way the page drops the cached
 * build files and reloads once. A session flag stops a reload loop when the network itself fails.
 */
const RELOADED_KEY = 'ascend_asset_recovery_reloaded';
/** Must match ASSET_CACHE_NAME's prefix in public/sw.js. */
const ASSET_CACHE_PREFIX = 'ascend-assets-';

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === '1';
  } catch {
    return true; // No session storage: never risk a loop.
  }
}

async function dropCachedBuildAndReload(): Promise<void> {
  if (alreadyReloaded()) return;
  try {
    sessionStorage.setItem(RELOADED_KEY, '1');
  } catch {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(ASSET_CACHE_PREFIX)).map((name) => caches.delete(name)));
  } catch {
    // Cache API unavailable: the reload still fetches what is missing.
  }
  window.location.reload();
}

/** Whether the build's own stylesheet (`/assets/*.css`) is missing or has no rules. */
function mainStylesheetBroken(): boolean {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]');
  if (!link) return false; // Dev server: styles come from modules, not a link.
  const sheet = link.sheet;
  if (!sheet) return true;
  try {
    return sheet.cssRules.length === 0;
  } catch {
    return false; // Unreadable (should not happen same-origin): assume it loaded.
  }
}

export function installAssetRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (alreadyReloaded()) return; // Let the error reach the page's error card instead.
    event.preventDefault();
    void dropCachedBuildAndReload();
  });

  // One recovery per tab session: the flag is never cleared, so a file that keeps failing
  // (a real outage) ends at the error card instead of reloading again and again.
  const checkStyles = () => {
    if (mainStylesheetBroken()) void dropCachedBuildAndReload();
  };
  if (document.readyState === 'complete') checkStyles();
  else window.addEventListener('load', checkStyles, { once: true });
}
