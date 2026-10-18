import { ArrowRight, Calendar, ListOrdered, Plus, Tag } from 'lucide-react';
import type { Goal, GoalStatus } from '@/types';
import { formatDateShort } from '@/lib/dates';
import { Chip, ItemCard, Nudge, StatusSelect } from './ItemCard';
import { GOAL_STATUS_LABEL, type GoalProgress } from './hierarchy';

const STATUS_TONE = { active: 'success', achieved: 'purple', abandoned: 'neutral' } as const;

export function GoalCard({
  goal,
  prog,
  today,
  onStatusChange,
  onOpenProjects,
  onAddProject,
  onUpdateProgress,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  prog: GoalProgress;
  today: string;
  onStatusChange: (status: GoalStatus) => void;
  onOpenProjects: () => void;
  onAddProject: () => void;
  onUpdateProgress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasProjects = prog.linkedProjectsCount > 0;
  const overdue = goal.status === 'active' && Boolean(goal.targetDate) && goal.targetDate! < today;

  const detail = hasProjects
    ? `${prog.completedProjectsCount} of ${prog.linkedProjectsCount} ${prog.linkedProjectsCount === 1 ? 'project' : 'projects'} done` +
      (prog.totalTasksCount > 0 ? ` · ${prog.completedTasksCount}/${prog.totalTasksCount} tasks` : '')
    : 'No projects yet, so you update it yourself';

  return (
    <ItemCard
      kindLabel="goal"
      title={goal.title}
      description={goal.description}
      muted={goal.status === 'abandoned'}
      onEdit={onEdit}
      onDelete={onDelete}
      chips={
        <>
          <Chip tone={STATUS_TONE[goal.status]}>{GOAL_STATUS_LABEL[goal.status]}</Chip>
          {goal.category && <Chip icon={<Tag size={10} className="shrink-0" />}>{goal.category}</Chip>}
          {goal.targetDate && (
            <Chip tone={overdue ? 'danger' : 'neutral'} icon={<Calendar size={10} className="shrink-0" />}>
              {overdue ? 'Past target' : 'Target'} {formatDateShort(goal.targetDate)}
            </Chip>
          )}
          {goal.sequentialMode && (
            <Chip icon={<ListOrdered size={10} className="shrink-0" />} title="Projects unlock one at a time">
              In order
            </Chip>
          )}
        </>
      }
      nudge={
        !hasProjects && goal.status === 'active' ? (
          <Nudge
            tone="purple"
            text="A goal without a plan is just a wish. Add a project to turn it into steps you can take."
            actionLabel="+ Add project"
            onAction={onAddProject}
          />
        ) : undefined
      }
      progress={{
        percent: prog.percent,
        detail,
        tone: 'purple',
        onUpdate: hasProjects ? undefined : onUpdateProgress,
        updateDisabled: goal.status === 'abandoned',
      }}
      footer={
        <>
          <StatusSelect label={`Status of "${goal.title}"`} value={goal.status} onChange={(v) => onStatusChange(v as GoalStatus)}>
            <option value="active">Active</option>
            {/* With projects, a goal is achieved when they are all done. */}
            <option value="achieved" disabled={hasProjects && goal.status !== 'achieved'}>
              {hasProjects && goal.status !== 'achieved' ? 'Achieved (when projects are done)' : 'Achieved'}
            </option>
            <option value="abandoned">Abandoned</option>
          </StatusSelect>
          <div className="ml-auto flex items-center gap-2">
            {hasProjects && (
              <button type="button" onClick={onAddProject} className="btn-secondary px-3 py-1.5 text-xs" aria-label={`Add a project to "${goal.title}"`}>
                <Plus size={13} aria-hidden="true" />
                <span className="max-sm:hidden">Project</span>
              </button>
            )}
            {hasProjects ? (
              <button type="button" onClick={onOpenProjects} className="btn-secondary px-3 py-1.5 text-xs text-purple-hierarchy">
                <span>{prog.linkedProjectsCount === 1 ? '1 project' : `${prog.linkedProjectsCount} projects`}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            ) : (
              goal.status !== 'active' && (
                <button type="button" onClick={onAddProject} className="btn-secondary px-3 py-1.5 text-xs">
                  <Plus size={13} aria-hidden="true" />
                  <span>Add project</span>
                </button>
              )
            )}
          </div>
        </>
      }
    />
  );
}
