import { ArrowRight, Calendar, Target } from 'lucide-react';
import type { Project, ProjectStatus } from '@/types';
import { formatDateShort } from '@/lib/dates';
import { Chip, ItemCard, Nudge, StatusSelect } from './ItemCard';
import { PROJECT_STATUS_LABEL, type LockStatus, type ProjectProgress } from './hierarchy';

const STATUS_TONE = { not_started: 'neutral', in_progress: 'cyan', on_hold: 'warning', completed: 'success' } as const;

export function ProjectCard({
  project,
  prog,
  lock,
  goalName,
  today,
  onStatusChange,
  onOpenGoal,
  onOpenTasks,
  onAddTask,
  onUpdateProgress,
  onEdit,
  onDelete,
}: {
  project: Project;
  prog: ProjectProgress;
  lock: LockStatus;
  goalName: string | null;
  today: string;
  onStatusChange: (status: ProjectStatus) => void;
  onOpenGoal: () => void;
  onOpenTasks: () => void;
  onAddTask: () => void;
  onUpdateProgress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = project.status === 'completed';
  const hasTasks = prog.total > 0;
  const overdue = !done && Boolean(project.dueDate) && project.dueDate! < today;
  const dueToday = !done && project.dueDate === today;

  const detail = hasTasks
    ? `${prog.completed} of ${prog.total} ${prog.total === 1 ? 'task' : 'tasks'} done`
    : 'No tasks yet, so you update it yourself';

  return (
    <ItemCard
      kindLabel="project"
      title={project.title}
      description={project.description}
      muted={lock.isLocked}
      onEdit={onEdit}
      onDelete={onDelete}
      lockedText={lock.isLocked && lock.blockingProject ? `Unlocks when "${lock.blockingProject.title}" is done.` : undefined}
      chips={
        <>
          <Chip tone={lock.isLocked ? 'neutral' : STATUS_TONE[project.status]}>
            {lock.isLocked ? 'Locked' : PROJECT_STATUS_LABEL[project.status]}
          </Chip>
          {lock.isSequentialGoal && (
            <Chip>
              Step {lock.stepIndex} of {lock.totalSteps}
            </Chip>
          )}
          {goalName ? (
            <Chip tone="purple" icon={<Target size={10} className="shrink-0" />} onClick={onOpenGoal} title={`Show the projects of "${goalName}"`}>
              {goalName}
            </Chip>
          ) : (
            <Chip>No goal</Chip>
          )}
          {project.dueDate && (
            <Chip tone={overdue ? 'danger' : dueToday ? 'warning' : 'neutral'} icon={<Calendar size={10} className="shrink-0" />}>
              {overdue ? 'Overdue' : dueToday ? 'Due today' : 'Due'} {formatDateShort(project.dueDate)}
            </Chip>
          )}
        </>
      }
      nudge={
        !hasTasks && !done && !lock.isLocked ? (
          <Nudge
            tone="cyan"
            text="This project has no tasks yet. Add one small step to get started."
            actionLabel="+ Add task"
            onAction={onAddTask}
          />
        ) : undefined
      }
      progress={{
        percent: prog.percent,
        detail,
        tone: 'cyan',
        onUpdate: hasTasks ? undefined : onUpdateProgress,
        updateDisabled: lock.isLocked,
      }}
      footer={
        <>
          <StatusSelect
            label={`Status of "${project.title}"`}
            value={project.status}
            disabled={lock.isLocked}
            onChange={(v) => onStatusChange(v as ProjectStatus)}
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            {/* With tasks, a project completes when they are all done. */}
            <option value="completed" disabled={hasTasks && !done}>
              {hasTasks && !done ? 'Completed (when tasks are done)' : 'Completed'}
            </option>
          </StatusSelect>
          <button type="button" onClick={onOpenTasks} className="btn-secondary ml-auto px-3 py-1.5 text-xs text-cyan-hierarchy">
            <span>{hasTasks ? `${prog.total} ${prog.total === 1 ? 'task' : 'tasks'}` : 'Tasks'}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </>
      }
    />
  );
}
