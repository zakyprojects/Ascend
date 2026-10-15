import { trustedNowMs } from './clock';
const RELOADED_AT_KEY = 'ascend_chunk_reload_at';
/** One reload per this window: a chunk that is still missing after it is a real failure, not a stale tab. */
const RELOAD_GUARD_MS = 60_000;

/**
 * A page chunk that fails to load is almost always a tab opened before a deploy: its hashed file
 * is gone. Reload once to pick up the new build. Guarded in sessionStorage so a chunk that keeps
 * failing (offline, a broken deploy) never loops; returns false when it did not reload.
 */
export function reloadOnceForStaleChunk(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY));
    if (last && trustedNowMs() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(trustedNowMs()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
