import type { Goal, GoalStatus, Project, ProjectStatus, Task } from '@/types';

/**
 * Bottom-up progress and automatic status for Projects & Goals, computed from the three lists:
 * subtasks → task, tasks → project, projects → goal. A project with no tasks and a goal with
 * no projects are updated by hand (manualProgress). The Projects page reads the progress through
 * useHierarchy; the store applies the automatic status on every change (autoStatusChanges).
 */

export interface ProjectProgress {
  total: number;
  completed: number;
  percent: number;
  isManual: boolean;
}

export interface GoalProgress {
  linkedProjectsCount: number;
  completedProjectsCount: number;
  totalTasksCount: number;
  completedTasksCount: number;
  percent: number;
  isManual: boolean;
}

export const clampPercent = (n: number | undefined) => Math.min(100, Math.max(0, Math.round(n ?? 0)));

/** A project's progress from its own tasks; a task with subtasks counts the done share of them. */
export function projectProgressOf(project: Project, linkedTasks: Task[]): ProjectProgress {
  if (linkedTasks.length === 0) {
    return { total: 0, completed: 0, percent: clampPercent(project.manualProgress), isManual: true };
  }
  let sum = 0;
  let completed = 0;
  for (const t of linkedTasks) {
    if (t.completed) completed++;
    const subtasks = t.subtasks || [];
    sum += subtasks.length > 0 ? subtasks.filter((st) => st.completed).length / subtasks.length : t.completed ? 1 : 0;
  }
  return { total: linkedTasks.length, completed, percent: Math.round((sum / linkedTasks.length) * 100), isManual: false };
}

/** A goal's progress from its own projects; a done project counts as 100%. */
export function goalProgressOf(goal: Goal, linkedProjects: Project[], progressOf: (project: Project) => ProjectProgress): GoalProgress {
  if (linkedProjects.length === 0) {
    return {
      linkedProjectsCount: 0,
      completedProjectsCount: 0,
      totalTasksCount: 0,
      completedTasksCount: 0,
      percent: clampPercent(goal.manualProgress),
      isManual: true,
    };
  }
  let sum = 0;
  let completedProjectsCount = 0;
  let totalTasksCount = 0;
  let completedTasksCount = 0;
  for (const p of linkedProjects) {
    const prog = progressOf(p);
    const done = p.status === 'completed' || prog.percent === 100;
    totalTasksCount += prog.total;
    completedTasksCount += prog.completed;
    sum += done ? 100 : prog.percent;
    if (done) completedProjectsCount++;
  }
  return {
    linkedProjectsCount: linkedProjects.length,
    completedProjectsCount,
    totalTasksCount,
    completedTasksCount,
    percent: Math.round(sum / linkedProjects.length),
    isManual: false,
  };
}

const groupBy = <T>(items: T[], keyOf: (item: T) => string | undefined): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
};

export const tasksByProjectId = (tasks: Task[]) => groupBy(tasks, (t) => t.projectId);
export const projectsByGoalId = (projects: Project[]) => groupBy(projects, (p) => p.goalId);

/**
 * The statuses that must change. A project with tasks completes when they are all done; a goal
 * with projects is achieved when they are all done; both reopen when that stops being true.
 * Abandoned goals are a choice and never change on their own; manual items keep their status.
 * Goals are judged on the projects' new statuses, so applying the result once is final.
 */
export function autoStatusChanges(
  goals: Goal[],
  projects: Project[],
  tasks: Task[]
): { projects: Map<string, ProjectStatus>; goals: Map<string, GoalStatus> } {
  const projectChanges = new Map<string, ProjectStatus>();
  const goalChanges = new Map<string, GoalStatus>();
  const byProject = tasksByProjectId(tasks);
  const progress = new Map<string, ProjectProgress>();
  const progressOf = (p: Project) => {
    let prog = progress.get(p.id);
    if (!prog) {
      prog = projectProgressOf(p, byProject.get(p.id) ?? []);
      progress.set(p.id, prog);
    }
    return prog;
  };

  const nextProjects = projects.map((p) => {
    const prog = progressOf(p);
    if (prog.isManual) return p;
    const next: ProjectStatus | null =
      prog.percent === 100 && p.status !== 'completed' ? 'completed' : prog.percent < 100 && p.status === 'completed' ? 'in_progress' : null;
    if (!next) return p;
    projectChanges.set(p.id, next);
    return { ...p, status: next };
  });

  const byGoal = projectsByGoalId(nextProjects);
  for (const g of goals) {
    if (g.status === 'abandoned') continue;
    const prog = goalProgressOf(g, byGoal.get(g.id) ?? [], progressOf);
    if (prog.isManual) continue;
    if (prog.percent === 100 && g.status === 'active') goalChanges.set(g.id, 'achieved');
    else if (prog.percent < 100 && g.status === 'achieved') goalChanges.set(g.id, 'active');
  }

  return { projects: projectChanges, goals: goalChanges };
}
