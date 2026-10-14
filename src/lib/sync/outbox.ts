import type { PostgrestError } from '@supabase/supabase-js';
import type { AppState } from '../../types';
import { supabase } from '../supabase';
import { SYNCED_COLLECTIONS, rowIdOf } from './syncedCollections';

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
}

interface DeleteOp {
  kind: 'delete';
  table: string;
  id: string;
}

type OutboxOp = UpsertOp | DeleteOp;
type Outbox = Record<string, OutboxOp>;
/**
 * stateKey -> item id -> row hash, as last sent to or received from the server.
 * DELETED marks a row this device knows is deleted, so bringing the id back is a
 * local re-creation (a re-awarded points entry), not an old copy.
 */
type Baseline = Record<string, Record<string, string>>;
export const DELETED = '';
/** A mirror collection never deletes more than this share of its rows in one diff. */
const MASS_REMOVAL_MIN = 20;

const outboxKey = (userId: string) => `ascend_outbox_${userId}`;
const baselineKey = (userId: string) => `ascend_sync_baseline_${userId}`;
const opKey = (table: string, id: string) => `${table}:${id}`;
export const cursorKey = (userId: string, table: string) => `ascend_sync_cursor_${userId}_${table}`;
const DELETE_CHUNK = 100;

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

/** FNV-1a over the row JSON; toRow fixes the key order. */
export function hashRow(row: Record<string, unknown>): string {
  const text = JSON.stringify(row);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Pure diff: the next baseline and the ops it adds to the outbox. */
export function diffSyncedCollections(
  state: AppState,
  baseline: Baseline,
  outbox: Outbox,
  nowIso: string
): { baseline: Baseline; outbox: Outbox; changed: boolean } {
  const tombstones = new Set(state.deletedEntityIds || []);
  const nextOutbox: Outbox = { ...outbox };
  const nextBaseline: Baseline = {};
  let changed = false;

  for (const collection of SYNCED_COLLECTIONS) {
    const prev = baseline[collection.stateKey] || {};
    const next: Record<string, string> = {};
    const items = (state[collection.stateKey] as Array<{ id?: string }> | undefined) || [];

    for (const item of items) {
      const id = item ? rowIdOf(collection, item) : '';
      if (!id || tombstones.has(id)) continue;
      const row = collection.toRow(item as never);
      const hash = hashRow(row);
      next[id] = hash;
      if (prev[id] === hash) continue;

      const key = opKey(collection.table, id);
      // A pending delete wins, except in a mirror collection, where re-adding is a re-award.
      if (nextOutbox[key]?.kind === 'delete' && !collection.mirrorRemovals) continue;
      nextOutbox[key] = {
        kind: 'upsert',
        table: collection.table,
        id,
        row,
        // A known row that changed is a local edit; a row new to this device keeps its own time,
        // so re-uploading old data never beats a newer server edit.
        updatedAt: id in prev ? nowIso : collection.ownTimestamp(item as never),
      };
      changed = true;
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
        continue;
      }
      const deletes = tombstones.has(id) || (collection.mirrorRemovals && !massRemoval);
      if (!deletes) continue;
      nextOutbox[opKey(collection.table, id)] = { kind: 'delete', table: collection.table, id };
      next[id] = DELETED;
      changed = true;
    }

    if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
    nextBaseline[collection.stateKey] = next;
  }

  return { baseline: nextBaseline, outbox: nextOutbox, changed };
}

/** Call after the blob save for this state succeeded. */
export function recordSyncedChanges(state: AppState): void {
  const userId = state.currentUser?.id;
  if (!userId || typeof window === 'undefined') return;

  const result = diffSyncedCollections(
    state,
    readJson<Baseline>(baselineKey(userId)) || {},
    readJson<Outbox>(outboxKey(userId)) || {},
    new Date().toISOString()
  );
  if (!result.changed) return;

  try {
    // Outbox first: if the baseline write is lost, the next diff only re-queues the same ops.
    writeJson(outboxKey(userId), result.outbox);
    writeJson(baselineKey(userId), result.baseline);
  } catch (err) {
    console.error('[SYNC OUTBOX] Could not store pending changes:', err);
    return;
  }
  void flushOutbox(userId);
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

export function knownHashes(userId: string, stateKey: string): Record<string, string> {
  return (readJson<Baseline>(baselineKey(userId)) || {})[stateKey] || {};
}

/** Records server rows the state now holds, so the next diff does not send them back as edits. */
export function acceptServerRows(userId: string, stateKey: string, hashes: Record<string, string | null>): void {
  const baseline = readJson<Baseline>(baselineKey(userId)) || {};
  const forKey = { ...(baseline[stateKey] || {}) };
  for (const [id, hash] of Object.entries(hashes)) forKey[id] = hash ?? DELETED;
  baseline[stateKey] = forKey;
  writeJson(baselineKey(userId), baseline);
}

export function clearSyncStorage(userId: string): void {
  try {
    localStorage.removeItem(outboxKey(userId));
    localStorage.removeItem(baselineKey(userId));
    for (const { table } of SYNCED_COLLECTIONS) localStorage.removeItem(cursorKey(userId, table));
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

async function sendUpserts(userId: string, table: string, ops: UpsertOp[]): Promise<boolean> {
  // deleted_at null: a points entry re-awarded after a delete comes back (point_entries
  // allows newer revivals); the other tables ignore writes to deleted rows.
  const toRow = (op: UpsertOp) => ({ ...op.row, user_id: userId, updated_at: op.updatedAt, deleted_at: null });
  const { error } = await supabase.from(table).upsert(ops.map(toRow), { onConflict: 'user_id,id' });
  if (!error) {
    settle(userId, ops);
    return true;
  }
  if (!isPermanent(error)) return false;

  // One bad row must not block the rest: retry singly and drop only the rows that fail.
  for (const op of ops) {
    const single = await supabase.from(table).upsert(toRow(op), { onConflict: 'user_id,id' });
    if (single.error && !isPermanent(single.error)) return false;
    if (single.error) console.error(`[SYNC OUTBOX] Dropped ${table}:${op.id}:`, single.error.message);
    settle(userId, [op]);
  }
  return true;
}

async function sendDeletes(userId: string, table: string, ops: DeleteOp[]): Promise<boolean> {
  for (let i = 0; i < ops.length; i += DELETE_CHUNK) {
    const chunk = ops.slice(i, i + DELETE_CHUNK);
    const nowIso = new Date().toISOString();
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

let flushing = false;
let flushAgain = false;

/** Sends pending ops; safe to call often. One tab flushes at a time. */
export async function flushOutbox(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
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
    flushing = false;
  }
}
