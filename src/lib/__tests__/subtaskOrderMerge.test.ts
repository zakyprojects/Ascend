// Subtask order across two copies of a task (stateMerger.mergeTaskCopies): the newer copy
// (updatedAt, the row's updated_at once synced) gives the order, titles and done states; a subtask
// only the older copy has joins the end; a deleted one stays out; no stamps = the incoming copy, as before.
import { DEFAULT_STATE, type AppState, type Task } from '../../types';
const { mergeTaskCopies, mergeAppState } = await import('../store/stateMerger');
const { SYNCED_COLLECTIONS } = await import('../sync/syncedCollections');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const order = (t: Task) => t.subtasks.map((st) => st.id).join(',');
const st = (id: string, completed = false, title = id.toUpperCase()) => ({ id, title, completed });
const task = (subtasks: Task['subtasks'], updatedAt?: string): Task => ({
  id: 't1',
  title: 'Launch',
  priority: 'medium',
  completed: false,
  subtasks,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...(updatedAt ? { updatedAt } : {}),
});
const none = new Set<string>();

// 1. Reordered on the newer copy: its order wins, whichever side it is on.
const older = task([st('a'), st('b'), st('c')], '2026-11-06T10:00:00.000Z');
const reordered = task([st('c'), st('a'), st('b')], '2026-11-07T10:00:00.000Z');
assert(order(mergeTaskCopies(older, reordered, none)) === 'c,a,b', 'newer incoming order wins');
assert(order(mergeTaskCopies(reordered, older, none)) === 'c,a,b', 'newer base order wins (was base-first a,b,c)');

// 2. Values of shared subtasks follow the newer copy too.
const ticked = task([st('b', true, 'B renamed'), st('a'), st('c')], '2026-11-07T11:00:00.000Z');
const merged = mergeTaskCopies(ticked, older, none);
assert(order(merged) === 'b,a,c', 'newer base order');
assert(merged.subtasks[0].completed && merged.subtasks[0].title === 'B renamed', 'newer tick and title kept');

// 3. A subtask only the older copy has joins the end; a deleted one stays out.
const olderWithExtra = task([st('x'), st('a'), st('b'), st('c'), st('gone')], '2026-11-06T10:00:00.000Z');
assert(order(mergeTaskCopies(olderWithExtra, reordered, new Set(['gone']))) === 'c,a,b,x', 'older-only at the end, tombstoned out');

// 4. No stamps on either copy: the incoming copy, as before this change.
const plainBase = task([st('a'), st('b')]);
const plainInc = task([st('b'), st('a')]);
assert(order(mergeTaskCopies(plainBase, plainInc, none)) === 'b,a', 'tie = incoming');
// A stamped copy beats one without a stamp (createdAt fallback is older than any edit).
assert(order(mergeTaskCopies(task([st('b'), st('a')], '2026-11-07T10:00:00.000Z'), plainBase, none)) === 'b,a', 'stamped beats unstamped');

// 5. Through mergeAppState (sign-in / hydration): the reorder on the newer copy survives.
const state = (t: Task): AppState => ({ ...DEFAULT_STATE, tasks: [t] }) as AppState;
const out = mergeAppState(state(reordered), state(older), 'hydration');
assert(order(out.tasks[0]) === 'c,a,b', 'mergeAppState keeps the newer order');

// 6. The task row's updated_at reads back as updatedAt; it is never sent (toRow), so no extra upload.
const tasks = SYNCED_COLLECTIONS.find((c) => c.stateKey === 'tasks')!;
const row = tasks.toRow(reordered as never) as Record<string, unknown>;
assert(!('updated_at' in row) && !('updatedAt' in row), 'toRow sends no updated time');
const back = tasks.fromRow({ ...row, updated_at: '2026-11-07T10:00:00+00:00' }) as Task;
assert(back.updatedAt === '2026-11-07T10:00:00.000Z' && order(back) === 'c,a,b', 'fromRow reads updated_at');
assert(!('updatedAt' in (tasks.fromRow(row) as Task)), 'no updated_at = no updatedAt');

console.log('subtaskOrderMerge: all assertions passed');
