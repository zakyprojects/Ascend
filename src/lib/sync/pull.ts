import type { AppState } from '../../types';
import { trustedNow, trustedNowMs } from '../clock';
import { supabase } from '../supabase';
import { DELETED, acceptServerRows, cursorKey, hashRow, knownHashes, lastFullPullKey, pendingOpIds } from './outbox';
import { SYNCED_COLLECTIONS, itemsOf, rowIdOf, syncKeyOf, withItems, type SyncedCollection } from './syncedCollections';

/**
 * Relational sync, read side (DB normalization S3). Server rows are MERGED into
 * the state collection by id, never replace it: a local item the server lacks
 * stays (the outbox uploads it), a row with a pending local op is skipped, and a
 * soft-deleted row removes the local item. A local edit not yet in the outbox
 * (debounced save, offline) is kept over another device's row and uploaded next.
 */

export interface RemoteChange {
  key: string;
  id: string;
  /** null = the row is soft-deleted on the server. */
  item: { id: string } | null;
  /** The baseline already holds this exact row: add it only if the state lacks it, never overwrite a local copy. */
  missingOnly?: boolean;
  /** Baseline hash before this row was accepted: a local item matching neither it nor the row is an unsent edit. */
  baseHash?: string;
  /** Full pull only: every live server-owned id, so local copies the server never wrote are dropped. */
  serverOwnedLive?: string[];
  /** A local op for this row is still waiting to be sent (only collections that merge conflicts get these rows). */
  pending?: boolean;
}

/** Re-reads rows this close to the cursor, so a late-committing write is not skipped. */
const CURSOR_OVERLAP_MS = 60_000;

/**
 * The server removes soft-deleted rows this many days after their delete
 * (ascend_purge_soft_deleted_rows; keep the two values equal). A device whose last full pull
 * is older than that may have missed a delete whose row is now gone.
 */
const PURGE_AFTER_DAYS = 30;

/** True when this device has not read every table for close to the purge window. */
function missedPurgedDeletes(userId: string): boolean {
  const last = Date.parse(localStorage.getItem(lastFullPullKey(userId)) || '');
  // No record yet: the device predates the purge, which only removes deletes older than
  // 30 days, so it has synced since every delete it could have missed.
  if (!last) return false;
  return trustedNowMs() - last > (PURGE_AFTER_DAYS - 1) * 24 * 60 * 60 * 1000;
}

/**
 * Server rows -> state changes. Rows the device already holds produce nothing.
 * full: rows the baseline already knows still come back as missingOnly, because the
 * state can boot without them now that the blob no longer carries synced collections (S4).
 */
export function prepareRemoteRows(
  userId: string,
  collection: SyncedCollection,
  rows: Array<Record<string, unknown>>,
  full = false,
  stale = false
): RemoteChange[] {
  const pending = pendingOpIds(userId, collection.table);
  const key = syncKeyOf(collection);
  const known = knownHashes(userId, key);
  const hashes: Record<string, string | null> = {};
  const changes: RemoteChange[] = [];

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    // A row with a pending local op is skipped, unless the collection merges the two (time tracker
    // days): then the merge replaces the pending op, so neither side's edits are lost.
    const isPending = Boolean(id) && pending.has(id);
    if (!id || (isPending && !collection.mergeConflict)) continue;
    if (row.deleted_at) {
      // A delete this device already applied: a local copy is a re-award or restore
      // not yet saved (the diff runs after the debounced save) and must not be removed.
      if (collection.revivable && known[id] === DELETED) continue;
      hashes[id] = null;
      changes.push({ key, id, item: null });
      continue;
    }
    const item = collection.fromRow(row) as { id: string };
    const hash = hashRow(collection.toRow(item as never));
    if (known[id] === hash && !isPending) {
      if (full) changes.push({ key, id, item, missingOnly: true });
      continue;
    }
    hashes[id] = hash;
    changes.push({ key, id, item, baseHash: known[id], ...(isPending ? { pending: true } : {}) });
  }

  // stale (full pull only): a row this device once synced that the server no longer has was
  // purged after a delete this device never saw, so its local copy goes too. Only ids the
  // baseline holds as synced count, so an item that never reached the server is kept.
  if (full && stale) {
    const present = new Set(rows.map((row) => String(row.id)));
    for (const [id, hash] of Object.entries(known)) {
      if (hash === DELETED || present.has(id) || pending.has(id) || collection.serverOwnedId?.(id)) continue;
      hashes[id] = null;
      changes.push({ key, id, item: null });
    }
  }

  if (Object.keys(hashes).length > 0) acceptServerRows(userId, key, hashes);
  if (full && collection.serverOwnedId) {
    const live = rows
      .filter((row) => !row.deleted_at && typeof row.id === 'string' && collection.serverOwnedId!(row.id))
      .map((row) => String(row.id));
    changes.push({ key, id: '', item: null, serverOwnedLive: live });
  }
  return changes;
}

/**
 * The local copy changed since the last sync and the change has not reached the outbox yet.
 * It is kept: the baseline now holds the server hash, so the next save uploads it as a local
 * edit (updatedAt = now). Without a baseline (or a known delete) the server row wins.
 */
function isUnsentEdit(collection: SyncedCollection, local: unknown, change: RemoteChange): boolean {
  if (!change.baseHash || !change.item || collection.serverOwnedId?.(change.id)) return false;
  const localHash = hashRow(collection.toRow(local as never));
  return localHash !== change.baseHash && localHash !== hashRow(collection.toRow(change.item as never));
}

/**
 * The server row for an item the device holds, for a collection that merges conflicts (time
 * tracker days). A local copy with its own unsent or pending change is merged with the row (the
 * result is uploaded when it differs from the row); an unchanged local copy takes the row. With no
 * baseline, only a copy edited on this device since the merge model (it has an edit stamp) is merged.
 */
function mergedRemoteItem(collection: SyncedCollection, local: unknown, change: RemoteChange): unknown {
  const localHash = hashRow(collection.toRow(local as never));
  const remoteHash = hashRow(collection.toRow(change.item as never));
  if (localHash === remoteHash) return local;
  const edited = Boolean(collection.editTimestamp?.(local as never));
  const conflict = change.pending || (change.baseHash ? localHash !== change.baseHash : edited);
  if (!conflict) return change.item;
  return collection.mergeConflict!(local as never, change.item as never, trustedNow().toISOString(), Boolean(change.pending));
}

/** Pure: returns prev itself when nothing changes, so no save is triggered. */
export function applyRemoteChanges(prev: AppState, changes: RemoteChange[]): AppState {
  const tombstones = new Set(prev.deletedEntityIds || []);
  const revived = new Set<string>();
  let next = prev;

  for (const collection of SYNCED_COLLECTIONS) {
    const key = syncKeyOf(collection);
    const forKey = changes.filter((c) => c.key === key);
    if (forKey.length === 0) continue;

    // Read from `next`: the time tracker's three collections share one state object.
    const current = itemsOf(collection, next);
    let items = current;
    for (const change of forKey) {
      if (change.serverOwnedLive) {
        const live = new Set(change.serverOwnedLive);
        const owned = collection.serverOwnedId;
        const kept = items.filter((item) => {
          const id = rowIdOf(collection, item);
          return !owned?.(id) || live.has(id);
        });
        if (kept.length !== items.length) items = kept;
        continue;
      }
      const index = items.findIndex((item) => rowIdOf(collection, item) === change.id);
      if (change.item === null) {
        if (index !== -1) items = items.filter((_, i) => i !== index);
      } else if (!tombstones.has(change.id) || collection.revivable) {
        // A revivable table only keeps a row alive over a delete when the revival is newer
        // (and a delete still in the outbox never gets here), so another device's re-award or
        // restore wins over this device's tombstone. Tombstones no longer sync between devices.
        if (tombstones.has(change.id)) revived.add(change.id);
        if (index === -1) items = [change.item, ...items];
        else if (!change.missingOnly && collection.mergeConflict) {
          const next = mergedRemoteItem(collection, items[index], change) as { id?: string };
          if (next !== items[index]) items = items.map((item, i) => (i === index ? next : item));
        } else if (!change.missingOnly && !isUnsentEdit(collection, items[index], change)) {
          items = items.map((item, i) => (i === index ? change.item! : item));
        }
      }
    }
    if (items !== current) next = withItems(collection, next, items);
  }

  if (revived.size > 0) {
    next = { ...next, deletedEntityIds: (next.deletedEntityIds || []).filter((id) => !revived.has(id)) };
  }
  return next;
}

/** The API returns at most PAGE_SIZE rows per request, so larger tables are read page by page. */
const PAGE_SIZE = 1000;

/** Every row of the user's table (changed since `since` when given); null when a read fails. */
async function fetchRows(
  table: string,
  userId: string,
  since: string | null
): Promise<Array<Record<string, unknown>> | null> {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*').eq('user_id', userId);
    if (since) query = query.gt('server_updated_at', since);
    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
    if (error || !data) {
      console.error(`[SYNC PULL] ${table} failed, keeping local data:`, error?.message);
      return null;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export interface PullResult {
  changes: RemoteChange[];
  /** Every table answered (false: some kept their device copy this time). */
  everyTableRead: boolean;
}

/**
 * full: every row (app boot), so the device converges even if a delta was missed.
 * Otherwise only rows changed since the last pull (reconnect, tab focus).
 */
export async function pullSyncedRows(userId: string, full: boolean): Promise<PullResult> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) return { changes: [], everyTableRead: false };

  const stale = full && missedPurgedDeletes(userId);
  let everyTableRead = true;
  const perTable = await Promise.all(
    SYNCED_COLLECTIONS.map(async (collection) => {
      const cursor = localStorage.getItem(cursorKey(userId, collection.table));
      const since = cursor && !full ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
      const rows = await fetchRows(collection.table, userId, since);
      if (!rows) {
        everyTableRead = false;
        return [];
      }

      const changes = prepareRemoteRows(userId, collection, rows, full, stale);
      const latest = rows.reduce<number>(
        (max, row) => Math.max(max, Date.parse(String(row.server_updated_at)) || 0),
        cursor ? Date.parse(cursor) : 0
      );
      if (latest > 0) localStorage.setItem(cursorKey(userId, collection.table), new Date(latest).toISOString());
      return changes;
    })
  );
  if (full && everyTableRead) localStorage.setItem(lastFullPullKey(userId), new Date(trustedNowMs()).toISOString());
  return { changes: perTable.flat(), everyTableRead };
}
