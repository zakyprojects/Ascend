import type { AppState } from '../../types';
import { SYNCED_COLLECTIONS, itemsOf, rowIdOf, syncKeyOf } from './syncedCollections';
import { hashRow } from './rowHash';
import { tabSyncedHashes } from './tabVersions';

/**
 * When each unsent row edit was made, so it reaches the server with its edit time and not the time
 * it was uploaded. A save diffs the state only after the blob save succeeded: an edit made offline,
 * or in a tab closed inside the save delay, used to be stamped at reconnect or reopen and then beat
 * a newer edit another device had made meanwhile.
 *
 * Per account in localStorage (shared by the tabs, like the outbox): collection key -> item id ->
 * [row hash, edit time]. The hash ties the time to the content: the time a row first took that
 * content on this device.
 */
export type EditTimes = Record<string, Record<string, [string, string]>>;

const editTimesKey = (userId: string) => `ascend_sync_edit_times_${userId}`;

export function readEditTimes(userId: string): EditTimes {
  try {
    const raw = localStorage.getItem(editTimesKey(userId));
    return raw ? (JSON.parse(raw) as EditTimes) : {};
  } catch {
    return {};
  }
}

function writeEditTimes(userId: string, times: EditTimes): void {
  try {
    if (Object.keys(times).length === 0) localStorage.removeItem(editTimesKey(userId));
    else localStorage.setItem(editTimesKey(userId), JSON.stringify(times));
  } catch {
    /* quota: the diff falls back to the upload time, as before */
  }
}

export function clearEditTimes(userId: string): void {
  try {
    localStorage.removeItem(editTimesKey(userId));
  } catch {
    /* ignore */
  }
}

const hashOf = (collection: (typeof SYNCED_COLLECTIONS)[number], item: unknown) =>
  hashRow(collection.toRow(item as never));

function setEntry(times: EditTimes, key: string, id: string, entry: [string, string] | null): boolean {
  const forKey = times[key];
  if (entry === null) {
    if (!forKey || !(id in forKey)) return false;
    delete forKey[id];
    if (Object.keys(forKey).length === 0) delete times[key];
    return true;
  }
  const old = forKey?.[id];
  if (old && old[0] === entry[0] && old[1] === entry[1]) return false;
  times[key] = { ...(forKey || {}), [id]: entry };
  return true;
}

/**
 * Call with every state the tab shows (the store's state effect), before it is cached. Looks only at
 * items whose object changed since `prev`. A copy equal to this tab's version is in step with the
 * server (a pull, another tab's state, or an edit undone) and has no edit time; any other content
 * gets the current time the first time it appears. Collections with their own edit time (time
 * tracker days) and server-owned rows are left out.
 */
export function noteEditTimes(userId: string, prev: AppState | null, next: AppState, nowIso: string): void {
  if (prev === next) return;
  const samePrevAccount = prev?.currentUser?.id === userId ? prev : null;
  let times: EditTimes | null = null;
  let changed = false;
  const versions = tabSyncedHashes(userId);

  for (const collection of SYNCED_COLLECTIONS) {
    if (collection.editTimestamp) continue;
    const items = itemsOf(collection, next);
    const before = samePrevAccount ? itemsOf(collection, samePrevAccount) : [];
    if (items === before) continue;
    const key = syncKeyOf(collection);
    const prevById = new Map<string, unknown>();
    for (const item of before) prevById.set(rowIdOf(collection, item), item);
    const tab = versions[key] || {};
    for (const item of items) {
      const id = item ? rowIdOf(collection, item) : '';
      if (!id || prevById.get(id) === item || collection.serverOwnedId?.(id)) continue;
      times = times || readEditTimes(userId);
      const hash = hashOf(collection, item);
      if (tab[id] === hash) {
        changed = setEntry(times, key, id, null) || changed;
      } else if (times[key]?.[id]?.[0] !== hash) {
        changed = setEntry(times, key, id, [hash, nowIso]) || changed;
      }
    }
  }
  if (times && changed) writeEditTimes(userId, times);
}

/** The time this row content was edited on this device, if known. */
export function editTimeOf(times: EditTimes, key: string, id: string, hash: string): string | undefined {
  const entry = times[key]?.[id];
  return entry && entry[0] === hash ? entry[1] : undefined;
}

/**
 * After a save's diff: drops the entries the saved state holds with that content (queued, or in
 * step). An entry for other content (an edit made while the save ran) stays for the next save.
 */
export function pruneEditTimes(userId: string, saved: AppState): void {
  const times = readEditTimes(userId);
  const keys = Object.keys(times);
  if (keys.length === 0) return;
  let changed = false;
  for (const collection of SYNCED_COLLECTIONS) {
    const key = syncKeyOf(collection);
    const forKey = times[key];
    if (!forKey) continue;
    const held = new Map<string, unknown>();
    for (const item of itemsOf(collection, saved)) held.set(rowIdOf(collection, item), item);
    for (const id of Object.keys(forKey)) {
      const item = held.get(id);
      // Gone from the state (deleted, or another account's data): nothing left to stamp.
      if (item === undefined || hashOf(collection, item) === forKey[id][0]) changed = setEntry(times, key, id, null) || changed;
    }
  }
  if (changed) writeEditTimes(userId, times);
}
