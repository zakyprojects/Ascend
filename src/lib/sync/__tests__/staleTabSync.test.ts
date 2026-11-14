// Two tabs of one browser share the sync baseline, outbox and pull cursor (localStorage) but each
// holds its own state. A tab that wakes behind another (the other pulled first) must not upload its
// old copies as fresh edits, must catch up, and must not spread old copies to the other tab; a real
// edit (also one made offline) must still upload. Covers a jsonb document table (reading_books),
// a relational table (tasks), time tracker days, weekly goals (row id = weekKey) and a revivable
// table (time tracker activities). Incident: knowledge/mode-a-yahya-reading-2026-11-04.md.
import { DEFAULT_STATE, type AppState } from '@/types';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const { DELETED, diffSyncedCollections, hashRow, readBaseline } = await import('../outbox');
const { adoptTabState, applyRemoteChanges, prepareRemoteRows } = await import('../pull');
const { SYNCED_COLLECTIONS, itemsOf, rowIdOf, syncKeyOf } = await import('../syncedCollections');
const { setTabSyncedHashes, storeTabSyncedHashes, tabSyncedHashes, clearTabSyncedHashes } = await import(
  '../tabVersions'
);
type Baseline = Record<string, Record<string, string>>;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const UID = 'u1';
const T0 = '2026-11-02T16:50:00.000Z';
const NOW = '2026-11-04T14:45:42.417Z';
const user = { id: UID, username: 'yahya' } as AppState['currentUser'];

interface Tab {
  state: AppState;
  hashes: Baseline;
}

const collectionByTable = (table: string) => SYNCED_COLLECTIONS.find((c) => c.table === table)!;

/** Runs fn with the module's per-tab versions set to this tab's (a real tab has its own module). */
function asTab<T>(tab: Tab, fn: () => T): T {
  setTabSyncedHashes(UID, tab.hashes);
  const result = fn();
  tab.hashes = tabSyncedHashes(UID);
  return result;
}

/** recordSyncedChanges without the network: diff against the shared baseline and outbox. */
function save(tab: Tab) {
  return asTab(tab, () => {
    const outbox = JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}');
    const result = diffSyncedCollections(tab.state, readBaseline(UID), outbox, NOW, tabSyncedHashes(UID));
    setTabSyncedHashes(UID, result.tabHashes);
    store.set(`ascend_outbox_${UID}`, JSON.stringify(result.outbox));
    store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(result.baseline));
    return result;
  });
}

/** The outbox "sends" every op: the server table takes each upserted row. */
const server = new Map<string, Record<string, unknown>>();
function flush() {
  const outbox = JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}') as Record<string, { kind: string; table: string; id: string; row?: Record<string, unknown> }>;
  for (const op of Object.values(outbox)) {
    const key = `${op.table}:${op.id}`;
    if (op.kind === 'upsert') server.set(key, { ...op.row, deleted_at: null });
    else server.set(key, { ...(server.get(key) || { id: op.id }), deleted_at: NOW });
  }
  store.set(`ascend_outbox_${UID}`, '{}');
}

/** Another device (the phone) writes a row straight to the server. */
function phoneWrites(table: string, item: unknown) {
  const collection = collectionByTable(table);
  server.set(`${table}:${rowIdOf(collection, item as never)}`, { ...collection.toRow(item as never), deleted_at: null });
}
function phoneDeletes(table: string, id: string) {
  server.set(`${table}:${id}`, { ...(server.get(`${table}:${id}`) || { id }), deleted_at: NOW });
}

/** A pull of these rows (delta, realtime or the catch-up read by id), applied to the tab. */
function pull(tab: Tab, table: string, ids: string[], full = false) {
  asTab(tab, () => {
    const collection = collectionByTable(table);
    const rows = ids.map((id) => server.get(`${table}:${id}`)!).filter(Boolean);
    const changes = prepareRemoteRows(UID, collection, rows, full);
    tab.state = applyRemoteChanges(tab.state, changes, UID);
  });
}

const opsFor = (table: string) =>
  Object.keys(JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}')).filter((k) => k.startsWith(`${table}:`));
const itemOf = (tab: Tab, table: string, id: string) => {
  const collection = collectionByTable(table);
  return itemsOf(collection, tab.state).find((item) => rowIdOf(collection, item) === id) as Record<string, unknown> | undefined;
};
const hashOf = (table: string, item: unknown) => hashRow(collectionByTable(table).toRow(item as never));

function reset() {
  store.clear();
  server.clear();
  clearTabSyncedHashes(UID);
}

/** Both tabs start in step: the state is saved by A, sent, and B took the same state. */
function twoTabs(state: AppState): { a: Tab; b: Tab } {
  const a: Tab = { state, hashes: {} };
  save(a);
  flush();
  const b: Tab = { state, hashes: a.hashes };
  return { a, b };
}

// Fixtures per collection: the item both tabs hold, the phone's newer version, and a later real edit.
const book = (page: number, updatedAt: string) =>
  ({ id: 'book-1', title: 'The Power of Now', totalPages: 250, currentPage: page, currentAmount: page, addedAt: T0, updatedAt }) as never;
const task = (title: string, completed: boolean) =>
  ({ id: 'task-1', title, priority: 'medium', completed, subtasks: [], createdAt: T0 }) as never;
const ttState = (blocks: unknown[], updatedAt?: string) =>
  ({
    ...DEFAULT_STATE.timeTracker,
    dailyLogs: { '2026-11-03': blocks },
    dayMeta: updatedAt ? { '2026-11-03': { updatedAt } } : {},
  }) as AppState['timeTracker'];
const week = (goals: unknown[]) => ({ weekKey: '2026-W45', createdAt: T0, goals, deletedGoalIds: [] }) as never;

interface Case {
  name: string;
  table: string;
  id: string;
  state: (version: 'old' | 'phone' | 'edit') => Partial<AppState>;
  phoneItem: unknown;
}

const cases: Case[] = [
  {
    name: 'reading_books (jsonb document)',
    table: 'reading_books',
    id: 'book-1',
    state: (v) => ({ libraryBooks: [v === 'old' ? book(10, T0) : v === 'phone' ? book(30, '2026-11-04T12:00:52.000Z') : book(35, NOW)] }),
    phoneItem: book(30, '2026-11-04T12:00:52.000Z'),
  },
  {
    name: 'tasks (relational, no content time)',
    table: 'tasks',
    id: 'task-1',
    state: (v) => ({ tasks: [v === 'old' ? task('Read', false) : v === 'phone' ? task('Read', true) : task('Read 30 pages', true)] }),
    phoneItem: task('Read', true),
  },
  {
    name: 'time_tracker_days',
    table: 'time_tracker_days',
    id: '2026-11-03',
    state: (v) => ({
      timeTracker:
        v === 'old'
          ? ttState([{ id: 'b1', activityId: 'a1', startTime: '09:00', endTime: '10:00' }])
          : v === 'phone'
            ? ttState([{ id: 'b1', activityId: 'a1', startTime: '09:00', endTime: '10:00', completedAt: '2026-11-03T17:06:00.000Z', updatedAt: '2026-11-03T17:06:00.000Z' }], '2026-11-03T17:06:00.000Z')
            : ttState([{ id: 'b1', activityId: 'a1', startTime: '09:00', endTime: '10:30', completedAt: '2026-11-03T17:06:00.000Z', updatedAt: NOW }], NOW),
    }),
    phoneItem: { date: '2026-11-03', blocks: [{ id: 'b1', activityId: 'a1', startTime: '09:00', endTime: '10:00', completedAt: '2026-11-03T17:06:00.000Z', updatedAt: '2026-11-03T17:06:00.000Z' }], updatedAt: '2026-11-03T17:06:00.000Z' },
  },
  {
    name: 'weekly_goals (row id = weekKey)',
    table: 'weekly_goals',
    id: '2026-W45',
    state: (v) => ({
      weeklyGoals: [week(v === 'old' ? [{ id: 'g1', title: 'Read', completed: false }] : v === 'phone' ? [{ id: 'g1', title: 'Read', completed: true }] : [{ id: 'g1', title: 'Read more', completed: true }])],
    }),
    phoneItem: week([{ id: 'g1', title: 'Read', completed: true }]),
  },
];

const base = (extra: Partial<AppState>) => ({ ...DEFAULT_STATE, currentUser: user, ...extra }) as AppState;

for (const c of cases) {
  // 1. Yahya's case: the phone moves the row on, tab A pulls it first, tab B wakes with the old copy.
  {
    reset();
    const { a, b } = twoTabs(base(c.state('old')));
    phoneWrites(c.table, c.phoneItem);
    pull(a, c.table, [c.id]);
    assert(hashOf(c.table, itemOf(a, c.table, c.id)) === hashOf(c.table, c.phoneItem), `${c.name}: tab A took the phone's row`);

    // B's save (the "Pending changes" save on wake) runs before its own pull caught up.
    const result = save(b);
    assert(opsFor(c.table).length === 0, `${c.name}: the stale tab uploads nothing`);
    assert(result.behind === 1, `${c.name}: the stale copy is counted as behind`);
    assert(
      readBaseline(UID)[syncKeyOf(collectionByTable(c.table))][c.id] === hashOf(c.table, c.phoneItem),
      `${c.name}: the shared baseline still holds the phone's row`
    );

    // B broadcasts its state to A before catching up: A keeps its newer copy.
    const adopted = adoptTabState(b.state, b.hashes, a.state, readBaseline(UID));
    const kept = itemsOf(collectionByTable(c.table), adopted.state).find((i) => rowIdOf(collectionByTable(c.table), i) === c.id);
    assert(hashOf(c.table, kept) === hashOf(c.table, c.phoneItem), `${c.name}: tab A does not take B's old copy`);
    a.state = adopted.state;
    a.hashes = adopted.tabHashes;
    save(a);
    assert(opsFor(c.table).length === 0, `${c.name}: tab A uploads nothing after the broadcast`);

    // B catches up: the delta pull reads the rows it is behind on by id, even though the shared
    // baseline already holds them.
    pull(b, c.table, [c.id]);
    assert(hashOf(c.table, itemOf(b, c.table, c.id)) === hashOf(c.table, c.phoneItem), `${c.name}: tab B caught up`);
    save(b);
    assert(opsFor(c.table).length === 0, `${c.name}: nothing to upload after catching up`);

    // 2. A real edit after waking uploads, stamped now.
    b.state = base(c.state('edit'));
    save(b);
    const ops = JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}');
    const op = ops[`${c.table}:${c.id}`];
    assert(op?.kind === 'upsert', `${c.name}: a fresh edit after waking uploads`);
    assert(op.updatedAt >= '2026-11-04', `${c.name}: the fresh edit carries a current time`);
  }

  // 3. An edit made in the stale tab before it caught up is a real edit: it still uploads
  //    (last write wins, as before), it is never dropped.
  {
    reset();
    const { a, b } = twoTabs(base(c.state('old')));
    phoneWrites(c.table, c.phoneItem);
    pull(a, c.table, [c.id]);
    b.state = base(c.state('edit'));
    save(b);
    assert(opsFor(c.table).length === 1, `${c.name}: an edit on a behind tab is still uploaded`);
  }

  // 4. An offline edit survives a pull of another device's row and uploads on reconnect.
  {
    reset();
    const { a } = twoTabs(base(c.state('old')));
    a.state = base(c.state('edit')); // offline: the blob save failed, so no diff ran
    phoneWrites(c.table, c.phoneItem);
    pull(a, c.table, [c.id]);
    const local = itemOf(a, c.table, c.id);
    const expectMerge = c.table === 'time_tracker_days';
    assert(
      expectMerge || hashOf(c.table, local) === hashOf(c.table, itemsOf(collectionByTable(c.table), base(c.state('edit')))[0]),
      `${c.name}: the offline edit stays over the other device's row`
    );
    save(a);
    assert(opsFor(c.table).length === 1, `${c.name}: the offline edit uploads on reconnect`);
  }

  // 5. Cold boot from a cache written by a tab that was behind: the cache keeps its versions, so the
  //    boot's full pull replaces the old copy instead of uploading it.
  {
    reset();
    const { a, b } = twoTabs(base(c.state('old')));
    phoneWrites(c.table, c.phoneItem);
    pull(a, c.table, [c.id]);
    asTab(b, () => storeTabSyncedHashes(UID)); // B wrote its (old) state to the device cache
    clearTabSyncedHashes(UID);
    store.set(`ascend_sync_tab_synced_${UID}`, JSON.stringify(b.hashes));
    const booted: Tab = { state: b.state, hashes: tabSyncedHashes(UID) };
    pull(booted, c.table, [c.id], true);
    assert(hashOf(c.table, itemOf(booted, c.table, c.id)) === hashOf(c.table, c.phoneItem), `${c.name}: cold boot takes the newer row`);
    save(booted);
    assert(opsFor(c.table).length === 0, `${c.name}: cold boot uploads nothing`);
  }
}

// 5b. A behind tab's broadcast does not undo an edit this tab has not saved yet either.
{
  reset();
  const { a, b } = twoTabs(base({ libraryBooks: [book(10, T0)] }));
  phoneWrites('reading_books', book(30, '2026-11-04T12:00:52.000Z'));
  pull(a, 'reading_books', ['book-1']);
  a.state = base({ libraryBooks: [book(32, NOW)] }); // edited in A, debounced save not run yet
  const adopted = adoptTabState(b.state, b.hashes, a.state, readBaseline(UID), a.hashes);
  const kept = adopted.state.libraryBooks.find((x) => x.id === 'book-1') as unknown as { currentPage: number };
  assert(kept.currentPage === 32, "tab A keeps its unsaved edit over B's old copy");
  a.state = adopted.state;
  a.hashes = adopted.tabHashes;
  save(a);
  assert(opsFor('reading_books').length === 1, "tab A's edit still uploads after the broadcast");
}

// 6. Deletes: another tab applied a delete; the behind tab neither re-uploads nor keeps the row.
{
  reset();
  const { a, b } = twoTabs(base({ tasks: [task('Read', false)] }));
  phoneDeletes('tasks', 'task-1');
  pull(a, 'tasks', ['task-1']);
  assert(!itemOf(a, 'tasks', 'task-1'), 'tab A removed the deleted task');
  save(b);
  assert(opsFor('tasks').length === 0, 'the behind tab does not resend a deleted task');
  assert(readBaseline(UID).tasks['task-1'] === DELETED, 'the baseline keeps the delete');
  pull(b, 'tasks', ['task-1']);
  assert(!itemOf(b, 'tasks', 'task-1'), 'tab B removes the deleted task on catch-up');
}

// 7. Revivable table (time tracker activities): a delete another tab applied removes the behind
//    tab's unchanged copy; a restore made after seeing the delete still uploads.
{
  reset();
  const activity = { id: 'act-read', name: 'Reading', createdAt: T0 };
  const tt = (activities: unknown[]) => ({ ...DEFAULT_STATE.timeTracker, activities }) as AppState['timeTracker'];
  const { a, b } = twoTabs(base({ timeTracker: tt([activity]) }));
  phoneDeletes('time_tracker_activities', 'act-read');
  pull(a, 'time_tracker_activities', ['act-read']);
  assert(!itemOf(a, 'time_tracker_activities', 'act-read'), 'tab A removed the activity');
  save(b);
  assert(opsFor('time_tracker_activities').length === 0, 'the behind tab does not revive the activity');
  pull(b, 'time_tracker_activities', ['act-read']);
  assert(!itemOf(b, 'time_tracker_activities', 'act-read'), 'tab B removes its unchanged copy');
  save(b);
  b.state = base({ timeTracker: tt([activity]) }); // the user restores the default activity
  save(b);
  assert(opsFor('time_tracker_activities').length === 1, 'a restore after the delete still uploads');
}

// 8. Without per-tab versions (older app version in the other tab, or before the first save on
//    this version) the diff behaves as before: a changed known row is an edit.
{
  reset();
  const { b } = twoTabs(base({ libraryBooks: [book(10, T0)] }));
  b.state = base({ libraryBooks: [book(30, NOW)] });
  const result = diffSyncedCollections(b.state, readBaseline(UID), {}, NOW);
  assert('reading_books:book-1' in result.outbox && result.behind === 0, 'no versions: old behaviour');
  const incoming = base({ libraryBooks: [book(12, T0)] });
  assert(adoptTabState(incoming, undefined, b.state, readBaseline(UID)).state === incoming, 'old broadcast taken as sent');
}

// 9. A broadcast from a tab that is not behind is taken whole (its own edits and adds included).
{
  reset();
  const { a, b } = twoTabs(base({ libraryBooks: [book(10, T0)], tasks: [task('Read', false)] }));
  b.state = base({ libraryBooks: [book(11, NOW)], tasks: [task('Read', false), { ...(task('New', false) as object), id: 'task-2' } as never] });
  const adopted = adoptTabState(b.state, b.hashes, a.state, readBaseline(UID));
  assert(adopted.state === b.state, "an up-to-date tab's state is taken as sent");
}

console.log('staleTabSync: all passed');
