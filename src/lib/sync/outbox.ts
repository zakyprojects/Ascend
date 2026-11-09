import type { PostgrestError } from '@supabase/supabase-js';
import type { AppState } from '../../types';
import { supabase } from '../supabase';
import { SYNCED_COLLECTIONS, itemsOf, rowIdOf, syncKeyOf } from './syncedCollections';
import { trustedNow } from '../clock';
import { clearTabSyncedHashes, setTabSyncedHashes, tabSyncedHashes, type Baseline } from './tabVersions';
import { hashRow } from './rowHash';
import { clearEditTimes, editTimeOf, pruneEditTimes, readEditTimes, type EditTimes } from './editTimes';

/**
 * Relational sync outbox (DB normalization, S2 dual-write).
 *
 * After a blob save succeeds, recordSyncedChanges diffs every synced collection
 * against a per-user baseline (row hashes kept in localStorage) and queues row
 * operations. flushOutbox sends them to the tables. Both survive reloads and
 * offline periods, and one op per row is kept (newest wins).
 *
 * Safety rule: a row is soft-deleted on the server ONLY when its id appears in
 * deletedEntityIds. An item that is just missing from the array (a bad merge, an
 * empty state) never deletes anything.
 */

interface UpsertOp {
  kind: 'upsert';
  table: string;
  id: string;
  row: Record<string, unknown>;
  updatedAt: string;
  /**
   * An edit of a row the server held when it was queued (it was synced, and no upload of it as a
   * new row was still waiting). Missing on ops written by older bundles: those are always sent.
   */
  onServer?: true;
}

interface DeleteOp {
  kind: 'delete';
  table: string;
  id: string;
}

type OutboxOp = UpsertOp | DeleteOp;
type Outbox = Record<string, OutboxOp>;
/**
 * collection key -> item id -> row hash, as last sent to or received from the server.
 * DELETED marks a row this device knows is deleted, so bringing the id back is a
 * local re-creation (a re-awarded points entry), not an old copy.
 */
export type { Baseline } from './tabVersions';
export const DELETED = '';
/** A mirror collection never deletes more than this share of its rows in one diff. */
const MASS_REMOVAL_MIN = 20;

const outboxKey = (userId: string) => `ascend_outbox_${userId}`;
const baselineKey = (userId: string) => `ascend_sync_baseline_${userId}`;
const opKey = (table: string, id: string) => `${table}:${id}`;
export const cursorKey = (userId: string, table: string) => `ascend_sync_cursor_${userId}_${table}`;
/** When this device last read every synced table in full (see pull.ts, PURGE_AFTER_DAYS). */
export const lastFullPullKey = (userId: string) => `ascend_sync_last_full_pull_${userId}`;
/** Rows the server did not store from an upsert (keep-newer, a deleted row, a day guard): table -> ids, re-read by the next pull. */
const refetchKey = (userId: string) => `ascend_sync_refetch_${userId}`;
const DELETE_CHUNK = 100;
/**
 * Fired (window event, detail { userId, refused? }) when a save held old copies back, or (refused:
 * true) when the server did not store some rows sent: this tab should pull.
 */
export const SYNC_BEHIND_EVENT = 'ascend-sync-behind';
/**
 * Fired (window event, detail { userId, hashes }) when a save moved this tab's row versions: the
 * store passes them to the other tabs, whose copies of the same rows took the versions this tab
 * had before the save (a broadcast goes out before the save's diff).
 */
export const SYNC_VERSIONS_EVENT = 'ascend-sync-versions';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export { hashRow } from './rowHash';

/**
 * Pure diff: the next baseline, the ops it adds to the outbox, and this tab's next row versions
 * (`tabHashes`, see tabSyncedHashes). `behind` counts old copies held back: rows another tab synced
 * past this tab's unchanged copy. Without tabHashes every changed known row is an edit.
 */
export function diffSyncedCollections(
  state: AppState,
  baseline: Baseline,
  outbox: Outbox,
  nowIso: string,
  tabHashes: Baseline = {},
  /** Versions this tab also held for the state (recordSyncedChanges: the ones current when the diff runs). */
  alsoHeld: Baseline = {},
  /** When each unsent edit was made (editTimes.ts); an edited row is stamped with it, not with nowIso. */
  editTimes: EditTimes = {}
): { baseline: Baseline; outbox: Outbox; changed: boolean; tabHashes: Baseline; behind: number } {
  const tombstones = new Set(state.deletedEntityIds || []);
  const nextOutbox: Outbox = { ...outbox };
  const nextBaseline: Baseline = {};
  const nextTabHashes: Baseline = {};
  let changed = false;
  let behind = 0;

  for (const collection of SYNCED_COLLECTIONS) {
    const prev = baseline[syncKeyOf(collection)] || {};
    const tabPrev = tabHashes[syncKeyOf(collection)] || {};
    const heldPrev = alsoHeld[syncKeyOf(collection)] || {};
    const next: Record<string, string> = {};
    const tabNext: Record<string, string> = {};
    const items = itemsOf(collection, state);

    const serverOwned = (id: string) => collection.serverOwnedId?.(id) === true;

    for (const item of items) {
      const id = item ? rowIdOf(collection, item) : '';
      if (!id || tombstones.has(id)) continue;
      const row = collection.toRow(item as never);
      const hash = hashRow(row);
      if (serverOwned(id)) {
        // Never uploaded; the version only tells the pull whether this tab's copy is behind.
        if (prev[id] === hash) tabNext[id] = hash;
        else if (id in tabPrev) tabNext[id] = tabPrev[id];
        continue;
      }
      if (prev[id] === hash) {
        next[id] = hash;
        tabNext[id] = hash;
        continue;
      }
      // Unchanged in this tab since it last synced the row, while the baseline moved on (another
      // tab pulled a newer row or a delete): an old copy. Uploading it would stamp old content
      // with "now" and undo the newer row, so it is held back and the next pull replaces it.
      if (id in prev && ((id in tabPrev && tabPrev[id] === hash) || (id in heldPrev && heldPrev[id] === hash))) {
        next[id] = prev[id];
        tabNext[id] = hash;
        behind++;
        continue;
      }
      next[id] = hash;
      tabNext[id] = hash;

      const key = opKey(collection.table, id);
      // A pending delete wins, except where the table revives rows (a re-award or a restore).
      if (nextOutbox[key]?.kind === 'delete' && !collection.revivable) continue;
      const waiting = nextOutbox[key];
      const onServer =
        id in prev && prev[id] !== DELETED && (!waiting || (waiting.kind === 'upsert' && waiting.onServer === true));
      nextOutbox[key] = {
        kind: 'upsert',
        table: collection.table,
        id,
        row,
        // A known row that changed is a local edit, stamped with the time it was made (time tracker
        // days carry it in the row, other rows in editTimes), so an edit made offline or in a tab
        // closed before its save doesn't take the upload time and beat a newer edit from another
        // device. A row new to this device keeps its own time, so re-uploading old data never
        // beats a newer server edit.
        updatedAt: id in prev
          ? collection.editTimestamp?.(item as never) ?? notLater(editTimeOf(editTimes, syncKeyOf(collection), id, hash), nowIso)
          : collection.ownTimestamp(item as never),
        ...(onServer ? { onServer: true as const } : {}),
      };
      changed = true;
    }

    // Server-owned rows keep the baseline the server gave them, so its next copy is compared to that.
    for (const id of Object.keys(prev)) {
      if (serverOwned(id)) next[id] = prev[id];
    }

    const removed = Object.keys(prev).filter((id) => !(id in next) && prev[id] !== DELETED);
    const mirrored = collection.mirrorRemovals ? removed.filter((id) => !tombstones.has(id)) : [];
    const knownCount = Object.values(prev).filter((hash) => hash !== DELETED).length;
    const massRemoval = mirrored.length > MASS_REMOVAL_MIN && mirrored.length > knownCount / 2;
    if (massRemoval) {
      console.error(`[SYNC OUTBOX] Refused to delete ${mirrored.length} ${collection.table} rows at once.`);
    }

    for (const id of Object.keys(prev)) {
      if (id in next) continue;
      if (prev[id] === DELETED) {
        next[id] = DELETED;
        if (!(id in tabNext)) tabNext[id] = DELETED;
        continue;
      }
      const deletes = tombstones.has(id) || (collection.mirrorRemovals && !massRemoval);
      if (!deletes) continue;
      nextOutbox[opKey(collection.table, id)] = { kind: 'delete', table: collection.table, id };
      next[id] = DELETED;
      tabNext[id] = DELETED;
      changed = true;
    }

    if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
    nextBaseline[syncKeyOf(collection)] = next;
    nextTabHashes[syncKeyOf(collection)] = tabNext;
  }

  return { baseline: nextBaseline, outbox: nextOutbox, changed, tabHashes: nextTabHashes, behind };
}

/** The edit time, never later than now (a device clock that ran ahead at the edit). */
function notLater(editIso: string | undefined, nowIso: string): string {
  return editIso && editIso < nowIso ? editIso : nowIso;
}

/**
 * The diff's versions, except rows whose version moved while the save ran (a pull or another tab's
 * state was taken in): the tab now shows a different copy of those, and keeps the version for it.
 */
function keepMovedVersions(result: Baseline, atStart: Baseline, current: Baseline): Baseline {
  const next: Baseline = { ...result };
  for (const key of new Set([...Object.keys(atStart), ...Object.keys(current)])) {
    const before = atStart[key] || {};
    const now = current[key] || {};
    let forKey: Record<string, string> | null = null;
    for (const id of new Set([...Object.keys(before), ...Object.keys(now)])) {
      if (before[id] === now[id]) continue;
      forKey = forKey || { ...(next[key] || {}) };
      if (id in now) forKey[id] = now[id];
      else delete forKey[id];
    }
    if (forKey) next[key] = forKey;
  }
  return next;
}

/** Accounts whose last save could not store its changes on this device (storage full). */
const storageFailed = new Set<string>();

/**
 * Call after the blob save for this state succeeded. versionsAtStart: this tab's versions when the
 * save took the state (tabSyncedHashes then). A pull or a broadcast taken in during the save moves
 * the versions to copies the saved state does not hold; compared with the moved ones only, an old
 * copy in the saved state looked like an edit and was sent with "now". So a copy equal to either
 * the versions at the start or the current ones (an earlier save's diff may have moved them) is
 * not an edit.
 */
export function recordSyncedChanges(state: AppState, versionsAtStart?: Baseline): void {
  const userId = state.currentUser?.id;
  if (!userId || typeof window === 'undefined') return;

  const current = tabSyncedHashes(userId);
  const atStart = versionsAtStart ?? current;
  const result = diffSyncedCollections(
    state,
    readJson<Baseline>(baselineKey(userId)) || {},
    readJson<Outbox>(outboxKey(userId)) || {},
    trustedNow().toISOString(),
    atStart,
    atStart === current ? {} : current,
    readEditTimes(userId)
  );
  if (result.changed) {
    try {
      // Outbox first: if the baseline write is lost, the next diff only re-queues the same ops.
      writeJson(outboxKey(userId), result.outbox);
      writeJson(baselineKey(userId), result.baseline);
    } catch (err) {
      // Storage full: nothing was queued, so this tab's versions and the edit times stay as they
      // were. Moved on, the edits would read as old copies next time and be replaced by the server.
      console.error('[SYNC OUTBOX] Could not store pending changes:', err);
      storageFailed.add(userId);
      window.dispatchEvent(
        new CustomEvent('app-toast-error', {
          detail: {
            title: 'Device storage is full',
            message: "Your latest changes can't be queued to sync. Free up browser storage and keep this tab open.",
            dedupKey: 'sync-storage-full',
          },
        })
      );
      if (result.behind > 0) window.dispatchEvent(new CustomEvent(SYNC_BEHIND_EVENT, { detail: { userId } }));
      return;
    }
  }
  storageFailed.delete(userId);
  pruneEditTimes(userId, state);
  const nextVersions = atStart === current ? result.tabHashes : keepMovedVersions(result.tabHashes, atStart, current);
  const versionsMoved = JSON.stringify(nextVersions) !== JSON.stringify(current);
  setTabSyncedHashes(userId, nextVersions);
  if (versionsMoved) {
    window.dispatchEvent(new CustomEvent(SYNC_VERSIONS_EVENT, { detail: { userId, hashes: nextVersions } }));
  }
  if (result.behind > 0) window.dispatchEvent(new CustomEvent(SYNC_BEHIND_EVENT, { detail: { userId } }));
  if (!result.changed) return;
  void flushOutbox(userId);
}

/** True while this tab's last save for the account could not queue its changes (storage full). */
export function syncStorageFailed(userId: string): boolean {
  return storageFailed.has(userId);
}

/** Ids with a local op still waiting to be sent; a server row must not overwrite those. */
export function pendingOpIds(userId: string, table: string): Set<string> {
  const outbox = readJson<Outbox>(outboxKey(userId)) || {};
  return new Set(
    Object.values(outbox)
      .filter((op) => op.table === table)
      .map((op) => op.id)
  );
}

/**
 * The stale full pull found these synced rows gone from the server (purged 30 days after a delete
 * this device never saw): drops their waiting deletes and their edits of rows the server held, so
 * an edit queued on a device away that long does not insert the purged row again. A new row whose
 * first upload is still waiting (or an op from an older bundle) is kept. Returns the ids dropped.
 */
export function dropOpsForPurgedRows(userId: string, table: string, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const stored = readJson<Outbox>(outboxKey(userId)) || {};
  const dropped: string[] = [];
  for (const id of ids) {
    const op = stored[opKey(table, id)];
    if (!op || (op.kind === 'upsert' && op.onServer !== true)) continue;
    delete stored[opKey(table, id)];
    dropped.push(id);
  }
  if (dropped.length === 0) return [];
  try {
    writeJson(outboxKey(userId), stored);
  } catch {
    return [];
  }
  return dropped;
}

/** True while any local op is still waiting to be sent. */
export function hasPendingSyncOps(userId: string): boolean {
  return Object.keys(readJson<Outbox>(outboxKey(userId)) || {}).length > 0;
}

export function knownHashes(userId: string, key: string): Record<string, string> {
  return readBaseline(userId)[key] || {};
}

/** The shared baseline: every collection's row hashes as last sent to or received from the server. */
export function readBaseline(userId: string): Baseline {
  return readJson<Baseline>(baselineKey(userId)) || {};
}

/** Records server rows the state now holds, so the next diff does not send them back as edits. */
export function acceptServerRows(userId: string, key: string, hashes: Record<string, string | null>): void {
  const baseline = readJson<Baseline>(baselineKey(userId)) || {};
  const forKey = { ...(baseline[key] || {}) };
  for (const [id, hash] of Object.entries(hashes)) forKey[id] = hash ?? DELETED;
  baseline[key] = forKey;
  writeJson(baselineKey(userId), baseline);
}

export function clearSyncStorage(userId: string): void {
  try {
    localStorage.removeItem(outboxKey(userId));
    localStorage.removeItem(baselineKey(userId));
    for (const { table } of SYNCED_COLLECTIONS) localStorage.removeItem(cursorKey(userId, table));
    localStorage.removeItem(lastFullPullKey(userId));
    localStorage.removeItem(refetchKey(userId));
    clearTabSyncedHashes(userId);
    clearEditTimes(userId);
  } catch {
    /* ignore */
  }
}

/** Data, constraint and permission errors: retrying the same op can never succeed. */
function isPermanent(error: PostgrestError): boolean {
  return /^(22|23|42)/.test(error.code || '');
}

/** Drops sent ops from storage unless a newer op replaced them meanwhile. */
function settle(userId: string, sent: OutboxOp[]): void {
  const stored = readJson<Outbox>(outboxKey(userId)) || {};
  for (const op of sent) {
    const key = opKey(op.table, op.id);
    if (JSON.stringify(stored[key]) === JSON.stringify(op)) delete stored[key];
  }
  writeJson(outboxKey(userId), stored);
}

/**
 * Records the sent rows the server did not store (missing from the returned rows) for the next pull
 * to re-read by id, and asks this tab to pull. The diff already set this tab's version to the copy
 * sent, so the server's row then replaces it. A row that does not exist on the server (a day guard
 * refused an insert) is read as nothing and forgotten: nothing loops.
 */
function noteRefused(userId: string, table: string, ops: UpsertOp[], stored: unknown): void {
  if (!Array.isArray(stored)) return;
  const kept = new Set(stored.map((row) => String((row as { id?: unknown }).id)));
  const refused = ops.filter((op) => !kept.has(op.id)).map((op) => op.id);
  if (refused.length === 0) return;
  const all = readJson<Record<string, string[]>>(refetchKey(userId)) || {};
  all[table] = Array.from(new Set([...(all[table] || []), ...refused]));
  writeJson(refetchKey(userId), all);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_BEHIND_EVENT, { detail: { userId, refused: true } }));
  }
}

/** Ids of this table the server refused to store; the next pull re-reads them by id. */
export function refusedRowIds(userId: string, table: string): string[] {
  return (readJson<Record<string, string[]>>(refetchKey(userId)) || {})[table] || [];
}

/** The pull read these refused rows: forget them (ids refused again meanwhile stay only if not read). */
export function clearRefusedRows(userId: string, table: string, ids: string[]): void {
  if (ids.length === 0) return;
  const all = readJson<Record<string, string[]>>(refetchKey(userId)) || {};
  const read = new Set(ids);
  const left = (all[table] || []).filter((id) => !read.has(id));
  if (left.length > 0) all[table] = left;
  else delete all[table];
  try {
    if (Object.keys(all).length > 0) writeJson(refetchKey(userId), all);
    else localStorage.removeItem(refetchKey(userId));
  } catch {
    /* ignore */
  }
}

async function sendUpserts(userId: string, table: string, ops: UpsertOp[]): Promise<boolean> {
  // deleted_at null: a points entry re-awarded after a delete comes back (point_entries
  // allows newer revivals); the other tables ignore writes to deleted rows.
  const toRow = (op: UpsertOp) => ({ ...op.row, user_id: userId, updated_at: op.updatedAt, deleted_at: null });
  // Returns the rows stored: a row a trigger refused (keep-newer: a newer edit is there; a deleted
  // row; a day guard) is missing and answers no error, so it is re-read instead of left diverged.
  const { data, error } = await supabase.from(table).upsert(ops.map(toRow), { onConflict: 'user_id,id' }).select('id');
  if (!error) {
    noteRefused(userId, table, ops, data);
    settle(userId, ops);
    return true;
  }
  if (!isPermanent(error)) return false;

  // One bad row must not block the rest: retry singly and drop only the rows that fail.
  for (const op of ops) {
    const single = await supabase.from(table).upsert(toRow(op), { onConflict: 'user_id,id' }).select('id');
    if (single.error && !isPermanent(single.error)) return false;
    if (single.error) console.error(`[SYNC OUTBOX] Dropped ${table}:${op.id}:`, single.error.message);
    else noteRefused(userId, table, [op], single.data);
    settle(userId, [op]);
  }
  return true;
}

async function sendDeletes(userId: string, table: string, ops: DeleteOp[]): Promise<boolean> {
  for (let i = 0; i < ops.length; i += DELETE_CHUNK) {
    const chunk = ops.slice(i, i + DELETE_CHUNK);
    const nowIso = trustedNow().toISOString();
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: nowIso, updated_at: nowIso })
      .eq('user_id', userId)
      .in(
        'id',
        chunk.map((op) => op.id)
      );
    if (error && !isPermanent(error)) return false;
    if (error) console.error(`[SYNC OUTBOX] Dropped ${chunk.length} ${table} deletes:`, error.message);
    settle(userId, chunk);
  }
  return true;
}

async function flushOnce(userId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const { data } = await supabase.auth.getSession();
  // Never send one account's ops with another account's session.
  if (data.session?.user.id !== userId) return;

  const ops = Object.values(readJson<Outbox>(outboxKey(userId)) || {});
  for (const table of new Set(ops.map((op) => op.table))) {
    const forTable = ops.filter((op) => op.table === table);
    const upserts = forTable.filter((op): op is UpsertOp => op.kind === 'upsert');
    const deletes = forTable.filter((op): op is DeleteOp => op.kind === 'delete');
    if (upserts.length > 0 && !(await sendUpserts(userId, table, upserts))) return;
    if (deletes.length > 0 && !(await sendDeletes(userId, table, deletes))) return;
  }
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

/**
 * Sends pending ops; safe to call often. One tab flushes at a time. The promise settles once
 * the running flush (including a repeat this call asked for) is done.
 */
export function flushOutbox(userId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = runFlush(userId);
  return flushing;
}

async function runFlush(userId: string): Promise<void> {
  try {
    do {
      flushAgain = false;
      if (navigator.locks) {
        await navigator.locks.request(`ascend_outbox_flush_${userId}`, { ifAvailable: true }, async (lock) => {
          if (lock) await flushOnce(userId);
        });
      } else {
        await flushOnce(userId);
      }
    } while (flushAgain);
  } catch (err) {
    console.error('[SYNC OUTBOX] Flush failed, will retry:', err);
  } finally {
    flushing = null;
  }
}
