import { useCallback, useMemo } from 'react';
import type { Goal, GoalStatus, Project, ProjectStatus, Task } from '@/types';
import {
  clampPercent,
  goalProgressOf,
  projectProgressOf,
  projectsByGoalId,
  tasksByProjectId,
  type GoalProgress,
  type ProjectProgress,
} from '@/lib/projectProgress';

export type { GoalProgress, ProjectProgress };

/**
 * Live progress for the Projects & Goals page (rules in lib/projectProgress.ts), plus the
 * sequential lock. The automatic status is applied by the store, not here.
 */

export interface LockStatus {
  isLocked: boolean;
  blockingProject?: Project;
  stepIndex?: number;
  totalSteps?: number;
  isSequentialGoal: boolean;
}

/** Where a manual item lands when its "done" status is taken back: just short of done. */
export const REOPENED_PERCENT = 95;

/** A goal's projects in sequence order (order, then oldest first). */
export function sortBySequence(list: Project[]): Project[] {
  return [...list].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

export function useHierarchy(goals: Goal[], projects: Project[], tasks: Task[]) {
  const tasksByProject = useMemo(() => tasksByProjectId(tasks), [tasks]);
  const projectsByGoal = useMemo(() => projectsByGoalId(projects), [projects]);

  const getProjectProgress = useCallback(
    (project: Project): ProjectProgress => projectProgressOf(project, tasksByProject.get(project.id) ?? []),
    [tasksByProject]
  );

  /** Done by status or by reaching 100%. A done project counts as 100% toward its goal. */
  const isProjectComplete = useCallback(
    (project: Project) => project.status === 'completed' || getProjectProgress(project).percent === 100,
    [getProjectProgress]
  );

  const getLockStatus = useCallback(
    (project: Project): LockStatus => {
      const goal = project.goalId ? goals.find((g) => g.id === project.goalId) : undefined;
      if (!goal?.sequentialMode) return { isLocked: false, isSequentialGoal: false };
      const linked = sortBySequence(projectsByGoal.get(goal.id) ?? []);
      const index = linked.findIndex((p) => p.id === project.id);
      const blockingProject = linked.slice(0, Math.max(index, 0)).find((p) => !isProjectComplete(p));
      return {
        isLocked: Boolean(blockingProject),
        blockingProject,
        stepIndex: index + 1,
        totalSteps: linked.length,
        isSequentialGoal: true,
      };
    },
    [goals, projectsByGoal, isProjectComplete]
  );

  const isLockedId = useCallback(
    (projectId?: string) => {
      if (!projectId) return false;
      const p = projects.find((x) => x.id === projectId);
      return p ? getLockStatus(p).isLocked : false;
    },
    [projects, getLockStatus]
  );

  const getGoalProgress = useCallback(
    (goal: Goal): GoalProgress => goalProgressOf(goal, projectsByGoal.get(goal.id) ?? [], getProjectProgress),
    [projectsByGoal, getProjectProgress]
  );

  return useMemo(
    () => ({ tasksByProject, projectsByGoal, getProjectProgress, isProjectComplete, getLockStatus, isLockedId, getGoalProgress }),
    [tasksByProject, projectsByGoal, getProjectProgress, isProjectComplete, getLockStatus, isLockedId, getGoalProgress]
  );
}

/**
 * The fields to save when a goal's status changes. A goal with projects becomes Achieved on its
 * own, so only a goal without projects (updated by hand) moves its % with the status: Achieved
 * fills it to 100, and taking Achieved back drops it just short of done.
 */
export function goalStatusPatch(goal: Pick<Goal, 'status' | 'manualProgress'> | null, next: GoalStatus, hasProjects: boolean): Partial<Goal> {
  if (hasProjects) return { status: next };
  const current = clampPercent(goal?.manualProgress);
  if (next === 'achieved') return { status: next, manualProgress: 100 };
  if (goal?.status === 'achieved' && current >= 100) return { status: next, manualProgress: REOPENED_PERCENT };
  return { status: next };
}

/** Same rule for a project: one with tasks completes on its own; one without moves its % with the status. */
export function projectStatusPatch(project: Pick<Project, 'status' | 'manualProgress'> | null, next: ProjectStatus, hasTasks: boolean): Partial<Project> {
  if (hasTasks) return { status: next };
  const current = clampPercent(project?.manualProgress);
  if (next === 'completed') return { status: next, manualProgress: 100 }; // the store stamps completedAt
  if (project?.status === 'completed' && current >= 100) return { status: next, manualProgress: REOPENED_PERCENT };
  return { status: next };
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  achieved: 'Achieved',
  abandoned: 'Abandoned',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
};
