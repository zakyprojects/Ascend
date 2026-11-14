// Saved list orders (lib/listOrder.ts): applying an order, reordering a filtered part in its slots,
// the list_orders sync collection, the merge branch, and that a reorder uploads only its own row
// (never a habit, skill, book, weekly-goal, workout or points row, so points cannot change).
import { DEFAULT_STATE, type AppState, type Habit, type ListOrder, type Project } from '../../types';
const { applyListOrder, byCreatedAsc, byCreatedDesc, moveId, reorderInSlots, sameOrder, savedOrderIds, LIST_ORDER_KEYS } = await import('../items/listOrder');
const { SYNCED_COLLECTIONS } = await import('../sync/syncedCollections');
const { diffSyncedCollections, hashRow } = await import('../sync/outbox');
const { mergeAppState } = await import('../store/stateMerger');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const ids = (list: { id: string }[]) => list.map((x) => x.id).join(',');
const item = (id: string, day: number) => ({ id, createdAt: `2026-11-0${day}T00:00:00.000Z` });

// applyListOrder: saved order first; unknown items by the fallback at the start or end; gone ids ignored.
const items = [item('a', 1), item('b', 2), item('c', 3), item('d', 4)];
assert(ids(applyListOrder(items, undefined, byCreatedAsc, 'end')) === 'a,b,c,d', 'no saved order = fallback');
assert(ids(applyListOrder(items, ['c', 'gone', 'a'], byCreatedAsc, 'end')) === 'c,a,b,d', 'unknown join the end, by fallback');
assert(ids(applyListOrder(items, ['c', 'a'], byCreatedDesc, 'start')) === 'd,b,c,a', 'unknown join the top, by fallback');
assert(ids(applyListOrder(items, ['b', 'b', 'a'], byCreatedAsc, 'end')) === 'b,a,c,d', 'a repeated id keeps its first slot');

// reorderInSlots: a filtered view reorders only its own slots; hidden items never move.
const full = ['t1', 't2', 't3', 't4', 't5'];
assert(reorderInSlots(full, ['t4', 't2']).join(',') === 't1,t4,t3,t2,t5', 'visible t2/t4 swap their slots');
assert(reorderInSlots(full, ['t5', 't1', 't3']).join(',') === 't5,t2,t1,t4,t3', 'three visible rotate in their slots');
assert(reorderInSlots(full, ['x', 't2']).join(',') === full.join(','), 'unknown visible ids ignored');
assert(reorderInSlots(full, full).join(',') === full.join(','), 'same order = unchanged');

// moveId
assert(moveId(['a', 'b', 'c'], 'a', 1).join(',') === 'b,a,c', 'down one');
assert(moveId(['a', 'b', 'c'], 'c', -5).join(',') === 'c,a,b', 'clamped to top');
assert(moveId(['a', 'b', 'c'], 'a', -1).join(',') === 'a,b,c', 'first cannot go up');
assert(sameOrder(['a'], ['a']) && !sameOrder(['a', 'b'], ['b', 'a']), 'sameOrder');

// The collection: table list_orders, row id = list key, round-trips with the same hash.
const collection = SYNCED_COLLECTIONS.find((c) => c.stateKey === 'listOrders');
assert(collection?.table === 'list_orders', 'listOrders is a synced collection on list_orders');
const order: ListOrder = { id: LIST_ORDER_KEYS.weeklyGoals('2026-W45'), ids: ['g2', 'g1'], createdAt: '2026-11-07T10:00:00.000Z', updatedAt: '2026-11-07T10:00:00.000Z' };
const row = collection!.toRow(order as never);
assert(row.id === 'weeklyGoals:2026-W45', 'row id is the list key');
assert(hashRow(collection!.toRow(collection!.fromRow({ ...row, user_id: 'u' }) as never)) === hashRow(row), 'fromRow/toRow round trip');
assert(savedOrderIds([order], 'weeklyGoals:2026-W45')?.join(',') === 'g2,g1', 'savedOrderIds finds the list');

// A reorder uploads only list_orders (the module rows and the points ledger are untouched).
const habit = (id: string): Habit =>
  ({ id, name: id, frequency: 'daily', points: 2, completions: {}, createdAt: '2026-11-01T00:00:00.000Z', createdAtPeriod: '2026-11-01' }) as unknown as Habit;
const project = (id: string, order: number): Project => ({ id, title: id, status: 'not_started', goalId: 'g', order, createdAt: '2026-11-01T00:00:00.000Z' });
const base: AppState = {
  ...DEFAULT_STATE,
  habits: [habit('h1'), habit('h2')],
  projects: [project('p1', 0), project('p2', 1)],
  pointsHistory: [{ id: 'habit_award_2026-11-07', amount: 4, reason: 'Habits', source: 'habit', timestamp: '2026-11-07T08:00:00.000Z' }],
  listOrders: [],
};
const NOW = '2026-11-07T10:00:00.000Z';
const first = diffSyncedCollections(base, {}, {}, NOW);
const tablesOf = (outbox: Record<string, { table: string }>) => [...new Set(Object.values(outbox).map((op) => op.table))].sort().join(',');
const reordered: AppState = { ...base, listOrders: [{ id: 'habits', ids: ['h2', 'h1'], createdAt: NOW, updatedAt: NOW }] };
const afterReorder = diffSyncedCollections(reordered, first.baseline, {}, NOW);
assert(tablesOf(afterReorder.outbox) === 'list_orders', `habit reorder uploads only list_orders (got ${tablesOf(afterReorder.outbox)})`);
assert(Object.keys(afterReorder.outbox).length === 1, 'one row per reorder');
// Projects keep sort_order: a project reorder rewrites only the projects whose order changed.
const projectsMoved: AppState = { ...base, projects: [project('p1', 1), project('p2', 0)] };
const afterProjects = diffSyncedCollections(projectsMoved, first.baseline, {}, NOW);
assert(tablesOf(afterProjects.outbox) === 'projects' && Object.keys(afterProjects.outbox).length === 2, 'project reorder = its project rows only');

// Merge: per list, the later reorder wins; lists only one side has are kept.
const older: ListOrder = { id: 'habits', ids: ['h1', 'h2'], createdAt: NOW, updatedAt: '2026-11-07T09:00:00.000Z' };
const newer: ListOrder = { id: 'habits', ids: ['h2', 'h1'], createdAt: NOW, updatedAt: '2026-11-07T11:00:00.000Z' };
const tasksOrder: ListOrder = { id: 'tasks', ids: ['t1'], createdAt: NOW, updatedAt: NOW };
const merged = mergeAppState({ ...base, listOrders: [newer] }, { ...base, listOrders: [older, tasksOrder] });
assert(savedOrderIds(merged.listOrders, 'habits')?.join(',') === 'h2,h1', 'newer base order kept over older incoming');
assert(savedOrderIds(merged.listOrders, 'tasks')?.join(',') === 't1', 'incoming-only list kept');
const merged2 = mergeAppState({ ...base, listOrders: [older] }, { ...base, listOrders: [newer] });
assert(savedOrderIds(merged2.listOrders, 'habits')?.join(',') === 'h2,h1', 'newer incoming order wins');
assert(merged.pointsHistory.length === base.pointsHistory.length, 'ledger unchanged by a reorder merge');

console.log('listOrderSync: all assertions passed');
