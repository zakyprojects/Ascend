import { trustedNowMs } from './clock';

/**
 * Recovers a page whose build files did not load: the main stylesheet came back empty or broken
 * (a bad copy in the service worker's asset cache, or a deploy that happened mid-load), or a lazy
 * page chunk failed to import (Vite's `vite:preloadError`). Either way the page drops the cached
 * build files (the service worker's copies and the browser's HTTP-cached stylesheet) and reloads.
 * At most once a minute on its own, so a file that keeps failing (offline, a broken deploy) ends at
 * the error card instead of a reload loop; never once per tab session, as an installed app's
 * session lasts days and many deploys (Zakria 2026-10-19: every update needed site storage cleared).
 * The error card's Repair app button runs the same repair on demand.
 */
const REPAIRED_AT_KEY = 'ascend_asset_recovery_at';
/** One automatic repair per this window. */
const REPAIR_GUARD_MS = 60_000;
/** Must match the cache names in public/sw.js. The push cache holds no build files and stays. */
const BUILD_CACHE_PREFIXES = ['ascend-assets-', 'ascend-pages-', 'ascend-static-'];

/** Claims this minute's automatic repair; false when one already ran (or storage is unavailable). */
function claimAutomaticRepair(): boolean {
  try {
    const last = Number(sessionStorage.getItem(REPAIRED_AT_KEY));
    if (last && trustedNowMs() - last < REPAIR_GUARD_MS) return false;
    sessionStorage.setItem(REPAIRED_AT_KEY, String(trustedNowMs()));
    return true;
  } catch {
    return false; // No session storage: never risk a loop.
  }
}

/** A failed import of a build file (lazy page chunk, its CSS), as browsers word it. */
export function isBuildFileError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk/i.test(
    message
  );
}

function mainStylesheetLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]');
}

/**
 * Drops the cached build files and reloads. `automatic` repairs (a failed load) run at most once a
 * minute and return false when skipped; the Repair app button always runs. Sign-in and the app's
 * own data are never touched, and the service worker stays registered (push depends on it).
 */
export function repairBuildFiles({ automatic }: { automatic: boolean }): boolean {
  if (automatic && (navigator.onLine === false || !claimAutomaticRepair())) return false;
  void dropCachedBuildAndReload();
  return true;
}

async function dropCachedBuildAndReload(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => BUILD_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))).map((name) => caches.delete(name))
    );
  } catch {
    // Cache API unavailable: the reload still fetches what is missing.
  }
  // Build files are served `immutable` for a year, so a bad copy in the browser's HTTP cache
  // survives every reload under the same file name. `cache: 'reload'` refetches it from the
  // network and overwrites that copy (through the service worker, which passes the mode on).
  const link = mainStylesheetLink();
  if (link) await fetch(link.href, { cache: 'reload' }).catch(() => undefined);
  window.location.reload();
}

/** Whether the build's own stylesheet (`/assets/*.css`) is missing or has no rules. */
function mainStylesheetBroken(): boolean {
  const link = mainStylesheetLink();
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
    // Skipped (repaired within the last minute): the error reaches the page's error card instead.
    if (repairBuildFiles({ automatic: true })) event.preventDefault();
  });

  const checkStyles = () => {
    if (mainStylesheetBroken()) repairBuildFiles({ automatic: true });
  };
  if (document.readyState === 'complete') checkStyles();
  else window.addEventListener('load', checkStyles, { once: true });
}
