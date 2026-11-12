// Offline audit LOW fixes of 2026-11-09 (knowledge/mode-a-offline-resilience-2026-11-09.md, F4–F8).
// F4: storage full while queueing: this tab's versions and edit times stay, so the edit is queued
//     on the next save instead of being read as an old copy and replaced by the server row.
// F7: a device away 30+ days with a queued edit of a row the server purged drops that edit at the
//     stale full pull instead of inserting the purged row again; a new row's first upload is kept.
// F8: rows the server rejects for good (22/23/42) are kept in a short dead-letter list (ids, table,
//     code; no row values or error text). The Sentry report itself is a no-op outside production
//     builds and is not checked here.
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

const { diffSyncedCollections, droppedOps, flushOutbox, hasPendingSyncOps, hashRow, lastFullPullKey, readBaseline, recordSyncedChanges, syncStorageFailed } =
  await import('../outbox');
const { applyRemoteChanges, pullSyncedRows } = await import('../pull');
const { trustedNowMs } = await import('../../time/clock');
const { SYNCED_COLLECTIONS } = await import('../syncedCollections');
const { setTabSyncedHashes, clearTabSyncedHashes, tabSyncedHashes } = await import('../tabVersions');
const { noteEditTimes, readEditTimes } = await import('../editTimes');
const { supabase } = await import('../../auth/supabase');
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
const client = supabase as unknown as { from: unknown; auth: { getSession: unknown } };
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

// ---------------------------------------------------------------- F7: purged row, queued edit
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Old', false), task('t2', 'Kept', false)] });
  synced(s0);
  // Offline: t1 edited (the server held it), t3 created; both saves' ops wait in the outbox.
  const local = base({ tasks: [task('t1', 'Old, edited', false), task('t2', 'Kept', false), task('t3', 'New', false)] });
  recordSyncedChanges(local);
  const queued = outbox();
  assert((queued['tasks:t1'] as { onServer?: boolean }).onServer === true, 'an edit of a synced row is marked');
  assert(!(queued['tasks:t3'] as { onServer?: boolean }).onServer, 'a new row is not');
  // Edited again before its first upload: still a new row.
  recordSyncedChanges(base({ ...local, tasks: [task('t1', 'Old, edited', false), task('t2', 'Kept', false), task('t3', 'New v2', false)] }));
  assert(!(outbox()['tasks:t3'] as { onServer?: boolean }).onServer, 'a new row edited before upload stays unmarked');
  const held = base({ tasks: [task('t1', 'Old, edited', false), task('t2', 'Kept', false), task('t3', 'New v2', false)] });
  await flushOutbox(UID); // the saves' flushes find no session (still offline)

  // 40 days away; meanwhile another device deleted t1 and the purge removed it.
  store.set(lastFullPullKey(UID), new Date(trustedNowMs() - 40 * 24 * 60 * 60 * 1000).toISOString());
  const serverRow = {
    ...byTable('tasks').toRow(task('t2', 'Kept', false) as never),
    user_id: UID,
    updated_at: T0,
    server_updated_at: T0,
    deleted_at: null,
  };
  client.auth.getSession = async () => ({ data: { session: { user: { id: UID } } } });
  client.from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gt: () => query,
      order: () => query,
      range: () => query,
      then: (resolve: (r: unknown) => void) => resolve({ data: table === 'tasks' ? [serverRow] : [], error: null }),
    };
    return query;
  };
  const { changes } = await pullSyncedRows(UID, true);
  const after = applyRemoteChanges(held, changes, UID);
  client.auth.getSession = async () => ({ data: { session: null } });
  assert(!('tasks:t1' in outbox()), 'the queued edit of the purged row is dropped (before the fix it was sent and re-inserted)');
  assert('tasks:t3' in outbox(), "the new row's first upload still waits");
  const ids = (after.tasks || []).map((t) => t.id);
  assert(!ids.includes('t1'), 'the purged row leaves this device too (delete wins)');
  assert(ids.includes('t2') && ids.includes('t3'), 'the other rows stay');

  // An op from an older bundle (no mark) is still sent, as before.
  reset();
  synced(s0);
  store.set(
    `ascend_outbox_${UID}`,
    JSON.stringify({ 'tasks:t1': { kind: 'upsert', table: 'tasks', id: 't1', row: byTable('tasks').toRow(task('t1', 'x', false) as never), updatedAt: T0 } })
  );
  store.set(lastFullPullKey(UID), new Date(trustedNowMs() - 40 * 24 * 60 * 60 * 1000).toISOString());
  client.auth.getSession = async () => ({ data: { session: { user: { id: UID } } } });
  await pullSyncedRows(UID, true);
  client.auth.getSession = async () => ({ data: { session: null } });
  assert('tasks:t1' in outbox(), "an unmarked op is kept (it may be a new row's first upload)");
}

// ---------------------------------------------------------------- F8: rejected rows are recorded
{
  reset();
  const s0 = base({ tasks: [task('t1', 'A', false), task('t2', 'B', false), task('t3', 'C', false)] });
  synced(s0);
  // t1 edited (the server rejects it: a check violation), t2 edited (stored), t3 deleted (the
  // update is rejected: a bad input).
  recordSyncedChanges(base({ tasks: [task('t1', 'A2', false), task('t2', 'B2', false)], deletedEntityIds: ['t3'] }));
  await flushOutbox(UID);
  const reject = { code: '23514', message: 'new row for relation "tasks" violates check constraint: secret text' };
  client.auth.getSession = async () => ({ data: { session: { user: { id: UID } } } });
  client.from = () => {
    let upserted: Array<Record<string, unknown>> | null = null;
    let updating = false;
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      upsert: (rows: Array<Record<string, unknown>> | Record<string, unknown>) => ((upserted = Array.isArray(rows) ? rows : [rows]), query),
      update: () => ((updating = true), query),
      then: (resolve: (r: unknown) => void) => {
        if (updating) return resolve({ data: null, error: { code: '22P02', message: 'invalid input syntax' } });
        if (upserted && upserted.some((r) => r.id === 't1')) return resolve({ data: null, error: reject });
        return resolve({ data: (upserted || []).map((r) => ({ id: r.id })), error: null });
      },
    };
    return query;
  };
  await flushOutbox(UID);
  client.auth.getSession = async () => ({ data: { session: null } });
  assert(Object.keys(outbox()).length === 0, 'rejected ops still leave the outbox (they can never succeed)');
  const dropped = droppedOps(UID);
  assert(dropped.length === 2, `two drops recorded (got ${dropped.length})`);
  assert(dropped.some((d) => d.table === 'tasks' && d.id === 't1' && d.kind === 'upsert' && d.code === '23514'), 'the rejected upsert is recorded');
  assert(dropped.some((d) => d.id === 't3' && d.kind === 'delete' && d.code === '22P02'), 'the rejected delete is recorded');
  assert(!JSON.stringify(dropped).includes('secret text') && !JSON.stringify(dropped).includes('A2'), 'no error text or row values kept');
  assert(!dropped.some((d) => d.id === 't2'), 'the stored row is not recorded');
}

console.log('offlineLowFixes: all passed');
