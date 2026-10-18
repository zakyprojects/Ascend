import { useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, Edit3, FolderKanban, Lock, Timer, Trash2 } from 'lucide-react';
import type { Task, TaskPriority, TaskSubtask } from '@/types';
import { formatDateShort } from '@/lib/dates';
import { cx, ProgressBar } from '@/components/ui/primitives';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { useCompletionPop } from '@/lib/useCompletionPop';
import { Chip } from './ItemCard';
import { actionFeedback } from '@/lib/actionFeedback';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-warning-text',
  low: 'bg-content-disabled',
};

/**
 * One task: tick, title, where it leads (project, then goal), due date, and its subtasks.
 * A task with subtasks ticks itself when the last one is done. Tasks in a locked project wait.
 */
export function TaskRow({
  task,
  today,
  lockedBy,
  projectName,
  goalName,
  onToggle,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onOpenProject,
  onFocus,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
  /** The earlier project this task's project waits on, when it is locked. */
  lockedBy?: string;
  projectName: string | null;
  goalName: string | null;
  onToggle: () => void;
  onToggleSubtask: (subtaskId: string) => void;
  onAddSubtask: (title: string) => void;
  onDeleteSubtask: (subtask: TaskSubtask) => void;
  onOpenProject: () => void;
  onFocus?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const locked = Boolean(lockedBy);
  const subtasks = task.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const completedSubtasks = subtasks.filter((st) => st.completed).length;
  const overdue = !task.completed && Boolean(task.dueDate) && task.dueDate! < today;
  const dueToday = !task.completed && task.dueDate === today;
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  // Armed by the tick and by subtask clicks: ticking the last subtask completes the task.
  const { arm: armCompletionPop, popClass } = useCompletionPop(task.completed);

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    onAddSubtask(title);
    setNewSubtask('');
  };

  return (
    <div className={cx('enter-item space-y-2.5 p-4 transition-colors', task.completed ? 'opacity-75' : 'hover:bg-overlay-subtle')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => {
            if (!task.completed) armCompletionPop();
            onToggle();
          }}
          disabled={hasSubtasks || locked}
          aria-label={
            locked ? `"${task.title}" is locked` : task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`
          }
          title={locked ? `Unlocks when "${lockedBy}" is done` : hasSubtasks ? 'Ticks itself when every subtask is done' : undefined}
          className={cx('-m-1.5 shrink-0 p-1.5 disabled:cursor-not-allowed', TAP_TARGET)}
        >
          <span
            className={cx(
              'flex h-5 w-5 items-center justify-center rounded-lg border transition-colors',
              task.completed
                ? 'border-emerald-400 bg-emerald-500 text-on-brand'
                : locked
                  ? 'border-overlay-default bg-overlay-subtle text-content-muted'
                  : 'border-overlay-strong hover:border-emerald-400'
            )}
          >
            {locked && !task.completed ? (
              <Lock size={11} aria-hidden="true" />
            ) : (
              <Check size={13} strokeWidth={3} className={cx(task.completed ? 'block' : 'hidden', popClass)} />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className={cx('item-name text-sm leading-snug break-words', task.completed ? 'text-content-muted line-through' : 'text-content-primary')}>
              {task.title}
            </span>
            <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
              {onFocus && !task.completed && !locked && (
                <button
                  type="button"
                  onClick={onFocus}
                  className={`p-1.5 text-cyan-hierarchy transition-colors hover:text-content-primary ${TAP_TARGET_Y}`}
                  aria-label={`Start a focus session on "${task.title}"`}
                  title="Focus on this"
                >
                  <Timer size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                className={`p-1.5 text-content-muted transition-colors hover:text-content-secondary ${TAP_TARGET_Y}`}
                aria-label={`Edit task "${task.title}"`}
                title="Edit"
              >
                <Edit3 size={15} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className={`p-1.5 text-content-muted transition-colors hover:text-rose-theme ${TAP_TARGET_Y}`}
                aria-label={`Delete task "${task.title}"`}
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-content-muted">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              {task.priority}
            </span>
            {projectName && (
              <Chip
                tone={locked ? 'neutral' : 'cyan'}
                icon={locked ? <Lock size={10} className="shrink-0" /> : <FolderKanban size={10} className="shrink-0" />}
                onClick={onOpenProject}
                title={goalName ? `${projectName}, part of the goal "${goalName}"` : projectName}
              >
                {goalName ? `${projectName} · ${goalName}` : projectName}
              </Chip>
            )}
            {task.dueDate && (
              <Chip tone={overdue ? 'danger' : dueToday ? 'warning' : 'neutral'} icon={<Calendar size={10} className="shrink-0" />}>
                {overdue ? 'Overdue' : dueToday ? 'Today' : 'Due'} {formatDateShort(task.dueDate)}
              </Chip>
            )}
          </div>

          {task.description && <p className="whitespace-pre-wrap text-xs leading-relaxed text-content-muted">{task.description}</p>}

          {locked && lockedBy && <p className="text-xs text-content-muted">Unlocks when "{lockedBy}" is done.</p>}

          <div>
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className={cx('flex w-full items-center gap-2 text-xs text-content-muted transition-colors hover:text-content-secondary', TAP_TARGET_Y)}
            >
              {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              <span>{hasSubtasks ? `Subtasks ${completedSubtasks}/${subtasks.length}` : 'Add subtasks'}</span>
              {hasSubtasks && (
                <ProgressBar
                  value={completedSubtasks}
                  max={subtasks.length}
                  label="Subtask progress"
                  tone={completedSubtasks === subtasks.length ? 'success' : 'cyan'}
                  size="sm"
                  className="ml-1 max-w-[8rem] flex-1"
                />
              )}
            </button>

            {expanded && (
              <div className="mt-2 space-y-1.5 border-l-2 border-overlay-default pl-3 animate-fade-in">
                {subtasks.map((st) => (
                  <div key={st.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!st.completed) {
                          armCompletionPop();
                          // The last open subtask completes the task, whose pop plays the tick itself.
                          if (subtasks.some((other) => other.id !== st.id && !other.completed)) actionFeedback('tick');
                        }
                        onToggleSubtask(st.id);
                      }}
                      disabled={locked}
                      aria-label={st.completed ? `Mark subtask "${st.title}" not done` : `Mark subtask "${st.title}" done`}
                      className={cx('flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed', TAP_TARGET_Y)}
                    >
                      <span
                        className={cx(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          st.completed ? 'border-emerald-400 bg-emerald-500 text-on-brand' : 'border-overlay-strong'
                        )}
                      >
                        {st.completed && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className={cx('truncate text-xs', st.completed ? 'text-content-disabled line-through' : 'text-content-tertiary')}>
                        {st.title}
                      </span>
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => onDeleteSubtask(st)}
                        className={`p-1 text-content-disabled transition-colors hover:text-rose-theme ${TAP_TARGET}`}
                        aria-label={`Delete subtask "${st.title}"`}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}

                {!locked && (
                  <form
                    className="flex items-center gap-2 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addSubtask();
                    }}
                  >
                    <input
                      type="text"
                      aria-label={`New subtask for "${task.title}"`}
                      placeholder="Add a subtask"
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      maxLength={120}
                      enterKeyHint="enter"
                      className="min-h-9 w-full rounded-lg border border-overlay-default bg-bg-900 px-2.5 py-1 text-base text-content-secondary placeholder:text-content-subtle focus:border-emerald-500/50 focus:outline-none sm:text-xs"
                    />
                    <button type="submit" disabled={!newSubtask.trim()} className="btn-secondary shrink-0 px-3 py-1 text-xs disabled:opacity-50">
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
