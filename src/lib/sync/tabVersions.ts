/**
 * Per-tab row versions for relational sync (see tabSyncedHashes). No imports from the rest of the
 * sync code, so the device-cache writers (store, supabase.ts) can use it without an import cycle.
 */

/** collection key -> item id -> row hash ('' = deleted), the same shape as the outbox baseline. */
export type Baseline = Record<string, Record<string, string>>;

/** This tab's row versions as they stood when its state was last written to the device cache. */
const tabSyncedKey = (userId: string) => `ascend_sync_tab_synced_${userId}`;

function readStored(userId: string): Baseline | null {
  try {
    const raw = localStorage.getItem(tabSyncedKey(userId));
    return raw ? (JSON.parse(raw) as Baseline) : null;
  } catch {
    return null;
  }
}

/**
 * This tab's version of each row: collection key -> item id -> the row hash this tab's state last
 * held in step with the baseline (DELETED: this tab knows the row is deleted). The baseline and the
 * pull cursor are shared by every tab of the browser, but each tab's state is its own, so another
 * tab's pull can move the baseline past a copy this tab still shows. A copy still equal to this
 * tab's version is then an old copy, not an edit: it is never uploaded, and the server row replaces
 * it. Kept in memory (each tab has its own) and written next to the device cache, so a cold boot
 * from that cache starts from the versions the cached state was built on.
 */
let tabSynced: { userId: string; hashes: Baseline } | null = null;

export function tabSyncedHashes(userId: string): Baseline {
  if (tabSynced?.userId !== userId) tabSynced = { userId, hashes: readStored(userId) || {} };
  return tabSynced.hashes;
}

export function setTabSyncedHashes(userId: string, hashes: Baseline): void {
  tabSynced = { userId, hashes };
}

/** Call wherever `ascend_user_cache_<id>` is written, so the cached state keeps the versions it was built on. */
export function storeTabSyncedHashes(userId: string): void {
  try {
    localStorage.setItem(tabSyncedKey(userId), JSON.stringify(tabSyncedHashes(userId)));
  } catch {
    /* ignore quota errors: without it a cold boot falls back to the baseline alone */
  }
}

export function clearTabSyncedHashes(userId: string): void {
  localStorage.removeItem(tabSyncedKey(userId));
  if (tabSynced?.userId === userId) tabSynced = null;
}
