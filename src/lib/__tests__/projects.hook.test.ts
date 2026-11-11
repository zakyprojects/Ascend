// Hook test (real useAppState + in-process fake Supabase, see harness/): the goal, project and task
// actions of a signed-in account, and the project auto-status effect. Written for C2 (moving them
// out of useAppState).
//   T25  a goal and two projects in it reach their tables; the second project joins the end of the
//        goal's sequence (createProject reads the current projects); a task in a project reaches
//        tasks; ticking the project's only task completes the project (auto-status effect, after the
//        server data is applied) and unticking reopens it; a list order reaches list_orders; deleting
//        the task and the project removes their rows.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('projects.hook (goal, project, task actions + auto status)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().isServerDataApplied, 'server data applied');
  await quiet(1500);

  h.s().createGoal({ title: 'HookGoal' });
  const goal = () => h.s().state.goals.find((g) => g.title === 'HookGoal');
  await until(goal, 'T25: goal in state');
  const goalId = goal()!.id;
  await until(() => rows('goals').some((r) => r.id === goalId), 'T25: goal reached goals', 5000);

  const p1 = h.s().createProject({ title: 'HookProjectA', goalId });
  await until(() => h.s().state.projects.some((p) => p.id === p1.id), 'T25: first project in state');
  const p2 = h.s().createProject({ title: 'HookProjectB', goalId });
  eq([p1.order, p2.order], [0, 1], 'T25: the second project joins the end of the goal sequence (reads current projects)');
  await until(() => rows('projects').some((r) => r.id === p2.id), 'T25: project reached projects', 5000);

  h.s().createTask({ title: 'HookTask', projectId: p1.id });
  const task = () => h.s().state.tasks.find((t) => t.title === 'HookTask');
  await until(task, 'T25: task in state');
  const taskId = task()!.id;
  await until(() => rows('tasks').some((r) => r.id === taskId), 'T25: task reached tasks', 5000);

  const project = () => h.s().state.projects.find((p) => p.id === p1.id);
  h.s().toggleTaskCompleted(taskId);
  await until(() => task()?.completed === true, 'T25: task ticked');
  await until(() => project()?.status === 'completed', 'T25: project auto-completed when its only task is done');
  assert(project()?.completedAt, 'T25: auto-completed project has completedAt');
  h.s().toggleTaskCompleted(taskId);
  await until(() => project()?.status === 'in_progress', 'T25: project reopened when the task is unticked');

  h.s().saveListOrder('hook-list', [p2.id, p1.id]);
  await until(() => rows('list_orders').some((r) => r.id === 'hook-list'), 'T25: list order reached list_orders', 5000);

  h.s().deleteTask(taskId);
  h.s().deleteProject(p2.id);
  await until(() => !task() && !h.s().state.projects.some((p) => p.id === p2.id), 'T25: task and project gone from state');
  await until(() => !rows('tasks').some((r) => r.id === taskId) && !rows('projects').some((r) => r.id === p2.id), 'T25: task and project rows deleted', 5000);
  pass('T25 goal, projects, task, auto status, list order and deletes saved');
});
