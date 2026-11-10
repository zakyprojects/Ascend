// Projects & Goals progress (lib/projectProgress.ts): a project or goal with parts reaches 100% and
// completes / is achieved only when every part is done. Rounding must never finish it early (PG-M1).
import type { Goal, Project, Task } from '../../types';
const { projectProgressOf, goalProgressOf, autoStatusChanges, tasksByProjectId } = await import('../projectProgress');
const { lockStatusOf } = await import('../../components/projects/hierarchy');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const created = '2026-11-01T00:00:00.000Z';
const task = (id: string, projectId: string, completed: boolean, subtasks: boolean[] = []): Task => ({
  id,
  title: id,
  projectId,
  priority: 'medium',
  completed,
  subtasks: subtasks.map((done, i) => ({ id: `${id}-s${i}`, title: `s${i}`, completed: done })),
  createdAt: created,
});
const project = (id: string, over: Partial<Project> = {}): Project => ({ id, title: id, status: 'in_progress', createdAt: created, ...over });
const goal = (id: string, over: Partial<Goal> = {}): Goal => ({ id, title: id, status: 'active', createdAt: created, ...over });
const tasksFor = (projectId: string, done: number, open: number) => [
  ...Array.from({ length: done }, (_, i) => task(`${projectId}-d${i}`, projectId, true)),
  ...Array.from({ length: open }, (_, i) => task(`${projectId}-o${i}`, projectId, false)),
];

// Project: 199 of 200 tasks done is 99.5% → shows 99, not 100, and does not complete.
{
  const p = project('p');
  const tasks = tasksFor('p', 199, 1);
  const prog = projectProgressOf(p, tasks);
  assert(prog.percent === 99, `199/200 tasks = 99 (got ${prog.percent})`);
  const changes = autoStatusChanges([], [p], tasks);
  assert(!changes.projects.has('p'), '199/200 tasks: project stays open');
}

// Project: one task with 199 of 200 subtasks done → 99, open.
{
  const p = project('p');
  const tasks = [task('t', 'p', false, [...Array(199).fill(true), false])];
  assert(projectProgressOf(p, tasks).percent === 99, 'one open subtask of 200 keeps the project at 99');
  assert(!autoStatusChanges([], [p], tasks).projects.has('p'), 'one open subtask: project stays open');
}

// Project: every task done → 100 and completes; a done task with all subtasks done counts too.
{
  const p = project('p');
  const tasks = [task('a', 'p', true), task('b', 'p', false, [true, true])];
  assert(projectProgressOf(p, tasks).percent === 100, 'all parts done = 100');
  assert(autoStatusChanges([], [p], tasks).projects.get('p') === 'completed', 'all parts done: project completes');
}

// Project: a completed project whose share drops below every-part-done reopens.
{
  const p = project('p', { status: 'completed' });
  const tasks = tasksFor('p', 199, 1);
  assert(autoStatusChanges([], [p], tasks).projects.get('p') === 'in_progress', 'completed project with an open task reopens');
}

// Normal shares still round as before (only the 100 boundary changed).
{
  const p = project('p');
  assert(projectProgressOf(p, tasksFor('p', 1, 2)).percent === 33, '1/3 = 33');
  assert(projectProgressOf(p, tasksFor('p', 2, 1)).percent === 67, '2/3 = 67');
  assert(projectProgressOf(p, []).percent === 0 && projectProgressOf(p, []).isManual, 'no tasks = manual');
  assert(projectProgressOf(project('m', { manualProgress: 100 }), []).percent === 100, 'manual 100 stays 100');
}

// Goal: [completed, 99%] averages 99.5 → 99, stays Active.
{
  const g = goal('g');
  const done = project('a', { goalId: 'g', status: 'completed' });
  const almost = project('b', { goalId: 'g', manualProgress: 99 });
  const prog = goalProgressOf(g, [done, almost], (p) => projectProgressOf(p, []));
  assert(prog.percent === 99, `[100, 99] = 99 (got ${prog.percent})`);
  assert(!autoStatusChanges([g], [done, almost], []).goals.has('g'), '[100, 99]: goal stays active');
}

// Goal: [100, 100, 99] and ten done + one at 95 stay below 100.
{
  const g = goal('g');
  const three = [project('a', { goalId: 'g', status: 'completed' }), project('b', { goalId: 'g', status: 'completed' }), project('c', { goalId: 'g', manualProgress: 99 })];
  assert(goalProgressOf(g, three, (p) => projectProgressOf(p, [])).percent === 99, '[100,100,99] = 99');
  assert(!autoStatusChanges([g], three, []).goals.has('g'), '[100,100,99]: goal stays active');
  const eleven = [
    ...Array.from({ length: 10 }, (_, i) => project(`d${i}`, { goalId: 'g', status: 'completed' })),
    project('r', { goalId: 'g', manualProgress: 95 }),
  ];
  assert(goalProgressOf(g, eleven, (p) => projectProgressOf(p, [])).percent === 99, '10 done + 1 at 95 = 99');
  assert(!autoStatusChanges([g], eleven, []).goals.has('g'), '10 done + 1 at 95: goal stays active');
}

// Goal: an Achieved goal set back to Active with one project at 99% is not flipped back (no loop).
{
  const g = goal('g', { status: 'active' });
  const projects = [project('a', { goalId: 'g', status: 'completed' }), project('b', { goalId: 'g', manualProgress: 99 })];
  const changes = autoStatusChanges([g], projects, []);
  assert(changes.goals.size === 0, 'goal set back to Active stays Active');
  const achieved = goal('g', { status: 'achieved' });
  assert(autoStatusChanges([achieved], projects, []).goals.get('g') === 'active', 'achieved goal with an open project goes back to Active');
}

// Goal: all projects done (one by its tasks) → 100, achieved.
{
  const g = goal('g');
  const projects = [project('a', { goalId: 'g', status: 'completed' }), project('b', { goalId: 'g' })];
  const tasks = tasksFor('b', 3, 0);
  const changes = autoStatusChanges([g], projects, tasks);
  assert(changes.projects.get('b') === 'completed', 'project b completes from its tasks');
  assert(changes.goals.get('g') === 'achieved', 'goal achieved once every project is done');
}

// In-order goal: a project at 99.5% (rounded) does not unlock the next one.
{
  const g = goal('g', { sequentialMode: true });
  const first = project('a', { goalId: 'g', order: 0 });
  const second = project('b', { goalId: 'g', order: 1 });
  const byProject = tasksByProjectId(tasksFor('a', 199, 1));
  const isComplete = (p: Project) => p.status === 'completed' || projectProgressOf(p, byProject.get(p.id) ?? []).percent === 100;
  const lock = lockStatusOf(second, [g], new Map([['g', [first, second]]]), isComplete);
  assert(lock.isLocked && lock.blockingProject?.id === 'a', 'next project stays locked while the first has an open task');
}

console.log('projectProgress tests passed');
