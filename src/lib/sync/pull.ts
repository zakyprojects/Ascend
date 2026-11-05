import type { AppState } from '../../types';
import { trustedNow, trustedNowMs } from '../clock';
import { supabase } from '../supabase';
import {
  DELETED,
  acceptServerRows,
  clearRefusedRows,
  cursorKey,
  hashRow,
  knownHashes,
  lastFullPullKey,
  pendingOpIds,
  refusedRowIds,
} from './outbox';
import { setTabSyncedHashes, tabSyncedHashes, type Baseline } from './tabVersions';
import { raiseBooksForConcurrentLogs } from './concurrentReadingLogs';
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
  /**
   * This tab's version of the row (tabSyncedHashes) when it has one. A local copy still equal to it
   * is unchanged here, so the server row replaces it even where the shared baseline already held
   * that row (another tab pulled it); on a delete (`item` null) it limits the removal to that copy.
   */
  tabHash?: string;
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
  const tab = tabSyncedHashes(userId)[key] || {};
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
      // Unless this tab never saw the delete (another tab applied it): its copy, while unchanged, goes.
      if (collection.revivable && known[id] === DELETED) {
        if (tab[id] !== undefined && tab[id] !== DELETED) changes.push({ key, id, item: null, tabHash: tab[id] });
        continue;
      }
      hashes[id] = null;
      changes.push({ key, id, item: null });
      continue;
    }
    const item = collection.fromRow(row) as { id: string };
    const hash = hashRow(collection.toRow(item as never));
    const tabHash = id in tab ? { tabHash: tab[id] } : {};
    if (known[id] === hash && !isPending) {
      // Another tab of this browser already took this row into the shared baseline: this tab still
      // needs it when its own version is older.
      const behind = id in tab && tab[id] !== hash;
      if (full || behind) changes.push({ key, id, item, missingOnly: true, ...(behind ? tabHash : {}) });
      continue;
    }
    hashes[id] = hash;
    changes.push({ key, id, item, baseHash: known[id], ...tabHash, ...(isPending ? { pending: true } : {}) });
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
  const base = baseOf(change);
  if (!base || !change.item || collection.serverOwnedId?.(change.id)) return false;
  const localHash = hashRow(collection.toRow(local as never));
  return localHash !== base && localHash !== hashRow(collection.toRow(change.item as never));
}

/**
 * The version the local copy is compared with to tell an edit made here: this tab's own version
 * when it has one (another tab may have moved the shared baseline past it), else the baseline.
 */
function baseOf(change: RemoteChange): string | undefined {
  return change.tabHash !== undefined ? change.tabHash : change.baseHash;
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
  const base = baseOf(change);
  const conflict = change.pending || (base ? localHash !== base : edited);
  if (!conflict) return change.item;
  return collection.mergeConflict!(local as never, change.item as never, trustedNow().toISOString(), Boolean(change.pending));
}

/**
 * Returns prev itself when nothing changes, so no save is triggered. With userId, also records the
 * rows the result now holds as this tab's versions (noteHeldRows); without it, pure.
 */
export function applyRemoteChanges(prev: AppState, changes: RemoteChange[], userId?: string): AppState {
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
        const untouched = change.tabHash === undefined || (index !== -1 && hashOf(collection, items[index]) === change.tabHash);
        if (index !== -1 && untouched) items = items.filter((_, i) => i !== index);
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
        } else if (change.missingOnly && change.tabHash !== undefined && isBehindCopy(collection, items[index], change)) {
          items = items.map((item, i) => (i === index ? change.item! : item));
        }
      }
    }
    if (items !== current) next = withItems(collection, next, items);
  }

  if (revived.size > 0) {
    next = { ...next, deletedEntityIds: (next.deletedEntityIds || []).filter((id) => !revived.has(id)) };
  }
  // Another device's reading log made while this device also moved that book: its pages back on the
  // book (an edit here, uploaded by the next save).
  next = raiseBooksForConcurrentLogs(prev, next, trustedNowMs(), trustedNow().toISOString());
  if (userId) noteHeldRows(userId, next, changes);
  return next;
}

const hashOf = (collection: SyncedCollection, item: unknown): string => hashRow(collection.toRow(item as never));

/** A local copy still at this tab's older version of a row the baseline already holds newer. */
function isBehindCopy(collection: SyncedCollection, local: unknown, change: RemoteChange): boolean {
  const localHash = hashOf(collection, local);
  if (localHash === hashOf(collection, change.item)) return false;
  // The server's own rows always take its copy (isUnsentEdit never keeps one either).
  return localHash === change.tabHash || collection.serverOwnedId?.(change.id) === true;
}

/**
 * Records, as this tab's versions, the pulled rows its state now holds exactly (and deletes it
 * applied), so its next save compares them with what it really has. Safe to run twice.
 */
export function noteHeldRows(userId: string, state: AppState, changes: RemoteChange[]): void {
  const current = tabSyncedHashes(userId);
  let hashes: Baseline | null = null;
  for (const collection of SYNCED_COLLECTIONS) {
    const key = syncKeyOf(collection);
    const forKey = changes.filter((c) => c.key === key && c.id);
    if (forKey.length === 0) continue;
    const held = new Map(itemsOf(collection, state).map((item) => [rowIdOf(collection, item), item]));
    const tab = { ...(current[key] || {}) };
    for (const change of forKey) {
      const local = held.get(change.id);
      if (change.item === null) {
        if (!local) tab[change.id] = DELETED;
      } else if (local) {
        const hash = hashOf(collection, change.item);
        if (hashOf(collection, local) === hash) tab[change.id] = hash;
      }
    }
    hashes = { ...(hashes || current), [key]: tab };
  }
  if (hashes) setTabSyncedHashes(userId, hashes);
}

/**
 * A state another tab of this browser broadcast, made safe to show here. A row the sender still
 * held unchanged at an older version than the shared baseline (it saved before its pull caught up)
 * keeps this tab's copy (the baseline's row, or an edit made here); a synced row the sender never
 * had is kept from this tab, and so is an item made here that never reached the server (the sender
 * never had it and did not delete it); a row the sender holds that the baseline knows deleted is
 * dropped when this tab dropped it. Everything else is the sender's, as sent, and a copy equal to the
 * baseline takes the baseline's version (the sender's can lag its own last save). Returns the state to show and this
 * tab's versions for it. Without the sender's versions (an older app version) the state is taken
 * as sent and this tab's versions are cleared, so every difference counts as an edit, as before.
 */
export function adoptTabState(
  incoming: AppState,
  incomingHashes: Baseline | undefined,
  current: AppState,
  baseline: Baseline,
  currentHashes: Baseline = {}
): { state: AppState; tabHashes: Baseline } {
  if (!incomingHashes) return { state: incoming, tabHashes: {} };
  const tombstones = new Set(incoming.deletedEntityIds || []);
  let next = incoming;
  const tabHashes: Baseline = { ...incomingHashes };

  for (const collection of SYNCED_COLLECTIONS) {
    const key = syncKeyOf(collection);
    const sent = incomingHashes[key] || {};
    const known = baseline[key] || {};
    const mine = currentHashes[key] || {};
    const tab = { ...sent };
    const ours = new Map(itemsOf(collection, current).map((item) => [rowIdOf(collection, item), item]));
    const fresh = (id: string) => {
      const item = ours.get(id);
      return item !== undefined && known[id] !== undefined && known[id] !== DELETED && hashOf(collection, item) === known[id];
    };
    const incomingItems = itemsOf(collection, next);
    const seen = new Set<string>();
    let changed = false;
    const items: unknown[] = [];
    for (const item of incomingItems) {
      const id = rowIdOf(collection, item);
      seen.add(id);
      const behind = id in sent && sent[id] === hashOf(collection, item) && known[id] !== undefined && known[id] !== sent[id];
      if (behind && ours.has(id)) {
        items.push(ours.get(id));
        if (fresh(id)) tab[id] = known[id];
        else if (id in mine) tab[id] = mine[id];
        else delete tab[id];
        changed = true;
      } else if (behind && known[id] === DELETED && !ours.has(id)) {
        tab[id] = DELETED;
        changed = true;
      } else {
        items.push(item);
        // The sender's version can predate its own last save (it is updated by the next diff): a
        // copy equal to the shared baseline is in step with it, whatever version came with it.
        if (known[id] !== undefined && known[id] !== DELETED && hashOf(collection, item) === known[id]) tab[id] = known[id];
      }
    }
    for (const [id, item] of ours) {
      if (seen.has(id) || id in sent || tombstones.has(id)) continue;
      if (fresh(id)) {
        items.push(item);
        tab[id] = known[id];
        changed = true;
      } else if (known[id] === undefined && !collection.serverOwnedId?.(id)) {
        // An item made here that never reached the server (its save is still pending) and that the
        // sender never had: kept, so the save uploads it and it does not vanish from this tab.
        items.push(item);
        changed = true;
      }
    }
    if (changed) next = withItems(collection, next, items);
    tabHashes[key] = tab;
  }
  return { state: next, tabHashes };
}

/**
 * Another tab's row versions after its save (SYNC_VERSIONS_EVENT), taken for the rows this tab holds
 * with exactly that content: the copy is in step with what that tab synced, so it is never sent again
 * as an edit here. Rows held with other content keep this tab's own version. Returns `mine` itself
 * when nothing changes.
 */
export function takePeerVersions(current: AppState, mine: Baseline, peer: Baseline): Baseline {
  let next: Baseline | null = null;
  for (const collection of SYNCED_COLLECTIONS) {
    const key = syncKeyOf(collection);
    const theirs = peer[key];
    if (!theirs) continue;
    let tab: Record<string, string> | null = null;
    for (const item of itemsOf(collection, current)) {
      const id = rowIdOf(collection, item);
      const hash = theirs[id];
      if (!id || hash === undefined || hash === DELETED || mine[key]?.[id] === hash) continue;
      if (hashOf(collection, item) !== hash) continue;
      tab = tab || { ...(mine[key] || {}) };
      tab[id] = hash;
    }
    if (tab) next = { ...(next || mine), [key]: tab };
  }
  return next || mine;
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

/** Ids whose row this tab holds at a different version than the shared baseline. */
function behindIds(userId: string, collection: SyncedCollection): string[] {
  const key = syncKeyOf(collection);
  const known = knownHashes(userId, key);
  const tab = tabSyncedHashes(userId)[key] || {};
  return Object.keys(tab).filter((id) => known[id] !== undefined && known[id] !== tab[id]);
}

const ID_CHUNK = 100;

/** The user's rows with these ids; null when a read fails. */
async function fetchRowsById(
  table: string,
  userId: string,
  ids: string[]
): Promise<Array<Record<string, unknown>> | null> {
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .in('id', ids.slice(i, i + ID_CHUNK));
    if (error || !data) {
      console.error(`[SYNC PULL] ${table} catch-up failed, keeping local data:`, error?.message);
      return null;
    }
    rows.push(...data);
  }
  return rows;
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
      // Rows the server refused to store from this device's upserts: their server copy did not
      // change, so it can sit behind the cursor. Read by id below (a full pull reads them anyway).
      const refused = refusedRowIds(userId, collection.table);
      const rows = await fetchRows(collection.table, userId, since);
      if (!rows) {
        everyTableRead = false;
        return [];
      }
      let refusedRead = true;
      // Rows another tab already pulled past this tab's version sit behind the shared cursor:
      // read them by id, so this tab catches up too.
      if (since) {
        const fetched = new Set(rows.map((row) => String(row.id)));
        const behind = Array.from(new Set([...behindIds(userId, collection), ...refused])).filter((id) => !fetched.has(id));
        const extra = behind.length > 0 ? await fetchRowsById(collection.table, userId, behind) : [];
        if (!extra) {
          everyTableRead = false;
          refusedRead = false;
        } else {
          rows.push(...extra);
        }
      }
      if (refusedRead) clearRefusedRows(userId, collection.table, refused);

      // Read before prepareRemoteRows, which skips the rows these ops are waiting to replace.
      const waiting = collection.mergeConflict ? new Set<string>() : pendingOpIds(userId, collection.table);
      const changes = prepareRemoteRows(userId, collection, rows, full, stale);
      let latest = rows.reduce<number>(
        (max, row) => Math.max(max, Date.parse(String(row.server_updated_at)) || 0),
        cursor ? Date.parse(cursor) : 0
      );
      // A skipped row stays ahead of the cursor: if the server then refuses the waiting op as older
      // (keep-newer returns no error), the next pull still reads the row instead of passing it.
      for (const row of rows) {
        const at = Date.parse(String(row.server_updated_at));
        if (at && waiting.has(String(row.id))) latest = Math.min(latest, at - 1);
      }
      if (latest > 0) localStorage.setItem(cursorKey(userId, collection.table), new Date(latest).toISOString());
      return changes;
    })
  );
  if (full && everyTableRead) localStorage.setItem(lastFullPullKey(userId), new Date(trustedNowMs()).toISOString());
  return { changes: perTable.flat(), everyTableRead };
}
