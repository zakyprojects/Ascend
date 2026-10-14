import type { AppState } from '../../types';
import { supabase } from '../supabase';
import { acceptServerRows, cursorKey, hashRow, knownHashes, pendingOpIds } from './outbox';
import { SYNCED_COLLECTIONS, type SyncedCollection } from './syncedCollections';

/**
 * Relational sync, read side (DB normalization S3). Server rows are MERGED into
 * the state collection by id, never replace it: a local item the server lacks
 * stays (the outbox uploads it), a row with a pending local op is skipped, and a
 * soft-deleted row removes the local item.
 */

export interface RemoteChange {
  stateKey: keyof AppState;
  id: string;
  /** null = the row is soft-deleted on the server. */
  item: { id: string } | null;
}

/** Re-reads rows this close to the cursor, so a late-committing write is not skipped. */
const CURSOR_OVERLAP_MS = 60_000;

/** Server rows -> state changes. Rows the device already holds produce nothing. */
export function prepareRemoteRows(
  userId: string,
  collection: SyncedCollection,
  rows: Array<Record<string, unknown>>
): RemoteChange[] {
  const pending = pendingOpIds(userId, collection.table);
  const known = knownHashes(userId, collection.stateKey);
  const hashes: Record<string, string | null> = {};
  const changes: RemoteChange[] = [];

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || pending.has(id)) continue;
    if (row.deleted_at) {
      hashes[id] = null;
      changes.push({ stateKey: collection.stateKey, id, item: null });
      continue;
    }
    const item = collection.fromRow(row) as { id: string };
    const hash = hashRow(collection.toRow(item as never));
    if (known[id] === hash) continue;
    hashes[id] = hash;
    changes.push({ stateKey: collection.stateKey, id, item });
  }

  if (Object.keys(hashes).length > 0) acceptServerRows(userId, collection.stateKey, hashes);
  return changes;
}

/** Pure: returns prev itself when nothing changes, so no save is triggered. */
export function applyRemoteChanges(prev: AppState, changes: RemoteChange[]): AppState {
  const tombstones = new Set(prev.deletedEntityIds || []);
  let next = prev;

  for (const { stateKey } of SYNCED_COLLECTIONS) {
    const forKey = changes.filter((c) => c.stateKey === stateKey);
    if (forKey.length === 0) continue;

    const current = (prev[stateKey] as Array<{ id: string }> | undefined) || [];
    let items = current;
    for (const change of forKey) {
      const index = items.findIndex((item) => item.id === change.id);
      if (change.item === null) {
        if (index !== -1) items = items.filter((item) => item.id !== change.id);
      } else if (!tombstones.has(change.id)) {
        if (index === -1) items = [change.item, ...items];
        else items = items.map((item, i) => (i === index ? change.item! : item));
      }
    }
    if (items !== current) next = { ...next, [stateKey]: items };
  }

  return next;
}

/**
 * full: every row (app boot), so the device converges even if a delta was missed.
 * Otherwise only rows changed since the last pull (reconnect, tab focus).
 */
export async function pullSyncedRows(userId: string, full: boolean): Promise<RemoteChange[]> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) return [];

  const changes: RemoteChange[] = [];
  for (const collection of SYNCED_COLLECTIONS) {
    const cursor = localStorage.getItem(cursorKey(userId, collection.table));
    let query = supabase.from(collection.table).select('*').eq('user_id', userId);
    if (cursor && !full) {
      query = query.gt('server_updated_at', new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString());
    }
    const { data: rows, error } = await query;
    if (error || !rows) {
      console.error(`[SYNC PULL] ${collection.table} failed, keeping local data:`, error?.message);
      continue;
    }

    changes.push(...prepareRemoteRows(userId, collection, rows));
    const latest = rows.reduce<number>(
      (max, row) => Math.max(max, Date.parse(String(row.server_updated_at)) || 0),
      cursor ? Date.parse(cursor) : 0
    );
    if (latest > 0) localStorage.setItem(cursorKey(userId, collection.table), new Date(latest).toISOString());
  }
  return changes;
}
