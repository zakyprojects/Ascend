// Display order of lists (lib/listOrder.ts) and the sequential lock (projects/hierarchy.ts):
// fixed fallback sorts, projects grouped by goal, new project orders, a done project never locked.
import type { Goal, Project } from '../../types';
const { byCreatedAsc, byCreatedDesc, sortBySequence, sortStandalone, projectsInDisplayOrder, nextSequenceOrder, topStandaloneOrder } =
  await import('../items/listOrder');
const { lockStatusOf } = await import('../../components/projects/hierarchy');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const ids = (list: { id: string }[]) => list.map((x) => x.id).join(',');

// Fallback sorts: the same result whatever the input array order (device independent).
const items = [
  { id: 'b', createdAt: '2026-11-02T00:00:00.000Z' },
  { id: 'a', createdAt: '2026-11-01T00:00:00.000Z' },
  { id: 'c', createdAt: '2026-11-02T00:00:00.000Z' },
];
assert(ids([...items].sort(byCreatedAsc)) === 'a,b,c', 'oldest first, id breaks ties');
assert(ids([...items].reverse().sort(byCreatedAsc)) === 'a,b,c', 'asc independent of input order');
assert(ids([...items].sort(byCreatedDesc)) === 'c,b,a', 'newest first, id breaks ties');
assert(ids([...items].reverse().sort(byCreatedDesc)) === 'c,b,a', 'desc independent of input order');
assert(ids([{ id: 'x' }, ...items].sort(byCreatedAsc)) === 'x,a,b,c', 'missing createdAt sorts first');

const project = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  title: id,
  status: 'not_started',
  createdAt: `2026-11-0${id.length}T00:00:00.000Z`,
  ...over,
});

// Sequence: order, then oldest, then id.
const seq = [project('p3', { order: 1 }), project('p1', { order: 0 }), project('p2', { order: 1, createdAt: '2026-11-01T00:00:00.000Z' })];
assert(ids(sortBySequence(seq)) === 'p1,p2,p3', 'sequence by order then createdAt');

// Standalone: order, then newest first.
const solo = [project('s1', { order: 0, createdAt: '2026-11-01T00:00:00.000Z' }), project('s2', { order: 0, createdAt: '2026-11-03T00:00:00.000Z' }), project('s3', { order: -1 })];
assert(ids(sortStandalone(solo)) === 's3,s2,s1', 'standalone by order then newest');

// All projects: goal by goal in the goals' order, each in sequence, standalone (and orphans) last.
const all = [
  project('a2', { goalId: 'gA', order: 1 }),
  project('s1', { order: 0 }),
  project('b1', { goalId: 'gB', order: 0 }),
  project('a1', { goalId: 'gA', order: 0 }),
  project('o1', { goalId: 'gone', order: 0, createdAt: '2026-10-01T00:00:00.000Z' }),
];
assert(ids(projectsInDisplayOrder(all, ['gB', 'gA'])) === 'b1,a1,a2,s1,o1', 'grouped by goal order, standalone last');

// New orders: max + 1 (never a repeat after a delete), standalone top = min - 1.
const withGap = [project('x', { goalId: 'g', order: 0 }), project('y', { goalId: 'g', order: 3 })];
assert(nextSequenceOrder(withGap, 'g') === 4, 'end of goal = max + 1');
assert(nextSequenceOrder(withGap, 'g', 'y') === 1, 'own row ignored');
assert(nextSequenceOrder(withGap, 'other') === 0, 'empty goal starts at 0');
assert(nextSequenceOrder([project('s', { order: 2 })], undefined) === 3, 'end of standalone');
assert(topStandaloneOrder([project('s', { order: 0 }), project('t', { order: -2 }), project('g', { goalId: 'g', order: -9 })]) === -3, 'top standalone ignores goal projects');
assert(topStandaloneOrder([]) === 0, 'first standalone order 0');

// Lock: a done project after an unfinished one is never locked; the one after the first unfinished is.
const goal: Goal = { id: 'g', title: 'G', status: 'active', sequentialMode: true, createdAt: '2026-11-01T00:00:00.000Z' };
const inGoal = [
  project('first', { goalId: 'g', order: 0, status: 'in_progress' }),
  project('done', { goalId: 'g', order: 1, status: 'completed' }),
  project('third', { goalId: 'g', order: 2 }),
];
const byGoal = new Map([['g', inGoal]]);
const complete = (p: Project) => p.status === 'completed';
const lockOf = (id: string) => lockStatusOf(inGoal.find((p) => p.id === id)!, [goal], byGoal, complete);
assert(!lockOf('first').isLocked && lockOf('first').stepIndex === 1, 'step 1 open');
assert(!lockOf('done').isLocked && lockOf('done').stepIndex === 2, 'done project after an unfinished one is not locked');
assert(lockOf('third').isLocked && lockOf('third').blockingProject?.id === 'first', 'locked behind the first unfinished project');
const plainGoal = { ...goal, sequentialMode: false };
assert(!lockStatusOf(inGoal[2], [plainGoal], byGoal, complete).isLocked, 'non-sequential goal never locks');

console.log('listOrder: all assertions passed');

// Currently reading: a saved order, and a book touched after it still goes to the top.
{
  const { applyListOrderTouchedFirst } = await import('../items/listOrder');
  const t = (iso: string) => Date.parse(iso);
  const books = [
    { id: 'a', at: '2026-11-07T08:00:00.000Z' },
    { id: 'b', at: '2026-11-07T09:00:00.000Z' },
    { id: 'c', at: '2026-11-07T10:00:00.000Z' },
  ];
  const touchedAt = (x: { at: string }) => t(x.at);
  const newest = (x: { at: string }, y: { at: string }) => t(y.at) - t(x.at);
  assert(ids(applyListOrderTouchedFirst(books, undefined, touchedAt, newest)) === 'c,b,a', 'no order: last touched first');
  const order = { id: 'books:reading', ids: ['a', 'c', 'b'], createdAt: '2026-11-07T11:00:00.000Z', updatedAt: '2026-11-07T11:00:00.000Z' };
  assert(ids(applyListOrderTouchedFirst(books, order, touchedAt, newest)) === 'a,c,b', 'saved order holds');
  const logged = books.map((x) => (x.id === 'b' ? { ...x, at: '2026-11-07T12:00:00.000Z' } : x));
  assert(ids(applyListOrderTouchedFirst(logged, order, touchedAt, newest)) === 'b,a,c', 'book logged after the order goes to the top');
  const started = [...books, { id: 'd', at: '2026-11-07T12:30:00.000Z' }];
  assert(ids(applyListOrderTouchedFirst(started, order, touchedAt, newest)) === 'd,a,c,b', 'new book joins the top');
  const bad = { ...order, updatedAt: 'nope' };
  assert(ids(applyListOrderTouchedFirst(books, bad, touchedAt, newest)) === 'a,c,b', 'unreadable time: saved order');
}
