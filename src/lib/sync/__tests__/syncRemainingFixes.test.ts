// Remaining sync fixes of 2026-11-05 (knowledge/mode-a-sync-remaining-2026-11-05.md):
// 5. An edit is uploaded with the time it was made (editTimes), not the time its save ran; a row the
//    server refused to store is re-read by id on the next pull (b1, l6, browser loss1).
// 9. The theme between devices: the later change wins; an unstamped difference takes the server's.
// The habit merge (fix 6) is SQL: work/hmr/pglite-test.mjs. The clock catch-up after sleep (e3) is in
// clockCatchUp.test.ts (it needs its own clock module state).
import { DEFAULT_STATE, type AppState } from '@/types';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
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

const { SYNC_BEHIND_EVENT, diffSyncedCollections, flushOutbox, hashRow, readBaseline, recordSyncedChanges, refusedRowIds } =
  await import('../outbox');
const { applyRemoteChanges, pullSyncedRows } = await import('../pull');
const { SYNCED_COLLECTIONS, itemsOf, rowIdOf } = await import('../syncedCollections');
const { setTabSyncedHashes, clearTabSyncedHashes } = await import('../tabVersions');
const { noteEditTimes, readEditTimes } = await import('../editTimes');
const { mergeThemePreference } = await import('../../store/stateMerger');
const { supabase } = await import('../../auth/supabase');
type Baseline = Record<string, Record<string, string>>;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const UID = 'u1';
const T0 = '2026-11-02T16:50:00.000Z';
const EDIT = '2026-11-05T04:00:00.000Z';
const LATER = '2026-11-05T05:00:00.000Z';
const user = { id: UID, username: 'zakria' } as AppState['currentUser'];
const base = (extra: Partial<AppState>) => ({ ...DEFAULT_STATE, currentUser: user, ...extra }) as AppState;
const byTable = (table: string) => SYNCED_COLLECTIONS.find((c) => c.table === table)!;
const hashOf = (table: string, item: unknown) => hashRow(byTable(table).toRow(item as never));
const itemOf = (state: AppState, table: string, id: string) =>
  itemsOf(byTable(table), state).find((item) => rowIdOf(byTable(table), item) === id) as Record<string, unknown> | undefined;
const task = (id: string, title: string, completed: boolean) =>
  ({ id, title, priority: 'medium', completed, subtasks: [], createdAt: T0 }) as never;
const outbox = () =>
  JSON.parse(store.get(`ascend_outbox_${UID}`) || '{}') as Record<string, { kind: string; updatedAt?: string; row?: Record<string, unknown> }>;
const row = (table: string, item: unknown, at: string) => ({
  ...byTable(table).toRow(item as never),
  user_id: UID,
  updated_at: at,
  server_updated_at: at,
  deleted_at: null,
});

function reset() {
  store.clear();
  events.length = 0;
  clearTabSyncedHashes(UID);
}

function synced(state: AppState): Baseline {
  const result = diffSyncedCollections(state, {}, {}, T0, {});
  store.set(`ascend_sync_baseline_${UID}`, JSON.stringify(result.baseline));
  store.set(`ascend_outbox_${UID}`, '{}');
  setTabSyncedHashes(UID, result.tabHashes);
  return result.tabHashes;
}

/** A fake client: upserts store every row except `refuse`; selects answer from `server`. */
function fakeClient(server: Map<string, Record<string, unknown>>, refuse: Set<string>) {
  const client = supabase as unknown as { from: unknown; auth: { getSession: unknown } };
  client.auth.getSession = async () => ({ data: { session: { user: { id: UID } } } });
  client.from = (table: string) => {
    let since = '';
    let ids: string[] | null = null;
    let upserted: Array<Record<string, unknown>> | null = null;
    const query = {
      select: () => query,
      eq: () => query,
      in: (_c: string, v: string[]) => ((ids = v), query),
      gt: (_c: string, v: string) => ((since = v), query),
      order: () => query,
      range: () => query,
      upsert: (rows: Array<Record<string, unknown>> | Record<string, unknown>) => ((upserted = Array.isArray(rows) ? rows : [rows]), query),
      update: () => query,
      then: (resolve: (r: unknown) => void) => {
        if (upserted) {
          const kept = upserted.filter((r) => !refuse.has(`${table}:${r.id}`));
          for (const r of kept) server.set(`${table}:${r.id}`, { ...r, server_updated_at: r.updated_at });
          return resolve({ data: kept.map((r) => ({ id: r.id })), error: null });
        }
        const rows = [...server.entries()]
          .filter(([k]) => k.startsWith(`${table}:`))
          .map(([, r]) => r)
          .filter((r) => (!since || String(r.server_updated_at) > since) && (!ids || ids.includes(String(r.id))));
        resolve({ data: rows, error: null });
      },
    };
    return query;
  };
}

// ---------------------------------------------------------------- fix 5: the edit carries its time
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false), task('t2', 'Other', false)] });
  synced(s0);
  // The phone completes t1 at EDIT; the tab is closed before its save (the state effect ran).
  const edited = base({ tasks: [task('t1', 'Essay', true), task('t2', 'Other', false)] });
  noteEditTimes(UID, s0, edited, EDIT);
  assert(readEditTimes(UID).tasks?.t1?.[1] === EDIT, 'the edit time is noted with the state');
  assert(!readEditTimes(UID).tasks?.t2, 'an unchanged item gets no edit time');
  // Reopened an hour later, the save diffs it: the op carries the edit time, not the reopen time.
  const result = diffSyncedCollections(edited, readBaseline(UID), {}, LATER, undefined, undefined, readEditTimes(UID));
  assert(result.outbox['tasks:t1']?.kind === 'upsert', 'the edit is queued');
  assert((result.outbox['tasks:t1'] as { updatedAt: string }).updatedAt === EDIT, 'stamped with the edit time');
  // Without a noted time (an older app version's edit) the upload time, as before.
  const plain = diffSyncedCollections(edited, readBaseline(UID), {}, LATER, undefined, undefined, {});
  assert((plain.outbox['tasks:t1'] as { updatedAt: string }).updatedAt === LATER, 'no noted time: the upload time');
  // An edit time later than now (clock ran ahead at the edit) is never used.
  const ahead = diffSyncedCollections(edited, readBaseline(UID), {}, '2026-11-05T03:00:00.000Z', undefined, undefined, readEditTimes(UID));
  assert((ahead.outbox['tasks:t1'] as { updatedAt: string }).updatedAt === '2026-11-05T03:00:00.000Z', 'never later than now');
}

{
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false)] });
  synced(s0);
  const ticked = base({ tasks: [task('t1', 'Essay', true)] });
  noteEditTimes(UID, s0, ticked, EDIT);
  // Unticked again before any save: back at this tab's version, so not an edit any more.
  const back = base({ tasks: [task('t1', 'Essay', false)] });
  noteEditTimes(UID, ticked, back, LATER);
  assert(!readEditTimes(UID).tasks?.t1, 'an edit undone back to the synced copy has no edit time');
  // Ticked again later: the later time, not the first one.
  const again = base({ tasks: [task('t1', 'Essay', true)] });
  noteEditTimes(UID, back, again, LATER);
  assert(readEditTimes(UID).tasks?.t1?.[1] === LATER, 'the same content made again later takes the later time');
  // Same content in a new object (a re-render, a merge) keeps the first time.
  noteEditTimes(UID, again, base({ tasks: [task('t1', 'Essay', true)] }), '2026-11-05T06:00:00.000Z');
  assert(readEditTimes(UID).tasks?.t1?.[1] === LATER, 'same content keeps its first time');
}

{
  // A pulled row (this tab's version moved with it) is not an edit; the save consumes the noted times.
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false), task('t2', 'Other', false)] });
  const versions = synced(s0);
  const pulled = base({ tasks: [task('t1', 'Phone title', false), task('t2', 'Other', false)] });
  setTabSyncedHashes(UID, { ...versions, tasks: { ...versions.tasks, t1: hashOf('tasks', task('t1', 'Phone title', false)) } });
  noteEditTimes(UID, s0, pulled, EDIT);
  assert(!readEditTimes(UID).tasks?.t1, 'a pulled copy gets no edit time');
  const edited = base({ tasks: [task('t1', 'Phone title', false), task('t2', 'Mine', false)] });
  noteEditTimes(UID, pulled, edited, EDIT);
  // An edit made while the save runs (t2 renamed again) keeps its own entry.
  const during = base({ tasks: [task('t1', 'Phone title', false), task('t2', 'Mine 2', false)] });
  noteEditTimes(UID, edited, during, LATER);
  const client = supabase as unknown as { auth: { getSession: unknown } };
  client.auth.getSession = async () => ({ data: { session: null } }); // no flush in this case
  recordSyncedChanges(edited);
  assert(readEditTimes(UID).tasks?.t2?.[0] === hashOf('tasks', task('t2', 'Mine 2', false)), 'the edit made during the save keeps its time');
  recordSyncedChanges(during);
  assert(!readEditTimes(UID).tasks, 'a save consumes the times of what it queued');
}

// ---------------------------------------------------------------- fix 5: a refused row is re-read
{
  reset();
  const s0 = base({ tasks: [task('t1', 'Essay', false)] });
  synced(s0);
  // Server: the PC un-completed t1 at LATER (newer). The phone's older completion (EDIT) is refused.
  const server = new Map<string, Record<string, unknown>>();
  server.set('tasks:t1', row('tasks', task('t1', 'Essay', false), LATER));
  fakeClient(server, new Set(['tasks:t1']));
  const phone = base({ tasks: [task('t1', 'Essay', true)] });
  noteEditTimes(UID, s0, phone, EDIT);
  recordSyncedChanges(phone);
  await flushOutbox(UID);
  assert(Object.keys(outbox()).length === 0, 'the refused op settles (no error from the server)');
  assert(refusedRowIds(UID, 'tasks').includes('t1'), 'the refused row is kept for a re-read');
  assert(events.some((e) => e.type === SYNC_BEHIND_EVENT && (e.detail as { refused?: boolean })?.refused === true), 'the tab is asked to pull');
  // The delta pull's cursor is past the server row; the re-read by id still finds it.
  store.set(`ascend_sync_cursor_${UID}_tasks`, '2026-11-05T06:00:00.000Z');
  const { changes } = await pullSyncedRows(UID, false);
  const healed = applyRemoteChanges(phone, changes, UID);
  assert(itemOf(healed, 'tasks', 't1')?.completed === false, "the phone takes the PC's newer row");
  assert(refusedRowIds(UID, 'tasks').length === 0, 'the re-read clears the mark');
  // A stored row is not marked.
  server.set('tasks:t1', row('tasks', task('t1', 'Essay', false), LATER));
  fakeClient(server, new Set());
  const renamed = base({ tasks: [task('t1', 'Essay 2', false)] });
  recordSyncedChanges(renamed);
  await flushOutbox(UID);
  assert(refusedRowIds(UID, 'tasks').length === 0, 'a stored row is not re-read');
}

// ---------------------------------------------------------------- fix 9: the theme between devices
{
  const light = { themePreference: 'light' as const, themeUpdatedAt: LATER };
  const darkOld = { themePreference: 'dark' as const, themeUpdatedAt: EDIT };
  assert(mergeThemePreference(light, darkOld).themePreference === 'light', 'server newer: the server theme');
  assert(mergeThemePreference(darkOld, light).themePreference === 'light', 'device newer: the device theme');
  assert(mergeThemePreference(light, darkOld).themeUpdatedAt === LATER, 'the winner keeps its stamp');
  assert(mergeThemePreference({ themePreference: 'light' }, { themePreference: 'dark' }).themePreference === 'light', 'no stamps: the server theme');
  assert(
    mergeThemePreference({ themePreference: 'light', themeUpdatedAt: EDIT }, { themePreference: 'dark', themeUpdatedAt: EDIT }).themePreference === 'light',
    'equal stamps, different values (an old app changed it): the server theme'
  );
  assert(mergeThemePreference({}, { themePreference: 'light' }).themePreference === 'light', 'no server theme: the device theme');
  assert(mergeThemePreference({}, {}).themePreference === 'system', 'neither: follow the device');
  assert(mergeThemePreference({ themePreference: 'dark' }, {}).themePreference === 'system', 'unstamped dark is the old default: follow the device');
  assert(mergeThemePreference({ themePreference: 'system', themeUpdatedAt: LATER }, darkOld).themePreference === 'system', 'a newer System pick wins');
}

console.log('syncRemainingFixes: all passed');
