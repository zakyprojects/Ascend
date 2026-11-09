// Offline audit LOW fixes of 2026-11-09 (knowledge/mode-a-offline-resilience-2026-11-09.md, F4–F8).
// F4: storage full while queueing: this tab's versions and edit times stay, so the edit is queued
//     on the next save instead of being read as an old copy and replaced by the server row.
// F5: the logout save clears the dirty flag, so the device data is removed when nothing is unsent
//     (the store's logout itself is not run here: its step 3b condition is checked on the helpers).
// F6: a finished save clears the dirty flag only when no newer change set it meanwhile (or the save
//     could not queue its changes). The store wiring (state effect, autosaves, logout) is not run here.
import { DEFAULT_STATE, type AppState } from '@/types';

const store = new Map<string, string>();
let failWrites: RegExp | null = null;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (failWrites?.test(k)) throw new Error('QuotaExceededError');
    store.set(k, String(v));
  },
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
const events: Array<{ type: string; detail?: unknown }> = [];
(globalThis as { window?: unknown }).window = {
  location: { hash: '', search: '', pathname: '/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (e: { type: string; detail?: unknown }) => {
    events.push(e);
    return true;
  },
};
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const { diffSyncedCollections, hasPendingSyncOps, hashRow, readBaseline, recordSyncedChanges, syncStorageFailed } = await import('../outbox');
const { SYNCED_COLLECTIONS } = await import('../syncedCollections');
const { setTabSyncedHashes, clearTabSyncedHashes, tabSyncedHashes } = await import('../tabVersions');
const { noteEditTimes, readEditTimes } = await import('../editTimes');
const { supabase } = await import('../../supabase');
const { clearDirtyAfterSave, dirtyMark, markDirty } = await import('../dirtyFlag');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const UID = 'u1';
const T0 = '2026-11-02T16:50:00.000Z';
const EDIT = '2026-11-05T04:00:00.000Z';
const user = { id: UID, username: 'zakria' } as AppState['currentUser'];
const base = (extra: Partial<AppState>) => ({ ...DEFAULT_STATE, currentUser: user, ...extra }) as AppState;
const byTable = (table: string) => SYNCED_COLLECTIONS.find((c) => c.table === table)!;
const hashOf = (table: string, item: unknown) => hashRow(byTable(table).toRow(item as never));
const task = (id: string, title: string, completed: boolean) =>
  ({ id, title, priority: 'medium', completed, subtasks: [], createdAt: T0 }) as never;
const outbox = () =>
  JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}') as Record<string, { kind: string; updatedAt?: string; row?: Record<string, unknown> }>;

// No session: recordSyncedChanges' flush returns at once.
const client = supabase as unknown as { auth: { getSession: unknown } };
client.auth.getSession = async () => ({ data: { session: null } });

function reset() {
  store.clear();
  events.length = 0;
  failWrites = null;
  clearTabSyncedHashes(UID);
}

function synced(state: AppState) {
  const result = diffSyncedCollections(state, {}, {}, T0, {});
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(result.baseline));
  store.set(`ascend_outbox_${UID}`, '{}');
  setTabSyncedHashes(UID, result.tabHashes);
}

// ---------------------------------------------------------------- F4: storage full while queueing
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false)] });
  synced(s0);
  const edited = base({ tasks: [task('t1', 'Essay v2', false)] });
  noteEditTimes(UID, s0, edited, EDIT);
  const oldVersion = tabSyncedHashes(UID).tasks.t1;

  failWrites = /^ascend_outbox_/;
  recordSyncedChanges(edited);
  assert(syncStorageFailed(UID), 'the failed write is remembered');
  assert(tabSyncedHashes(UID).tasks.t1 === oldVersion, "this tab's version did not move to the unqueued copy");
  assert(readEditTimes(UID).tasks?.t1?.[1] === EDIT, 'the edit time is kept for the next save');
  assert(readBaseline(UID).tasks.t1 === oldVersion, 'the baseline did not move');
  const toast = events.find((e) => e.type === 'app-toast-error');
  assert(Boolean(toast), 'a storage full toast is shown');
  assert((toast!.detail as { dedupKey?: string }).dedupKey === 'sync-storage-full', 'the toast is deduplicated');

  // Storage freed: the next save queues the edit with its edit time (before the fix it was held
  // back as an old copy and the next pull put the server row back).
  failWrites = null;
  events.length = 0;
  recordSyncedChanges(edited);
  assert(!syncStorageFailed(UID), 'a stored save clears the failure');
  const op = outbox()['tasks:t1'];
  assert(op?.kind === 'upsert', 'the edit is queued once storage works again');
  assert(op?.updatedAt === EDIT, 'stamped with the time it was made');
  assert(tabSyncedHashes(UID).tasks.t1 === hashOf('tasks', task('t1', 'Essay v2', false)), 'the version moves with the queued copy');
  assert(!events.some((e) => e.type === 'ascend-sync-behind'), 'the edit is not read as an old copy');
}

// ---------------------------------------------------------------- F6: dirty flag generations
{
  reset();
  const key = `ascend_dirty_${UID}`;
  markDirty(UID);
  const a = dirtyMark(UID);
  assert(Boolean(a), 'the flag is set');
  // Edit B lands while A's save runs.
  markDirty(UID);
  const b = dirtyMark(UID);
  assert(a !== b, 'every mark is new');
  clearDirtyAfterSave(UID, a);
  assert(store.get(key) === b, "A's finished save keeps the flag B set (before the fix it was removed)");
  clearDirtyAfterSave(UID, b);
  assert(!store.has(key), "B's own save clears it");
  // A save that started with no flag never clears one set meanwhile.
  markDirty(UID);
  clearDirtyAfterSave(UID, null);
  assert(store.has(key), 'a flag set after the save took its state stays');
  // An older bundle's '1' mark still clears normally.
  store.set(key, '1');
  clearDirtyAfterSave(UID, dirtyMark(UID));
  assert(!store.has(key), "an older tab's '1' is cleared by a save that read it");
  // The save could not queue its row changes (storage full): the flag stays.
  synced(base({ tasks: [task('t1', 'Essay', false)] }));
  markDirty(UID);
  const c = dirtyMark(UID);
  failWrites = /^ascend_outbox_/;
  recordSyncedChanges(base({ tasks: [task('t1', 'Changed', false)] }));
  failWrites = null;
  clearDirtyAfterSave(UID, c);
  assert(store.get(key) === c, 'storage full keeps the flag, so logout keeps the data and reconnect retries');
}

// ---------------------------------------------------------------- F5: logout right after an edit
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false)] });
  synced(s0);
  // The edit's state effect marked the flag; logout saves before the debounce ran.
  markDirty(UID);
  const atLogout = dirtyMark(UID);
  recordSyncedChanges(base({ tasks: [task('t1', 'Essay v3', false)] }));
  // The flush is sent and settled (the fake has no session, so it is settled by hand here).
  store.set(`ascend_outbox_${UID}`, '{}');
  clearDirtyAfterSave(UID, atLogout);
  const clearsDevice = !hasPendingSyncOps(UID) && !store.get(`ascend_dirty_${UID}`);
  assert(clearsDevice, 'after a saved and sent logout nothing holds the device data back (before the fix the flag did)');
  // An edit made while the logout save ran keeps the data on the device.
  markDirty(UID);
  const atLogout2 = dirtyMark(UID);
  markDirty(UID);
  clearDirtyAfterSave(UID, atLogout2);
  assert(Boolean(store.get(`ascend_dirty_${UID}`)), 'an edit during the logout save keeps the flag');
}

console.log('offlineLowFixes: all passed');
