import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, CheckSquare, Filter, FolderKanban, HelpCircle, Plus, Search, Target, X } from 'lucide-react';
import { cx, EmptyState as EmptyStateBase, SlidingPill, TabPanel, Tabs, ToolbarInput, ToolbarSelect } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { PageHero } from '@/components/ui/PageHero';
import { Reveal } from '@/components/ui/Motion';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { ProgressUpdateDialog } from '@/components/ui/ProgressUpdateDialog';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { toUserMessage } from '@/lib/userMessage';
import { AppStore } from '@/lib/store';
import { addDays } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import type { Goal, GoalStatus, Project, ProjectStatus, Task, TaskPriority, TaskSubtask } from '@/types';
import { EmptyState } from '@/components/views/ProjectsGoalsEmptyState';
import { goalStatusPatch, projectStatusPatch, sortBySequence, useHierarchy } from '@/components/projects/hierarchy';
import { GoalCard } from '@/components/projects/GoalCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { TaskRow } from '@/components/projects/TaskRow';
import { GoalFormDialog, ProjectFormDialog, TaskFormDialog, type GoalPayload, type ProjectPayload, type TaskPayload } from '@/components/projects/HierarchyForms';
import { HowItWorksDialog } from '@/components/projects/HowItWorksDialog';

type SubViewTab = 'goals' | 'projects' | 'tasks';
type TabOrder = 'taskFirst' | 'projectFirst' | 'goalFirst';
type TaskView = 'all' | 'active' | 'today' | 'overdue' | 'next7' | 'completed' | 'locked';

const TAB_ORDER: Record<TabOrder, SubViewTab[]> = {
  taskFirst: ['tasks', 'projects', 'goals'],
  projectFirst: ['projects', 'tasks', 'goals'],
  goalFirst: ['goals', 'projects', 'tasks'],
};
const NEXT_ORDER: Record<TabOrder, TabOrder> = { taskFirst: 'projectFirst', projectFirst: 'goalFirst', goalFirst: 'taskFirst' };
const ORDER_LABEL: Record<TabOrder, string> = { taskFirst: 'Tasks first', projectFirst: 'Projects first', goalFirst: 'Goals first' };
const TAB_META = {
  tasks: { label: 'Tasks', icon: CheckSquare },
  projects: { label: 'Projects', icon: FolderKanban },
  goals: { label: 'Goals', icon: Target },
} as const;

const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'To do' },
  { id: 'today', label: 'Due today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'next7', label: 'Next 7 days' },
  { id: 'completed', label: 'Done' },
  { id: 'locked', label: 'Locked' },
];

/** A row of filter options with a gliding active pill. */
function FilterRow<T extends string>({
  options,
  value,
  onChange,
  activeClass,
  label,
  className,
  id,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  activeClass: Partial<Record<T, string>>;
  label: string;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} role="group" aria-label={label} className={cx('relative isolate flex flex-wrap items-center gap-1.5', className)}>
      <SlidingPill
        active={value}
        className={cx('rounded-lg border', activeClass[value] ?? 'border-overlay-strong bg-overlay-default')}
        contentKey={options.map((o) => o.label).join('|')}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-pill-id={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition-colors',
            value === o.id ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Projects of the goal X" / "Tasks of the project X", with a way back to everything. */
function ScopeBar({ icon: Icon, text, name, onClear }: { icon: typeof Target; text: string; name: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-overlay-subtle bg-overlay-subtle px-3 py-2">
      <p className="flex min-w-0 items-center gap-2 text-xs text-content-tertiary">
        <Icon size={14} className="shrink-0 text-content-muted" aria-hidden="true" />
        <span className="truncate">
          {text} <strong className="font-medium text-content-primary">{name}</strong>
        </span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className={cx('flex shrink-0 items-center gap-1 text-xs font-medium text-content-muted hover:text-content-primary', TAP_TARGET)}
      >
        <X size={13} aria-hidden="true" />
        <span>Show all</span>
      </button>
    </div>
  );
}

export function ProjectsGoalsView({
  store,
  onStartFocusSession,
}: {
  store: AppStore;
  onStartFocusSession?: (taskTitle: string) => void;
}) {
  const { showSuccessToast, showErrorToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const goals = useMemo(() => store.state.goals || [], [store.state.goals]);
  const projects = useMemo(() => store.state.projects || [], [store.state.projects]);
  const tasks = useMemo(() => store.state.tasks || [], [store.state.tasks]);
  const h = useHierarchy(goals, projects, tasks);
  // Re-renders at local midnight: overdue / due today counts and filters roll over (C5).
  const today = useLocalDayKey();

  const [activeTab, setActiveTab] = useState<SubViewTab>('tasks');
  const [tabOrder, setTabOrder] = useState<TabOrder>('taskFirst');

  // Drill-down: a goal's projects, a project's tasks.
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);

  const [goalStatusFilter, setGoalStatusFilter] = useState<'all' | GoalStatus>('all');
  const [goalSearch, setGoalSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | ProjectStatus | 'locked'>('all');
  const [projectGoalFilter, setProjectGoalFilter] = useState('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [taskView, setTaskView] = useState<TaskView>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [taskProjectFilter, setTaskProjectFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  // Phones: the task filters sit behind one Filters button so the list starts higher.
  const [taskFiltersOpen, setTaskFiltersOpen] = useState(false);

  // Quick add
  const quickTaskInputRef = useRef<HTMLInputElement | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>('medium');
  const [quickTaskProjectId, setQuickTaskProjectId] = useState('');
  const [focusQuickAdd, setFocusQuickAdd] = useState(false);
  useEffect(() => {
    setQuickTaskProjectId(filterProjectId || '');
  }, [filterProjectId]);
  // Focus the quick-add box once the Tasks tab has rendered it.
  useEffect(() => {
    if (!focusQuickAdd || activeTab !== 'tasks') return;
    const input = quickTaskInputRef.current;
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setFocusQuickAdd(false);
  }, [focusQuickAdd, activeTab]);

  // Dialogs (each form is keyed so it opens fresh)
  const [guideOpen, setGuideOpen] = useState(false);
  const [goalForm, setGoalForm] = useState<{ key: number; editing: Goal | null } | null>(null);
  const [projectForm, setProjectForm] = useState<{ key: number; editing: Project | null; goalId?: string } | null>(null);
  const [taskForm, setTaskForm] = useState<{ key: number; editing: Task | null; projectId?: string } | null>(null);
  const [progressUpdate, setProgressUpdate] = useState<{ kind: 'goal' | 'project'; id: string; title: string; current: number } | null>(null);
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
  const [deleteSubtaskTarget, setDeleteSubtaskTarget] = useState<{ taskId: string; subtask: TaskSubtask } | null>(null);
  const formKey = useRef(0);

  const goalName = (id?: string) => (id ? goals.find((g) => g.id === id)?.title ?? null : null);
  const projectById = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);

  // --------------------------------------------------------------------------
  // Hero numbers
  // --------------------------------------------------------------------------
  const stats = useMemo(() => {
    const activeGoals = goals.filter((g) => g.status === 'active');
    const avgGoal = activeGoals.length
      ? Math.round(activeGoals.reduce((sum, g) => sum + h.getGoalProgress(g).percent, 0) / activeGoals.length)
      : 0;
    const openTasks = tasks.filter((t) => !t.completed && !h.isLockedId(t.projectId));
    return {
      activeGoals: activeGoals.length,
      achievedGoals: goals.filter((g) => g.status === 'achieved').length,
      avgGoal,
      activeProjects: projects.filter((p) => (p.status === 'in_progress' || p.status === 'not_started') && !h.getLockStatus(p).isLocked).length,
      pendingTasks: openTasks.length,
      overdue: openTasks.filter((t) => t.dueDate && t.dueDate < today).length,
      dueToday: openTasks.filter((t) => t.dueDate === today).length,
    };
  }, [goals, projects, tasks, h, today]);

  // --------------------------------------------------------------------------
  // Lists
  // --------------------------------------------------------------------------
  const goalSearchMatches = useMemo(() => {
    const q = goalSearch.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) => [g.title, g.description, g.category].some((s) => (s || '').toLowerCase().includes(q)));
  }, [goals, goalSearch]);

  const filteredGoals = useMemo(
    () => goalSearchMatches.filter((g) => goalStatusFilter === 'all' || g.status === goalStatusFilter),
    [goalSearchMatches, goalStatusFilter]
  );

  const activeGoalFilter = filterGoalId || (projectGoalFilter !== 'all' ? projectGoalFilter : null);
  const projectsInScope = useMemo(() => {
    if (!activeGoalFilter) return projects;
    return projects.filter((p) => (activeGoalFilter === 'standalone' ? !p.goalId : p.goalId === activeGoalFilter));
  }, [projects, activeGoalFilter]);

  const projectSearchMatches = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projectsInScope;
    return projectsInScope.filter((p) => [p.title, p.description].some((s) => (s || '').toLowerCase().includes(q)));
  }, [projectsInScope, projectSearch]);

  const projectMatchesStatus = (p: Project, f: typeof projectStatusFilter) => {
    const locked = h.getLockStatus(p).isLocked;
    if (f === 'all') return true;
    if (f === 'locked') return locked;
    if (f === 'completed') return p.status === 'completed';
    return p.status === f && !locked;
  };

  const projectCounts = useMemo(() => {
    const count = (f: typeof projectStatusFilter) => projectSearchMatches.filter((p) => projectMatchesStatus(p, f)).length;
    return {
      all: projectSearchMatches.length,
      in_progress: count('in_progress'),
      not_started: count('not_started'),
      on_hold: count('on_hold'),
      completed: count('completed'),
      locked: count('locked'),
    };
    // projectMatchesStatus reads only h, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSearchMatches, h]);

  const scopedGoal = activeGoalFilter && activeGoalFilter !== 'standalone' ? goals.find((g) => g.id === activeGoalFilter) : undefined;
  // Up/down only make sense while the list shows one ordered goal's projects in their order.
  const showReorder = Boolean(scopedGoal?.sequentialMode) && projectStatusFilter === 'all' && !projectSearch.trim();

  const filteredProjects = useMemo(() => {
    const list = projectSearchMatches.filter((p) => projectMatchesStatus(p, projectStatusFilter));
    if (projectStatusFilter === 'completed') {
      return [...list].sort((a, b) => (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt));
    }
    if (scopedGoal?.sequentialMode) return sortBySequence(list);
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // projectMatchesStatus reads only h, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSearchMatches, projectStatusFilter, scopedGoal, h]);

  const activeProjectFilter = filterProjectId || (taskProjectFilter !== 'all' ? taskProjectFilter : null);
  const tasksInScope = useMemo(() => {
    if (!filterProjectId) return tasks;
    return tasks.filter((t) => t.projectId === filterProjectId);
  }, [tasks, filterProjectId]);

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    const next7Key = addDays(today, 7);
    return tasks.filter((t) => {
      if (activeProjectFilter === 'standalone' ? t.projectId : activeProjectFilter && t.projectId !== activeProjectFilter) return false;
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;
      const locked = h.isLockedId(t.projectId);
      if (taskView === 'locked' && !locked) return false;
      if (taskView === 'active' && (t.completed || (locked && !q))) return false;
      if (taskView === 'completed' && !t.completed) return false;
      if (taskView === 'today' && t.dueDate !== today) return false;
      if (taskView === 'overdue' && (!t.dueDate || t.dueDate >= today || t.completed)) return false;
      if (taskView === 'next7' && (!t.dueDate || t.dueDate < today || t.dueDate > next7Key)) return false;
      if (q && ![t.title, t.description].some((s) => (s || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, activeProjectFilter, taskPriorityFilter, taskView, taskSearch, today, h]);

  const activeTaskFilterCount =
    Number(taskPriorityFilter !== 'all') + Number(!filterProjectId && taskProjectFilter !== 'all') + Number(taskView !== 'all');

  const clearGoalFilters = () => {
    setGoalSearch('');
    setGoalStatusFilter('all');
  };
  const clearProjectFilters = () => {
    setProjectSearch('');
    setProjectStatusFilter('all');
    setProjectGoalFilter('all');
  };
  const clearTaskFilters = () => {
    setTaskSearch('');
    setTaskView('all');
    setTaskPriorityFilter('all');
    setTaskProjectFilter('all');
  };

  // --------------------------------------------------------------------------
  // Navigation between levels
  // --------------------------------------------------------------------------
  const openGoalProjects = (goalId: string) => {
    setFilterGoalId(goalId);
    setProjectStatusFilter('all');
    setProjectSearch('');
    setActiveTab('projects');
  };
  const openProjectTasks = (projectId: string) => {
    setFilterProjectId(projectId);
    setTaskView('all');
    setTaskSearch('');
    setActiveTab('tasks');
  };
  const startTaskForProject = (projectId: string) => {
    openProjectTasks(projectId);
    setFocusQuickAdd(true);
  };

  // --------------------------------------------------------------------------
  // Saves
  // --------------------------------------------------------------------------
  const nextKey = () => ++formKey.current;

  const saveGoal = (payload: GoalPayload) => {
    const editing = goalForm?.editing ?? null;
    const hasProjects = editing ? (h.projectsByGoal.get(editing.id)?.length ?? 0) > 0 : false;
    const statusFields = goalStatusPatch(editing, payload.status, hasProjects);
    if (editing) {
      store.updateGoal(editing.id, { ...payload, ...statusFields });
      showSuccessToast('Goal saved', `"${payload.title}" is updated.`);
    } else {
      store.createGoal({ ...payload, manualProgress: statusFields.manualProgress });
      showSuccessToast('Goal created', `Next, add a project to "${payload.title}".`);
    }
  };

  const saveProject = (payload: ProjectPayload) => {
    const editing = projectForm?.editing ?? null;
    const hasTasks = editing ? (h.tasksByProject.get(editing.id)?.length ?? 0) > 0 : false;
    const statusFields = projectStatusPatch(editing, payload.status, hasTasks);
    if (editing) {
      store.updateProject(editing.id, { ...payload, ...statusFields });
      showSuccessToast('Project saved', `"${payload.title}" is updated.`);
    } else {
      store.createProject({ ...payload, manualProgress: statusFields.manualProgress });
      showSuccessToast('Project created', `Next, add its first task.`);
    }
  };

  const saveTask = (payload: TaskPayload) => {
    const editing = taskForm?.editing ?? null;
    if (editing) {
      store.updateTask(editing.id, payload);
      showSuccessToast('Task saved', `"${payload.title}" is updated.`);
    } else {
      store.createTask({ ...payload, completed: false });
      showSuccessToast('Task added', `"${payload.title}" is on your list.`);
    }
  };

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTaskTitle.trim();
    if (!title) return;
    await executeWithKey('quick_add_task', async () => {
      store.createTask({ title, priority: quickTaskPriority, projectId: quickTaskProjectId || undefined, completed: false, subtasks: [] });
      setQuickTaskTitle('');
      showSuccessToast('Task added', `"${title}" is on your list.`);
    }).catch((err) => showErrorToast("Couldn't add the task", toUserMessage(err, 'Try again.')));
  };

  const changeGoalStatus = (goal: Goal, next: GoalStatus) => {
    const hasProjects = (h.projectsByGoal.get(goal.id)?.length ?? 0) > 0;
    store.updateGoal(goal.id, goalStatusPatch(goal, next, hasProjects));
  };

  const changeProjectStatus = (project: Project, next: ProjectStatus) => {
    const lock = h.getLockStatus(project);
    if (lock.isLocked) return; // the menu is disabled while locked
    const hasTasks = (h.tasksByProject.get(project.id)?.length ?? 0) > 0;
    store.updateProject(project.id, projectStatusPatch(project, next, hasTasks));
  };

  /** A hand-updated %: reaching 100 marks it done, dropping below takes that back. */
  const saveManualProgress = (next: number) => {
    if (!progressUpdate) return;
    const value = Math.max(0, Math.min(100, Math.round(next)));
    if (progressUpdate.kind === 'goal') {
      const goal = goals.find((g) => g.id === progressUpdate.id);
      if (!goal) return;
      const status: GoalStatus =
        goal.status === 'abandoned' ? goal.status : value === 100 ? 'achieved' : goal.status === 'achieved' ? 'active' : goal.status;
      store.updateGoal(goal.id, { manualProgress: value, status });
    } else {
      const project = projects.find((p) => p.id === progressUpdate.id);
      if (!project || h.getLockStatus(project).isLocked) return;
      const status: ProjectStatus = value === 100 ? 'completed' : project.status === 'completed' ? 'in_progress' : project.status;
      store.updateProject(project.id, { manualProgress: value, status });
    }
  };

  // --------------------------------------------------------------------------
  // Deletes
  // --------------------------------------------------------------------------
  const handleDeleteGoalConfirm = async () => {
    const target = deleteGoalTarget;
    if (!target) return;
    await executeWithKey(`delete_goal_${target.id}`, async () => {
      await store.deleteGoal(target.id);
      showSuccessToast('Goal deleted', 'Its projects are kept, now without a goal.', `goal_${target.id}`);
      setDeleteGoalTarget(null);
      if (filterGoalId === target.id) setFilterGoalId(null);
      if (projectGoalFilter === target.id) setProjectGoalFilter('all');
    });
  };

  const handleDeleteProjectConfirm = async () => {
    const target = deleteProjectTarget;
    if (!target) return;
    await executeWithKey(`delete_project_${target.id}`, async () => {
      await store.deleteProject(target.id);
      showSuccessToast('Project deleted', 'Its tasks are kept, now without a project.', `project_${target.id}`);
      setDeleteProjectTarget(null);
      if (filterProjectId === target.id) setFilterProjectId(null);
      if (taskProjectFilter === target.id) setTaskProjectFilter('all');
    });
  };

  const handleDeleteTaskConfirm = async () => {
    const target = deleteTaskTarget;
    if (!target) return;
    await executeWithKey(`delete_task_${target.id}`, async () => {
      await store.deleteTask(target.id);
      showSuccessToast('Task deleted', 'Task removed.', `task_${target.id}`);
      setDeleteTaskTarget(null);
    });
  };

  const handleDeleteSubtaskConfirm = async () => {
    const target = deleteSubtaskTarget;
    if (!target) return;
    await executeWithKey(`delete_subtask_${target.subtask.id}`, async () => {
      await store.deleteSubtask(target.taskId, target.subtask.id);
      showSuccessToast('Subtask deleted', 'Subtask removed.', `subtask_${target.subtask.id}`);
      setDeleteSubtaskTarget(null);
    });
  };

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const deleteGoalText = (goal: Goal) => {
    const count = h.projectsByGoal.get(goal.id)?.length ?? 0;
    return count > 0
      ? `"${goal.title}" will be deleted. Its ${plural(count, 'project stays', 'projects stay')}, just without a goal.`
      : `"${goal.title}" will be deleted.`;
  };

  const deleteProjectText = (project: Project) => {
    const count = h.tasksByProject.get(project.id)?.length ?? 0;
    const lock = h.getLockStatus(project);
    const laterSteps = lock.isSequentialGoal && (lock.stepIndex ?? 0) < (lock.totalSteps ?? 0);
    return [
      `"${project.title}" will be deleted.`,
      count > 0 ? `Its ${plural(count, 'task stays', 'tasks stay')}, just without a project.` : '',
      laterSteps ? 'The projects after it in this goal move up one step.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  const orderedTabs = TAB_ORDER[tabOrder];
  const changeTab = (id: string) => setActiveTab(id as SubViewTab);
  const tabCounts = { tasks: tasks.length, projects: projects.length, goals: goals.length };
  const primaryAction =
    activeTab === 'tasks'
      ? { label: 'New task', onClick: () => setTaskForm({ key: nextKey(), editing: null, projectId: filterProjectId ?? undefined }) }
      : activeTab === 'projects'
        ? { label: 'New project', onClick: () => setProjectForm({ key: nextKey(), editing: null, goalId: scopedGoal?.id }) }
        : { label: 'New goal', onClick: () => setGoalForm({ key: nextKey(), editing: null }) };

  const heroStats = [
    { key: 'projects', label: 'Active projects', value: stats.activeProjects, valueClassName: 'text-cyan-hierarchy' },
    { key: 'goals', label: 'Active goals', value: stats.activeGoals, valueClassName: 'text-purple-hierarchy' },
  ];
  if (tabOrder === 'goalFirst') heroStats.reverse();

  const filterGoal = filterGoalId ? goals.find((g) => g.id === filterGoalId) : undefined;
  const filterProject = projectById(filterProjectId ?? undefined);
  const filterProjectLock = filterProject ? h.getLockStatus(filterProject) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Projects & Goals</h1>
          <p className="page-subtitle">
            Dream it, plan it, do it.{' '}
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1 font-medium text-content-secondary underline-offset-2 hover:text-content-primary hover:underline"
            >
              <HelpCircle size={13} aria-hidden="true" />
              How it works
            </button>
          </p>
        </div>
        <button type="button" onClick={primaryAction.onClick} className="btn-primary self-start md:self-auto">
          <Plus size={16} aria-hidden="true" /> {primaryAction.label}
        </button>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Projects and goals overview"
          ring={{
            value: stats.avgGoal,
            max: 100,
            label: `Average progress of active goals: ${stats.avgGoal}%`,
            center: stats.activeGoals ? `${stats.avgGoal}%` : '–',
            caption: stats.activeGoals ? 'goal progress' : 'no goals yet',
            tone: 'purple',
          }}
          lead={{
            label: 'Tasks to do',
            value: stats.pendingTasks,
            hint:
              stats.overdue > 0
                ? `${stats.overdue} overdue${stats.dueToday ? `, ${stats.dueToday} due today` : ''}`
                : stats.dueToday > 0
                  ? `${stats.dueToday} due today`
                  : tasks.length === 0
                    ? 'Add one small step to start'
                    : 'Nothing overdue',
            valueClassName: 'text-success-text',
          }}
          stats={[
            ...heroStats.map(({ label, value, valueClassName }) => ({ label, value, valueClassName })),
            { label: 'Goals achieved', value: stats.achievedGoals },
          ]}
        />
      </Reveal>

      <div className="flex items-center gap-2">
        <Tabs
          idBase="projects-goals"
          ariaLabel="Projects and goals sections"
          className="min-w-0 flex-1"
          scrollable
          value={activeTab}
          onChange={changeTab}
          items={orderedTabs.map((id, index) => ({
            id,
            label: `${index + 1}. ${TAB_META[id].label}`,
            icon: TAB_META[id].icon,
            badge: tabCounts[id],
          }))}
        />
        {/* The order switch unlocks once there is a goal to lead with. */}
        <button
          type="button"
          disabled={goals.length === 0}
          onClick={() => setTabOrder(NEXT_ORDER[tabOrder])}
          title={goals.length === 0 ? 'Add a goal to change the order' : `Order: ${ORDER_LABEL[tabOrder]}. Tap to switch.`}
          aria-label={goals.length === 0 ? 'Change order (add a goal first)' : `Order: ${ORDER_LABEL[tabOrder]}. Switch to ${ORDER_LABEL[NEXT_ORDER[tabOrder]]}`}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors',
            goals.length === 0 ? 'cursor-not-allowed text-content-disabled' : 'text-content-muted hover:bg-overlay-subtle hover:text-content-primary',
            TAP_TARGET
          )}
        >
          <ArrowDownUp size={14} aria-hidden="true" />
          <span className="max-sm:hidden">{ORDER_LABEL[tabOrder]}</span>
        </button>
      </div>

      <TabPanel idBase="projects-goals" ids={orderedTabs} value={activeTab} onChange={changeTab}>
        {/* ------------------------------------------------------------------ GOALS */}
        {activeTab === 'goals' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ToolbarInput
                type="search"
                icon={Search}
                aria-label="Search goals"
                placeholder="Search goals"
                value={goalSearch}
                onChange={(e) => setGoalSearch(e.target.value)}
                wrapperClassName="flex-1"
              />
              <FilterRow
                label="Goal status"
                value={goalStatusFilter}
                onChange={setGoalStatusFilter}
                activeClass={{
                  active: 'border-emerald-500/30 bg-emerald-500/15',
                  achieved: 'border-[var(--badge-purple-border)] bg-[var(--badge-purple-bg)]',
                }}
                options={[
                  { id: 'all', label: `All ${goalSearchMatches.length}` },
                  { id: 'active', label: `Active ${goalSearchMatches.filter((g) => g.status === 'active').length}` },
                  { id: 'achieved', label: `Achieved ${goalSearchMatches.filter((g) => g.status === 'achieved').length}` },
                  { id: 'abandoned', label: `Abandoned ${goalSearchMatches.filter((g) => g.status === 'abandoned').length}` },
                ]}
              />
            </div>

            {filteredGoals.length === 0 ? (
              <EmptyState
                tier="goals"
                isFiltered={goals.length > 0}
                onClearFilters={clearGoalFilters}
                onCreate={() => setGoalForm({ key: nextKey(), editing: null })}
              />
            ) : (
              <div className="grid-cards-xl items-start gap-3">
                {filteredGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    prog={h.getGoalProgress(goal)}
                    today={today}
                    onStatusChange={(s) => changeGoalStatus(goal, s)}
                    onOpenProjects={() => openGoalProjects(goal.id)}
                    onAddProject={() => setProjectForm({ key: nextKey(), editing: null, goalId: goal.id })}
                    onUpdateProgress={() =>
                      setProgressUpdate({ kind: 'goal', id: goal.id, title: goal.title, current: h.getGoalProgress(goal).percent })
                    }
                    onEdit={() => setGoalForm({ key: nextKey(), editing: goal })}
                    onDelete={() => setDeleteGoalTarget(goal)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ PROJECTS */}
        {activeTab === 'projects' && (
          <div className="space-y-4">
            {filterGoal && (
              <ScopeBar icon={Target} text="Projects of the goal" name={filterGoal.title} onClear={() => setFilterGoalId(null)} />
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <ToolbarInput
                  type="search"
                  icon={Search}
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  wrapperClassName="flex-1"
                />
                {!filterGoalId && (
                  <ToolbarSelect aria-label="Filter projects by goal" value={projectGoalFilter} onChange={(e) => setProjectGoalFilter(e.target.value)}>
                    <option value="all">All goals</option>
                    <option value="standalone">No goal</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </ToolbarSelect>
                )}
              </div>
              <FilterRow
                label="Project status"
                value={projectStatusFilter}
                onChange={setProjectStatusFilter}
                activeClass={{
                  in_progress: 'border-[var(--badge-cyan-border)] bg-[var(--badge-cyan-bg)]',
                  completed: 'border-emerald-500/30 bg-emerald-500/15',
                }}
                options={[
                  { id: 'all', label: `All ${projectCounts.all}` },
                  { id: 'in_progress', label: `In progress ${projectCounts.in_progress}` },
                  { id: 'not_started', label: `Not started ${projectCounts.not_started}` },
                  { id: 'on_hold', label: `On hold ${projectCounts.on_hold}` },
                  { id: 'completed', label: `Completed ${projectCounts.completed}` },
                  ...(projectCounts.locked > 0 || projectStatusFilter === 'locked'
                    ? [{ id: 'locked' as const, label: `Locked ${projectCounts.locked}` }]
                    : []),
                ]}
              />
            </div>

            {filteredProjects.length === 0 ? (
              <EmptyState
                tier="projects"
                isFiltered={projectsInScope.length > 0 || (!filterGoalId && projects.length > 0)}
                onClearFilters={clearProjectFilters}
                onCreate={() => setProjectForm({ key: nextKey(), editing: null, goalId: scopedGoal?.id })}
              />
            ) : (
              <div className="grid-cards-xl items-start gap-3">
                {filteredProjects.map((project) => {
                  const lock = h.getLockStatus(project);
                  const prog = h.getProjectProgress(project);
                  const index = showReorder ? filteredProjects.indexOf(project) : -1;
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      prog={prog}
                      lock={lock}
                      goalName={goalName(project.goalId)}
                      today={today}
                      reorder={
                        showReorder
                          ? {
                              canUp: index > 0,
                              canDown: index < filteredProjects.length - 1,
                              onMove: (direction) => store.moveProjectOrder(project.id, direction),
                            }
                          : undefined
                      }
                      onStatusChange={(s) => changeProjectStatus(project, s)}
                      onOpenGoal={() => project.goalId && openGoalProjects(project.goalId)}
                      onOpenTasks={() => openProjectTasks(project.id)}
                      onAddTask={() => startTaskForProject(project.id)}
                      onUpdateProgress={() => setProgressUpdate({ kind: 'project', id: project.id, title: project.title, current: prog.percent })}
                      onEdit={() => setProjectForm({ key: nextKey(), editing: project })}
                      onDelete={() => setDeleteProjectTarget(project)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            {filterProject && (
              <div className="space-y-2">
                <ScopeBar icon={FolderKanban} text="Tasks of the project" name={filterProject.title} onClear={() => setFilterProjectId(null)} />
                {filterProjectLock?.isLocked && filterProjectLock.blockingProject && (
                  <p className="px-1 text-xs text-content-muted">
                    These tasks unlock when "{filterProjectLock.blockingProject.title}" is done.
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleQuickAddTask} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <ToolbarInput
                ref={quickTaskInputRef}
                id="input-quick-add-task"
                type="text"
                icon={CheckSquare}
                aria-label="New task"
                placeholder="e.g. Read 10 pages, do 50 pushups, drink 3L water"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                maxLength={120}
                wrapperClassName="flex-1"
              />
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:flex">
                <ToolbarSelect aria-label="New task priority" value={quickTaskPriority} onChange={(e) => setQuickTaskPriority(e.target.value as TaskPriority)}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </ToolbarSelect>
                {filterProjectId ? (
                  <span aria-hidden="true" />
                ) : (
                  <ToolbarSelect aria-label="New task project" value={quickTaskProjectId} onChange={(e) => setQuickTaskProjectId(e.target.value)} className="truncate">
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </ToolbarSelect>
                )}
                <button
                  id="btn-quick-add-task"
                  type="submit"
                  disabled={!quickTaskTitle.trim() || isKeyLoading('quick_add_task')}
                  className="btn-primary shrink-0 px-3.5 py-2 text-xs disabled:opacity-50"
                >
                  {isKeyLoading('quick_add_task') ? <AscendLoadingIndicator size="sm" /> : <Plus size={14} aria-hidden="true" />}
                  <span>Add</span>
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex w-full flex-1 items-center gap-2">
                  <ToolbarInput
                    type="search"
                    icon={Search}
                    aria-label="Search tasks"
                    placeholder="Search tasks"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    wrapperClassName="flex-1"
                  />
                  <button
                    type="button"
                    aria-expanded={taskFiltersOpen}
                    aria-controls="task-filters-selects task-filters-status"
                    onClick={() => setTaskFiltersOpen((open) => !open)}
                    className={cx(
                      'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:hidden',
                      taskFiltersOpen || activeTaskFilterCount > 0
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-success-text'
                        : 'border-overlay-default bg-bg-900 text-content-muted'
                    )}
                  >
                    <Filter size={14} aria-hidden="true" />
                    <span>Filters</span>
                    {activeTaskFilterCount > 0 && <span className="tabular-nums">{activeTaskFilterCount}</span>}
                  </button>
                </div>
                <div id="task-filters-selects" className={cx('grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto', !taskFiltersOpen && 'max-sm:hidden')}>
                  <ToolbarSelect aria-label="Filter tasks by priority" value={taskPriorityFilter} onChange={(e) => setTaskPriorityFilter(e.target.value as 'all' | TaskPriority)}>
                    <option value="all">Any priority</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </ToolbarSelect>
                  {!filterProjectId && (
                    <ToolbarSelect aria-label="Filter tasks by project" value={taskProjectFilter} onChange={(e) => setTaskProjectFilter(e.target.value)}>
                      <option value="all">All projects</option>
                      <option value="standalone">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </ToolbarSelect>
                  )}
                </div>
              </div>
              <FilterRow
                id="task-filters-status"
                label="Task view"
                value={taskView}
                onChange={setTaskView}
                className={cx(!taskFiltersOpen && 'max-sm:hidden')}
                activeClass={{
                  active: 'border-emerald-500/30 bg-emerald-500/15',
                  today: 'border-emerald-500/30 bg-emerald-500/15',
                  overdue: 'border-rose-500/30 bg-rose-500/15',
                  next7: 'border-emerald-500/30 bg-emerald-500/15',
                  completed: 'border-emerald-500/30 bg-emerald-500/15',
                }}
                options={TASK_VIEWS}
              />
            </div>

            {filteredTasks.length === 0 ? (
              tasksInScope.length > 0 ? (
                <EmptyState tier="tasks" isFiltered onClearFilters={clearTaskFilters} onCreate={() => setFocusQuickAdd(true)} />
              ) : goals.length === 0 && tasks.length === 0 ? (
                <EmptyStateBase
                  icon={Target}
                  iconClassName="badge-purple"
                  title="Start with a goal"
                  description="Tasks feel lighter when they lead somewhere. Set a goal first, or just add a task."
                  action={
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setGoalForm({ key: nextKey(), editing: null })}
                        className="btn-primary inline-flex items-center gap-1.5 bg-purple-600 px-4 py-2 text-xs text-white hover:bg-purple-500"
                      >
                        <Plus size={14} aria-hidden="true" />
                        <span>Create your first goal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusQuickAdd(true)}
                        className="text-xs text-content-muted underline-offset-2 hover:text-content-secondary hover:underline"
                      >
                        Or add a task without a goal
                      </button>
                    </div>
                  }
                />
              ) : (
                <EmptyState tier="tasks" onCreate={() => setFocusQuickAdd(true)} />
              )
            ) : (
              <div className="space-y-3">
                {tasks.length <= 3 && taskView === 'all' && !taskSearch.trim() && !filterProjectId && (
                  <p className="px-1 text-xs text-content-muted">A few more small tasks will fill out your day.</p>
                )}
                <div className="card divide-y divide-overlay-subtle overflow-hidden p-0">
                  {filteredTasks.map((task) => {
                    const project = projectById(task.projectId);
                    const lock = project ? h.getLockStatus(project) : undefined;
                    return (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        lockedBy={lock?.isLocked ? lock.blockingProject?.title : undefined}
                        projectName={project?.title ?? null}
                        goalName={goalName(project?.goalId)}
                        onToggle={() => store.toggleTaskCompleted(task.id)}
                        onToggleSubtask={(id) => store.toggleSubtask(task.id, id)}
                        onAddSubtask={(title) => store.addSubtask(task.id, title)}
                        onDeleteSubtask={(subtask) => setDeleteSubtaskTarget({ taskId: task.id, subtask })}
                        onOpenProject={() => task.projectId && openProjectTasks(task.projectId)}
                        onFocus={onStartFocusSession ? () => onStartFocusSession(task.title) : undefined}
                        onEdit={() => setTaskForm({ key: nextKey(), editing: task })}
                        onDelete={() => setDeleteTaskTarget(task)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </TabPanel>

      {/* ------------------------------------------------------------------ DIALOGS */}
      <ProgressUpdateDialog
        open={Boolean(progressUpdate)}
        onClose={() => setProgressUpdate(null)}
        title={progressUpdate ? `Update progress: ${progressUpdate.title}` : 'Update progress'}
        current={progressUpdate?.current ?? 0}
        target={100}
        format={(n) => `${n}%`}
        addLabel="Percent to add"
        setLabel="New percent"
        step={5}
        tone={progressUpdate?.kind === 'project' ? 'cyan' : 'purple'}
        onSave={saveManualProgress}
      />

      {goalForm && (
        <GoalFormDialog
          key={goalForm.key}
          open
          editing={goalForm.editing}
          goals={goals}
          hasProjects={goalForm.editing ? (h.projectsByGoal.get(goalForm.editing.id)?.length ?? 0) > 0 : false}
          onClose={() => setGoalForm(null)}
          onSave={saveGoal}
        />
      )}
      {projectForm && (
        <ProjectFormDialog
          key={projectForm.key}
          open
          editing={projectForm.editing}
          goals={goals}
          projects={projects}
          defaultGoalId={projectForm.goalId}
          hasTasks={projectForm.editing ? (h.tasksByProject.get(projectForm.editing.id)?.length ?? 0) > 0 : false}
          onClose={() => setProjectForm(null)}
          onSave={saveProject}
        />
      )}
      {taskForm && (
        <TaskFormDialog
          key={taskForm.key}
          open
          editing={taskForm.editing}
          projects={projects}
          tasks={tasks}
          defaultProjectId={taskForm.projectId}
          onClose={() => setTaskForm(null)}
          onSave={saveTask}
        />
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteGoalTarget)}
        onClose={() => setDeleteGoalTarget(null)}
        onConfirm={handleDeleteGoalConfirm}
        title="Delete goal?"
        description={deleteGoalTarget ? deleteGoalText(deleteGoalTarget) : undefined}
        confirmText="Delete goal"
      />
      <ConfirmDeleteModal
        open={Boolean(deleteProjectTarget)}
        onClose={() => setDeleteProjectTarget(null)}
        onConfirm={handleDeleteProjectConfirm}
        title="Delete project?"
        description={deleteProjectTarget ? deleteProjectText(deleteProjectTarget) : undefined}
        confirmText="Delete project"
      />
      <ConfirmDeleteModal
        open={Boolean(deleteTaskTarget)}
        onClose={() => setDeleteTaskTarget(null)}
        onConfirm={handleDeleteTaskConfirm}
        title="Delete task?"
        description={
          deleteTaskTarget
            ? `"${deleteTaskTarget.title}" will be deleted${
                (deleteTaskTarget.subtasks || []).length > 0 ? `, with its ${plural(deleteTaskTarget.subtasks.length, 'subtask', 'subtasks')}` : ''
              }.`
            : undefined
        }
        confirmText="Delete task"
      />
      <ConfirmDeleteModal
        open={Boolean(deleteSubtaskTarget)}
        onClose={() => setDeleteSubtaskTarget(null)}
        onConfirm={handleDeleteSubtaskConfirm}
        title="Delete subtask?"
        itemName={deleteSubtaskTarget?.subtask.title}
        confirmText="Delete subtask"
      />

      <HowItWorksDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
