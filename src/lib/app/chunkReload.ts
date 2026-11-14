import { repairBuildFiles } from './assetRecovery';

/**
 * A page chunk that fails to load is almost always a tab opened before a deploy: its hashed file
 * is gone. Repair (drop the cached build files) and reload to pick up the new build, at most once
 * a minute so a chunk that keeps failing (offline, a broken deploy) never loops; returns false
 * when it did not reload.
 */
export function reloadOnceForStaleChunk(): boolean {
  return repairBuildFiles({ automatic: true });
}
