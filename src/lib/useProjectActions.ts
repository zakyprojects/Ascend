// Project, goal and task actions of useAppState (goals, projects, tasks, subtasks, list order) and the
// project/goal auto-status effect, moved out of store.ts unchanged. useAppState calls this hook once, at the
// same place (so the effect keeps its position in the effect order), and returns the same members as before.
import { useCallback, useEffect } from 'react';
import type { AppState, Goal, Project, ListOrder, Task, TaskSubtask, GoalStatus, ProjectStatus, TaskPriority } from '@/types';
import { uid } from './dates';
import { autoStatusChanges } from './projectProgress';
import { applyListOrder, nextSequenceOrder, sameOrder, topStandaloneOrder } from './listOrder';
import { renameSubtaskIn } from './itemEdits';
import { trustedNow } from './clock';
import type { StoreSetState } from './storeSetState';

export function useProjectActions(setState: StoreSetState, get: () => AppState, state: AppState, isServerDataApplied: boolean) {
  // --- MODULE: PROJECTS & GOALS ACTIONS ---
  const createGoal = useCallback(
    (data: {
      title: string;
      description?: string;
      category?: string;
      targetDate?: string;
      status?: GoalStatus;
      manualProgress?: number;
      sequentialMode?: boolean;
    }) => {
      const newGoal: Goal = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        category: data.category?.trim() || undefined,
        targetDate: data.targetDate || undefined,
        status: data.status || 'active',
        manualProgress: data.manualProgress !== undefined ? data.manualProgress : 0,
        sequentialMode: Boolean(data.sequentialMode),
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            goals: [newGoal, ...prev.goals],
          };
        },
        { immediate: true }
      );
      return newGoal;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateGoal = useCallback(
    (id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => {
          return {
            ...prev,
            goals: prev.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteGoal = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id].slice(-500);
          return {
            ...prev,
            // Unlink linked projects by setting their goalId to undefined
            projects: prev.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
            // Remove goal
            goals: prev.goals.filter((g) => g.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Goal deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to compute updated completedAt timestamp on project status changes
  const resolveProjectCompletedAt = (
    currentStatus: ProjectStatus,
    newStatus: ProjectStatus | undefined,
    currentCompletedAt?: string,
    explicitCompletedAt?: string
  ): string | undefined => {
    if (newStatus === undefined || newStatus === currentStatus) {
      return explicitCompletedAt !== undefined ? explicitCompletedAt : currentCompletedAt;
    }
    if (newStatus === 'completed') {
      return currentCompletedAt || trustedNow().toISOString();
    }
    return undefined;
  };

  const createProject = useCallback(
    (data: {
      title: string;
      description?: string;
      goalId?: string;
      startDate?: string;
      dueDate?: string;
      status?: ProjectStatus;
      manualProgress?: number;
      order?: number;
    }) => {
      const isCompleted = data.status === 'completed';
      // A goal's new project joins the end of its sequence; a new standalone project the top.
      // (max + 1, not the count: after a delete the count can repeat an order already taken.)
      const projectOrder =
        data.order ?? (data.goalId ? nextSequenceOrder(state.projects, data.goalId) : topStandaloneOrder(state.projects));

      const newProject: Project = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        goalId: data.goalId || undefined,
        startDate: data.startDate || undefined,
        dueDate: data.dueDate || undefined,
        status: data.status || 'not_started',
        completedAt: isCompleted ? trustedNow().toISOString() : undefined,
        manualProgress: data.manualProgress !== undefined ? data.manualProgress : 0,
        order: projectOrder,
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            projects: [newProject, ...prev.projects],
          };
        },
        { immediate: true }
      );
      return newProject;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.projects]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => {
          return {
            ...prev,
            projects: prev.projects.map((p) => {
              if (p.id !== id) return p;
              const completedAt = resolveProjectCompletedAt(p.status, updates.status, p.completedAt, updates.completedAt);
              // Moved to another goal (or out of one): join the end of that list, so it can't take
              // step 1 with its old order and lock the projects already there.
              const movedGoal = 'goalId' in updates && (updates.goalId || undefined) !== (p.goalId || undefined);
              const order =
                movedGoal && updates.order === undefined
                  ? nextSequenceOrder(prev.projects, updates.goalId || undefined, id)
                  : updates.order ?? p.order;
              return { ...p, ...updates, completedAt, order };
            }),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Saves the user's order of one list (`key`, lib/listOrder LIST_ORDER_KEYS): one list_orders
   * row. Never touches the items themselves, so no module row (and no points) changes.
   */
  const saveListOrder = useCallback((key: string, ids: string[]) => {
    setState(
      (prev) => {
        const orders = prev.listOrders || [];
        const existing = orders.find((o) => o.id === key);
        if (existing && sameOrder(existing.ids, ids)) return prev;
        const now = trustedNow().toISOString();
        const next: ListOrder = { id: key, ids: [...ids], createdAt: existing?.createdAt ?? now, updatedAt: now };
        return { ...prev, listOrders: existing ? orders.map((o) => (o.id === key ? next : o)) : [...orders, next] };
      },
      { immediate: true }
    );
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Saves the order of one goal's projects (or of the standalone ones): `ids` in their new order
   * get order 0..n-1. In a sequential goal this is the unlock order. Only rows whose order changes
   * are rewritten.
   */
  const saveProjectOrder = useCallback((ids: string[]) => {
    setState(
      (prev) => {
        const index = new Map(ids.map((id, i) => [id, i]));
        let changed = false;
        const projects = prev.projects.map((p) => {
          const order = index.get(p.id);
          if (order === undefined || p.order === order) return p;
          changed = true;
          return { ...p, order };
        });
        return changed ? { ...prev, projects } : prev;
      },
      { immediate: true }
    );
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteProject = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id].slice(-500);
          return {
            ...prev,
            // Unlink linked tasks by setting their projectId to undefined
            tasks: prev.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined } : t)),
            // Remove project
            projects: prev.projects.filter((p) => p.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Project deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTask = useCallback(
    (data: {
      title: string;
      description?: string;
      projectId?: string;
      dueDate?: string;
      priority?: TaskPriority;
      completed?: boolean;
      subtasks?: TaskSubtask[];
    }) => {
      const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
      const isCompleted = subtasks.length > 0
        ? subtasks.every((st) => st.completed)
        : Boolean(data.completed);

      const newTask: Task = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        projectId: data.projectId || undefined,
        dueDate: data.dueDate || undefined,
        priority: data.priority || 'medium',
        completed: isCompleted,
        subtasks,
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            tasks: [newTask, ...prev.tasks],
          };
        },
        { immediate: true }
      );
      return newTask;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
      setState((prev) => {
        return {
          ...prev,
          tasks: prev.tasks.map((t) => {
            if (t.id !== id) return t;
            const updatedSubtasks = updates.subtasks !== undefined ? updates.subtasks : t.subtasks;
            const updatedCompleted = (updatedSubtasks && updatedSubtasks.length > 0)
              ? updatedSubtasks.every((st) => st.completed)
              : updates.completed !== undefined
              ? updates.completed
              : t.completed;
            return { ...t, ...updates, completed: updatedCompleted, updatedAt: trustedNow().toISOString() };
          }),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleTaskCompleted = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.tasks.find((t) => t.id === id);
      if (!target || (target.subtasks || []).length > 0) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== id) return t;
          return { ...t, completed: !t.completed, updatedAt: trustedNow().toISOString() };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteTask = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const targetTask = prev.tasks.find((t) => t.id === id);
          const subtaskIds = (targetTask?.subtasks || []).map((s) => s.id);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id, ...subtaskIds].slice(-500);
          return {
            ...prev,
            tasks: prev.tasks.filter((t) => t.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Task deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    setState((prev) => {
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const updatedSubtasks = (t.subtasks || []).map((st) =>
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
          );
          const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
          return { ...t, subtasks: updatedSubtasks, completed: allCompleted, updatedAt: trustedNow().toISOString() };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSubtask = useCallback((taskId: string, title: string) => {
    if (!title.trim()) return;
    const newSubtask: TaskSubtask = {
      id: uid(),
      title: title.trim(),
      completed: false,
    };
    setState((prev) => {
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const updatedSubtasks = [...(t.subtasks || []), newSubtask];
          const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
          return { ...t, subtasks: updatedSubtasks, completed: allCompleted, updatedAt: trustedNow().toISOString() };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), subtaskId].slice(-500);
          return {
            ...prev,
            tasks: prev.tasks.map((t) => {
              if (t.id !== taskId) return t;
              const updatedSubtasks = (t.subtasks || []).filter((st) => st.id !== subtaskId);
              const allCompleted = updatedSubtasks.length > 0 ? updatedSubtasks.every((st) => st.completed) : t.completed;
              return {
                ...t,
                subtasks: updatedSubtasks,
                completed: allCompleted,
                updatedAt: trustedNow().toISOString(),
              };
            }),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Subtask deletion', entityId: subtaskId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames a subtask; it stays done or not done, and so does its task. */
  const renameSubtask = useCallback((taskId: string, subtaskId: string, title: string) => {
    renameSubtaskIn(get().tasks, taskId, subtaskId, title);
    return setState(
      (prev) => {
        try {
          const tasks = renameSubtaskIn(prev.tasks, taskId, subtaskId, title);
          if (tasks === prev.tasks) return prev;
          const stamp = trustedNow().toISOString();
          return { ...prev, tasks: tasks.map((t) => (t.id === taskId ? { ...t, updatedAt: stamp } : t)) };
        } catch {
          return prev;
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Puts a task's subtasks in the order of `ids` (Reorder). Subtasks `ids` does not name keep their
   * place after the named ones; done states and the task's completion never change.
   */
  const reorderSubtasks = useCallback((taskId: string, ids: string[]) => {
    setState(
      (prev) => {
        const target = prev.tasks.find((t) => t.id === taskId);
        if (!target) return prev;
        const current = (target.subtasks || []).map((st) => st.id);
        const next = applyListOrder(target.subtasks || [], ids, (a, b) => current.indexOf(a.id) - current.indexOf(b.id), 'end');
        if (sameOrder(current, next.map((st) => st.id))) return prev;
        const stamp = trustedNow().toISOString();
        return { ...prev, tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: next, updatedAt: stamp } : t)) };
      },
      { immediate: true }
    );
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatic status (lib/projectProgress.ts): applied on every change to goals, projects or tasks,
  // whichever page, tab or device made it, so it never waits for the Projects page to open.
  // Waits for the server data, so a device cache or a failed read never flips a status.
  useEffect(() => {
    if (!isServerDataApplied) return;
    const pending = autoStatusChanges(state.goals, state.projects, state.tasks);
    if (pending.projects.size === 0 && pending.goals.size === 0) return;
    setState(
      (prev) => {
        const changes = autoStatusChanges(prev.goals, prev.projects, prev.tasks);
        if (changes.projects.size === 0 && changes.goals.size === 0) return prev;
        return {
          ...prev,
          projects: prev.projects.map((p) => {
            const status = changes.projects.get(p.id);
            return status ? { ...p, status, completedAt: resolveProjectCompletedAt(p.status, status, p.completedAt) } : p;
          }),
          goals: prev.goals.map((g) => {
            const status = changes.goals.get(g.id);
            return status ? { ...g, status } : g;
          }),
        };
      },
      { immediate: true }
    );
    // False positive: setState is stable; resolveProjectCompletedAt reads only its arguments and the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServerDataApplied, state.goals, state.projects, state.tasks]);

  return {
    createGoal,
    updateGoal,
    deleteGoal,
    createProject,
    updateProject,
    saveProjectOrder,
    saveListOrder,
    deleteProject,
    createTask,
    updateTask,
    toggleTaskCompleted,
    deleteTask,
    toggleSubtask,
    addSubtask,
    deleteSubtask,
    renameSubtask,
    reorderSubtasks,
  };
}
