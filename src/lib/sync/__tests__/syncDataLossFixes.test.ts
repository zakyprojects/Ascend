// Client sync data-loss fixes of 2026-11-05 (knowledge/mode-a-sync-scenarios-2026-11-05.md, fixes 1-4):
// 1. Reopen with an unfinished save (dirty flag): only the settings part of the device cache goes over
//    the hydrated state; the synced lists stay as hydration merged them (phone swipe-away, loss i2/i3).
// 2. A broadcast's copy equal to the shared baseline takes the baseline's version, a save's new
//    versions reach the other tabs, and a save diffs against the versions it started with (m5/m6, j2b).
// 3. A broadcast keeps this tab's own never-synced new item (g2; the debounced save of the latest
//    state, g1, is store glue and covered by the simulation).
// 4. A delta pull does not move the cursor past a row it skipped for a waiting op, so a refused (older)
//    op is followed by a re-read of the newer row (j2a).
import { DEFAULT_STATE, type AppState } from '@/types';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
const events: string[] = [];
(globalThis as { window?: unknown }).window = {
  location: { hash: '', search: '', pathname: '/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (e: { type: string }) => {
    events.push(e.type);
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

const { DELETED, SYNC_VERSIONS_EVENT, cursorKey, diffSyncedCollections, hashRow, readBaseline, recordSyncedChanges } =
  await import('../outbox');
const { adoptTabState, applyRemoteChanges, prepareRemoteRows, pullSyncedRows, takePeerVersions } = await import('../pull');
const { SYNCED_COLLECTIONS, cacheWithHydratedCollections, itemsOf, rowIdOf } = await import('../syncedCollections');
const { setTabSyncedHashes, tabSyncedHashes, clearTabSyncedHashes } = await import('../tabVersions');
const { supabase } = await import('../../supabase');
type Baseline = Record<string, Record<string, string>>;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const UID = 'u1';
const T0 = '2026-11-02T16:50:00.000Z';
const NOW = '2026-11-05T05:00:00.000Z';
const user = { id: UID, username: 'zakria' } as AppState['currentUser'];
const base = (extra: Partial<AppState>) => ({ ...DEFAULT_STATE, currentUser: user, ...extra }) as AppState;
const byTable = (table: string) => SYNCED_COLLECTIONS.find((c) => c.table === table)!;
const hashOf = (table: string, item: unknown) => hashRow(byTable(table).toRow(item as never));
const itemOf = (state: AppState, table: string, id: string) =>
  itemsOf(byTable(table), state).find((item) => rowIdOf(byTable(table), item) === id) as Record<string, unknown> | undefined;
const task = (id: string, title: string, completed: boolean) =>
  ({ id, title, priority: 'medium', completed, subtasks: [], createdAt: T0 }) as never;
const book = (page: number, updatedAt: string) =>
  ({ id: 'book-1', title: 'The Power of Now', totalPages: 250, currentPage: page, currentAmount: page, addedAt: T0, updatedAt }) as never;
const activity = (id: string, name: string) => ({ id, name, color: '#888', createdAt: T0 }) as never;
const tt = (activities: unknown[]) => ({ ...DEFAULT_STATE.timeTracker, activities }) as AppState['timeTracker'];
const outbox = () => JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}') as Record<string, { kind: string; row?: Record<string, unknown> }>;

function reset() {
  store.clear();
  events.length = 0;
  clearTabSyncedHashes(UID);
}

/** Saves the state as synced: baseline and this tab's versions hold every row. */
function synced(state: AppState): Baseline {
  const result = diffSyncedCollections(state, {}, {}, T0, {});
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(result.baseline));
  store.set(`ascend_outbox_${UID}`, '{}');
  setTabSyncedHashes(UID, result.tabHashes);
  return result.tabHashes;
}

const row = (table: string, item: unknown, at: string, deleted = false) => ({
  ...byTable(table).toRow(item as never),
  user_id: UID,
  updated_at: at,
  server_updated_at: at,
  deleted_at: deleted ? at : null,
});

// ---------------------------------------------------------------- fix 1: boot with a dirty cache
{
  reset();
  // Synced state on this device before it closed: task t1 open, t2 titled, activity act-1 alive.
  const before = base({
    tasks: [task('t1', 'Write essay', false), task('t2', 'Buy milk', false)],
    timeTracker: tt([activity('act-1', 'Reading')]),
  });
  synced(before);
  // The tab closed inside the save debounce: the cache holds an offline-style edit (t2 renamed here),
  // a brand-new task t9 that never reached the server, a setting and a tombstone.
  const cache = base({
    ...before,
    tasks: [task('t9', 'New here', false), task('t1', 'Write essay', false), task('t2', 'Buy oat milk', false)],
    themePreference: 'light',
    deletedEntityIds: ['old-1'],
  } as Partial<AppState>);
  // Meanwhile the phone completed t1 and deleted act-1; hydration = cache lists + full pull.
  const changes = [
    ...prepareRemoteRows(UID, byTable('tasks'), [row('tasks', task('t1', 'Write essay', true), NOW), row('tasks', task('t2', 'Buy milk', false), T0)], true),
    ...prepareRemoteRows(UID, byTable('time_tracker_activities'), [row('time_tracker_activities', activity('act-1', 'Reading'), NOW, true)], true),
  ];
  const hydrated = applyRemoteChanges({ ...cache, themePreference: 'dark' } as AppState, changes, UID);
  assert(itemOf(hydrated, 'tasks', 't1')?.completed === true, 'hydration took the phone completion');
  assert(itemOf(hydrated, 'tasks', 't2')?.title === 'Buy oat milk', 'hydration kept the unsent edit made here');
  assert(!itemOf(hydrated, 'time_tracker_activities', 'act-1'), 'hydration applied the phone delete');

  const merged = cacheWithHydratedCollections(cache, hydrated, readBaseline(UID));
  assert(itemOf(merged, 'tasks', 't1')?.completed === true, 'the cached open copy of t1 does not come back');
  assert(!itemOf(merged, 'time_tracker_activities', 'act-1'), 'the deleted activity is not revived from the cache');
  assert(itemOf(merged, 'tasks', 't2')?.title === 'Buy oat milk', 'the edit made here stays');
  assert(itemOf(merged, 'tasks', 't9')?.title === 'New here', 'the never-synced new item stays');
  assert(merged.themePreference === 'light' && (merged.deletedEntityIds || []).includes('old-1'), 'settings and tombstones come from the cache');

  // The next save uploads the local edit and the new item, and nothing that undoes the phone.
  const result = diffSyncedCollections(merged, readBaseline(UID), {}, NOW, tabSyncedHashes(UID));
  const ops = Object.keys(result.outbox).sort();
  assert(ops.join(',') === 'tasks:t2,tasks:t9', `only t2 and t9 upload (got ${ops.join(',')})`);
}

// A cache item the server deleted (baseline DELETED) is not an "unsynced" item and stays gone.
{
  reset();
  const cache = base({ tasks: [task('t3', 'Gone', false)] });
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify({ tasks: { t3: DELETED } }));
  const merged = cacheWithHydratedCollections(cache, base({ tasks: [] }), readBaseline(UID));
  assert(!itemOf(merged, 'tasks', 't3'), 'a deleted row is not re-added from the cache');
}

// ---------------------------------------------------------------- fix 2: versions travel right
{
  reset();
  const s0 = base({ libraryBooks: [book(10, T0)] });
  const v0 = synced(s0);
  // Tab A edits the book and broadcasts before its save's diff: the message carries the old version.
  const edited = base({ libraryBooks: [book(20, NOW)] });
  const sentVersions = v0;
  // A's save then records the edit (baseline = edit) ...
  setTabSyncedHashes(UID, v0);
  const result = diffSyncedCollections(edited, readBaseline(UID), {}, NOW, v0);
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(result.baseline));
  // ... and tab B adopts A's (late) broadcast: the copy equals the baseline, so B takes that version.
  const adopted = adoptTabState(edited, sentVersions, s0, readBaseline(UID), v0);
  assert(adopted.tabHashes.libraryBooks['book-1'] === hashOf('reading_books', book(20, NOW)), 'B holds the baseline version for the copy');
  // The phone moves the book on; B's pull replaces its copy instead of keeping it as an "unsent edit".
  setTabSyncedHashes(UID, adopted.tabHashes);
  const phone = book(30, '2026-11-05T05:10:00.000Z');
  const changes = prepareRemoteRows(UID, byTable('reading_books'), [row('reading_books', phone, '2026-11-05T05:10:00.000Z')]);
  const next = applyRemoteChanges(adopted.state, changes, UID);
  assert(itemOf(next, 'reading_books', 'book-1')?.currentPage === 30, "B takes the phone's page");
  const again = diffSyncedCollections(next, readBaseline(UID), {}, NOW, tabSyncedHashes(UID));
  assert(Object.keys(again.outbox).length === 0, 'B re-uploads nothing');
}

// A save's new versions go to the other tabs (SYNC_VERSIONS_EVENT) and take only matching copies.
{
  reset();
  const s0 = base({ libraryBooks: [book(10, T0)] });
  const v0 = synced(s0);
  const edited = base({ libraryBooks: [book(20, NOW)] });
  recordSyncedChanges(edited);
  assert(events.includes(SYNC_VERSIONS_EVENT), 'a save that moves the versions announces them');
  const after = tabSyncedHashes(UID);
  const matching = takePeerVersions(edited, v0, after);
  assert(matching.libraryBooks['book-1'] === hashOf('reading_books', book(20, NOW)), 'a tab holding the same copy takes the version');
  const other = takePeerVersions(base({ libraryBooks: [book(15, NOW)] }), v0, after);
  assert(other === v0, 'a tab holding other content keeps its own version');
}

// A save diffs against the versions it started with: a pull taken in during the save does not turn
// the saved state's old copy into an edit (the race behind j2b), and the moved version is kept.
{
  reset();
  const s0 = base({ tasks: [task('t1', 'PC title', false)] });
  const atStart = synced(s0);
  // During the save's blob round trip the tab pulls the phone's newer row.
  const phoneTask = task('t1', 'Phone title', false);
  const pulled = applyRemoteChanges(s0, prepareRemoteRows(UID, byTable('tasks'), [row('tasks', phoneTask, NOW)]), UID);
  assert(itemOf(pulled, 'tasks', 't1')?.title === 'Phone title', 'the pull took the phone row');
  recordSyncedChanges(s0, atStart); // the save finishes with the state it started with
  assert(Object.keys(outbox()).length === 0, 'the old copy in the saved state is not uploaded');
  assert(tabSyncedHashes(UID).tasks.t1 === hashOf('tasks', phoneTask), 'the version moved by the pull is kept');
  // A real edit made before the save started still uploads.
  reset();
  const v = synced(s0);
  const edit = base({ tasks: [task('t1', 'Edited here', false)] });
  applyRemoteChanges(edit, prepareRemoteRows(UID, byTable('tasks'), [row('tasks', task('t2', 'Other', false), NOW)]), UID);
  recordSyncedChanges(edit, v);
  assert('tasks:t1' in outbox(), 'an edit in the saved state uploads');
}

// ---------------------------------------------------------------- fix 3: keep this tab's new item
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Write essay', false)] });
  const v0 = synced(s0);
  const mine = base({ tasks: [task('t5', 'Made here, save pending', false), task('t1', 'Write essay', false)] });
  const incoming = base({ tasks: [task('t1', 'Write essay', false)] }); // a woken tab that never saw t5
  const adopted = adoptTabState(incoming, v0, mine, readBaseline(UID), v0);
  assert(itemOf(adopted.state, 'tasks', 't5') !== undefined, 'the unsaved new item stays on screen');
  assert(!('t5' in (adopted.tabHashes.tasks || {})), 'it has no version, so the save uploads it');
  const out = diffSyncedCollections(adopted.state, readBaseline(UID), {}, NOW, adopted.tabHashes);
  assert('tasks:t5' in out.outbox, 'the save after the broadcast uploads it');

  const deleted = adoptTabState({ ...incoming, deletedEntityIds: ['t5'] }, v0, mine, readBaseline(UID), v0);
  assert(!itemOf(deleted.state, 'tasks', 't5'), 'an item the sender deleted is not kept');
  const sentHasIt = adoptTabState(incoming, { ...v0, tasks: { ...v0.tasks, t5: 'x' } }, mine, readBaseline(UID), v0);
  assert(!itemOf(sentHasIt.state, 'tasks', 't5'), 'an item the sender had and dropped is not kept');
}

// ---------------------------------------------------------------- fix 4: cursor holds a skipped row
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Write essay', false), task('t2', 'Other', false)] });
  synced(s0);
  // This tab renamed t1; the save queued the op, but its write timed out, so it waits in the outbox.
  const local = base({ tasks: [task('t1', 'PC title', false), task('t2', 'Other', false)] });
  const queued = diffSyncedCollections(local, readBaseline(UID), {}, NOW, tabSyncedHashes(UID));
  store.set(`ascend_outbox_${UID}`, JSON.stringify(queued.outbox));
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(queued.baseline));
  setTabSyncedHashes(UID, queued.tabHashes);
  assert('tasks:t1' in queued.outbox, 'the rename waits in the outbox');
  // Meanwhile the phone writes t1 (newer) and later t2.
  const at1 = '2026-11-05T05:01:00.000Z';
  const at2 = '2026-11-05T05:20:00.000Z';
  const serverRows = [row('tasks', task('t1', 'Phone title', false), at1), row('tasks', task('t2', 'Other', true), at2)];
  store.set(cursorKey(UID, 'tasks'), '2026-11-05T04:00:00.000Z');
  const client = supabase as unknown as { from: unknown; auth: { getSession: unknown } };
  client.auth.getSession = async () => ({ data: { session: { user: { id: UID } } } });
  client.from = (table: string) => {
    let since = '';
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gt: (_c: string, v: string) => ((since = v), query),
      order: () => query,
      range: () => query,
      then: (resolve: (r: unknown) => void) =>
        resolve({ data: table === 'tasks' ? serverRows.filter((r) => !since || r.server_updated_at > since) : [], error: null }),
    };
    return query;
  };
  await pullSyncedRows(UID, false);
  const cursor = store.get(cursorKey(UID, 'tasks'))!;
  assert(Date.parse(cursor) < Date.parse(at1), `the cursor stays before the skipped row (got ${cursor})`);

  // The op is then refused as older (no error) and settles; the next delta pull reads t1 again.
  store.set(`ascend_outbox_${UID}`, '{}');
  const { changes } = await pullSyncedRows(UID, false);
  const healed = applyRemoteChanges(local, changes, UID);
  assert(changes.some((c) => c.id === 't1'), 'the delta pull after the refusal reads t1 again');
  assert(itemOf(healed, 'tasks', 't1')?.title === 'Phone title', "the device takes the phone's row");
  assert(Date.parse(store.get(cursorKey(UID, 'tasks'))!) >= Date.parse(at2), 'with nothing waiting the cursor moves on');
}

console.log('syncDataLossFixes: all passed');
