import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Target,
  FolderKanban,
  CheckSquare,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  Check,
  Circle,
  Timer,
  Edit3,
  Trash2,
  Filter,
  Search,
  ChevronRight,
  Sparkles,
  Tag,
  ListTodo,
  TrendingUp,
  X,
  Briefcase,
  Lock,
  Unlock,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import {
  Goal,
  Project,
  Task,
  TaskSubtask,
  GoalStatus,
  ProjectStatus,
  TaskPriority,
} from '@/types';
import { todayKey, weekKey, formatDateLong, formatDateShort } from '@/lib/dates';

type SubViewTab = 'goals' | 'projects' | 'tasks';

const GOAL_CATEGORY_SUGGESTIONS = [
  'Career & Business',
  'Health & Fitness',
  'Finance & Wealth',
  'Skill Mastery',
  'Personal Growth',
  'Relationships',
  'Mindset & Focus',
];

export function ProjectsGoalsView({
  store,
  onStartFocusSession,
}: {
  store: AppStore;
  onStartFocusSession?: (taskTitle: string) => void;
}) {
  const { showSuccessToast, showErrorToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey(300);

  // Active sub-view tab
  const [activeTab, setActiveTab] = useState<SubViewTab>('tasks');

  // Filter drilldown state
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);

  // Search queries & local filters
  const [goalStatusFilter, setGoalStatusFilter] = useState<'all' | GoalStatus>('all');
  const [goalSearch, setGoalSearch] = useState('');

  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | ProjectStatus | 'locked'>('all');
  const [projectGoalFilter, setProjectGoalFilter] = useState<string>('all');
  const [projectSearch, setProjectSearch] = useState('');

  const [taskViewFilter, setTaskViewFilter] = useState<
    'all' | 'today' | 'overdue' | 'this_week' | 'active' | 'completed' | 'locked'
  >('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');

  // Quick Task Add Input state
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>('medium');
  const [quickTaskProjectId, setQuickTaskProjectId] = useState<string>(filterProjectId || '');

  // Keep quickTaskProjectId pre-filled when filterProjectId changes (approach a)
  useEffect(() => {
    setQuickTaskProjectId(filterProjectId || '');
  }, [filterProjectId]);

  // Expanded subtasks state (set of taskId)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<Record<string, string>>({});

  // Modals state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalFormTitle, setGoalFormTitle] = useState('');
  const [goalFormDescription, setGoalFormDescription] = useState('');
  const [goalFormCategory, setGoalFormCategory] = useState('');
  const [goalFormTargetDate, setGoalFormTargetDate] = useState('');
  const [goalFormStatus, setGoalFormStatus] = useState<GoalStatus>('active');
  const [goalFormSequentialMode, setGoalFormSequentialMode] = useState<boolean>(false);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectFormTitle, setProjectFormTitle] = useState('');
  const [projectFormDescription, setProjectFormDescription] = useState('');
  const [projectFormGoalId, setProjectFormGoalId] = useState<string>('');
  const [projectFormStartDate, setProjectFormStartDate] = useState('');
  const [projectFormDueDate, setProjectFormDueDate] = useState('');
  const [projectFormStatus, setProjectFormStatus] = useState<ProjectStatus>('not_started');

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskFormTitle, setTaskFormTitle] = useState('');
  const [taskFormDescription, setTaskFormDescription] = useState('');
  const [taskFormProjectId, setTaskFormProjectId] = useState<string>('');
  const [taskFormDueDate, setTaskFormDueDate] = useState('');
  const [taskFormPriority, setTaskFormPriority] = useState<TaskPriority>('medium');
  const [taskFormSubtasks, setTaskFormSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [newModalSubtaskTitle, setNewModalSubtaskTitle] = useState('');

  // Delete Modals
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);

  const goals = store.state.goals || [];
  const projects = store.state.projects || [];
  const tasks = store.state.tasks || [];

  const currentToday = todayKey();
  const currentWeek = weekKey();

  // Date input bounds (e.g. today minus 2 years to today plus 20 years)
  const currentYear = new Date().getFullYear();
  const minAllowedDate = `${currentYear - 2}-01-01`;
  const maxAllowedDate = `${currentYear + 20}-12-31`;

  const sanitizeDateBounds = (dateStr?: string): string | undefined => {
    if (!dateStr || !dateStr.trim()) return undefined;
    const trimmed = dateStr.trim();
    if (trimmed < minAllowedDate) return minAllowedDate;
    if (trimmed > maxAllowedDate) return maxAllowedDate;
    return trimmed;
  };

  // --------------------------------------------------------------------------
  // COMPUTED PROGRESS & COMPLETION HELPERS (Bottom-Up Hierarchy)
  // --------------------------------------------------------------------------

  // 1. Task progress: returns completion percentage of a project
  // Task-linked mode if >= 1 task (calculates fractional progress from subtasks if present), manual mode if 0 tasks
  const getProjectProgress = useCallback(
    (projectId: string): { total: number; completed: number; percent: number; isManual: boolean } => {
      const project = projects.find((p) => p.id === projectId);
      const linkedTasks = tasks.filter((t) => t.projectId === projectId);
      const total = linkedTasks.length;
      if (total === 0) {
        const percent = Math.min(100, Math.max(0, project?.manualProgress ?? 0));
        return { total: 0, completed: 0, percent, isManual: true };
      }

      const completed = linkedTasks.filter((t) => t.completed).length;

      // Sum of fractional task contributions
      let sumOfTaskContributions = 0;
      for (const t of linkedTasks) {
        const subtasks = t.subtasks || [];
        if (subtasks.length > 0) {
          const completedSub = subtasks.filter((st) => st.completed).length;
          sumOfTaskContributions += completedSub / subtasks.length;
        } else {
          sumOfTaskContributions += t.completed ? 1 : 0;
        }
      }

      const percent = Math.round((sumOfTaskContributions / total) * 100);
      return { total, completed, percent, isManual: false };
    },
    [tasks, projects]
  );

  // Checks whether a project is completed either explicitly via status or by reaching 100% progress
  const isProjectComplete = useCallback(
    (projectId: string): boolean => {
      const p = projects.find((proj) => proj.id === projectId);
      if (!p) return false;
      if (p.status === 'completed') return true;
      const prog = getProjectProgress(p.id);
      return prog.percent === 100;
    },
    [projects, getProjectProgress]
  );

  // --------------------------------------------------------------------------
  // SEQUENTIAL LOCK HELPER (Live-computed single source of truth for both Views)
  // --------------------------------------------------------------------------
  const getProjectLockStatus = useCallback(
    (projectId: string): {
      isLocked: boolean;
      reason?: string;
      blockingProject?: Project;
      stepIndex?: number;
      totalSteps?: number;
      isSequentialGoal: boolean;
    } => {
      const project = projects.find((p) => p.id === projectId);
      if (!project || !project.goalId) {
        return { isLocked: false, isSequentialGoal: false };
      }
      const goal = goals.find((g) => g.id === project.goalId);
      if (!goal || !goal.sequentialMode) {
        return { isLocked: false, isSequentialGoal: false };
      }

      // Projects under this goal sorted by defined order ascending, then createdAt ascending
      const linked = projects
        .filter((p) => p.goalId === project.goalId)
        .sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) ||
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            a.id.localeCompare(b.id)
        );

      const index = linked.findIndex((p) => p.id === projectId);
      if (index <= 0) {
        return { isLocked: false, stepIndex: 1, totalSteps: linked.length, isSequentialGoal: true };
      }

      // Check all previous projects in sequence
      const priorProjects = linked.slice(0, index);
      const uncompletedPrior = priorProjects.find((p) => !isProjectComplete(p.id));

      if (uncompletedPrior) {
        return {
          isLocked: true,
          reason: `Locked: Complete previous project "${uncompletedPrior.title}" first.`,
          blockingProject: uncompletedPrior,
          stepIndex: index + 1,
          totalSteps: linked.length,
          isSequentialGoal: true,
        };
      }

      return { isLocked: false, stepIndex: index + 1, totalSteps: linked.length, isSequentialGoal: true };
    },
    [projects, goals, isProjectComplete]
  );

  const isProjectLocked = useCallback(
    (projectId: string): boolean => {
      return getProjectLockStatus(projectId).isLocked;
    },
    [getProjectLockStatus]
  );

  // 2. Goal progress:
  // Linked-projects mode (>= 1 project): flat simple average of ALL linked projects' percentages (task-based or manual)
  // Standalone mode (0 projects): manual mode using goal.manualProgress (default 0)
  const getGoalProgress = useCallback(
    (goalId: string): {
      linkedProjectsCount: number;
      completedProjectsCount: number;
      totalTasksCount: number;
      completedTasksCount: number;
      percent: number;
      isManual: boolean;
    } => {
      const goal = goals.find((g) => g.id === goalId);
      const linkedProjects = projects.filter((p) => p.goalId === goalId);
      const linkedProjectsCount = linkedProjects.length;

      if (linkedProjectsCount === 0) {
        const percent = Math.min(100, Math.max(0, goal?.manualProgress ?? 0));
        return {
          linkedProjectsCount: 0,
          completedProjectsCount: 0,
          totalTasksCount: 0,
          completedTasksCount: 0,
          percent,
          isManual: true,
        };
      }

      let totalPercentSum = 0;
      let completedProjectsCount = 0;
      let totalTasksCount = 0;
      let completedTasksCount = 0;

      linkedProjects.forEach((p) => {
        const prog = getProjectProgress(p.id);
        totalTasksCount += prog.total;
        completedTasksCount += prog.completed;
        totalPercentSum += prog.percent;
        if (p.status === 'completed' || prog.percent === 100) {
          completedProjectsCount++;
        }
      });

      const percent = Math.round(totalPercentSum / linkedProjectsCount);

      return {
        linkedProjectsCount,
        completedProjectsCount,
        totalTasksCount,
        completedTasksCount,
        percent,
        isManual: false,
      };
    },
    [goals, projects, getProjectProgress]
  );

  // --------------------------------------------------------------------------
  // REACTIVE AUTO TRANSITIONS: ACTIVE <-> ACHIEVED FOR PROJECT-LINKED GOALS
  // --------------------------------------------------------------------------
  useEffect(() => {
    goals.forEach((goal) => {
      // Rule 3: Abandoned goals are intentional manual choices and NEVER auto-transition
      if (goal.status === 'abandoned') return;

      const linkedProjects = projects.filter((p) => p.goalId === goal.id);
      // Only applies to goals with at least 1 linked project (manual-only goals are untouched)
      if (linkedProjects.length === 0) return;

      const prog = getGoalProgress(goal.id);

      // Rule 1: Active -> Achieved when all linked projects reach 100%
      if (goal.status === 'active' && prog.percent === 100) {
        store.updateGoal(goal.id, { status: 'achieved' });
      }
      // Rule 2: Achieved -> Active when progress drops below 100% (e.g. project uncompleted or new project added)
      else if (goal.status === 'achieved' && prog.percent < 100) {
        store.updateGoal(goal.id, { status: 'active' });
      }
    });
  }, [goals, projects, tasks, getGoalProgress, store]);

  // Overall Hierarchy Stats (Excluding locked items from active actionable work metrics)
  const hierarchyStats = useMemo(() => {
    const activeGoals = goals.filter((g) => g.status === 'active').length;
    const activeProjects = projects.filter(
      (p) => (p.status === 'in_progress' || p.status === 'not_started') && !isProjectLocked(p.id)
    ).length;
    const pendingTasks = tasks.filter(
      (t) => !t.completed && (!t.projectId || !isProjectLocked(t.projectId))
    ).length;
    return { activeGoals, activeProjects, pendingTasks };
  }, [goals, projects, tasks, isProjectLocked]);

  // --------------------------------------------------------------------------
  // FILTERING LOGIC
  // --------------------------------------------------------------------------

  // Base filtered goals matching search
  const baseSearchGoals = useMemo(() => {
    return goals.filter((g) => {
      if (goalSearch.trim()) {
        const q = goalSearch.toLowerCase();
        const matchesTitle = g.title.toLowerCase().includes(q);
        const matchesDesc = (g.description || '').toLowerCase().includes(q);
        const matchesCat = (g.category || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCat) return false;
      }
      return true;
    });
  }, [goals, goalSearch]);

  // Status counts for Goal filter tabs
  const goalStatusCounts = useMemo(() => {
    return {
      all: baseSearchGoals.length,
      active: baseSearchGoals.filter((g) => g.status === 'active').length,
      achieved: baseSearchGoals.filter((g) => g.status === 'achieved').length,
      abandoned: baseSearchGoals.filter((g) => g.status === 'abandoned').length,
    };
  }, [baseSearchGoals]);

  // Filtered Goals
  const filteredGoals = useMemo(() => {
    return baseSearchGoals.filter((g) => {
      if (goalStatusFilter !== 'all' && g.status !== goalStatusFilter) return false;
      return true;
    });
  }, [baseSearchGoals, goalStatusFilter]);

  // Base filtered projects matching active goal filter and search
  const baseGoalAndSearchProjects = useMemo(() => {
    const activeGoalFilter = filterGoalId || (projectGoalFilter !== 'all' ? projectGoalFilter : null);

    return projects.filter((p) => {
      if (activeGoalFilter) {
        if (activeGoalFilter === 'standalone' && p.goalId) return false;
        if (activeGoalFilter !== 'standalone' && p.goalId !== activeGoalFilter) return false;
      }
      if (projectSearch.trim()) {
        const q = projectSearch.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [projects, filterGoalId, projectGoalFilter, projectSearch]);

  // Live counts for status tabs (with single source of truth for locked status)
  const projectStatusCounts = useMemo(() => {
    return {
      all: baseGoalAndSearchProjects.length,
      in_progress: baseGoalAndSearchProjects.filter((p) => p.status === 'in_progress' && !isProjectLocked(p.id)).length,
      not_started: baseGoalAndSearchProjects.filter((p) => p.status === 'not_started' && !isProjectLocked(p.id)).length,
      on_hold: baseGoalAndSearchProjects.filter((p) => p.status === 'on_hold' && !isProjectLocked(p.id)).length,
      completed: baseGoalAndSearchProjects.filter((p) => p.status === 'completed').length,
      locked: baseGoalAndSearchProjects.filter((p) => isProjectLocked(p.id)).length,
    };
  }, [baseGoalAndSearchProjects, isProjectLocked]);

  // Filtered & Sorted Projects for the single list view
  const filteredProjects = useMemo(() => {
    let list = baseGoalAndSearchProjects.filter((p) => {
      if (projectStatusFilter === 'all') return true;
      if (projectStatusFilter === 'locked') return isProjectLocked(p.id);
      if (projectStatusFilter === 'in_progress') {
        return p.status === 'in_progress' && !isProjectLocked(p.id);
      }
      if (projectStatusFilter === 'not_started') {
        return p.status === 'not_started' && !isProjectLocked(p.id);
      }
      if (projectStatusFilter === 'on_hold') {
        return p.status === 'on_hold' && !isProjectLocked(p.id);
      }
      if (projectStatusFilter === 'completed') {
        return p.status === 'completed';
      }
      return true;
    });

    const activeGoalFilter = filterGoalId || (projectGoalFilter !== 'all' ? projectGoalFilter : null);
    const activeGoal = activeGoalFilter && activeGoalFilter !== 'standalone' ? goals.find((g) => g.id === activeGoalFilter) : null;

    if (projectStatusFilter === 'completed') {
      // Sort by most-recently-completed first
      list = [...list].sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
    } else if (activeGoal?.sequentialMode) {
      // Sort by defined sequence order within sequential goal
      list = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      // Sort by createdAt descending (newest first)
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list;
  }, [baseGoalAndSearchProjects, projectStatusFilter, filterGoalId, projectGoalFilter, goals, isProjectLocked]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    const activeProjectFilter = filterProjectId || (taskProjectFilter !== 'all' ? taskProjectFilter : null);

    return tasks.filter((t) => {
      // Project filter
      if (activeProjectFilter) {
        if (activeProjectFilter === 'standalone' && t.projectId) return false;
        if (activeProjectFilter !== 'standalone' && t.projectId !== activeProjectFilter) return false;
      }

      // Priority filter
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;

      const isParentLocked = t.projectId ? isProjectLocked(t.projectId) : false;
      const hasSearch = taskSearch.trim().length > 0;

      // View Filters: Exclude tasks under locked projects only from 'active' view unless searching
      if (isParentLocked && !hasSearch && taskViewFilter === 'active') {
        return false;
      }

      // View Filters
      if (taskViewFilter === 'locked' && !isParentLocked) return false;
      if (taskViewFilter === 'active' && t.completed) return false;
      if (taskViewFilter === 'completed' && !t.completed) return false;
      if (taskViewFilter === 'today') {
        if (t.dueDate !== currentToday) return false;
      }
      if (taskViewFilter === 'overdue') {
        if (!t.dueDate || t.dueDate >= currentToday || t.completed) return false;
      }
      if (taskViewFilter === 'this_week') {
        // Due within 7 days from todayKey
        if (!t.dueDate) return false;
        const due = t.dueDate;
        if (due < currentToday) return false;
        // Simple 7 day check
        const dObj = new Date();
        dObj.setDate(dObj.getDate() + 7);
        const maxDue = todayKey(dObj);
        if (due > maxDue) return false;
      }

      // Search filter (Search finds locked tasks too)
      if (hasSearch) {
        const q = taskSearch.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }

      return true;
    });
  }, [tasks, filterProjectId, taskProjectFilter, taskPriorityFilter, taskViewFilter, taskSearch, currentToday, isProjectLocked]);

  // --------------------------------------------------------------------------
  // GOAL ACTIONS
  // --------------------------------------------------------------------------

  const openCreateGoalModal = () => {
    setEditingGoal(null);
    setGoalFormTitle('');
    setGoalFormDescription('');
    setGoalFormCategory('');
    setGoalFormTargetDate('');
    setGoalFormStatus('active');
    setGoalFormSequentialMode(false);
    setGoalModalOpen(true);
  };

  const openEditGoalModal = (goal: Goal) => {
    setEditingGoal(goal);
    setGoalFormTitle(goal.title);
    setGoalFormDescription(goal.description || '');
    setGoalFormCategory(goal.category || '');
    setGoalFormTargetDate(goal.targetDate || '');
    setGoalFormStatus(goal.status);
    setGoalFormSequentialMode(goal.sequentialMode ?? false);
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!goalFormTitle.trim()) return;

    await executeWithKey('save_goal', async () => {
      const sanitizedTargetDate = sanitizeDateBounds(goalFormTargetDate);
      if (editingGoal) {
        store.updateGoal(editingGoal.id, {
          title: goalFormTitle.trim(),
          description: goalFormDescription.trim() || undefined,
          category: goalFormCategory.trim() || undefined,
          targetDate: sanitizedTargetDate,
          status: goalFormStatus,
          sequentialMode: goalFormSequentialMode,
        });
        showSuccessToast('Goal Updated', `"${goalFormTitle.trim()}" saved.`);
      } else {
        store.createGoal({
          title: goalFormTitle.trim(),
          description: goalFormDescription.trim() || undefined,
          category: goalFormCategory.trim() || undefined,
          targetDate: sanitizedTargetDate,
          status: goalFormStatus,
          sequentialMode: goalFormSequentialMode,
        });
        showSuccessToast('Goal Created', `"${goalFormTitle.trim()}" is now active.`);
      }
      setGoalModalOpen(false);
    });
  };

  const handleUpdateGoalManualProgress = (goal: Goal, val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
    let newStatus = goal.status;

    // Abandoned goals are never auto-overridden
    if (goal.status !== 'abandoned') {
      if (clamped === 100 && goal.status !== 'achieved') {
        newStatus = 'achieved';
      } else if (clamped < 100 && goal.status === 'achieved') {
        newStatus = 'active';
      }
    }

    store.updateGoal(goal.id, {
      manualProgress: clamped,
      status: newStatus,
    });
  };

  const handleMoveGoalStatus = async (goalId: string, newStatus: GoalStatus) => {
    await executeWithKey(`move_goal_${goalId}`, async () => {
      const linkedProjects = projects.filter((p) => p.goalId === goalId);
      const isManual = linkedProjects.length === 0;

      if (isManual && newStatus === 'achieved') {
        store.updateGoal(goalId, {
          status: newStatus,
          manualProgress: 100,
        });
      } else {
        store.updateGoal(goalId, {
          status: newStatus,
        });
      }
    });
  };

  const handleDeleteGoalConfirm = async () => {
    if (!deleteGoalTarget) return;
    await executeWithKey(`delete_goal_${deleteGoalTarget.id}`, async () => {
      store.deleteGoal(deleteGoalTarget.id);
      showSuccessToast('Goal Deleted', 'Linked projects were safely unlinked.');
      setDeleteGoalTarget(null);
      if (filterGoalId === deleteGoalTarget.id) {
        setFilterGoalId(null);
      }
    });
  };

  // --------------------------------------------------------------------------
  // PROJECT ACTIONS
  // --------------------------------------------------------------------------

  const openCreateProjectModal = (preselectedGoalId?: string, defaultStatus?: ProjectStatus) => {
    setEditingProject(null);
    setProjectFormTitle('');
    setProjectFormDescription('');
    setProjectFormGoalId(preselectedGoalId || filterGoalId || '');
    setProjectFormStartDate(todayKey());
    setProjectFormDueDate('');
    const initialStatus =
      defaultStatus ||
      (projectStatusFilter !== 'all' && projectStatusFilter !== 'locked' ? projectStatusFilter : 'not_started');
    setProjectFormStatus(initialStatus);
    setProjectModalOpen(true);
  };

  const openEditProjectModal = (project: Project) => {
    setEditingProject(project);
    setProjectFormTitle(project.title);
    setProjectFormDescription(project.description || '');
    setProjectFormGoalId(project.goalId || '');
    setProjectFormStartDate(project.startDate || '');
    setProjectFormDueDate(project.dueDate || '');
    setProjectFormStatus(project.status);
    setProjectModalOpen(true);
  };

  const handleSaveProject = async () => {
    if (!projectFormTitle.trim()) return;

    await executeWithKey('save_project', async () => {
      const sanitizedStartDate = sanitizeDateBounds(projectFormStartDate);
      const sanitizedDueDate = sanitizeDateBounds(projectFormDueDate);

      if (editingProject) {
        store.updateProject(editingProject.id, {
          title: projectFormTitle.trim(),
          description: projectFormDescription.trim() || undefined,
          goalId: projectFormGoalId || undefined,
          startDate: sanitizedStartDate,
          dueDate: sanitizedDueDate,
          status: projectFormStatus,
        });
        showSuccessToast('Project Updated', `"${projectFormTitle.trim()}" saved.`);
      } else {
        store.createProject({
          title: projectFormTitle.trim(),
          description: projectFormDescription.trim() || undefined,
          goalId: projectFormGoalId || undefined,
          startDate: sanitizedStartDate,
          dueDate: sanitizedDueDate,
          status: projectFormStatus,
        });
        showSuccessToast('Project Created', `"${projectFormTitle.trim()}" added.`);
      }
      setProjectModalOpen(false);
    });
  };

  const handleUpdateProjectManualProgress = (project: Project, val: number) => {
    const lock = getProjectLockStatus(project.id);
    if (lock.isLocked) {
      showErrorToast('Project Locked', `This project is locked until "${lock.blockingProject?.title}" is completed.`);
      return;
    }

    const clamped = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
    let newStatus = project.status;
    let newCompletedAt = project.completedAt;

    if (clamped === 100 && project.status !== 'completed') {
      newStatus = 'completed';
      newCompletedAt = new Date().toISOString();
    } else if (clamped < 100 && project.status === 'completed') {
      newStatus = 'in_progress';
      newCompletedAt = undefined;
    }

    store.updateProject(project.id, {
      manualProgress: clamped,
      status: newStatus,
      completedAt: newCompletedAt,
    });
  };

  const handleMoveProjectStatus = async (projectId: string, newStatus: ProjectStatus) => {
    const lock = getProjectLockStatus(projectId);
    if (lock.isLocked && (newStatus === 'completed' || newStatus === 'in_progress')) {
      showErrorToast('Project Locked', `This project is locked in sequential mode until "${lock.blockingProject?.title}" is completed.`);
      return;
    }

    await executeWithKey(`move_project_${projectId}`, async () => {
      const linkedTasks = tasks.filter((t) => t.projectId === projectId);
      const isManual = linkedTasks.length === 0;

      if (isManual && newStatus === 'completed') {
        store.updateProject(projectId, {
          status: 'completed',
          manualProgress: 100,
          completedAt: new Date().toISOString(),
        });
      } else {
        store.moveProjectStatus(projectId, newStatus);
      }
    });
  };

  const handleDeleteProjectConfirm = async () => {
    if (!deleteProjectTarget) return;
    await executeWithKey(`delete_project_${deleteProjectTarget.id}`, async () => {
      store.deleteProject(deleteProjectTarget.id);
      showSuccessToast('Project Deleted', 'Linked tasks were safely unlinked.');
      setDeleteProjectTarget(null);
      if (filterProjectId === deleteProjectTarget.id) {
        setFilterProjectId(null);
      }
    });
  };

  // --------------------------------------------------------------------------
  // TASK ACTIONS
  // --------------------------------------------------------------------------

  const handleQuickAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickTaskTitle.trim()) return;

    const title = quickTaskTitle.trim();
    const projId = quickTaskProjectId || undefined;

    await executeWithKey('quick_add_task', async () => {
      store.createTask({
        title,
        priority: quickTaskPriority,
        projectId: projId,
        completed: false,
        subtasks: [],
      });
      setQuickTaskTitle('');
      showSuccessToast('Task Added', `"${title}" added.`);
    });
  };

  const openCreateTaskModal = (preselectedProjectId?: string) => {
    setEditingTask(null);
    setTaskFormTitle('');
    setTaskFormDescription('');
    setTaskFormProjectId(preselectedProjectId || filterProjectId || '');
    setTaskFormDueDate('');
    setTaskFormPriority('medium');
    setTaskFormSubtasks([]);
    setNewModalSubtaskTitle('');
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setTaskFormTitle(task.title);
    setTaskFormDescription(task.description || '');
    setTaskFormProjectId(task.projectId || '');
    setTaskFormDueDate(task.dueDate || '');
    setTaskFormPriority(task.priority);
    setTaskFormSubtasks([...(task.subtasks || [])]);
    setNewModalSubtaskTitle('');
    setTaskModalOpen(true);
  };

  const handleSaveTaskModal = async () => {
    if (!taskFormTitle.trim()) return;

    await executeWithKey('save_task_modal', async () => {
      const sanitizedDueDate = sanitizeDateBounds(taskFormDueDate);

      if (editingTask) {
        store.updateTask(editingTask.id, {
          title: taskFormTitle.trim(),
          description: taskFormDescription.trim() || undefined,
          projectId: taskFormProjectId || undefined,
          dueDate: sanitizedDueDate,
          priority: taskFormPriority,
          subtasks: taskFormSubtasks,
        });
        showSuccessToast('Task Updated', `"${taskFormTitle.trim()}" saved.`);
      } else {
        store.createTask({
          title: taskFormTitle.trim(),
          description: taskFormDescription.trim() || undefined,
          projectId: taskFormProjectId || undefined,
          dueDate: sanitizedDueDate,
          priority: taskFormPriority,
          completed: false,
          subtasks: taskFormSubtasks,
        });
        showSuccessToast('Task Created', `"${taskFormTitle.trim()}" added.`);
      }
      setTaskModalOpen(false);
    });
  };

  const handleToggleTask = (task: Task) => {
    if (task.projectId) {
      const lock = getProjectLockStatus(task.projectId);
      if (lock.isLocked) {
        showErrorToast('Project Locked', `Cannot mark tasks complete while project is locked. Complete "${lock.blockingProject?.title}" first.`);
        return;
      }
    }
    store.toggleTaskCompleted(task.id);
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task?.projectId) {
      const lock = getProjectLockStatus(task.projectId);
      if (lock.isLocked) {
        showErrorToast('Project Locked', `Cannot mark subtasks complete while project is locked. Complete "${lock.blockingProject?.title}" first.`);
        return;
      }
    }
    store.toggleSubtask(taskId, subtaskId);
  };

  const handleDeleteTaskConfirm = async () => {
    if (!deleteTaskTarget) return;
    await executeWithKey(`delete_task_${deleteTaskTarget.id}`, async () => {
      store.deleteTask(deleteTaskTarget.id);
      showSuccessToast('Task Deleted', 'Task removed.');
      setDeleteTaskTarget(null);
    });
  };

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleAddInlineSubtask = (taskId: string) => {
    const val = (newSubtaskInputs[taskId] || '').trim();
    if (!val) return;
    store.addSubtask(taskId, val);
    setNewSubtaskInputs((prev) => ({ ...prev, [taskId]: '' }));
  };

  // Helper colors
  const priorityColor = (p: TaskPriority) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'low':
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  const goalStatusBadge = (status: GoalStatus) => {
    switch (status) {
      case 'active':
        return <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">ACTIVE</span>;
      case 'achieved':
        return <span className="badge bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-bold">ACHIEVED</span>;
      case 'abandoned':
        return <span className="badge bg-slate-500/15 text-slate-400 border border-slate-500/30 text-[10px] font-bold">ABANDONED</span>;
    }
  };

  const projectStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return <span className="badge bg-slate-500/15 text-slate-300 border border-slate-500/30 text-[10px]">Not Started</span>;
      case 'in_progress':
        return <span className="badge bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]">In Progress</span>;
      case 'on_hold':
        return <span className="badge bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">On Hold</span>;
      case 'completed':
        return <span className="badge bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">Completed</span>;
    }
  };

  // Find goal name helper
  const getGoalName = (goalId?: string) => {
    if (!goalId) return null;
    return goals.find((g) => g.id === goalId)?.title || null;
  };

  // Find project name helper
  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.title || null;
  };

  return (
    <div className="space-y-6">
      {/* HEADER & TOP NAVIGATION */}
      <div className="card p-5 space-y-4 border border-white/10 bg-bg-800/80">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
              <FolderKanban className="text-purple-400" size={26} />
              Projects & Goals
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 bg-bg-900/60 border border-white/5 px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckSquare size={14} /> <span>1. Tasks</span>
              </div>
              <ArrowRight className="text-slate-600" size={12} />
              <div className="flex items-center gap-1.5 text-cyan-400">
                <FolderKanban size={14} /> <span>2. Projects</span>
              </div>
              <ArrowRight className="text-slate-600" size={12} />
              <div className="flex items-center gap-1.5 text-purple-400">
                <Target size={14} /> <span>3. Goals</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            {activeTab === 'tasks' && (
              <button
                id="btn-new-task-modal"
                onClick={() => openCreateTaskModal()}
                className="btn-primary text-xs flex items-center justify-center gap-1.5 px-3.5 py-2 w-full sm:w-auto"
              >
                <Plus size={15} />
                <span>New Task</span>
              </button>
            )}

            {activeTab === 'projects' && (
              <button
                id="btn-new-project"
                onClick={() => openCreateProjectModal(undefined, projectStatusFilter !== 'all' && projectStatusFilter !== 'locked' ? projectStatusFilter : undefined)}
                className="btn-primary text-xs flex items-center justify-center gap-1.5 px-3.5 py-2 w-full sm:w-auto"
              >
                <Plus size={15} />
                <span>New Project</span>
              </button>
            )}

            {activeTab === 'goals' && (
              <button
                id="btn-new-goal"
                onClick={openCreateGoalModal}
                className="btn-primary text-xs flex items-center justify-center gap-1.5 px-3.5 py-2 w-full sm:w-auto"
              >
                <Plus size={15} />
                <span>New Goal</span>
              </button>
            )}
          </div>
        </div>

        {/* STATS OVERVIEW BAR (Tasks -> Projects -> Goals) */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
          <div className="p-2.5 rounded-xl bg-bg-900/60 border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pending Tasks</span>
              <p className="text-base font-bold text-slate-100">{hierarchyStats.pendingTasks}</p>
            </div>
            <CheckSquare size={18} className="text-emerald-400 opacity-60" />
          </div>

          <div className="p-2.5 rounded-xl bg-bg-900/60 border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Projects</span>
              <p className="text-base font-bold text-slate-100">{hierarchyStats.activeProjects}</p>
            </div>
            <FolderKanban size={18} className="text-cyan-400 opacity-60" />
          </div>

          <div className="p-2.5 rounded-xl bg-bg-900/60 border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Goals</span>
              <p className="text-base font-bold text-slate-100">{hierarchyStats.activeGoals}</p>
            </div>
            <Target size={18} className="text-purple-400 opacity-60" />
          </div>
        </div>

        {/* SUB-VIEW TABS (1. Tasks -> 2. Projects -> 3. Goals) */}
        <div className="flex flex-wrap border-b border-white/5 gap-2 pb-1">
          <button
            id="tab-tasks-view"
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
              activeTab === 'tasks'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <CheckSquare size={16} />
            <span>1. Tasks ({tasks.length})</span>
          </button>

          <button
            id="tab-projects-view"
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
              activeTab === 'projects'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <FolderKanban size={16} />
            <span>2. Projects ({projects.length})</span>
          </button>

          <button
            id="tab-goals-view"
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
              activeTab === 'goals'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Target size={16} />
            <span>3. Goals ({goals.length})</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 1. GOALS SUB-VIEW (Full-Width List) */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {/* Goals Control Bar with Status Filter Tabs & Search */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-bg-800/50 p-3 rounded-2xl border border-white/5">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                id="filter-goals-all"
                onClick={() => setGoalStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  goalStatusFilter === 'all'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({goalStatusCounts.all})
              </button>
              <button
                id="filter-goals-active"
                onClick={() => setGoalStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  goalStatusFilter === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Active ({goalStatusCounts.active})
              </button>
              <button
                id="filter-goals-achieved"
                onClick={() => setGoalStatusFilter('achieved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  goalStatusFilter === 'achieved'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Achieved ({goalStatusCounts.achieved})
              </button>
              <button
                id="filter-goals-abandoned"
                onClick={() => setGoalStatusFilter('abandoned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  goalStatusFilter === 'abandoned'
                    ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Abandoned ({goalStatusCounts.abandoned})
              </button>
            </div>

            <div className="relative w-full xl:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Search goals..."
                value={goalSearch}
                onChange={(e) => setGoalSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          {/* Full-Width Goals List */}
          {filteredGoals.length === 0 ? (
            <div className="card p-12 text-center border border-dashed border-white/10 bg-bg-800/40 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto">
                <Target size={24} />
              </div>
              <div className="max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-slate-200">No Goals Found</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {goals.length === 0
                    ? 'Set high-level strategic objectives to organize your projects and daily work.'
                    : 'No goals match your current filter criteria.'}
                </p>
              </div>
              <button
                onClick={openCreateGoalModal}
                className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Create Your First Goal</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGoals.map((goal) => {
                const prog = getGoalProgress(goal.id);
                return (
                  <div
                    key={goal.id}
                    className="card p-4 sm:p-4.5 border border-white/10 bg-bg-800 rounded-2xl space-y-3.5 hover:border-purple-500/30 transition-all shadow-sm group"
                  >
                    {/* Top Row: Info & Metadata (Left) + Actions & Controls (Right) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Status Badges, Title, Description */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                          {goalStatusBadge(goal.status)}
                          {goal.sequentialMode && (
                            <span className="badge bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                              <Lock size={10} className="shrink-0" />
                              <span>Sequential Mode</span>
                            </span>
                          )}
                          {goal.category && (
                            <span className="badge bg-white/5 text-slate-300 border border-white/10 text-[10px] flex items-center gap-1">
                              <Tag size={10} className="text-purple-400 shrink-0" />
                              <span className="truncate max-w-[140px]">{goal.category}</span>
                            </span>
                          )}
                          {goal.targetDate ? (
                            <span className="badge bg-white/5 text-slate-300 border border-white/10 text-[10px] flex items-center gap-1">
                              <Calendar size={10} className="text-purple-400 shrink-0" />
                              <span>Target: {formatDateShort(goal.targetDate)}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">No target date</span>
                          )}
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-slate-100 leading-snug" title={goal.title}>
                          {goal.title}
                        </h4>

                        {goal.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {goal.description}
                          </p>
                        )}
                      </div>

                      {/* Right: Status Dropdown, Linked Button, Edit/Delete */}
                      <div className="flex items-center gap-2 shrink-0 self-start pt-0.5 flex-wrap sm:flex-nowrap">
                        <select
                          value={goal.status}
                          onChange={(e) => handleMoveGoalStatus(goal.id, e.target.value as GoalStatus)}
                          className="bg-bg-900 border border-white/10 text-xs rounded-xl px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-purple-500/50"
                        >
                          <option value="active">🟢 Active</option>
                          <option value="achieved">🏆 Achieved</option>
                          <option value="abandoned">⚪ Abandoned</option>
                        </select>

                        {prog.linkedProjectsCount > 0 ? (
                          <button
                            onClick={() => {
                              setFilterGoalId(goal.id);
                              setActiveTab('projects');
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-colors shrink-0 whitespace-nowrap"
                            title="View linked projects"
                          >
                            <span>Projects</span>
                            <ArrowRight size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => openCreateProjectModal(goal.id)}
                            className="text-xs text-slate-400 hover:text-purple-300 font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-white/5 border border-white/10 transition-colors shrink-0 whitespace-nowrap"
                            title="Create first project for this goal"
                          >
                            <Plus size={12} />
                            <span>Project</span>
                          </button>
                        )}

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => openEditGoalModal(goal)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors"
                            title="Edit Goal"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteGoalTarget(goal)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Delete Goal"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Full-Width Progress Section with High-Contrast Percentage */}
                    <div className="pt-2.5 border-t border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                            {prog.isManual ? 'Manual Progress' : 'Overall Progress'}
                          </span>
                          {prog.isManual ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 font-semibold border border-purple-500/20">
                              0 linked projects
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">
                              ({prog.completedProjectsCount}/{prog.linkedProjectsCount} projects complete)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100 tabular-nums">
                            {prog.percent}%
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                            • Created {formatDateShort(goal.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar with Steppers (if manual) */}
                      <div className="flex items-center gap-2.5">
                        {prog.isManual && (
                          <button
                            type="button"
                            onClick={() => handleUpdateGoalManualProgress(goal, prog.percent - 5)}
                            disabled={prog.percent <= 0}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-white/5 flex items-center justify-center text-xs transition-colors shrink-0 border border-white/10"
                            title="Decrease 5%"
                          >
                            <Minus size={12} />
                          </button>
                        )}

                        <div className="flex-1 bg-bg-900 rounded-full h-2.5 overflow-hidden border border-white/5 shadow-inner">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-300 ${
                              prog.percent >= 100
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-sm shadow-emerald-500/30'
                                : prog.percent > 0
                                ? 'bg-gradient-to-r from-purple-600 to-purple-400 shadow-sm shadow-purple-500/20'
                                : 'bg-slate-700'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(prog.percent, 0))}%` }}
                          />
                        </div>

                        {prog.isManual && (
                          <button
                            type="button"
                            onClick={() => handleUpdateGoalManualProgress(goal, prog.percent + 5)}
                            disabled={prog.percent >= 100}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-white/5 flex items-center justify-center text-xs transition-colors shrink-0 border border-white/10"
                            title="Increase 5%"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 2. PROJECTS SUB-VIEW (Status-Filtered List) */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          {/* Breadcrumb if filtered by Goal */}
          {filterGoalId && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Target size={16} className="text-purple-400 shrink-0" />
                <span className="text-xs text-slate-300">
                  Showing projects linked to Goal:{' '}
                  <strong className="text-purple-300 font-bold">{getGoalName(filterGoalId)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setFilterGoalId(null);
                    setActiveTab('goals');
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
                >
                  ← Back to all Goals
                </button>
                <button
                  onClick={() => setFilterGoalId(null)}
                  className="p-1 text-slate-400 hover:text-slate-200"
                  title="Clear Filter"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Projects Control Bar with Status Filter Tabs & Search/Goal Filters */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-bg-800/50 p-3 rounded-2xl border border-white/5">
            {/* Status Filter Tab Bar (Wrapped for responsive display) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                id="filter-projects-all"
                onClick={() => setProjectStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  projectStatusFilter === 'all'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({projectStatusCounts.all})
              </button>
              <button
                id="filter-projects-in-progress"
                onClick={() => setProjectStatusFilter('in_progress')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  projectStatusFilter === 'in_progress'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                In Progress ({projectStatusCounts.in_progress})
              </button>
              <button
                id="filter-projects-not-started"
                onClick={() => setProjectStatusFilter('not_started')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  projectStatusFilter === 'not_started'
                    ? 'bg-slate-500/20 text-slate-200 border border-slate-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Not Started ({projectStatusCounts.not_started})
              </button>
              <button
                id="filter-projects-on-hold"
                onClick={() => setProjectStatusFilter('on_hold')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  projectStatusFilter === 'on_hold'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                On Hold ({projectStatusCounts.on_hold})
              </button>
              <button
                id="filter-projects-completed"
                onClick={() => setProjectStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  projectStatusFilter === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Completed ({projectStatusCounts.completed})
              </button>
              <button
                id="filter-projects-locked"
                onClick={() => setProjectStatusFilter('locked')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
                  projectStatusFilter === 'locked'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                <Lock size={12} className="shrink-0" />
                <span>Locked ({projectStatusCounts.locked})</span>
              </button>
            </div>

            {/* Goal Filter & Search */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-2.5 shrink-0">
              {!filterGoalId && (
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  <Filter size={14} className="text-slate-400 shrink-0" />
                  <select
                    value={projectGoalFilter}
                    onChange={(e) => setProjectGoalFilter(e.target.value)}
                    className="w-full sm:w-auto bg-bg-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="all">All Goals ({projects.length} projects)</option>
                    <option value="standalone">Standalone Projects (No Goal)</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        Goal: {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
          </div>

          {/* FULL-WIDTH VERTICAL LIST */}
          {filteredProjects.length === 0 ? (
            <div className="card p-12 text-center border border-dashed border-white/10 bg-bg-800/40 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
                <FolderKanban size={24} />
              </div>
              <div className="max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-slate-200">No Projects Found</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {projects.length === 0
                    ? 'Create your first project to break down your high-level goals into actionable work.'
                    : `No ${projectStatusFilter === 'locked' ? 'locked' : projectStatusFilter !== 'all' ? projectStatusFilter.replace('_', ' ') : ''} projects match your current filters.`}
                </p>
              </div>
              <button
                onClick={() => openCreateProjectModal(undefined, projectStatusFilter !== 'all' && projectStatusFilter !== 'locked' ? projectStatusFilter : undefined)}
                className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Create New Project</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProjects.map((project) => {
                const prog = getProjectProgress(project.id);
                const isOverdue = project.dueDate && project.dueDate < currentToday && project.status !== 'completed';
                const isDueToday = project.dueDate === currentToday && project.status !== 'completed';
                const lockStatus = getProjectLockStatus(project.id);

                return (
                  <div
                    key={project.id}
                    className={`card p-4 sm:p-4.5 border rounded-2xl space-y-3.5 transition-all shadow-sm group ${
                      lockStatus.isLocked
                        ? 'border-amber-500/20 bg-bg-800/80 hover:border-amber-500/40'
                        : 'border-white/10 bg-bg-800 hover:border-cyan-500/30'
                    }`}
                  >
                    {/* Locked Banner if Locked */}
                    {lockStatus.isLocked && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-2 text-xs text-amber-300">
                        <Lock size={13} className="shrink-0 text-amber-400" />
                        <span className="font-medium">
                          {lockStatus.reason || 'This project is locked until prior projects in sequence are completed.'}
                        </span>
                      </div>
                    )}

                    {/* Top Row: Info & Metadata (Left) + Actions & Controls (Right) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Badges, Title, Description */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                          {/* Goal badge */}
                          {project.goalId ? (
                            <button
                              onClick={() => {
                                setFilterGoalId(project.goalId || null);
                                setActiveTab('goals');
                              }}
                              className="badge bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] truncate flex items-center gap-1 transition-colors"
                              title={`Linked to Goal: ${getGoalName(project.goalId)}`}
                            >
                              <Target size={10} className="shrink-0" />
                              <span className="truncate max-w-[150px]">{getGoalName(project.goalId)}</span>
                            </button>
                          ) : (
                            <span className="badge bg-white/5 text-slate-400 border border-white/10 text-[10px]">Standalone</span>
                          )}

                          {/* Sequential Step Badge */}
                          {lockStatus.isSequentialGoal && (
                            <span
                              className={`badge text-[10px] font-bold flex items-center gap-1 border ${
                                lockStatus.isLocked
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : project.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              }`}
                            >
                              {lockStatus.isLocked ? (
                                <Lock size={10} className="shrink-0" />
                              ) : (
                                <Unlock size={10} className="shrink-0" />
                              )}
                              <span>
                                Step {lockStatus.stepIndex} of {lockStatus.totalSteps}
                                {lockStatus.isLocked ? ' (Locked)' : project.status === 'completed' ? ' (Done)' : ' (Active)'}
                              </span>
                            </span>
                          )}

                          {project.dueDate ? (
                            <span
                              className={`badge text-[10px] flex items-center gap-1 border ${
                                isOverdue
                                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold'
                                  : isDueToday
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold'
                                  : 'bg-white/5 text-slate-300 border border-white/10'
                              }`}
                            >
                              <Calendar size={10} className="shrink-0" />
                              <span>
                                {isOverdue ? 'Overdue: ' : isDueToday ? 'Today: ' : 'Due: '}
                                {formatDateShort(project.dueDate)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">No due date</span>
                          )}
                        </div>

                        <h4
                          className={`text-sm sm:text-base font-bold leading-snug ${
                            lockStatus.isLocked ? 'text-slate-300' : 'text-slate-100'
                          }`}
                          title={project.title}
                        >
                          {project.title}
                        </h4>

                        {project.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {project.description}
                          </p>
                        )}
                      </div>

                      {/* Right: Reorder Buttons, Status Dropdown, Tasks Button, Edit/Delete */}
                      <div className="flex items-center gap-2 shrink-0 self-start pt-0.5 flex-wrap sm:flex-nowrap">
                        {/* Move Up/Down Order Buttons (if linked to a Goal) */}
                        {project.goalId && (
                          <div className="flex items-center bg-bg-900 border border-white/10 rounded-xl p-0.5 shrink-0" title="Reorder Project sequence in Goal">
                            <button
                              type="button"
                              onClick={() => store.moveProjectOrder(project.id, 'up')}
                              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-lg transition-colors"
                              title="Move Up in sequence"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => store.moveProjectOrder(project.id, 'down')}
                              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-lg transition-colors"
                              title="Move Down in sequence"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        )}

                        <select
                          value={project.status}
                          disabled={lockStatus.isLocked}
                          onChange={(e) => handleMoveProjectStatus(project.id, e.target.value as ProjectStatus)}
                          className="bg-bg-900 border border-white/10 text-xs rounded-xl px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-cyan-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                          title={lockStatus.isLocked ? 'Project is locked by sequence order' : undefined}
                        >
                          <option value="not_started">📌 Not Started</option>
                          <option value="in_progress" disabled={lockStatus.isLocked}>
                            🚀 In Progress {lockStatus.isLocked ? '(Locked)' : ''}
                          </option>
                          <option value="on_hold">⏸️ On Hold</option>
                          <option
                            value="completed"
                            disabled={lockStatus.isLocked}
                            title={lockStatus.isLocked ? 'Project is locked by sequence order' : undefined}
                          >
                            ✅ Completed {lockStatus.isLocked ? '(Locked)' : ''}
                          </option>
                        </select>

                        <button
                          onClick={() => {
                            setFilterProjectId(project.id);
                            setActiveTab('tasks');
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors shrink-0 whitespace-nowrap"
                          title="View project tasks"
                        >
                          <span>Tasks</span>
                          <ArrowRight size={12} />
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => openEditProjectModal(project)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors"
                            title="Edit Project"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteProjectTarget(project)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Delete Project"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Full-Width Progress Section with High-Contrast Percentage */}
                    <div className="pt-2.5 border-t border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                            {prog.isManual ? 'Manual Progress' : 'Task Completion'}
                          </span>
                          {prog.isManual ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/20">
                              0 linked tasks
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">
                              ({prog.completed}/{prog.total} tasks complete)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100 tabular-nums">
                            {prog.percent}%
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                            • Created {formatDateShort(project.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar with Steppers (if manual) */}
                      <div className="flex items-center gap-2.5">
                        {prog.isManual && (
                          <button
                            type="button"
                            onClick={() => handleUpdateProjectManualProgress(project, prog.percent - 5)}
                            disabled={prog.percent <= 0 || lockStatus.isLocked}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-white/5 flex items-center justify-center text-xs transition-colors shrink-0 border border-white/10"
                            title="Decrease 5%"
                          >
                            <Minus size={12} />
                          </button>
                        )}

                        <div className="flex-1 bg-bg-900 rounded-full h-2.5 overflow-hidden border border-white/5 shadow-inner">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-300 ${
                              prog.percent >= 100
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-sm shadow-emerald-500/30'
                                : prog.percent > 0
                                ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 shadow-sm shadow-cyan-500/20'
                                : 'bg-slate-700'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(prog.percent, 0))}%` }}
                          />
                        </div>

                        {prog.isManual && (
                          <button
                            type="button"
                            onClick={() => handleUpdateProjectManualProgress(project, prog.percent + 5)}
                            disabled={prog.percent >= 100 || lockStatus.isLocked}
                            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-white/5 flex items-center justify-center text-xs transition-colors shrink-0 border border-white/10"
                            title="Increase 5%"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3. TASKS SUB-VIEW (Flat Checklist) */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Breadcrumb & Lock Banner if filtered by Project */}
          {filterProjectId && (() => {
            const filterLock = getProjectLockStatus(filterProjectId);
            return (
              <div className="space-y-2">
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban size={16} className="text-cyan-400 shrink-0" />
                    <span className="text-xs text-slate-300">
                      Showing tasks for Project:{' '}
                      <strong className="text-cyan-300 font-bold">{getProjectName(filterProjectId)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setFilterProjectId(null);
                        setActiveTab('projects');
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
                    >
                      ← Back to all Projects
                    </button>
                    <button
                      onClick={() => setFilterProjectId(null)}
                      className="p-1 text-slate-400 hover:text-slate-200"
                      title="Clear Filter"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {filterLock.isLocked && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-2 text-xs text-amber-300">
                    <Lock size={13} className="shrink-0 text-amber-400" />
                    <span className="font-medium">
                      {filterLock.reason || 'This project is locked by sequential goal order. Finish prior projects to unlock tasks.'}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* QUICK-ADD TASK BAR */}
          <form
            onSubmit={handleQuickAddTask}
            className="card p-3.5 border border-white/10 bg-bg-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shadow-md"
          >
            <div className="flex-1 relative">
              <CheckSquare className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                id="input-quick-add-task"
                type="text"
                placeholder="Quick add a new task (press Enter)..."
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-2.5 w-full sm:w-auto">
              <select
                value={quickTaskPriority}
                onChange={(e) => setQuickTaskPriority(e.target.value as TaskPriority)}
                className="flex-1 sm:flex-none bg-bg-900 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none min-w-[110px]"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Med Priority</option>
                <option value="low">⚪ Low Priority</option>
              </select>

              {!filterProjectId && (
                <select
                  value={quickTaskProjectId}
                  onChange={(e) => setQuickTaskProjectId(e.target.value)}
                  className="flex-1 sm:flex-none bg-bg-900 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none min-w-[110px] truncate"
                >
                  <option value="">No Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}

              <button
                id="btn-quick-add-task"
                type="submit"
                disabled={!quickTaskTitle.trim() || isKeyLoading('quick_add_task')}
                className="w-full sm:w-auto btn-primary text-xs px-3.5 py-2 flex items-center justify-center gap-1 shrink-0 disabled:opacity-50"
              >
                {isKeyLoading('quick_add_task') ? <AscendLoadingIndicator size="sm" /> : <Plus size={14} />}
                <span>Add Task</span>
              </button>
            </div>
          </form>

          {/* FILTERS & SEARCH */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-bg-800/50 p-3 rounded-2xl border border-white/5">
            {/* Quick Segment Filter (Wrapped for responsive display with zero horizontal scrolling) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active' },
                  { id: 'today', label: 'Due Today' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'this_week', label: 'This Week' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'locked', label: 'Locked' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTaskViewFilter(f.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                    taskViewFilter === f.id
                      ? f.id === 'locked'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : f.id === 'locked'
                      ? 'text-slate-400 hover:text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-2.5 shrink-0">
              {/* Priority Dropdown Filter */}
              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value as 'all' | TaskPriority)}
                className="bg-bg-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Med Priority</option>
                <option value="low">⚪ Low Priority</option>
              </select>

              {!filterProjectId && (
                <select
                  value={taskProjectFilter}
                  onChange={(e) => setTaskProjectFilter(e.target.value)}
                  className="bg-bg-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none max-w-[160px] truncate"
                >
                  <option value="all">All Projects</option>
                  <option value="standalone">Standalone Tasks Only</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      Project: {p.title}
                    </option>
                  ))}
                </select>
              )}

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          </div>

          {/* TASK LIST */}
          {filteredTasks.length === 0 ? (
            <div className="card p-12 text-center border border-dashed border-white/10 bg-bg-800/40 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckSquare size={24} />
              </div>
              <div className="max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-slate-200">No Tasks Found</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {tasks.length === 0
                    ? 'Use the quick input above to capture your first task.'
                    : 'No tasks match your selected filter.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < currentToday && !task.completed;
                const isDueToday = task.dueDate === currentToday && !task.completed;
                const subtasks = task.subtasks || [];
                const completedSubtasks = subtasks.filter((st) => st.completed).length;
                const isExpanded = expandedTaskIds.has(task.id);
                const hasSubtasks = subtasks.length > 0;
                const projectLock = task.projectId ? getProjectLockStatus(task.projectId) : { isLocked: false, reason: '' };

                return (
                  <div
                    key={task.id}
                    className={`card p-4 border transition-all rounded-2xl space-y-3 ${
                      projectLock.isLocked
                        ? 'bg-bg-800/80 border-amber-500/20'
                        : task.completed
                        ? 'bg-bg-800/50 border-white/5 opacity-75'
                        : 'bg-bg-800 border-white/10 hover:border-emerald-500/30'
                    }`}
                  >
                    {/* Main Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Task Checkbox */}
                        <button
                          onClick={() => {
                            if (!hasSubtasks && !projectLock.isLocked) {
                              store.toggleTaskCompleted(task.id);
                            }
                          }}
                          disabled={hasSubtasks || projectLock.isLocked}
                          className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                            hasSubtasks || projectLock.isLocked ? 'cursor-not-allowed opacity-90' : ''
                          } ${
                            task.completed
                              ? 'bg-emerald-500 border-emerald-400 text-white'
                              : projectLock.isLocked
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                              : 'border-white/20 hover:border-emerald-400 text-transparent'
                          }`}
                          title={
                            projectLock.isLocked
                              ? (projectLock.reason || 'Project is locked by sequence order')
                              : hasSubtasks
                              ? 'Auto-synced: completion is driven by subtasks'
                              : task.completed
                              ? 'Mark incomplete'
                              : 'Mark complete'
                          }
                        >
                          {projectLock.isLocked ? (
                            <Lock size={11} className="text-amber-400" />
                          ) : (
                            <Check size={13} strokeWidth={3} className={task.completed ? 'block' : 'hidden'} />
                          )}
                        </button>

                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap">
                            <span
                              className={`text-sm font-bold leading-snug break-words ${
                                task.completed ? 'line-through text-slate-400' : 'text-slate-100'
                              }`}
                            >
                              {task.title}
                            </span>

                            <span className={`badge text-[10px] font-bold border ${priorityColor(task.priority)}`}>
                              {task.priority.toUpperCase()}
                            </span>

                            {task.projectId && (
                              <button
                                onClick={() => {
                                  setFilterProjectId(task.projectId || null);
                                  setActiveTab('tasks');
                                }}
                                className={`badge text-[10px] flex items-center gap-1 max-w-[180px] truncate border ${
                                  projectLock.isLocked
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border-cyan-500/20'
                                }`}
                                title={`Project: ${getProjectName(task.projectId)} ${projectLock.isLocked ? '(Locked)' : ''}`}
                              >
                                {projectLock.isLocked ? <Lock size={10} className="shrink-0 text-amber-400" /> : <FolderKanban size={10} className="shrink-0" />}
                                <span className="truncate">{getProjectName(task.projectId)}</span>
                              </button>
                            )}

                            {task.dueDate && (
                              <span
                                className={`badge text-[10px] flex items-center gap-1 border ${
                                  isOverdue
                                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold'
                                    : isDueToday
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold'
                                    : 'bg-white/5 text-slate-400 border-white/10'
                                }`}
                              >
                                <Calendar size={10} />
                                <span>
                                  {isOverdue ? 'Overdue: ' : isDueToday ? 'Today: ' : 'Due: '}
                                  {formatDateShort(task.dueDate)}
                                </span>
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Start Deep Focus Session Button */}
                        <button
                          onClick={() => {
                            if (onStartFocusSession) {
                              onStartFocusSession(task.title);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                          title="Start Deep Focus Session with this task"
                        >
                          <Timer size={13} />
                          <span className="hidden sm:inline">Focus</span>
                        </button>

                        <button
                          onClick={() => openEditTaskModal(task)}
                          className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Edit Task"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          onClick={() => setDeleteTaskTarget(task)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Subtasks Section */}
                    <div className="pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleTaskExpand(task.id)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1.5 transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          <span>
                            Subtasks ({completedSubtasks}/{subtasks.length})
                          </span>
                        </button>

                        {subtasks.length > 0 && (
                          <span className="text-[10px] text-slate-500 font-bold">
                            {Math.round((completedSubtasks / subtasks.length) * 100)}%
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-2.5 pl-4 border-l-2 border-white/10 space-y-2 animate-fade-in">
                          {subtasks.map((st) => (
                            <div key={st.id} className="flex items-center justify-between gap-2 group/st">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <button
                                  onClick={() => store.toggleSubtask(task.id, st.id)}
                                  disabled={projectLock.isLocked}
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all shrink-0 ${
                                    projectLock.isLocked ? 'cursor-not-allowed opacity-60' : ''
                                  } ${
                                    st.completed
                                      ? 'bg-emerald-500 border-emerald-400 text-white'
                                      : 'border-white/20 hover:border-emerald-400 text-transparent'
                                  }`}
                                  title={projectLock.isLocked ? 'Project is locked by sequence order' : undefined}
                                >
                                  <Check size={10} strokeWidth={3} className={st.completed ? 'block' : 'hidden'} />
                                </button>
                                <span
                                  className={`text-xs ${
                                    st.completed ? 'line-through text-slate-500' : 'text-slate-300'
                                  } truncate`}
                                >
                                  {st.title}
                                </span>
                              </div>

                              <button
                                onClick={() => store.deleteSubtask(task.id, st.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover/st:opacity-100 transition-all"
                                title="Delete Subtask"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}

                          {/* Add Subtask Input */}
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Add a subtask..."
                              value={newSubtaskInputs[task.id] || ''}
                              onChange={(e) =>
                                setNewSubtaskInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddInlineSubtask(task.id);
                                }
                              }}
                              className="w-full bg-bg-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddInlineSubtask(task.id)}
                              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* GOAL MODAL (CREATE / EDIT) */}
      {/* -------------------------------------------------------------------- */}
      <Modal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={editingGoal ? 'Edit Goal' : 'Create New Goal'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Goal Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Master Full-Stack Architecture"
              value={goalFormTitle}
              onChange={(e) => setGoalFormTitle(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Why this goal matters and what high-level success looks like..."
              value={goalFormDescription}
              onChange={(e) => setGoalFormDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Category Tag</label>
            <input
              type="text"
              placeholder="e.g. Career, Health, Finance..."
              value={goalFormCategory}
              onChange={(e) => setGoalFormCategory(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500/50 mb-1.5"
            />
            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
              {GOAL_CATEGORY_SUGGESTIONS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGoalFormCategory(cat)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 hover:bg-purple-500/20 text-slate-400 hover:text-purple-300 border border-white/5 transition-all"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Sequential Mode Toggle */}
          <div className="p-3 bg-bg-900 border border-white/10 rounded-xl flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer">
                <Lock size={13} className="text-amber-400" />
                <span>Sequential Mode</span>
              </label>
              <p className="text-[11px] text-slate-400">
                Enforce step-by-step completion: linked projects must be finished in sequential order.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={goalFormSequentialMode}
                onChange={(e) => setGoalFormSequentialMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Target Completion Date</label>
              <input
                type="date"
                min={minAllowedDate}
                max={maxAllowedDate}
                value={goalFormTargetDate}
                onChange={(e) => setGoalFormTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
              <select
                value={goalFormStatus}
                onChange={(e) => setGoalFormStatus(e.target.value as GoalStatus)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500/50"
              >
                <option value="active">Active</option>
                <option value="achieved">Achieved</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="btn-secondary text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveGoal}
              disabled={!goalFormTitle.trim() || isKeyLoading('save_goal')}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isKeyLoading('save_goal') ? <AscendLoadingIndicator size="sm" /> : <Check size={14} />}
              <span>{editingGoal ? 'Save Changes' : 'Create Goal'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------------- */}
      {/* PROJECT MODAL (CREATE / EDIT) */}
      {/* -------------------------------------------------------------------- */}
      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create New Project'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Project Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Build Mobile UI Redesign"
              value={projectFormTitle}
              onChange={(e) => setProjectFormTitle(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Project scope and deliverables..."
              value={projectFormDescription}
              onChange={(e) => setProjectFormDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Link to Goal (Optional)</label>
            <select
              value={projectFormGoalId}
              onChange={(e) => setProjectFormGoalId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">None (Standalone Project)</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  Goal: {g.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                min={minAllowedDate}
                max={maxAllowedDate}
                value={projectFormStartDate}
                onChange={(e) => setProjectFormStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Due Date</label>
              <input
                type="date"
                min={minAllowedDate}
                max={maxAllowedDate}
                value={projectFormDueDate}
                onChange={(e) => setProjectFormDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
            <select
              value={projectFormStatus}
              onChange={(e) => setProjectFormStatus(e.target.value as ProjectStatus)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="not_started">📌 Not Started</option>
              <option value="in_progress">🚀 In Progress</option>
              <option value="on_hold">⏸️ On Hold</option>
              <option value="completed">✅ Completed</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => setProjectModalOpen(false)}
              className="btn-secondary text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProject}
              disabled={!projectFormTitle.trim() || isKeyLoading('save_project')}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isKeyLoading('save_project') ? <AscendLoadingIndicator size="sm" /> : <Check size={14} />}
              <span>{editingProject ? 'Save Changes' : 'Create Project'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------------- */}
      {/* TASK MODAL (CREATE / EDIT) */}
      {/* -------------------------------------------------------------------- */}
      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Conduct user interviews"
              value={taskFormTitle}
              onChange={(e) => setTaskFormTitle(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Task instructions and notes..."
              value={taskFormDescription}
              onChange={(e) => setTaskFormDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Linked Project</label>
              <select
                value={taskFormProjectId}
                onChange={(e) => setTaskFormProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="">None (Standalone Task)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
              <select
                value={taskFormPriority}
                onChange={(e) => setTaskFormPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Due Date</label>
            <input
              type="date"
              min={minAllowedDate}
              max={maxAllowedDate}
              value={taskFormDueDate}
              onChange={(e) => setTaskFormDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-bg-900 border border-white/10 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Subtasks in Modal */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Subtasks Checklist</label>
            <div className="space-y-1.5 mb-2">
              {taskFormSubtasks.map((st, idx) => (
                <div key={st.id} className="flex items-center justify-between gap-2 p-1.5 bg-bg-900 rounded-lg border border-white/5">
                  <span className="text-xs text-slate-200 truncate">{st.title}</span>
                  <button
                    type="button"
                    onClick={() => setTaskFormSubtasks((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-rose-400 p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add subtask title..."
                value={newModalSubtaskTitle}
                onChange={(e) => setNewModalSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newModalSubtaskTitle.trim()) {
                      setTaskFormSubtasks((prev) => [
                        ...prev,
                        { id: Date.now().toString(), title: newModalSubtaskTitle.trim(), completed: false },
                      ]);
                      setNewModalSubtaskTitle('');
                    }
                  }
                }}
                className="flex-1 px-3 py-1.5 bg-bg-900 border border-white/10 rounded-lg text-xs text-slate-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newModalSubtaskTitle.trim()) {
                    setTaskFormSubtasks((prev) => [
                      ...prev,
                      { id: Date.now().toString(), title: newModalSubtaskTitle.trim(), completed: false },
                    ]);
                    setNewModalSubtaskTitle('');
                  }
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg text-xs font-semibold"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => setTaskModalOpen(false)}
              className="btn-secondary text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTaskModal}
              disabled={!taskFormTitle.trim() || isKeyLoading('save_task_modal')}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isKeyLoading('save_task_modal') ? <AscendLoadingIndicator size="sm" /> : <Check size={14} />}
              <span>{editingTask ? 'Save Changes' : 'Create Task'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------------- */}
      {/* CONFIRM DELETE MODALS */}
      {/* -------------------------------------------------------------------- */}

      {/* 1. Delete Goal Confirm */}
      <ConfirmDeleteModal
        open={Boolean(deleteGoalTarget)}
        onClose={() => setDeleteGoalTarget(null)}
        onConfirm={handleDeleteGoalConfirm}
        title="Delete Goal?"
        description={
          deleteGoalTarget
            ? `Delete goal "${deleteGoalTarget.title}"? Its ${
                projects.filter((p) => p.goalId === deleteGoalTarget.id).length
              } linked project(s) will become unlinked, not deleted.`
            : undefined
        }
        confirmText="Delete Goal"
      />

      {/* 2. Delete Project Confirm */}
      <ConfirmDeleteModal
        open={Boolean(deleteProjectTarget)}
        onClose={() => setDeleteProjectTarget(null)}
        onConfirm={handleDeleteProjectConfirm}
        title="Delete Project?"
        description={
          deleteProjectTarget
            ? `Delete project "${deleteProjectTarget.title}"? Its ${
                tasks.filter((t) => t.projectId === deleteProjectTarget.id).length
              } linked task(s) will become unlinked, not deleted.`
            : undefined
        }
        confirmText="Delete Project"
      />

      {/* 3. Delete Task Confirm */}
      <ConfirmDeleteModal
        open={Boolean(deleteTaskTarget)}
        onClose={() => setDeleteTaskTarget(null)}
        onConfirm={handleDeleteTaskConfirm}
        title="Delete Task?"
        itemName={deleteTaskTarget?.title}
        confirmText="Delete Task"
      />
    </div>
  );
}
